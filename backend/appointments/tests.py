import os
import uuid
import datetime
from unittest.mock import patch
from django.test import TestCase, override_settings
from django.utils import timezone
from django.core.cache import cache
from django.core.management import call_command
from rest_framework.test import APITestCase
from rest_framework import status
from .models import (
    ClinicSetting,
    StaffUser,
    Doctor,
    DoctorLeave,
    DisruptionBatch,
    Service,
    DoctorService,
    AvailabilityRule,
    BookingRequest,
    SlotOffer,
    Appointment,
    FollowUpTask,
    AuditLog,
    IdempotencyKey,
    InteractionLog,
)
from .services.availability import AvailabilityEngine
from .services.hold_service import HoldService, SlotConflictException
from .services.disruption_service import (
    DisruptionService,
    DisruptionUndoError,
    DisruptionRefusal,
)
from .services.conflict_service import ConflictService
from .services.sweep_service import SweepService


def next_legal_slot(hour, minute=0):
    """
    Wave 2 test helper: a deterministic future WEEKDAY at a fixed hour.

    The booking engine now enforces the clinic calendar on every path, so a
    fixture built from `now + timedelta(...)` can land at 03:00 on a Saturday
    depending on when the suite runs. Every slot a test BOOKS (hold, offer,
    dispatch pick, reschedule) must come from here instead. Assertions may
    still use raw datetimes freely - only booked slots need to be legal.
    """
    day = timezone.localdate() + datetime.timedelta(days=1)
    while day.isoweekday() > 5:
        day += datetime.timedelta(days=1)
    return timezone.make_aware(datetime.datetime.combine(day, datetime.time(hour, minute)))


class DomainModelTests(TestCase):
    """
    Verifies that all 11 clinical domain models, constraint rules,
    PIN hashing, password hashing, and auto-generated codes behave as specified.
    """

    def setUp(self):
        self.clinic = ClinicSetting.get_settings()
        self.clinic.webhook_secret = 'clinic_dev_secret_2026'
        self.clinic.save()
        self.doctor = Doctor.objects.create(
            name='Dr. Test Doctor',
            specialty='Dental Surgery',
            working_days=[1, 2, 3, 4, 5],
            shift_start=datetime.time(9, 0),
            shift_end=datetime.time(17, 0),
        )
        self.service = Service.objects.create(
            name='Test Dental Checkup',
            category='Dental',
            duration_minutes=30,
            buffer_minutes=10,
            price=15000.00,
        )
        self.doctor_service = DoctorService.objects.create(
            doctor=self.doctor,
            service=self.service,
        )

    def test_staff_user_password_and_pin_hashing(self):
        user = StaffUser.objects.create(
            full_name='Test Receptionist',
            email='receptionist@clinic.com',
            role='receptionist',
        )
        user.set_password('SecretPass123!')
        user.set_pin('1234')
        user.save()

        self.assertTrue(user.check_password('SecretPass123!'))
        self.assertFalse(user.check_password('WrongPass'))
        self.assertTrue(user.check_pin('1234'))
        self.assertFalse(user.check_pin('9999'))
        self.assertNotEqual(user.quick_pin_hash, '1234')  # Must be hashed

    def test_booking_request_code_auto_generation(self):
        req = BookingRequest.objects.create(
            patient_name='Kelechi Nnamdi',
            patient_phone='+2348011223344',
            service=self.service,
            preferred_doctor=self.doctor,
            preferred_time_window='morning',
            channel='web',
        )
        self.assertTrue(req.request_code.startswith('REQ-'))
        self.assertEqual(req.status, 'awaiting_review')

    def test_appointment_code_and_atomic_fields(self):
        now = timezone.now()
        appt = Appointment.objects.create(
            patient_name='Amina Sani',
            patient_phone='+2348055667788',
            doctor=self.doctor,
            service=self.service,
            start_datetime=now + datetime.timedelta(hours=2),
            end_datetime=now + datetime.timedelta(hours=2, minutes=30),
            status='held',
            hold_expires_at=now + datetime.timedelta(minutes=15),
        )
        self.assertTrue(appt.appointment_code.startswith('AP-'))
        self.assertEqual(appt.status, 'held')
        self.assertIsNotNone(appt.hold_expires_at)

    def test_clinic_setting_dynamic_config(self):
        self.assertIn('currency', self.clinic.custom_config)
        self.assertEqual(self.clinic.grid_increment_minutes, 15)
        self.assertEqual(self.clinic.offer_expiry_minutes, 60)
        self.assertEqual(self.clinic.hold_expiry_minutes, 15)

    def test_idempotency_key_uniqueness(self):
        now = timezone.now()
        IdempotencyKey.objects.create(
            key='tg_update_987654321',
            source='telegram',
            expires_at=now + datetime.timedelta(hours=24),
        )
        with self.assertRaises(Exception):
            IdempotencyKey.objects.create(
                key='tg_update_987654321',
                source='telegram',
                expires_at=now + datetime.timedelta(hours=24),
            )


class Phase2ServicesTests(TestCase):
    """
    Rigorously verifies Phase 2: Availability Engine, Atomic Hold Concurrency Locks,
    Disruption Protocols, and Expiry Sweepers.
    """

    def setUp(self):
        self.clinic = ClinicSetting.get_settings()
        self.clinic.webhook_secret = 'clinic_dev_secret_2026'
        self.clinic.save()
        self.doctor = Doctor.objects.create(
            name='Dr. Bello Ibrahim',
            specialty='Dental Surgery',
            working_days=[1, 2, 3, 4, 5],
            shift_start=datetime.time(9, 0),
            shift_end=datetime.time(17, 0),
            max_daily_appointments=12,
        )
        self.colleague = Doctor.objects.create(
            name='Dr. Chinwe Okafor',
            specialty='General Practice',
            working_days=[1, 2, 3, 4, 5, 6],
            shift_start=datetime.time(8, 0),
            shift_end=datetime.time(16, 0),
            max_daily_appointments=14,
        )
        self.service = Service.objects.create(
            name='Dental Examination',
            category='Dental Care',
            duration_minutes=30,
            buffer_minutes=10,
            price=15000.00,
        )
        DoctorService.objects.create(doctor=self.doctor, service=self.service)
        DoctorService.objects.create(doctor=self.colleague, service=self.service)

    def test_availability_engine_slot_generation(self):
        # Choose a target weekday (e.g. Monday = 1)
        today = timezone.now().date()
        target_date = today + datetime.timedelta(days=(1 - today.isoweekday()) % 7 + 7)  # Next Monday

        engine = AvailabilityEngine()
        slots = engine.get_available_slots_for_date(
            service=self.service,
            target_date=target_date,
            preferred_doctor=self.doctor,
            preferred_time_window='morning'
        )

        self.assertGreater(len(slots), 0)
        first_slot = slots[0]
        self.assertEqual(first_slot['doctor_name'], 'Dr. Bello Ibrahim')
        self.assertEqual(first_slot['duration_minutes'], 30)
        self.assertEqual(first_slot['buffer_minutes'], 10)
        self.assertGreater(first_slot['score'], 100)  # Contiguous score bonus

    def test_hold_service_atomic_lock_and_conflict_shield(self):
        today = timezone.now().date()
        target_date = today + datetime.timedelta(days=(1 - today.isoweekday()) % 7 + 7)  # Next Monday
        start_dt = timezone.make_aware(datetime.datetime.combine(target_date, datetime.time(10, 0)))
        end_dt = timezone.make_aware(datetime.datetime.combine(target_date, datetime.time(10, 30)))

        # Patient 1 claims slot
        appt1 = HoldService.acquire_slot(
            doctor_id=self.doctor.id,
            service_id=self.service.id,
            start_datetime=start_dt,
            end_datetime=end_dt,
            patient_name='Patient 1',
            patient_phone='+2348011112222',
            is_hold=True
        )
        self.assertEqual(appt1.status, 'held')
        self.assertIsNotNone(appt1.hold_expires_at)

        # Patient 2 attempts to claim overlapping slot at 10:15
        overlap_start = timezone.make_aware(datetime.datetime.combine(target_date, datetime.time(10, 15)))
        overlap_end = timezone.make_aware(datetime.datetime.combine(target_date, datetime.time(10, 45)))

        with self.assertRaises(SlotConflictException):
            HoldService.acquire_slot(
                doctor_id=self.doctor.id,
                service_id=self.service.id,
                start_datetime=overlap_start,
                end_datetime=overlap_end,
                patient_name='Patient 2',
                patient_phone='+2348033334444',
                is_hold=True
            )

        # Confirm hold for Patient 1
        confirmed_appt = HoldService.confirm_hold(appt1.id)
        self.assertEqual(confirmed_appt.status, 'confirmed')
        self.assertIsNone(confirmed_appt.hold_expires_at)

    def test_disruption_service_colleague_reassignment(self):
        today = timezone.now().date()
        target_date = today + datetime.timedelta(days=(1 - today.isoweekday()) % 7 + 7)  # Next Monday
        start_dt = timezone.make_aware(datetime.datetime.combine(target_date, datetime.time(11, 0)))
        end_dt = timezone.make_aware(datetime.datetime.combine(target_date, datetime.time(11, 30)))

        appt = HoldService.acquire_slot(
            doctor_id=self.doctor.id,
            service_id=self.service.id,
            start_datetime=start_dt,
            end_datetime=end_dt,
            patient_name='Amina Musa',
            patient_phone='+2348055556666',
            is_hold=False
        )

        # Doctor Bello falls ill
        report = DisruptionService.declare_doctor_leave(
            doctor_id=self.doctor.id,
            leave_start_dt=start_dt - datetime.timedelta(hours=1),
            reason='Acute Malaria'
        )

        self.assertEqual(report['impacted_count'], 1)
        impacted_item = report['impacted_appointments'][0]
        self.assertGreater(len(impacted_item['eligible_reassignments']), 0)
        self.assertEqual(impacted_item['eligible_reassignments'][0]['doctor_name'], 'Dr. Chinwe Okafor')

        # Reassign to Colleague
        reassigned = DisruptionService.reassign_to_colleague(
            appointment_id=appt.id,
            new_doctor_id=self.colleague.id
        )
        self.assertEqual(reassigned.doctor.id, self.colleague.id)

    def test_expiry_sweeper_transitions(self):
        now = timezone.now()
        # Create an expired booking request
        req = BookingRequest.objects.create(
            patient_name='Expired Patient',
            patient_phone='+2348077778888',
            service=self.service,
            status='slots_offered',
            offer_expires_at=now - datetime.timedelta(minutes=5),
        )

        # Create an expired temporary hold
        appt = Appointment.objects.create(
            patient_name='Expired Hold Patient',
            patient_phone='+2348099990000',
            doctor=self.doctor,
            service=self.service,
            start_datetime=now + datetime.timedelta(hours=4),
            end_datetime=now + datetime.timedelta(hours=4, minutes=30),
            status='held',
            hold_expires_at=now - datetime.timedelta(minutes=2),
        )

        sweep_res = SweepService.run_sweep()
        self.assertGreaterEqual(sweep_res['expired_offers_count'], 1)
        self.assertGreaterEqual(sweep_res['expired_holds_count'], 1)

        req.refresh_from_db()
        appt.refresh_from_db()
        self.assertEqual(req.status, 'offer_expired')
        self.assertEqual(appt.status, 'hold_expired')

    def test_sterilization_buffer_conflict_from_prior_appointment(self):
        """
        Finding #1: Verifies that a new appointment starting immediately at the end
        of a prior appointment is REJECTED because the 10m sanitization buffer is still active.
        """
        today = timezone.now().date()
        target_date = today + datetime.timedelta(days=(1 - today.isoweekday()) % 7 + 7)
        appt1_start = timezone.make_aware(datetime.datetime.combine(target_date, datetime.time(10, 0)))
        appt1_end = timezone.make_aware(datetime.datetime.combine(target_date, datetime.time(10, 30)))

        # Prior appointment 10:00 - 10:30 (buffer 10m occupies until 10:40)
        HoldService.acquire_slot(
            doctor_id=self.doctor.id,
            service_id=self.service.id,
            start_datetime=appt1_start,
            end_datetime=appt1_end,
            patient_name='Prior Patient',
            patient_phone='+2348011110000',
            is_hold=False
        )

        # Attempt to book 10:30 - 11:00 (inside Appt 1's 10m buffer)
        appt2_start = appt1_end
        appt2_end = timezone.make_aware(datetime.datetime.combine(target_date, datetime.time(11, 0)))

        with self.assertRaises(SlotConflictException):
            HoldService.acquire_slot(
                doctor_id=self.doctor.id,
                service_id=self.service.id,
                start_datetime=appt2_start,
                end_datetime=appt2_end,
                patient_name='Colliding Patient',
                patient_phone='+2348022220000',
                is_hold=True
            )

    def test_hold_service_rejects_doctor_on_leave(self):
        """
        Finding #2: Verifies that HoldService rejects bookings if the doctor is on leave (Risk R-05).
        """
        today = timezone.now().date()
        target_date = today + datetime.timedelta(days=(1 - today.isoweekday()) % 7 + 7)
        start_dt = timezone.make_aware(datetime.datetime.combine(target_date, datetime.time(14, 0)))
        end_dt = timezone.make_aware(datetime.datetime.combine(target_date, datetime.time(14, 30)))

        self.doctor.is_on_leave = True
        self.doctor.save(update_fields=['is_on_leave'])

        with self.assertRaises(SlotConflictException):
            HoldService.acquire_slot(
                doctor_id=self.doctor.id,
                service_id=self.service.id,
                start_datetime=start_dt,
                end_datetime=end_dt,
                patient_name='Sick Doctor Patient',
                patient_phone='+2348033330000',
                is_hold=True
            )

    def test_disruption_respects_colleague_shift_hours(self):
        """
        Finding #5: Verifies that colleague reassignment respects the colleague's shift hours.
        Dr. Okafor's shift ends at 16:00; she cannot take an appointment booked for 16:15.
        """
        today = timezone.now().date()
        target_date = today + datetime.timedelta(days=(1 - today.isoweekday()) % 7 + 7)
        # Book a late afternoon appointment with Dr. Bello (whose shift ends at 17:00)
        late_start = timezone.make_aware(datetime.datetime.combine(target_date, datetime.time(16, 15)))
        late_end = timezone.make_aware(datetime.datetime.combine(target_date, datetime.time(16, 45)))

        appt = HoldService.acquire_slot(
            doctor_id=self.doctor.id,
            service_id=self.service.id,
            start_datetime=late_start,
            end_datetime=late_end,
            patient_name='Late Patient',
            patient_phone='+2348044440000',
            is_hold=False
        )

        # Dr. Bello goes on emergency leave
        report = DisruptionService.declare_doctor_leave(
            doctor_id=self.doctor.id,
            leave_start_dt=late_start - datetime.timedelta(hours=1),
            reason='Family Emergency'
        )

        # Colleague Dr. Okafor shift ends at 16:00, so she must NOT be eligible for this 16:15 appointment
        impacted_item = report['impacted_appointments'][0]
        self.assertEqual(len(impacted_item['eligible_reassignments']), 0)


class Phase3AuthTests(APITestCase):
    """
    Verifies Task 3.1: Staff Authentication, Dual-Mode JWT,
    Quick-PIN Verification with 3-Strike Lockout, and Real-Time Session Killswitch.
    """

    def setUp(self):
        cache.clear()
        self.staff_password = 'ClinicPassword123!'
        self.staff_pin = '1234'
        self.staff = StaffUser.objects.create(
            full_name='Sarah Okafor',
            email='sarah@clinic.com',
            role='receptionist',
            is_active=True,
        )
        self.staff.set_password(self.staff_password)
        self.staff.set_pin(self.staff_pin)
        self.staff.save()

        self.admin = StaffUser.objects.create(
            full_name='Dr. Admin Bello',
            email='admin@clinic.com',
            role='clinic_admin',
            is_active=True,
        )
        self.admin.set_password(self.staff_password)
        self.admin.set_pin('9876')
        self.admin.save()

    def tearDown(self):
        cache.clear()

    def test_staff_login_success_t301(self):
        """
        T-301: Valid credentials return access & refresh JWT tokens and set HttpOnly cookies.
        """
        res = self.client.post('/api/v1/auth/login/', {
            'email': 'sarah@clinic.com',
            'password': self.staff_password,
        }, format='json')

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('access', res.data)
        self.assertIn('refresh', res.data)
        self.assertEqual(res.data['user']['email'], 'sarah@clinic.com')
        self.assertEqual(res.data['user']['role'], 'receptionist')

        # Verify HttpOnly cookies
        self.assertIn('clinic_access_token', res.cookies)
        self.assertIn('clinic_refresh_token', res.cookies)
        self.assertTrue(res.cookies['clinic_access_token']['httponly'])

    @override_settings(DEBUG=False)
    def test_cookie_secure_flag_production_t301(self):
        """T-301: In production (DEBUG=False) Secure flag must be True on cookies."""
        res = self.client.post('/api/v1/auth/login/', {
            'email': 'sarah@clinic.com',
            'password': self.staff_password,
        }, format='json')
        self.assertTrue(res.cookies['clinic_access_token']['secure'])
        self.assertTrue(res.cookies['clinic_refresh_token']['secure'])


    def test_staff_login_invalid_credentials_t301(self):
        """
        T-301: Invalid password or non-existent email returns 401 Unauthorized.
        """
        res = self.client.post('/api/v1/auth/login/', {
            'email': 'sarah@clinic.com',
            'password': 'WrongPassword!',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(res.data['error'], 'INVALID_CREDENTIALS')

        res_nonexistent = self.client.post('/api/v1/auth/login/', {
            'email': 'ghost@clinic.com',
            'password': self.staff_password,
        }, format='json')
        self.assertEqual(res_nonexistent.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(res_nonexistent.data['error'], 'INVALID_CREDENTIALS')

    def test_staff_login_inactive_blocked_t301(self):
        """
        T-301: Deactivated staff cannot log in; returns 401 ACCOUNT_DEACTIVATED.
        """
        self.staff.is_active = False
        self.staff.save(update_fields=['is_active'])

        res = self.client.post('/api/v1/auth/login/', {
            'email': 'sarah@clinic.com',
            'password': self.staff_password,
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(res.data['error'], 'ACCOUNT_DEACTIVATED')

    def test_quick_pin_screen_lock_success_t302(self):
        """
        T-302: Valid 4-digit PIN returns 200 OK unlocked for authenticated staff.
        Tests both /auth/pin-unlock/ and /auth/verify-pin/.
        """
        self.client.force_authenticate(user=self.staff)

        # Test /auth/pin-unlock/
        res1 = self.client.post('/api/v1/auth/pin-unlock/', {'pin': '1234'}, format='json')
        self.assertEqual(res1.status_code, status.HTTP_200_OK)
        self.assertEqual(res1.data['status'], 'unlocked')

        # Test /auth/verify-pin/
        res2 = self.client.post('/api/v1/auth/verify-pin/', {'pin': '1234'}, format='json')
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        self.assertEqual(res2.data['status'], 'unlocked')

    def test_quick_pin_three_strike_lockout_t302(self):
        """
        T-302: 3 consecutive wrong PINs trigger 60s cooldown lockout (HTTP 423) and AuditLog entry.
        """
        self.client.force_authenticate(user=self.staff)

        # Strike 1
        res1 = self.client.post('/api/v1/auth/verify-pin/', {'pin': '0000'}, format='json')
        self.assertEqual(res1.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res1.data['remaining_attempts'], 2)

        # Strike 2
        res2 = self.client.post('/api/v1/auth/verify-pin/', {'pin': '1111'}, format='json')
        self.assertEqual(res2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res2.data['remaining_attempts'], 1)

        # Strike 3 -> 423 Locked
        res3 = self.client.post('/api/v1/auth/verify-pin/', {'pin': '2222'}, format='json')
        self.assertEqual(res3.status_code, status.HTTP_423_LOCKED)
        self.assertEqual(res3.data['error'], 'PIN_LOCKED')
        self.assertEqual(res3.data['cooldown_seconds'], 60)

        # Verify audit log was recorded
        audit = AuditLog.objects.filter(
            entity_name='StaffUser',
            entity_id=self.staff.id,
            action='SECURITY_PIN_LOCKOUT_TRIGGERED'
        ).first()
        self.assertIsNotNone(audit)

        # Strike 4 during active cooldown -> still 423 Locked
        res4 = self.client.post('/api/v1/auth/verify-pin/', {'pin': '1234'}, format='json')
        self.assertEqual(res4.status_code, status.HTTP_423_LOCKED)
        self.assertEqual(res4.data['error'], 'PIN_LOCKED')

    def test_instant_session_revocation_killswitch_t303(self):
        """
        T-303: When a staff user is marked is_active=False, any active session or JWT
        immediately receives 401 Unauthorized on subsequent requests.
        """
        # Step 1: Login to get valid JWT token
        login_res = self.client.post('/api/v1/auth/login/', {
            'email': 'sarah@clinic.com',
            'password': self.staff_password,
        }, format='json')
        self.assertEqual(login_res.status_code, status.HTTP_200_OK)
        token = login_res.data['access']

        # Step 2: Make request with valid token -> 200 OK
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        profile_res = self.client.get('/api/v1/auth/me/')
        self.assertEqual(profile_res.status_code, status.HTTP_200_OK)
        self.assertEqual(profile_res.data['email'], 'sarah@clinic.com')

        # Step 3: Admin killswitch: deactivate staff
        self.staff.is_active = False
        self.staff.save(update_fields=['is_active'])

        # Step 4: Next request with the SAME token must be immediately ejected with 401
        ejected_res = self.client.get('/api/v1/auth/me/')
        self.assertEqual(ejected_res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_cookie_jwt_authentication_and_revocation_t303(self):
        """
        T-303: Tests dual-mode cookie transport and cookie session revocation.
        """
        # Login and capture cookie
        login_res = self.client.post('/api/v1/auth/login/', {
            'email': 'sarah@clinic.com',
            'password': self.staff_password,
        }, format='json')
        access_cookie = login_res.cookies['clinic_access_token'].value

        # Clear Authorization header and use cookie
        self.client.credentials()  # clear headers
        self.client.cookies['clinic_access_token'] = access_cookie

        me_res = self.client.get('/api/v1/auth/me/')
        self.assertEqual(me_res.status_code, status.HTTP_200_OK)

        # Deactivate staff
        self.staff.is_active = False
        self.staff.save(update_fields=['is_active'])

        # Immediate ejection via cookie
        me_res_ejected = self.client.get('/api/v1/auth/me/')
        self.assertEqual(me_res_ejected.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertIn('clinic_access_token', me_res_ejected.cookies)
        self.assertEqual(me_res_ejected.cookies['clinic_access_token']['max-age'], 0)


class Phase3BookingQueueTests(APITestCase):
    """
    Rigorously verifies Task 3.2:
    - Public intake endpoint with honeypot bot trap and E.164 phone sanitization.
    - Returning patient dossier matching (zero-diagnosis leakage).
    - IP-based rate limiting (5 req / 10 min).
    - T-304: FIFO Booking Queue Retrieval (GET /api/v1/booking-requests/).
    - T-305: Candidate Slot Calculation Bridge (POST /api/v1/booking-requests/{id}/check-slots/).
    - T-306: Offer Dispatch API (POST /api/v1/booking-requests/{id}/dispatch-offers/).
    - T-307: Front-Desk Inquiry Dispatch (POST /api/v1/booking-requests/{id}/ask-info/).
    """

    def setUp(self):
        cache.clear()
        self.clinic = ClinicSetting.get_settings()
        self.clinic.webhook_secret = 'clinic_dev_secret_2026'
        self.clinic.save()

        self.doctor = Doctor.objects.create(
            name='Dr. Bello Ibrahim',
            specialty='Dental Surgery',
            working_days=[1, 2, 3, 4, 5],
            shift_start=datetime.time(9, 0),
            shift_end=datetime.time(17, 0),
        )
        self.service = Service.objects.create(
            name='Dental Examination',
            category='Dental Care',
            duration_minutes=30,
            buffer_minutes=10,
            price=15000.00,
        )
        self.doctor_service = DoctorService.objects.create(
            doctor=self.doctor,
            service=self.service,
        )

        self.receptionist = StaffUser.objects.create(
            full_name='Amina Frontdesk',
            email='amina@clinic.com',
            role='receptionist',
            is_active=True,
        )
        self.receptionist.set_password('FrontdeskPass123!')
        self.receptionist.save()

    def tearDown(self):
        cache.clear()

    def test_booking_intake_honeypot_silently_dropped(self):
        """
        Anti-Abuse: If clinic_web_trap is filled, return 201 Created but do NOT save to database.
        """
        initial_count = BookingRequest.objects.count()
        res = self.client.post('/api/v1/booking-requests/', {
            'patient_name': 'Spam Bot 3000',
            'patient_phone': '08012345678',
            'service_id': str(self.service.id),
            'clinic_web_trap': 'I am an automated bot payload',
        }, format='json')

        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(BookingRequest.objects.count(), initial_count)  # No DB write

    def test_booking_intake_phone_sanitization_and_returning_patient(self):
        """
        Verifies Nigerian 080... format sanitization to +23480... and automatic
        returning patient status detection without clinical leak.
        """
        # 1. First visit -> new patient
        res1 = self.client.post('/api/v1/booking-requests/', {
            'patient_name': 'Ngozi Eze',
            'patient_phone': '08099887766',
            'service_id': str(self.service.id),
            'preferred_dates': ['2026-10-25', '2026-10-26'],
        }, format='json')
        self.assertEqual(res1.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res1.data['patient_phone'], '+2348099887766')
        self.assertEqual(res1.data['patient_type'], 'new')

        # 2. Second visit with formatted number -> returning patient
        res2 = self.client.post('/api/v1/booking-requests/', {
            'patient_name': 'Ngozi Eze',
            'patient_phone': '+234-809-988-7766',
            'service_id': str(self.service.id),
        }, format='json')
        self.assertEqual(res2.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res2.data['patient_phone'], '+2348099887766')
        self.assertEqual(res2.data['patient_type'], 'returning')

    def test_booking_intake_rate_limiting(self):
        """
        Enforces 5 requests per 10 minutes per IP. 6th request must return 429 Too Many Requests.
        """
        for i in range(5):
            res = self.client.post('/api/v1/booking-requests/', {
                'patient_name': f'Patient {i}',
                'patient_phone': f'0801000000{i}',
                'service_id': str(self.service.id),
            }, format='json')
            self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        # 6th request from same IP
        res_blocked = self.client.post('/api/v1/booking-requests/', {
            'patient_name': 'Blocked Spammer',
            'patient_phone': '08099999999',
            'service_id': str(self.service.id),
        }, format='json')
        self.assertEqual(res_blocked.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(res_blocked.data['error'], 'RATE_LIMIT_EXCEEDED')

    def test_fifo_booking_queue_retrieval_t304(self):
        """
        T-304: GET /api/v1/booking-requests/ returns requests ordered strictly by created_at ASC (FIFO)
        and supports status filtering.
        """
        self.client.force_authenticate(user=self.receptionist)

        req1 = BookingRequest.objects.create(
            patient_name='Patient Alpha',
            patient_phone='+2348011111111',
            service=self.service,
            status='awaiting_review',
        )
        req2 = BookingRequest.objects.create(
            patient_name='Patient Beta',
            patient_phone='+2348022222222',
            service=self.service,
            status='slots_offered',
        )
        req3 = BookingRequest.objects.create(
            patient_name='Patient Gamma',
            patient_phone='+2348033333333',
            service=self.service,
            status='awaiting_review',
        )

        # 1. Unfiltered FIFO retrieval
        res = self.client.get('/api/v1/booking-requests/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        returned_ids = [item['id'] for item in res.data]
        self.assertEqual(returned_ids, [str(req1.id), str(req2.id), str(req3.id)])

        # 2. Status filtering (?status=awaiting_review)
        res_filtered = self.client.get('/api/v1/booking-requests/?status=awaiting_review')
        self.assertEqual(res_filtered.status_code, status.HTTP_200_OK)
        filtered_ids = [item['id'] for item in res_filtered.data]
        self.assertEqual(filtered_ids, [str(req1.id), str(req3.id)])

    def test_candidate_slot_calculation_bridge_t305(self):
        """
        T-305: POST /api/v1/booking-requests/{id}/check-slots/ invokes AvailabilityEngine
        and returns candidate slots. Verifies lookup by both UUID and human-readable request_code.
        """
        self.client.force_authenticate(user=self.receptionist)

        today = timezone.now().date()
        target_start = today + datetime.timedelta(days=2)
        target_end = today + datetime.timedelta(days=7)

        req = BookingRequest.objects.create(
            patient_name='Kelechi Test',
            patient_phone='+2348055554444',
            service=self.service,
            preferred_doctor=self.doctor,
            preferred_date_range={'start': target_start.isoformat(), 'end': target_end.isoformat()},
            preferred_time_window='morning',
            status='awaiting_review',
        )

        # Test lookup by UUID
        res_uuid = self.client.post(f'/api/v1/booking-requests/{req.id}/check-slots/')
        self.assertEqual(res_uuid.status_code, status.HTTP_200_OK)
        self.assertEqual(res_uuid.data['request_id'], req.request_code)
        self.assertIn('candidate_slots', res_uuid.data)
        self.assertGreater(len(res_uuid.data['candidate_slots']), 0)

        # Test lookup by request_code (REQ-YYYY-XXXX)
        res_code = self.client.post(f'/api/v1/booking-requests/{req.request_code}/check-slots/')
        self.assertEqual(res_code.status_code, status.HTTP_200_OK)
        self.assertEqual(res_code.data['request_id'], req.request_code)

    def test_offer_dispatch_api_t306(self):
        """
        T-306: POST /api/v1/booking-requests/{id}/dispatch-offers/ approves candidate slots,
        transitions status to 'slots_offered', sets 1-hour expiry, creates SlotOffer records,
        and generates Telegram button payload.
        """
        self.client.force_authenticate(user=self.receptionist)

        req = BookingRequest.objects.create(
            patient_name='Zainab Ahmed',
            patient_phone='+2348077778888',
            service=self.service,
            preferred_doctor=self.doctor,
            status='awaiting_review',
        )

        now = timezone.now()
        slot1_start = next_legal_slot(10)
        slot1_end = slot1_start + datetime.timedelta(minutes=30)
        slot2_start = next_legal_slot(12)
        slot2_end = slot2_start + datetime.timedelta(minutes=30)

        res = self.client.post(f'/api/v1/booking-requests/{req.request_code}/dispatch-offers/', {
            'slots': [
                {
                    'doctor_id': str(self.doctor.id),
                    'start_datetime': slot1_start.isoformat(),
                    'end_datetime': slot1_end.isoformat(),
                    'is_alternative_date': False,
                },
                {
                    'doctor_id': str(self.doctor.id),
                    'start_datetime': slot2_start.isoformat(),
                    'end_datetime': slot2_end.isoformat(),
                    'is_alternative_date': False,
                }
            ]
        }, format='json')

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['status'], 'slots_offered')
        self.assertIn('offer_expires_at', res.data)
        self.assertEqual(len(res.data['offers']), 2)

        # Verify DB state
        req.refresh_from_db()
        self.assertEqual(req.status, 'slots_offered')
        self.assertIsNotNone(req.offer_expires_at)
        self.assertEqual(SlotOffer.objects.filter(request=req).count(), 2)

        # Verify Telegram interactive keyboard structure
        self.assertIn('telegram_payload', res.data)
        self.assertEqual(len(res.data['telegram_payload']['inline_keyboard']), 2)

    def test_dispatch_offers_auto_computes_end_datetime(self):
        """
        Verify DispatchOffersView auto-computes end_datetime from service duration when omitted.
        """
        self.client.force_authenticate(user=self.receptionist)
        req = BookingRequest.objects.create(
            patient_name='Khadijah Sanusi',
            patient_phone='+2348099990000',
            service=self.service,
            preferred_doctor=self.doctor,
            status='awaiting_review',
        )

        slot_start = next_legal_slot(10)
        res = self.client.post(f'/api/v1/booking-requests/{req.request_code}/dispatch-offers/', {
            'slots': [
                {
                    'doctor_id': str(self.doctor.id),
                    'start_datetime': slot_start.isoformat(),
                    # end_datetime intentionally omitted to test fallback
                }
            ]
        }, format='json')

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['status'], 'slots_offered')
        offer = SlotOffer.objects.filter(request=req).first()
        self.assertIsNotNone(offer)
        expected_end = slot_start + datetime.timedelta(minutes=self.service.duration_minutes)
        self.assertEqual(offer.end_datetime, expected_end)

    def test_front_desk_inquiry_dispatch_t307(self):
        """
        T-307: POST /api/v1/booking-requests/{id}/ask-info/ logs the
        clarification inquiry to patient_notes and creates an AuditLog entry.

        Wave 4 / Step 4.3: this request has NO Telegram chat and no other
        messaging channel, so the honest answer is `recorded_only` — the old
        `dispatched` claimed a delivery that never happened.
        """
        self.client.force_authenticate(user=self.receptionist)

        req = BookingRequest.objects.create(
            patient_name='Tunde Bakare',
            patient_phone='+2348066665555',
            service=self.service,
            status='awaiting_review',
        )

        res = self.client.post(f'/api/v1/booking-requests/{req.id}/ask-info/', {
            'prompt_code': 'confirm_availability',
            'message': 'Good day Mr. Bakare, would 10:30 AM or 2:00 PM suit you better?'
        }, format='json')

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['status'], 'recorded_only')
        self.assertIn('No patient messaging channel', res.data['detail'])

        # Verify patient_notes updated
        req.refresh_from_db()
        self.assertIn('would 10:30 AM or 2:00 PM suit you better?', req.patient_notes)

        # Verify AuditLog created — the action matches what really happened
        audit = AuditLog.objects.filter(
            entity_name='BookingRequest',
            entity_id=req.id,
            action='PATIENT_INQUIRY_RECORDED'
        ).first()
        self.assertIsNotNone(audit)
        self.assertEqual(audit.performed_by, self.receptionist.email)


class Phase3LiveVisitsTests(APITestCase):
    """
    Rigorously verifies Task 3.3:
    - Atomic Slot Hold API (/api/v1/slots/hold/ & /api/v1/appointments/hold/)
    - T-308: Live Visit Status Transitions (arrived -> in_consultation -> completed / no_show / cancelled)
    - T-309: Doctor Follow-Up Task Creation (/api/v1/appointments/{id}/follow-up/)
    - 1-Click Doctor Sick Leave Colleague Reassignment (/api/v1/appointments/{id}/reassign-leave/)
    - Today's Live Visits Feed (/api/v1/appointments/today/)
    - T-310: RFC 4180 CSV Data Exports (/api/v1/admin/export/appointments/ & /attendance/)
    """

    def setUp(self):
        cache.clear()
        self.clinic = ClinicSetting.get_settings()
        self.clinic.webhook_secret = 'clinic_dev_secret_2026'
        self.clinic.save()

        self.doctor = Doctor.objects.create(
            name='Dr. Bello Ibrahim',
            specialty='Dental Surgery',
            working_days=[1, 2, 3, 4, 5],
            shift_start=datetime.time(8, 0),
            shift_end=datetime.time(18, 0),
        )
        self.colleague = Doctor.objects.create(
            name='Dr. Chinwe Okafor',
            specialty='General Practice',
            working_days=[1, 2, 3, 4, 5, 6],
            shift_start=datetime.time(8, 0),
            shift_end=datetime.time(18, 0),
        )
        self.service = Service.objects.create(
            name='Tooth Extraction',
            category='Dental Care',
            duration_minutes=45,
            buffer_minutes=15,
            price=25000.00,
        )
        self.doctor_service = DoctorService.objects.create(
            doctor=self.doctor,
            service=self.service,
        )
        self.colleague_service = DoctorService.objects.create(
            doctor=self.colleague,
            service=self.service,
        )

        self.receptionist = StaffUser.objects.create(
            full_name='Blessing Desk',
            email='blessing@clinic.com',
            role='receptionist',
            is_active=True,
        )
        self.receptionist.set_password('DeskPass123!')
        self.receptionist.save()

    def tearDown(self):
        cache.clear()

    def test_atomic_slot_hold_via_slot_offer_success(self):
        """
        Patient selects an offered slot -> acquires atomic 15-minute hold and updates SlotOffer.
        """
        req = BookingRequest.objects.create(
            patient_name='Chidi Obi',
            patient_phone='+2348033334444',
            service=self.service,
            status='slots_offered',
        )

        tomorrow = next_legal_slot(10)
        slot_start = tomorrow
        slot_end = slot_start + datetime.timedelta(minutes=45)

        offer = SlotOffer.objects.create(
            request=req,
            doctor=self.doctor,
            start_datetime=slot_start,
            end_datetime=slot_end,
            expires_at=timezone.now() + datetime.timedelta(minutes=60),
            is_selected=False,
        )

        res = self.client.post('/api/v1/slots/hold/', {
            'slot_offer_id': str(offer.id)
        }, format='json', HTTP_X_WEBHOOK_SECRET='clinic_dev_secret_2026')

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['status'], 'held')
        self.assertIsNotNone(res.data['hold_expires_at'])
        self.assertTrue(res.data['appointment_code'].startswith('AP-'))

        # Verify DB hold created
        appt = Appointment.objects.get(appointment_code=res.data['appointment_code'])
        self.assertEqual(appt.status, 'held')
        self.assertEqual(appt.doctor, self.doctor)

        # Verify offer marked selected
        offer.refresh_from_db()
        self.assertTrue(offer.is_selected)

    def test_atomic_slot_hold_conflict_rejected(self):
        """
        Race condition protection: Attempting to hold a slot that overlaps an existing visit
        must return 409 Conflict.
        """
        tomorrow = next_legal_slot(11)
        start1 = tomorrow
        end1 = start1 + datetime.timedelta(minutes=45)

        # First appointment held
        Appointment.objects.create(
            patient_name='First Patient',
            patient_phone='+2348011112222',
            doctor=self.doctor,
            service=self.service,
            start_datetime=start1,
            end_datetime=end1,
            status='confirmed',
        )

        # Second booking attempts overlapping slot (11:15 - 12:00)
        start2 = start1 + datetime.timedelta(minutes=15)
        end2 = start2 + datetime.timedelta(minutes=45)

        res = self.client.post('/api/v1/appointments/hold/', {
            'doctor_id': str(self.doctor.id),
            'service_id': str(self.service.id),
            'start_datetime': start2.isoformat(),
            'end_datetime': end2.isoformat(),
            'patient_name': 'Second Patient',
            'patient_phone': '+2348055556666',
        }, format='json', HTTP_X_WEBHOOK_SECRET='clinic_dev_secret_2026')

        self.assertEqual(res.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(res.data['error'], 'SLOT_CONFLICT')

    def test_live_visit_status_lifecycle_t308(self):
        """
        T-308: confirmed -> arrived -> in_consultation -> completed
        Verifies timestamps, status transitions, and audit logs.
        """
        self.client.force_authenticate(user=self.receptionist)

        now = timezone.now()
        appt = Appointment.objects.create(
            patient_name='Ibrahim Garba',
            patient_phone='+2348077778888',
            doctor=self.doctor,
            service=self.service,
            start_datetime=now,
            end_datetime=now + datetime.timedelta(minutes=45),
            status='confirmed',
            confirmed_at=now,
        )

        # Step 1: Arrived
        res_arrived = self.client.patch(f'/api/v1/appointments/{appt.appointment_code}/status/', {
            'status': 'arrived'
        }, format='json')
        self.assertEqual(res_arrived.status_code, status.HTTP_200_OK)
        self.assertEqual(res_arrived.data['status'], 'arrived')
        self.assertIsNotNone(res_arrived.data['arrival_at'])

        # Step 2: In Consultation
        res_in_consult = self.client.patch(f'/api/v1/appointments/{appt.id}/status/', {
            'status': 'in_consultation'
        }, format='json')
        self.assertEqual(res_in_consult.status_code, status.HTTP_200_OK)
        self.assertEqual(res_in_consult.data['status'], 'in_consultation')

        # Step 3: Completed
        res_completed = self.client.patch(f'/api/v1/appointments/{appt.id}/status/', {
            'status': 'completed'
        }, format='json')
        self.assertEqual(res_completed.status_code, status.HTTP_200_OK)
        self.assertEqual(res_completed.data['status'], 'completed')
        self.assertIsNotNone(res_completed.data['completed_at'])

        # Verify audit log captures transition
        audit = AuditLog.objects.filter(
            entity_name='Appointment',
            entity_id=appt.id,
            action='APPOINTMENT_STATUS_CHANGED'
        ).first()
        self.assertIsNotNone(audit)
        self.assertEqual(audit.changes['to_status'], 'completed')
        self.assertEqual(audit.performed_by, self.receptionist.email)

    def test_appointment_cancellation_with_reason_t308(self):
        """
        T-308: Cancelling an appointment requires cancellation_reason and sets cancelled_at.
        """
        self.client.force_authenticate(user=self.receptionist)

        now = timezone.now()
        appt = Appointment.objects.create(
            patient_name='Maryam Danjuma',
            patient_phone='+2348099990000',
            doctor=self.doctor,
            service=self.service,
            start_datetime=now,
            end_datetime=now + datetime.timedelta(minutes=45),
            status='confirmed',
        )

        res = self.client.patch(f'/api/v1/appointments/{appt.id}/status/', {
            'status': 'cancelled',
            'cancellation_reason': 'Patient emergency out of town',
        }, format='json')

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['status'], 'cancelled')
        self.assertEqual(res.data['cancellation_reason'], 'Patient emergency out of town')
        self.assertIsNotNone(res.data['cancelled_at'])

    def test_doctor_followup_task_creation_t309(self):
        """
        T-309: POST /api/v1/appointments/{id}/follow-up/ schedules recall task
        linked to the treating doctor.
        """
        self.client.force_authenticate(user=self.receptionist)

        now = timezone.now()
        appt = Appointment.objects.create(
            patient_name='Emeka Nnamani',
            patient_phone='+2348022223333',
            doctor=self.doctor,
            service=self.service,
            start_datetime=now,
            end_datetime=now + datetime.timedelta(minutes=45),
            status='completed',
        )

        follow_date = (timezone.now() + datetime.timedelta(days=7)).date()
        res = self.client.post(f'/api/v1/appointments/{appt.appointment_code}/follow-up/', {
            'follow_up_date': follow_date.isoformat(),
            'notes': '1-week post-op suture removal and wound inspection'
        }, format='json')

        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data['patient_name'], 'Emeka Nnamani')
        self.assertEqual(res.data['doctor_name'], self.doctor.name)
        self.assertEqual(res.data['notes'], '1-week post-op suture removal and wound inspection')

        # Verify DB
        task = FollowUpTask.objects.filter(appointment=appt).first()
        self.assertIsNotNone(task)
        self.assertEqual(task.follow_up_date, follow_date)

    def test_reassign_colleague_on_leave(self):
        """
        1-Click colleague reassignment moves the appointment to an active colleague.
        """
        self.client.force_authenticate(user=self.receptionist)

        now = timezone.now()
        appt = Appointment.objects.create(
            patient_name='Halima Yusuf',
            patient_phone='+2348088889999',
            doctor=self.doctor,
            service=self.service,
            start_datetime=now,
            end_datetime=now + datetime.timedelta(minutes=45),
            status='confirmed',
        )

        res = self.client.post(f'/api/v1/appointments/{appt.id}/reassign-leave/', {
            'new_doctor_id': str(self.colleague.id)
        }, format='json')

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['doctor_id'], str(self.colleague.id))
        self.assertEqual(res.data['doctor_name'], self.colleague.name)

        appt.refresh_from_db()
        self.assertEqual(appt.doctor, self.colleague)

    def test_csv_export_appointments_t310(self):
        """
        T-310: GET /api/v1/admin/export/appointments/ downloads RFC 4180 CSV attachment.
        """
        self.client.force_authenticate(user=self.receptionist)

        now = timezone.now()
        Appointment.objects.create(
            patient_name='Export Test User',
            patient_phone='+2348011223344',
            doctor=self.doctor,
            service=self.service,
            start_datetime=now,
            end_datetime=now + datetime.timedelta(minutes=45),
            status='completed',
        )

        res = self.client.get('/api/v1/admin/export/appointments/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res['Content-Type'], 'text/csv')
        self.assertIn('attachment; filename="appointments_', res['Content-Disposition'])

        content = res.content.decode('utf-8')
        self.assertIn('Appointment Code,Patient Name,Patient Phone,Doctor', content)
        self.assertIn('Export Test User', content)

    def test_csv_export_attendance_t310(self):
        """
        T-310: GET /api/v1/admin/export/attendance/ downloads RFC 4180 CSV summary.
        """
        self.client.force_authenticate(user=self.receptionist)

        res = self.client.get('/api/v1/admin/export/attendance/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res['Content-Type'], 'text/csv')
        self.assertIn('attachment; filename="attendance_', res['Content-Disposition'])

        content = res.content.decode('utf-8')
        self.assertIn('Doctor Name,Specialty,Total Appointments,Completed', content)
        self.assertIn(self.doctor.name, content)


class RescheduleConflictTests(APITestCase):
    """
    Phase 2.5 / system-review finding #4: Reschedule and 1-Click Colleague
    Reassignment must give the SAME zero-double-booking guarantee as
    HoldService.acquire_slot — doctor row lock, active/leave check, and the
    two-way overlap + sterilization-buffer conflict test — instead of silently
    saving onto an occupied calendar block.
    """

    def setUp(self):
        cache.clear()
        self.clinic = ClinicSetting.get_settings()
        self.clinic.webhook_secret = 'clinic_dev_secret_2026'
        self.clinic.save()

        self.doctor = Doctor.objects.create(
            name='Dr. Bello Ibrahim',
            specialty='Dental Surgery',
            working_days=[1, 2, 3, 4, 5],
            shift_start=datetime.time(8, 0),
            shift_end=datetime.time(18, 0),
        )
        self.colleague = Doctor.objects.create(
            name='Dr. Chinwe Okafor',
            specialty='General Practice',
            working_days=[1, 2, 3, 4, 5, 6],
            shift_start=datetime.time(8, 0),
            shift_end=datetime.time(18, 0),
        )
        self.service = Service.objects.create(
            name='Tooth Extraction',
            category='Dental Care',
            duration_minutes=45,
            buffer_minutes=15,
            price=25000.00,
        )
        DoctorService.objects.create(doctor=self.doctor, service=self.service)
        DoctorService.objects.create(doctor=self.colleague, service=self.service)

        self.receptionist = StaffUser.objects.create(
            full_name='Reschedule Tester',
            email='reschedule@clinic.com',
            role='receptionist',
            is_active=True,
        )
        self.receptionist.set_password('DeskPass123!')
        self.receptionist.save()

        now = timezone.now()
        # Wave 2: reschedule now enforces the clinic calendar (closed days,
        # shift, lunch, notice), so every fixture anchors to a deterministic
        # future WEEKDAY at fixed hours. The old wall-clock offsets floated
        # with the time of day the suite ran at - 10:00 in a comment could
        # really be 03:00 on a Saturday.
        day = timezone.localdate() + datetime.timedelta(days=1)
        while day.isoweekday() > 5:
            day += datetime.timedelta(days=1)

        def at(hour, minute=0):
            return timezone.make_aware(datetime.datetime.combine(day, datetime.time(hour, minute)))

        self.t_occupied = at(10)        # occupied block 10:00-10:45 (buffer 15 -> 11:00)
        self.t_movable = at(12)         # the appointment under test, 12:00-12:45
        self.t_head_on = at(10, 15)     # overlaps the occupied block head-on
        self.t_buffer_zone = at(10, 50)  # inside the occupied block's buffer
        self.t_free = at(16)            # a clean, legal target slot

        # Occupied block on self.doctor: 10:00-10:45 (buffer 15 -> effective end 11:00)
        self.occupied = Appointment.objects.create(
            patient_name='Occupied Block',
            patient_phone='+2348000000001',
            doctor=self.doctor,
            service=self.service,
            start_datetime=self.t_occupied,
            end_datetime=self.t_occupied + datetime.timedelta(minutes=45),
            status='confirmed',
        )
        # The appointment under test on the same doctor: 12:00-12:45
        self.movable = Appointment.objects.create(
            patient_name='Movable Visit',
            patient_phone='+2348000000002',
            doctor=self.doctor,
            service=self.service,
            start_datetime=self.t_movable,
            end_datetime=self.t_movable + datetime.timedelta(minutes=45),
            status='confirmed',
        )
        self.client.force_authenticate(user=self.receptionist)

    def tearDown(self):
        cache.clear()

    def _url(self, appt):
        return f'/api/v1/appointments/{appt.id}/reschedule/'

    def test_reschedule_onto_occupied_slot_rejected_409(self):
        # 10:15-11:00 overlaps the occupied 10:00-10:45 block head-on.
        res = self.client.post(self._url(self.movable), {
            'start_datetime': self.t_head_on.isoformat(),
            'end_datetime': (self.t_head_on + datetime.timedelta(minutes=45)).isoformat(),
        }, format='json')

        self.assertEqual(res.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(res.data['error'], 'SLOT_CONFLICT')
        self.assertEqual(res.data['conflicting_appointment'], self.occupied.appointment_code)

        # The rejected move must leave the appointment exactly where it was.
        self.movable.refresh_from_db()
        self.assertEqual(self.movable.start_datetime, self.t_movable)
        self.assertEqual(
            self.movable.end_datetime - self.movable.start_datetime,
            datetime.timedelta(minutes=45),
        )
        self.assertEqual(Appointment.objects.filter(doctor=self.doctor).count(), 2)

    def test_reschedule_into_buffer_zone_rejected_409(self):
        # 10:50 start sits inside the occupied block's 15-minute sterilization buffer.
        res = self.client.post(self._url(self.movable), {
            'start_datetime': self.t_buffer_zone.isoformat(),
            'end_datetime': (self.t_buffer_zone + datetime.timedelta(minutes=45)).isoformat(),
        }, format='json')

        self.assertEqual(res.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(res.data['error'], 'SLOT_CONFLICT')

    def test_reschedule_to_free_slot_succeeds(self):
        res = self.client.post(self._url(self.movable), {
            'start_datetime': self.t_free.isoformat(),
            'end_datetime': (self.t_free + datetime.timedelta(minutes=45)).isoformat(),
        }, format='json')

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.movable.refresh_from_db()
        self.assertEqual(self.movable.start_datetime, self.t_free)

    def test_reschedule_to_own_slot_allowed(self):
        # Moving an appointment to (effectively) its own time must not trip
        # the conflict check against itself.
        res = self.client.post(self._url(self.movable), {
            'start_datetime': self.movable.start_datetime.isoformat(),
            'end_datetime': self.movable.end_datetime.isoformat(),
        }, format='json')

        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_reschedule_preserves_duration_when_only_start_sent(self):
        # Moving only the start keeps the 45-minute visit length instead of
        # silently stretching or shrinking the appointment.
        res = self.client.post(self._url(self.movable), {
            'start_datetime': self.t_free.isoformat(),
        }, format='json')

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.movable.refresh_from_db()
        self.assertEqual(
            self.movable.end_datetime - self.movable.start_datetime,
            datetime.timedelta(minutes=45),
        )

    def test_reschedule_to_doctor_on_leave_rejected_409(self):
        self.colleague.is_on_leave = True
        self.colleague.save(update_fields=['is_on_leave'])

        res = self.client.post(self._url(self.movable), {
            'doctor_id': str(self.colleague.id),
        }, format='json')

        self.assertEqual(res.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(res.data['error'], 'SLOT_CONFLICT')
        self.movable.refresh_from_db()
        self.assertEqual(self.movable.doctor, self.doctor)

    def test_reassign_to_busy_colleague_rejected_409(self):
        # The colleague already has a visit overlapping the movable time block.
        Appointment.objects.create(
            patient_name='Colleague Busy',
            patient_phone='+2348000000003',
            doctor=self.colleague,
            service=self.service,
            start_datetime=self.t_movable,
            end_datetime=self.t_movable + datetime.timedelta(minutes=30),
            status='confirmed',
        )

        res = self.client.post(f'/api/v1/appointments/{self.movable.id}/reassign-leave/', {
            'new_doctor_id': str(self.colleague.id)
        }, format='json')

        self.assertEqual(res.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(res.data['error'], 'SLOT_CONFLICT')
        self.movable.refresh_from_db()
        self.assertEqual(self.movable.doctor, self.doctor)

    def test_reassign_to_colleague_on_leave_rejected_409(self):
        self.colleague.is_on_leave = True
        self.colleague.save(update_fields=['is_on_leave'])

        res = self.client.post(f'/api/v1/appointments/{self.movable.id}/reassign-leave/', {
            'new_doctor_id': str(self.colleague.id)
        }, format='json')

        self.assertEqual(res.status_code, status.HTTP_409_CONFLICT)
        self.movable.refresh_from_db()
        self.assertEqual(self.movable.doctor, self.doctor)

    def test_reassign_to_free_colleague_succeeds(self):
        res = self.client.post(f'/api/v1/appointments/{self.movable.id}/reassign-leave/', {
            'new_doctor_id': str(self.colleague.id)
        }, format='json')

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.movable.refresh_from_db()
        self.assertEqual(self.movable.doctor, self.colleague)


class Phase3ClinicSettingsTests(APITestCase):
    """
    Rigorously verifies Task 3.4:
    - Dynamic Clinic Settings CRUD (GET / PATCH /api/v1/clinic/settings/)
    - 1-Click White-Label Settings Export & Import (/api/v1/clinic/settings/export/ & /import/)
    - Staff Directory with Live Duty Status Indicators (GET /api/v1/clinic/staff-directory/)
    - 1-Click Doctor Duty Status Toggling (PATCH /api/v1/clinic/doctors/{id}/duty-status/)
    - Master Clinical Calendar Aggregator Feed (GET /api/v1/calendar/schedule/)
    """

    def setUp(self):
        cache.clear()
        self.clinic = ClinicSetting.get_settings()
        self.clinic.webhook_secret = 'clinic_dev_secret_2026'
        self.clinic.save()

        self.admin = StaffUser.objects.create(
            full_name='Dr. Admin Director',
            email='director@clinic.com',
            role='clinic_admin',
            is_active=True,
        )
        self.admin.set_password('AdminPass123!')
        self.admin.save()

        self.receptionist = StaffUser.objects.create(
            full_name='Fatima Frontdesk',
            email='fatima@clinic.com',
            role='receptionist',
            is_active=True,
        )
        self.receptionist.set_password('FrontdeskPass123!')
        self.receptionist.save()

        self.doctor = Doctor.objects.create(
            name='Dr. Bello Ibrahim',
            specialty='Dental Surgery',
            working_days=[1, 2, 3, 4, 5],
            shift_start=datetime.time(8, 0),
            shift_end=datetime.time(18, 0),
            is_active=True,
            is_on_leave=False,
        )

        self.service = Service.objects.create(
            name='General Consultation',
            category='General',
            duration_minutes=30,
            buffer_minutes=10,
            price=12000.00,
        )

    def tearDown(self):
        cache.clear()

    def test_get_clinic_settings(self):
        """
        Staff members can view complete operational settings and white-label config.
        """
        self.client.force_authenticate(user=self.receptionist)
        res = self.client.get('/api/v1/clinic/settings/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['clinic_name'], 'Cedarcare Specialist Clinic')
        self.assertEqual(res.data['grid_increment_minutes'], 15)
        self.assertEqual(res.data['offer_expiry_minutes'], 60)
        self.assertIn('currency', res.data['custom_config'])

    def test_patch_clinic_settings_admin_only(self):
        """
        PATCH /api/v1/clinic/settings/ is restricted to clinic_admin.
        """
        # Receptionist attempt -> 403 Forbidden
        self.client.force_authenticate(user=self.receptionist)
        res_forbidden = self.client.patch('/api/v1/clinic/settings/', {
            'default_buffer_minutes': 20
        }, format='json')
        self.assertEqual(res_forbidden.status_code, status.HTTP_403_FORBIDDEN)

        # Admin attempt -> 200 OK
        self.client.force_authenticate(user=self.admin)
        res_admin = self.client.patch('/api/v1/clinic/settings/', {
            'default_buffer_minutes': 20,
            'clinic_name': 'Cedarcare Abuja Apex Clinic',
            'custom_config': {'currency': 'NGN', 'currency_symbol': '₦', 'white_label': 'agency_v1'}
        }, format='json')
        self.assertEqual(res_admin.status_code, status.HTTP_200_OK)
        self.assertEqual(res_admin.data['default_buffer_minutes'], 20)
        self.assertEqual(res_admin.data['clinic_name'], 'Cedarcare Abuja Apex Clinic')
        self.assertEqual(res_admin.data['custom_config']['white_label'], 'agency_v1')

        # Verify audit log
        audit = AuditLog.objects.filter(
            entity_name='ClinicSetting',
            action='CLINIC_SETTINGS_UPDATED'
        ).first()
        self.assertIsNotNone(audit)
        self.assertEqual(audit.performed_by, self.admin.email)

    def test_export_and_import_clinic_settings(self):
        """
        Tests 1-click JSON configuration export and re-import for agency multi-clinic onboarding.
        """
        # 1. Export
        self.client.force_authenticate(user=self.receptionist)
        export_res = self.client.get('/api/v1/clinic/settings/export/')
        self.assertEqual(export_res.status_code, status.HTTP_200_OK)
        self.assertEqual(export_res['Content-Type'], 'application/json')
        self.assertIn('client-config-', export_res['Content-Disposition'])

        template_data = export_res.json()
        self.assertNotIn('id', template_data)
        self.assertIn('clinic_name', template_data)

        # 2. Modify template and Import as Admin
        template_data['clinic_name'] = 'New Clinic Franchise'
        template_data['offer_expiry_minutes'] = 45

        self.client.force_authenticate(user=self.admin)
        import_res = self.client.post('/api/v1/clinic/settings/import/', template_data, format='json')
        self.assertEqual(import_res.status_code, status.HTTP_200_OK)
        self.assertEqual(import_res.data['settings']['clinic_name'], 'New Clinic Franchise')
        self.assertEqual(import_res.data['settings']['offer_expiry_minutes'], 45)

        # Verify persistent DB update
        self.clinic.refresh_from_db()
        self.assertEqual(self.clinic.clinic_name, 'New Clinic Franchise')
        self.assertEqual(self.clinic.offer_expiry_minutes, 45)

    def test_staff_directory_and_duty_metrics(self):
        """
        GET /api/v1/clinic/staff-directory/ returns active doctors and receptionists
        with live duty status chips and daily visit counts.
        """
        self.client.force_authenticate(user=self.receptionist)

        now = timezone.now()
        Appointment.objects.create(
            patient_name='Directory Test Patient',
            patient_phone='+2348011223344',
            doctor=self.doctor,
            service=self.service,
            start_datetime=now,
            end_datetime=now + datetime.timedelta(minutes=30),
            status='completed',
        )

        res = self.client.get('/api/v1/clinic/staff-directory/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('doctors', res.data)
        self.assertIn('staff', res.data)
        self.assertIn('summary', res.data)

        doctor_entry = next((d for d in res.data['doctors'] if d['id'] == str(self.doctor.id)), None)
        self.assertIsNotNone(doctor_entry)
        self.assertIn('duty_status', doctor_entry)
        self.assertGreaterEqual(doctor_entry['patients_seen_today'], 1)

    def test_doctor_duty_status_toggle(self):
        """
        PATCH /api/v1/clinic/doctors/{id}/duty-status/ toggles doctor leave/active state in 1 click.
        """
        self.client.force_authenticate(user=self.receptionist)

        # Toggle to on_sick_leave
        res = self.client.patch(f'/api/v1/clinic/doctors/{self.doctor.id}/duty-status/', {
            'duty_mode': 'on_sick_leave'
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['duty_status'], 'on_sick_leave')
        self.assertTrue(res.data['is_on_leave'])

        self.doctor.refresh_from_db()
        self.assertTrue(self.doctor.is_on_leave)

        # Verify audit log
        audit = AuditLog.objects.filter(
            entity_name='Doctor',
            entity_id=self.doctor.id,
            action='DOCTOR_DUTY_STATUS_CHANGED'
        ).first()
        self.assertIsNotNone(audit)

    def test_calendar_schedule_query(self):
        """
        GET /api/v1/calendar/schedule/ returns doctor shifts, confirmed appointments,
        and temporary holds across the requested date window.
        """
        self.client.force_authenticate(user=self.receptionist)

        today = timezone.localdate()
        now = timezone.now()

        Appointment.objects.create(
            patient_name='Calendar Patient',
            patient_phone='+2348099881122',
            doctor=self.doctor,
            service=self.service,
            start_datetime=now,
            end_datetime=now + datetime.timedelta(minutes=30),
            status='confirmed',
        )

        res = self.client.get('/api/v1/calendar/schedule/', {
            'start_date': today.isoformat(),
            'end_date': (today + datetime.timedelta(days=3)).isoformat(),
        })
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('doctors', res.data)
        self.assertGreaterEqual(res.data['appointments_count'], 1)

        doctor_schedule = next((d for d in res.data['doctors'] if d['doctor_id'] == str(self.doctor.id)), None)
        self.assertIsNotNone(doctor_schedule)
        self.assertEqual(doctor_schedule['shift_start'], '08:00')
        self.assertEqual(len(doctor_schedule['appointments']), 1)
        self.assertEqual(doctor_schedule['appointments'][0]['patient_name'], 'Calendar Patient')


class Phase3RealtimeWebhookTests(APITestCase):
    """
    Rigorously verifies Task 3.5:
    - Real-Time SSE Stream Endpoint (/api/v1/realtime/stream/ & /events/)
      anti-buffering headers (X-Accel-Buffering: no, text/event-stream), initial connected event
    - T-311: Receptionist Desk Review Presence Broadcasting (/api/v1/realtime/presence/)
      and 3-minute self-expiring TTL cache to prevent ghost locks
    - T-312: Messaging Gateway Webhook Ingestion & Concurrency-Safe Deduplication (/api/v1/webhooks/messaging/inbound/)
      via IdempotencyKey
    - Telegram Bot API Webhook Secret Token Verification (HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN)
    - Real-time Event Bus pub/sub delivery
    """

    def setUp(self):
        cache.clear()
        self.clinic = ClinicSetting.get_settings()
        self.clinic.webhook_secret = 'clinic_dev_secret_2026'
        self.clinic.custom_config['telegram_secret_token'] = 'prod-secret-tg-token-777'
        self.clinic.save()
        self.receptionist = StaffUser.objects.create(
            full_name='Zainab Frontdesk',
            email='zainab@clinic.com',
            role='receptionist',
            is_active=True,
        )
        self.receptionist.set_password('ZainabPass123!')
        self.receptionist.save()

    def tearDown(self):
        cache.clear()

    def test_realtime_stream_connection_and_headers(self):
        """
        SEC-01: GET /api/v1/realtime/events/?limit=1 requires staff authentication (401 on anonymous),
        and upon authentication connects to SSE stream returning text/event-stream with X-Accel-Buffering: no.
        """
        # 1. Anonymous connection rejected under SEC-01
        anon_res = self.client.get('/api/v1/realtime/events/?limit=1')
        self.assertEqual(anon_res.status_code, status.HTTP_401_UNAUTHORIZED)

        # 2. Authenticated staff connects successfully
        self.client.force_authenticate(user=self.receptionist)
        res = self.client.get('/api/v1/realtime/events/?limit=1')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res['Content-Type'], 'text/event-stream')
        self.assertEqual(res['X-Accel-Buffering'], 'no')
        self.assertEqual(res['Cache-Control'], 'no-cache, no-transform')

        # Read streaming content
        chunks = [chunk.decode('utf-8') if isinstance(chunk, bytes) else chunk for chunk in res.streaming_content]
        full_content = "".join(chunks)
        self.assertIn('event: connected', full_content)
        self.assertIn('"status": "connected"', full_content)

    def test_presence_broadcast_and_cache_ttl(self):
        """
        T-311: POST /api/v1/realtime/presence/ broadcasts desk presence
        and stores 3-minute TTL in cache. stop_review clears the cache key.
        """
        self.client.force_authenticate(user=self.receptionist)
        req_id = 'REQ-2026-0042'

        # 1. Start review presence
        res = self.client.post('/api/v1/realtime/presence/', {
            'request_id': req_id,
            'action': 'start_review',
        }, format='json')

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['status'], 'broadcasted')
        self.assertEqual(res.data['presence']['reviewer_name'], 'Zainab Frontdesk')

        # Verify cached with 180s TTL
        cached = cache.get(f"review_presence_{req_id}")
        self.assertIsNotNone(cached)
        self.assertEqual(cached['reviewer_name'], 'Zainab Frontdesk')

        # 2. Stop review presence
        res_stop = self.client.post('/api/v1/realtime/presence/', {
            'request_id': req_id,
            'action': 'stop_review',
        }, format='json')
        self.assertEqual(res_stop.status_code, status.HTTP_200_OK)

        # Cache key should be cleaned up immediately
        self.assertIsNone(cache.get(f"review_presence_{req_id}"))

    def test_sse_event_name_contract_phase25(self):
        """
        Phase 2.5 (system review finding #5): pin the canonical SSE event
        NAMES the backend broadcasts. The frontend registers listeners for
        exactly these names — a rename on either side silently kills live
        updates (presence badges, swimlane moves, re-request alerts), so the
        contract is asserted here per broadcaster, end to end.
        """
        from unittest.mock import patch

        self.client.force_authenticate(user=self.receptionist)

        # 1. Desk presence -> 'request.reviewing'
        with patch('appointments.views_realtime.broadcast_event') as mock_b:
            res = self.client.post('/api/v1/realtime/presence/', {
                'request_id': 'REQ-2026-0042',
                'action': 'start_review',
            }, format='json')
            self.assertEqual(res.status_code, status.HTTP_200_OK)
            mock_b.assert_called_once()
            self.assertEqual(mock_b.call_args[0][0], 'request.reviewing')

        # 2. Appointment lifecycle -> 'appointment.status_changed'
        now = timezone.now()
        doctor = Doctor.objects.create(name='Dr. SSE Contract')
        service = Service.objects.create(
            name='SSE Contract Consult', duration_minutes=30, buffer_minutes=5, price=1000,
        )
        appt = Appointment.objects.create(
            patient_name='SSE Contract',
            patient_phone='+2348099990001',
            doctor=doctor,
            service=service,
            start_datetime=now + datetime.timedelta(days=1),
            end_datetime=now + datetime.timedelta(days=1, minutes=30),
            status='confirmed',
        )
        with patch('appointments.views_appointment.broadcast_event') as mock_b:
            res = self.client.patch(f'/api/v1/appointments/{appt.id}/status/', {
                'status': 'arrived',
            }, format='json')
            self.assertEqual(res.status_code, status.HTTP_200_OK)
            mock_b.assert_called_once()
            self.assertEqual(mock_b.call_args[0][0], 'appointment.status_changed')

        # 3. Expired-offer re-request -> 'request.re_requested'
        booking = BookingRequest.objects.create(
            request_code='REQ-2026-7777',
            patient_name='Re Request SSE',
            patient_phone='+2348099990002',
            service=service,
            status='offer_expired',
        )
        with patch('appointments.views_booking.broadcast_event') as mock_b:
            res = self.client.post(
                f'/api/v1/booking-requests/{booking.request_code}/re-request/',
                HTTP_X_WEBHOOK_SECRET='clinic_dev_secret_2026',
            )
            self.assertEqual(res.status_code, status.HTTP_200_OK)
            mock_b.assert_called_once()
            self.assertEqual(mock_b.call_args[0][0], 'request.re_requested')

    def test_webhook_idempotency_deduplication_t312(self):
        """
        T-312: Webhook ingestion with IdempotencyKey.
        First delivery registers key and returns 200 'processed'.
        Second delivery with same update_id returns 200 'duplicate_ignored' with 0 duplicate DB entries.
        """
        webhook_payload = {
            'update_id': 99112233,
            'channel': 'telegram',
            'message': {
                'from': {'id': 12345, 'first_name': 'Aliyu'},
                'text': 'I accept slot 1',
            }
        }

        # 1. Initial ingestion
        res1 = self.client.post('/api/v1/webhooks/messaging/inbound/', webhook_payload, format='json', HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN='prod-secret-tg-token-777')
        self.assertEqual(res1.status_code, status.HTTP_200_OK)
        self.assertEqual(res1.data['status'], 'processed')
        self.assertTrue(res1.data['created'])
        self.assertEqual(res1.data['update_id'], '99112233')

        self.assertEqual(IdempotencyKey.objects.filter(key='99112233').count(), 1)

        # Verify audit log recorded
        audit = AuditLog.objects.filter(
            entity_name='IdempotencyKey',
            action='WEBHOOK_INGESTED'
        ).first()
        self.assertIsNotNone(audit)
        self.assertEqual(audit.performed_by, 'Gateway:telegram')

        # 2. Duplicate ingestion (network retry or retry sweep)
        res2 = self.client.post('/api/v1/webhooks/messaging/inbound/', webhook_payload, format='json', HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN='prod-secret-tg-token-777')
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        self.assertEqual(res2.data['status'], 'duplicate_ignored')
        self.assertIn('already been processed', res2.data['detail'])

        # Total keys remains 1
        self.assertEqual(IdempotencyKey.objects.filter(key='99112233').count(), 1)

    def test_webhook_telegram_secret_token_verification(self):
        """
        Verifies X-Telegram-Bot-Api-Secret-Token cryptographic header check.
        Returns 403 Forbidden if token mismatch, 200 OK when matching.
        """
        self.clinic.custom_config['telegram_secret_token'] = 'prod-secret-tg-token-777'
        self.clinic.save()

        payload = {'update_id': 88442211, 'channel': 'telegram'}

        # Missing token header -> 403 Forbidden (REV-BE-04)
        res_missing = self.client.post(
            '/api/v1/webhooks/telegram/inbound/',
            payload,
            format='json'
        )
        self.assertEqual(res_missing.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(res_missing.data['error'], 'INVALID_WEBHOOK_SECRET')

        # Mismatched token -> 403 Forbidden
        res_fail = self.client.post(
            '/api/v1/webhooks/telegram/inbound/',
            payload,
            format='json',
            HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN='wrong-token'
        )
        self.assertEqual(res_fail.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(res_fail.data['error'], 'INVALID_WEBHOOK_SECRET')

        # Matching token -> 200 OK
        res_ok = self.client.post(
            '/api/v1/webhooks/telegram/inbound/',
            payload,
            format='json',
            HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN='prod-secret-tg-token-777'
        )
        self.assertEqual(res_ok.status_code, status.HTTP_200_OK)
        self.assertEqual(res_ok.data['status'], 'processed')

    def test_sse_event_bus_pubsub(self):
        """
        Tests that the SSEEventBus singleton delivers events to subscribed listeners.
        """
        from .services.sse_bus import bus, broadcast_event
        q = bus.subscribe()
        try:
            broadcast_event('test.event', {'ping': 'pong'})
            item = q.get(timeout=2.0)
            self.assertIn('event: test.event\n', item)
            self.assertIn('"ping": "pong"', item)
        finally:
            bus.unsubscribe(q)


class Phase3AnalyticsTests(APITestCase):
    """
    Rigorously verifies Task 3.6:
    - T-313: Clinical Analytics KPI Summary (GET /api/v1/analytics/summary/)
      aggregating total bookings, attendance vs no-show rate, triage velocity,
      today's revenue, category breakdown, hourly trend, and top doctors/services.
    - Zero-division safety on empty databases (Risk EC-1).
    - Query parameter date filtering (?start_date=&end_date=).
    - T-314: RFC 4180 CSV Export Endpoints (GET /api/v1/analytics/export/appointments/ & attendance/).
    - RBAC 401 Unauthorized protection against unauthenticated access (Risk EC-5).
    """

    def setUp(self):
        cache.clear()
        self.clinic = ClinicSetting.get_settings()
        self.clinic.webhook_secret = 'clinic_dev_secret_2026'
        self.clinic.save()

        self.doctor = Doctor.objects.create(
            name='Dr. Aminu Kano',
            specialty='Dentistry',
            working_days=[1, 2, 3, 4, 5],
            shift_start=datetime.time(8, 0),
            shift_end=datetime.time(18, 0),
            is_active=True,
        )

        self.service1 = Service.objects.create(
            name='Teeth Whitening',
            category='Dental Care',
            duration_minutes=45,
            buffer_minutes=15,
            price=30000.00,
        )
        self.service2 = Service.objects.create(
            name='General Consultation',
            category='General',
            duration_minutes=30,
            buffer_minutes=10,
            price=15000.00,
        )

        self.receptionist = StaffUser.objects.create(
            full_name='Zainab Frontdesk',
            email='zainab.desk@clinic.com',
            role='receptionist',
            is_active=True,
        )
        self.receptionist.set_password('ZainabPass123!')
        self.receptionist.save()

    def tearDown(self):
        cache.clear()

    def test_analytics_summary_unauthenticated_rejected_401(self):
        """
        Unauthenticated requests must return 401 Unauthorized.
        """
        res = self.client.get('/api/v1/analytics/summary/')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

        res_csv = self.client.get('/api/v1/analytics/export/appointments/')
        self.assertEqual(res_csv.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_analytics_summary_empty_database_resilience(self):
        """
        Empty database (0 appointments) must return 200 OK without ZeroDivisionError.
        """
        self.client.force_authenticate(user=self.receptionist)
        res = self.client.get('/api/v1/analytics/summary/')

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['totalAppointments'], 0)
        self.assertEqual(res.data['attendanceRatePct'], 100.0)
        self.assertEqual(res.data['noShowRatePct'], 0.0)
        self.assertEqual(res.data['avgTriageVelocityMin'], 0.0)
        self.assertEqual(res.data['todayRevenue'], 0.0)
        self.assertEqual(res.data['todayRevenueFormatted'], '₦0')
        self.assertEqual(len(res.data['hourlyDistribution']), 10)  # 08:00 to 17:00

    def test_analytics_summary_populated_kpis_t313(self):
        """
        T-313: Tests accurate calculation of attendance rates, today's revenue,
        hourly buckets, top services, and triage velocity.
        """
        self.client.force_authenticate(user=self.receptionist)

        now = timezone.now()
        today = timezone.localdate()
        today_start = timezone.make_aware(datetime.datetime.combine(today, datetime.time(10, 0)))

        # 1. Create a request with triage velocity tracking
        req = BookingRequest.objects.create(
            patient_name='Kelechi Test',
            patient_phone='+2348011112222',
            service=self.service1,
            status='slots_offered',
        )
        offer = SlotOffer.objects.create(
            request=req,
            doctor=self.doctor,
            start_datetime=today_start,
            end_datetime=today_start + datetime.timedelta(minutes=45),
            expires_at=now + datetime.timedelta(minutes=50),
        )
        SlotOffer.objects.filter(id=offer.id).update(
            offered_at=req.created_at + datetime.timedelta(minutes=5)
        )

        # 2. Create appointments with distinct statuses
        # Completed (attending)
        Appointment.objects.create(
            patient_name='Patient Completed',
            patient_phone='+2348022223333',
            doctor=self.doctor,
            service=self.service1,
            start_datetime=today_start,
            end_datetime=today_start + datetime.timedelta(minutes=45),
            status='completed',
            completed_at=now,
        )
        # No-show (missed)
        Appointment.objects.create(
            patient_name='Patient NoShow',
            patient_phone='+2348033334444',
            doctor=self.doctor,
            service=self.service2,
            start_datetime=today_start + datetime.timedelta(hours=1),
            end_datetime=today_start + datetime.timedelta(hours=1, minutes=30),
            status='no_show',
        )
        # Confirmed
        Appointment.objects.create(
            patient_name='Patient Confirmed',
            patient_phone='+2348044445555',
            doctor=self.doctor,
            service=self.service1,
            start_datetime=today_start + datetime.timedelta(hours=2),
            end_datetime=today_start + datetime.timedelta(hours=2, minutes=45),
            status='confirmed',
        )

        res = self.client.get('/api/v1/analytics/summary/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # 3 total appointments
        self.assertEqual(res.data['totalAppointments'], 3)
        self.assertEqual(res.data['total_appointments'], 3)

        # Attendance: 1 completed, 1 no-show => 50%
        self.assertEqual(res.data['attendanceRatePct'], 50.0)
        self.assertEqual(res.data['noShowRatePct'], 50.0)

        # Today's Revenue: service1 (30,000) + service1 (30,000) = 60,000 (no-show excluded from revenue)
        self.assertEqual(res.data['todayRevenue'], 60000.0)
        self.assertEqual(res.data['todayRevenueFormatted'], '₦60,000')

        # Category revenue breakdown
        self.assertIn('Dental Care', res.data['revenueByCategory'])
        self.assertEqual(res.data['revenueByCategory']['Dental Care'], 60000.0)

        # Triage velocity (15m to 10m ago => ~5 minutes)
        self.assertAlmostEqual(res.data['avgTriageVelocityMin'], 5.0, delta=1.0)

        # Top Services
        self.assertEqual(res.data['topServices'][0]['name'], 'Teeth Whitening')
        self.assertEqual(res.data['topServices'][0]['count'], 2)

        # Top Doctors
        self.assertEqual(res.data['topDoctors'][0]['name'], 'Dr. Aminu Kano')
        self.assertEqual(res.data['topDoctors'][0]['completed_count'], 1)

    def test_analytics_summary_date_range_filtering(self):
        """
        Tests date filtering via ?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD.
        """
        self.client.force_authenticate(user=self.receptionist)

        past_date = (timezone.localdate() - datetime.timedelta(days=10))
        future_date = (timezone.localdate() + datetime.timedelta(days=10))

        past_dt = timezone.make_aware(datetime.datetime.combine(past_date, datetime.time(11, 0)))
        future_dt = timezone.make_aware(datetime.datetime.combine(future_date, datetime.time(11, 0)))

        Appointment.objects.create(
            patient_name='Past Patient',
            patient_phone='+2348011110000',
            doctor=self.doctor,
            service=self.service1,
            start_datetime=past_dt,
            end_datetime=past_dt + datetime.timedelta(minutes=45),
            status='completed',
        )
        Appointment.objects.create(
            patient_name='Future Patient',
            patient_phone='+2348022220000',
            doctor=self.doctor,
            service=self.service2,
            start_datetime=future_dt,
            end_datetime=future_dt + datetime.timedelta(minutes=30),
            status='confirmed',
        )

        # Query only the past window
        res_past = self.client.get('/api/v1/analytics/summary/', {
            'start_date': (past_date - datetime.timedelta(days=1)).isoformat(),
            'end_date': (past_date + datetime.timedelta(days=1)).isoformat(),
        })
        self.assertEqual(res_past.status_code, status.HTTP_200_OK)
        self.assertEqual(res_past.data['totalAppointments'], 1)
        self.assertEqual(res_past.data['breakdown']['completed'], 1)

    def test_analytics_csv_exports_t314(self):
        """
        T-314: Tests CSV file streaming endpoints under /api/v1/analytics/export/...
        """
        self.client.force_authenticate(user=self.receptionist)

        # Appointments CSV export
        res_appt = self.client.get('/api/v1/analytics/export/appointments/')
        self.assertEqual(res_appt.status_code, status.HTTP_200_OK)
        self.assertEqual(res_appt['Content-Type'], 'text/csv')
        self.assertIn('attachment; filename="appointments_', res_appt['Content-Disposition'])

        # Attendance CSV export
        res_att = self.client.get('/api/v1/analytics/export/attendance/')
        self.assertEqual(res_att.status_code, status.HTTP_200_OK)
        self.assertEqual(res_att['Content-Type'], 'text/csv')
        self.assertIn('attachment; filename="attendance_', res_att['Content-Disposition'])
        self.assertIn('Doctor Name,Specialty', res_att.content.decode('utf-8'))


class Phase5TelegramTests(APITestCase):
    """
    Rigorously verifies Task 5.1:
    - Outbound Telegram message formatting (HTML escaping, Inline Keyboard arrays).
    - Inbound Telegram webhook routing (/start, text, callback_query).
    - EC-1: Expired slot rejection & graceful recovery prompt.
    - EC-2: Rapid multi-click / already booked protection.
    - EC-3: Safe HTML formatting preventing crash from special characters.
    - EC-4: Two patients competing for same slot (conflict handling).
    - Re-requesting expired slots into receptionist priority tab.
    - Interactive 24h reminder confirmation & cancellation callbacks.
    """

    def setUp(self):
        cache.clear()
        self.clinic = ClinicSetting.get_settings()
        self.clinic.webhook_secret = 'clinic_dev_secret_2026'
        self.clinic.custom_config['telegram_secret_token'] = 'prod-secret-tg-token-777'
        self.clinic.save()
        # Inject the Telegram gateway secret header for every request in this class
        # (fail-closed inbound verification is active under the test runner).
        self.client.credentials(HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN='prod-secret-tg-token-777')
        self.doctor = Doctor.objects.create(
            name='Dr. Bello (Dentist & Surgeon)',
            specialty='Dental Surgery',
            working_days=[1, 2, 3, 4, 5],
            shift_start=datetime.time(8, 0),
            shift_end=datetime.time(18, 0),
            is_active=True,
        )
        self.service = Service.objects.create(
            name='Dental Examination <Advanced>',
            category='Dental Care',
            duration_minutes=30,
            buffer_minutes=10,
            price=20000.00,
        )
        self.booking = BookingRequest.objects.create(
            patient_name='Amina O\'Connor <VIP>',
            patient_phone='+2348011223344',
            service=self.service,
            channel='telegram',
            status='slots_offered',
        )
        now = timezone.now()
        # Wave 2: the booking path now enforces the clinic calendar, so the
        # offer must sit on a deterministic LEGAL slot - a weekday inside the
        # doctor's shift - instead of a wall-clock offset that can land at
        # 03:00 or on a Saturday depending on when the suite runs.
        day = timezone.localdate() + datetime.timedelta(days=1)
        while day.isoweekday() > 5:
            day += datetime.timedelta(days=1)
        offer_start = timezone.make_aware(
            datetime.datetime.combine(day, datetime.time(10, 0))
        )
        self.offer = SlotOffer.objects.create(
            request=self.booking,
            doctor=self.doctor,
            start_datetime=offer_start,
            end_datetime=offer_start + datetime.timedelta(minutes=30),
            expires_at=now + datetime.timedelta(minutes=60),
            is_selected=False,
        )

    def tearDown(self):
        cache.clear()

    def test_telegram_slot_offers_format_and_html_escaping(self):
        """
        EC-3: Verifies safe HTML escaping for special characters (<, >, &, quotes)
        and inline keyboard button structure.
        """
        from .services.telegram_service import TelegramService
        text, markup = TelegramService.format_slot_offers(self.booking, [self.offer], self.clinic)

        # Assert special characters are escaped
        self.assertIn('&lt;Advanced&gt;', text)
        self.assertIn('Amina O&#x27;Connor &lt;VIP&gt;', text)
        self.assertNotIn('<script>', text)

        # Assert inline keyboard buttons
        self.assertEqual(len(markup['inline_keyboard']), 2)  # 1 slot + 1 chat reception button
        self.assertEqual(markup['inline_keyboard'][0][0]['callback_data'], f'select_slot_{self.offer.id}')

    def test_telegram_callback_slot_selection_success(self):
        """
        Patient taps [1️⃣ 10:00 AM] -> triggers atomic hold, marks offer selected,
        returns confirmation card, and strips buttons.
        """
        payload = {
            'update_id': 100200301,
            'channel': 'telegram',
            'callback_query': {
                'id': 'cq_12345',
                'data': f'select_slot_{self.offer.id}',
                'from': {'id': 98765432, 'first_name': 'Amina'},
                'message': {
                    'message_id': 555,
                    'chat': {'id': 98765432}
                }
            }
        }

        res = self.client.post('/api/v1/webhooks/telegram/inbound/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['status'], 'processed')
        self.assertEqual(res.data['telegram_result']['status'], 'confirmed')
        self.assertTrue(res.data['telegram_result']['appointment_code'].startswith('AP-'))

        # Verify DB state
        self.offer.refresh_from_db()
        self.assertTrue(self.offer.is_selected)

        appt = Appointment.objects.get(appointment_code=res.data['telegram_result']['appointment_code'])
        self.assertEqual(appt.status, 'held')
        self.assertEqual(appt.patient_name, self.booking.patient_name)

    def test_telegram_callback_expired_slot_rejection_ec1(self):
        """
        EC-1: Patient taps button after 60-minute offer window expired.
        Must reject booking, leave appointment uncreated, and offer fresh times.
        """
        # Expire offer
        self.offer.expires_at = timezone.now() - datetime.timedelta(minutes=5)
        self.offer.save(update_fields=['expires_at'])

        payload = {
            'update_id': 100200302,
            'channel': 'telegram',
            'callback_query': {
                'id': 'cq_expired',
                'data': f'select_slot_{self.offer.id}',
                'from': {'id': 98765432},
                'message': {'message_id': 556, 'chat': {'id': 98765432}}
            }
        }

        initial_appt_count = Appointment.objects.count()
        res = self.client.post('/api/v1/webhooks/telegram/inbound/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['telegram_result']['status'], 'expired_handled')
        self.assertEqual(Appointment.objects.count(), initial_appt_count)  # Zero DB mutation

    def test_telegram_callback_rapid_double_click_ec2(self):
        """
        EC-2: Patient rapidly taps slot button twice.
        Second tap returns 'already_selected' without creating duplicate appointment.
        """
        self.offer.is_selected = True
        self.offer.save(update_fields=['is_selected'])

        payload = {
            'update_id': 100200303,
            'channel': 'telegram',
            'callback_query': {
                'id': 'cq_double',
                'data': f'select_slot_{self.offer.id}',
                'from': {'id': 98765432},
                'message': {'message_id': 557, 'chat': {'id': 98765432}}
            }
        }

        initial_count = Appointment.objects.count()
        res = self.client.post('/api/v1/webhooks/telegram/inbound/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['telegram_result']['status'], 'already_selected')
        self.assertEqual(Appointment.objects.count(), initial_count)

    def test_telegram_callback_re_request_expired_slots(self):
        """
        Patient taps [🔄 See New Times] -> transitions request to 're_requested'
        to prioritize in receptionist triage queue.
        """
        payload = {
            'update_id': 100200304,
            'channel': 'telegram',
            'callback_query': {
                'id': 'cq_rereq',
                'data': f're_request_{self.booking.id}',
                'from': {'id': 98765432},
                'message': {'message_id': 558, 'chat': {'id': 98765432}}
            }
        }

        res = self.client.post('/api/v1/webhooks/telegram/inbound/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['telegram_result']['status'], 're_requested_handled')

        self.booking.refresh_from_db()
        self.assertEqual(self.booking.status, 're_requested')

        # Verify audit log recorded
        self.assertTrue(AuditLog.objects.filter(entity_name='BookingRequest', action='PATIENT_RE_REQUESTED_TIMES').exists())

    def test_telegram_callback_confirm_attendance(self):
        """
        Patient taps [✅ I'll Be There] from 24h reminder.
        """
        now = timezone.now()
        appt = Appointment.objects.create(
            patient_name='Kelechi Okoye',
            patient_phone='+2348099887766',
            doctor=self.doctor,
            service=self.service,
            start_datetime=now + datetime.timedelta(days=1),
            end_datetime=now + datetime.timedelta(days=1, minutes=30),
            status='held',
        )

        payload = {
            'update_id': 100200305,
            'channel': 'telegram',
            'callback_query': {
                'id': 'cq_confirm',
                'data': f'confirm_attend_{appt.id}',
                'from': {'id': 98765432},
                'message': {'message_id': 559, 'chat': {'id': 98765432}}
            }
        }

        res = self.client.post('/api/v1/webhooks/telegram/inbound/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['telegram_result']['status'], 'confirmed_attendance')

        appt.refresh_from_db()
        self.assertEqual(appt.status, 'confirmed')
        self.assertIsNotNone(appt.confirmed_at)

    def test_telegram_callback_cancellation(self):
        """
        Patient taps [❌ Cancel] from reminder or confirmation card.
        """
        now = timezone.now()
        appt = Appointment.objects.create(
            patient_name='Emeka Nnamdi',
            patient_phone='+2348077665544',
            doctor=self.doctor,
            service=self.service,
            start_datetime=now + datetime.timedelta(days=1),
            end_datetime=now + datetime.timedelta(days=1, minutes=30),
            status='confirmed',
        )

        payload = {
            'update_id': 100200306,
            'channel': 'telegram',
            'callback_query': {
                'id': 'cq_cancel',
                'data': f'cancel_{appt.id}',
                'from': {'id': 98765432},
                'message': {'message_id': 560, 'chat': {'id': 98765432}}
            }
        }

        res = self.client.post('/api/v1/webhooks/telegram/inbound/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['telegram_result']['status'], 'cancelled_by_patient')

        appt.refresh_from_db()
        self.assertEqual(appt.status, 'cancelled')
        self.assertIn('Cancelled by patient', appt.cancellation_reason)

    def test_telegram_inbound_start_message(self):
        """
        Patient enters /start -> receives clinic welcome message.
        """
        payload = {
            'update_id': 100200307,
            'channel': 'telegram',
            'message': {
                'message_id': 561,
                'chat': {'id': 98765432},
                'text': '/start'
            }
        }

        res = self.client.post('/api/v1/webhooks/telegram/inbound/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['telegram_result']['status'], 'welcomed')

    def test_telegram_interactive_service_booking_and_dispatch(self):
        """
        Patient walks the FULL Telegram conversational booking flow:
        book_svc_<id> -> date range (tg_rng) -> time window (tg_win) ->
        gender (tg_gen) -> BookingRequest created with telegram_chat_id in
        patient_notes, and receptionist can dispatch offers without error.

        Phase 2.5 (system review finding #9): the flow gained the
        date-range / time-window / gender conversational steps after this
        test was written; it asserted 'booking_request_created' straight
        after the service tap and has been the suite's one red test since.
        """
        def tg_callback(update_id, data, callback_id):
            return {
                'update_id': update_id,
                'channel': 'telegram',
                'callback_query': {
                    'id': callback_id,
                    'data': data,
                    'from': {'id': 98765432, 'first_name': 'Musa', 'last_name': 'Yusuf'},
                    'message': {'message_id': 562, 'chat': {'id': 98765432}}
                }
            }

        # 1. Service tap -> prompted for a preferred date range
        res = self.client.post(
            '/api/v1/webhooks/telegram/inbound/',
            tg_callback(100200308, f'book_svc_{self.service.id}', 'cq_book_svc_1'),
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['telegram_result']['status'], 'prompted_date_range')

        # 2. Date range ("Next 7 Days") -> prompted for a time window
        res = self.client.post(
            '/api/v1/webhooks/telegram/inbound/',
            tg_callback(100200309, f'tg_rng_{self.service.id}_7', 'cq_rng_7'),
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['telegram_result']['status'], 'prompted_time_window')

        # 3. Time window (morning) -> prompted for gender
        res = self.client.post(
            '/api/v1/webhooks/telegram/inbound/',
            tg_callback(100200310, f'tg_win_{self.service.id}_7_morning', 'cq_win_morning'),
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['telegram_result']['status'], 'prompted_gender')

        # 4. Gender -> BookingRequest created
        res = self.client.post(
            '/api/v1/webhooks/telegram/inbound/',
            tg_callback(100200311, f'tg_gen_{self.service.id}_7_morning_male', 'cq_gen_male'),
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['telegram_result']['status'], 'booking_request_created')
        req_code = res.data['telegram_result']['request_id']

        created_req = BookingRequest.objects.get(request_code=req_code)
        self.assertEqual(created_req.patient_name, 'Musa Yusuf')
        self.assertEqual(created_req.channel, 'telegram')
        self.assertIn('telegram_chat_id:98765432', created_req.patient_notes)
        self.assertIn('start', created_req.preferred_date_range)

        # Receptionist dispatches slot offers to this Telegram request
        receptionist = StaffUser.objects.create(
            full_name='Desk Staff',
            email='desk.tg@clinic.com',
            role='receptionist',
            is_active=True,
        )
        receptionist.set_password('Pass123!')
        receptionist.save()
        self.client.force_authenticate(user=receptionist)

        day = timezone.localdate() + datetime.timedelta(days=1)
        while day.isoweekday() > 5:
            day += datetime.timedelta(days=1)
        slot_start = timezone.make_aware(
            datetime.datetime.combine(day, datetime.time(11, 0))
        )
        slot_end = slot_start + datetime.timedelta(minutes=30)
        dispatch_res = self.client.post(f'/api/v1/booking-requests/{created_req.id}/dispatch-offers/', {
            'slots': [{
                'doctor_id': str(self.doctor.id),
                'start_datetime': slot_start.isoformat(),
                'end_datetime': slot_end.isoformat(),
            }]
        }, format='json')
        self.assertEqual(dispatch_res.status_code, status.HTTP_200_OK)
        self.assertEqual(dispatch_res.data['status'], 'slots_offered')


class Phase6ConcurrencyAndE2ETests(APITestCase):
    """
    Phase 6 Comprehensive Verification Suite:
    - Task 6.1: Concurrency & Atomic Lock Tests (Race condition handling, simultaneous receptionist dispatch).
    - Task 6.2: End-to-End 10-Step Full Booking Lifecycle Verification.
    - Task 6.3: Admin Deactivation & Immediate Session Killswitch Revocation.
    """

    def setUp(self):
        cache.clear()
        self.clinic = ClinicSetting.get_settings()
        self.clinic.webhook_secret = 'clinic_dev_secret_2026'
        self.clinic.custom_config['telegram_secret_token'] = 'prod-secret-tg-token-777'
        self.clinic.save()

        # Create staff user
        self.staff_password = 'Password123!'
        self.staff_pin = '4321'
        self.staff = StaffUser.objects.create(
            full_name='Amina Lead Receptionist',
            email='amina.lead@clinic.com',
            role='receptionist',
            is_active=True,
        )
        self.staff.set_password(self.staff_password)
        self.staff.set_pin(self.staff_pin)
        self.staff.save()

        # Doctor & Service
        self.doctor = Doctor.objects.create(
            name='Dr. Bello Ibrahim',
            specialty='General Medicine',
            working_days=[1, 2, 3, 4, 5],
            shift_start=datetime.time(8, 0),
            shift_end=datetime.time(17, 0),
            is_active=True,
            is_on_leave=False,
        )
        self.service = Service.objects.create(
            name='Medical Consultation',
            category='General',
            duration_minutes=30,
            buffer_minutes=10,
            price=20000.00,
        )
        DoctorService.objects.create(doctor=self.doctor, service=self.service)

    def _authenticate_staff(self):
        login_res = self.client.post('/api/v1/auth/login/', {
            'email': self.staff.email,
            'password': self.staff_password,
        }, format='json')
        self.assertEqual(login_res.status_code, status.HTTP_200_OK)
        token = login_res.data['access']
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        return token

    def test_concurrent_slot_selection_atomic_lock_t601(self):
        """
        Task 6.1: Tests that when two patients attempt to claim overlapping slots,
        HoldService's atomic select_for_update lock grants the slot to the first patient
        and strictly rejects the second patient with a 409 Conflict / SlotConflictException.
        """
        today = timezone.now().date()
        target_date = today + datetime.timedelta(days=(1 - today.isoweekday()) % 7 + 7)  # Next Monday
        start_dt = timezone.make_aware(datetime.datetime.combine(target_date, datetime.time(10, 0)))
        end_dt = timezone.make_aware(datetime.datetime.combine(target_date, datetime.time(10, 30)))

        # Patient A claims slot
        appt_a = HoldService.acquire_slot(
            doctor_id=self.doctor.id,
            service_id=self.service.id,
            start_datetime=start_dt,
            end_datetime=end_dt,
            patient_name='Patient Alpha',
            patient_phone='+2348011111111',
            is_hold=True,
            performed_by='patient_alpha'
        )
        self.assertEqual(appt_a.status, 'held')

        # Patient B attempts to claim the exact same doctor and overlapping time block
        with self.assertRaises(SlotConflictException):
            HoldService.acquire_slot(
                doctor_id=self.doctor.id,
                service_id=self.service.id,
                start_datetime=start_dt,
                end_datetime=end_dt,
                patient_name='Patient Beta',
                patient_phone='+2348022222222',
                is_hold=True,
                performed_by='patient_beta'
            )

        # Test API endpoint response when booking overlapping slot
        overlap_payload = {
            'doctor_id': str(self.doctor.id),
            'service_id': str(self.service.id),
            'start_datetime': start_dt.isoformat(),
            'end_datetime': end_dt.isoformat(),
            'patient_name': 'Patient Gamma',
            'patient_phone': '+2348033333333',
        }
        res = self.client.post('/api/v1/slots/hold/', overlap_payload, format='json', HTTP_X_WEBHOOK_SECRET='clinic_dev_secret_2026')
        self.assertEqual(res.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(res.data['error'], 'SLOT_CONFLICT')

        # Verify only 1 active appointment exists for this time block
        active_count = Appointment.objects.filter(
            doctor=self.doctor,
            start_datetime=start_dt,
            status__in=['held', 'confirmed']
        ).count()
        self.assertEqual(active_count, 1)

    def test_dual_receptionist_simultaneous_dispatch_t601(self):
        """
        Task 6.1: Verifies that if two receptionists simultaneously click
        [Approve & Dispatch Offers] for the same booking request, the operation
        is serialized atomically without duplicate SlotOffer records.
        """
        self._authenticate_staff()

        # Create intake booking request
        today = timezone.now().date()
        target_date = today + datetime.timedelta(days=(1 - today.isoweekday()) % 7 + 7)
        booking = BookingRequest.objects.create(
            patient_name='Chioma Obi',
            patient_phone='+2348055556666',
            service=self.service,
            preferred_doctor=self.doctor,
            preferred_date_range={'start': target_date.isoformat(), 'end': target_date.isoformat()},
            preferred_time_window='morning',
            channel='web',
            status='awaiting_review',
        )

        dispatch_url = f'/api/v1/booking-requests/{booking.id}/dispatch-offers/'

        # Receptionist 1 dispatches offers
        res1 = self.client.post(dispatch_url, {}, format='json')
        self.assertEqual(res1.status_code, status.HTTP_200_OK)
        self.assertEqual(res1.data['status'], 'slots_offered')

        # Receptionist 2 immediately dispatches offers for the same card
        res2 = self.client.post(dispatch_url, {}, format='json')
        self.assertEqual(res2.status_code, status.HTTP_200_OK)

        # Assert no duplicated orphan offers (old unselected ones were cleaned up atomically)
        offers_count = SlotOffer.objects.filter(request=booking).count()
        self.assertLessEqual(offers_count, 3)

        booking.refresh_from_db()
        self.assertEqual(booking.status, 'slots_offered')

    def test_full_10_step_lifecycle_e2e_t602(self):
        """
        Task 6.2: Complete End-to-End 10-Step Receptionist-Approved Clinical Journey:
        1. Public patient intake with phone sanitization.
        2. FIFO queue retrieval.
        3. Front desk candidate slot check.
        4. Receptionist approves & dispatches candidate slots (1-hour window).
        5. Patient taps option 1 via Telegram callback -> atomic hold/confirm.
        6. 24h reminder scheduled query.
        7. Patient confirms attendance via callback.
        8. Live visits progression: Arrived -> In Consultation -> Completed.
        9. Doctor records clinical follow-up recall.
        10. Verification of immutable AuditLog trail.
        """
        # Step 1: Patient Submits Intake via Web/Telegram API
        today = timezone.now().date()
        target_date = today + datetime.timedelta(days=(1 - today.isoweekday()) % 7 + 7)  # Next Monday
        intake_res = self.client.post('/api/v1/booking-requests/', {
            'patient_name': 'Fatima Aliyu',
            'patient_phone': '08091234567',  # Nigerian local number
            'service_id': str(self.service.id),
            'preferred_doctor_id': str(self.doctor.id),
            'preferred_dates': [target_date.isoformat()],
            'preferred_time_window': 'morning',
            'channel': 'telegram',
            'patient_notes': 'Experiencing persistent headache for 3 days',
        }, format='json')
        self.assertEqual(intake_res.status_code, status.HTTP_201_CREATED)
        booking_id = intake_res.data['id']
        booking_code = intake_res.data['request_code']
        self.assertEqual(intake_res.data['patient_phone'], '+2348091234567')  # E.164 normalized

        # Step 2: Receptionist checks FIFO Queue
        self._authenticate_staff()
        queue_res = self.client.get('/api/v1/booking-requests/?status=awaiting_review')
        self.assertEqual(queue_res.status_code, status.HTTP_200_OK)
        queued_ids = [r['id'] for r in queue_res.data]
        self.assertIn(booking_id, queued_ids)

        # Step 3: Receptionist checks Candidate Slots
        check_res = self.client.post(f'/api/v1/booking-requests/{booking_id}/check-slots/', {}, format='json')
        self.assertEqual(check_res.status_code, status.HTTP_200_OK)
        candidate_slots = check_res.data['candidate_slots']
        self.assertGreaterEqual(len(candidate_slots), 1)

        # Step 4: Receptionist Approves and Dispatches Candidate Slots (1-hour window)
        dispatch_res = self.client.post(f'/api/v1/booking-requests/{booking_id}/dispatch-offers/', {}, format='json')
        self.assertEqual(dispatch_res.status_code, status.HTTP_200_OK)
        self.assertEqual(dispatch_res.data['status'], 'slots_offered')
        offers = SlotOffer.objects.filter(request_id=booking_id)
        self.assertGreaterEqual(offers.count(), 1)
        selected_offer = offers.first()

        # Step 5: Patient Selects Option 1 via Telegram Webhook Callback
        tg_payload = {
            'update_id': 999888001,
            'channel': 'telegram',
            'callback_query': {
                'id': 'cq_e2e_select',
                'data': f'select_slot_{selected_offer.id}',
                'from': {'id': 98765432},
                'message': {'message_id': 101, 'chat': {'id': 98765432}}
            }
        }
        select_res = self.client.post('/api/v1/webhooks/telegram/inbound/', tg_payload, format='json', HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN='prod-secret-tg-token-777')
        self.assertEqual(select_res.status_code, status.HTTP_200_OK)
        self.assertEqual(select_res.data['telegram_result']['status'], 'confirmed')
        appt_code = select_res.data['telegram_result']['appointment_code']

        appt = Appointment.objects.get(appointment_code=appt_code)
        self.assertEqual(appt.status, 'held')
        self.assertEqual(appt.patient_name, 'Fatima Aliyu')

        # Step 6: 24h Pre-Visit Reminder Query
        reminder_res = self.client.get('/api/v1/appointments/upcoming-reminders/', HTTP_X_WEBHOOK_SECRET='clinic_dev_secret_2026')
        self.assertEqual(reminder_res.status_code, status.HTTP_200_OK)
        reminder_codes = [r['appointment_id'] for r in reminder_res.data['reminders']]
        self.assertIn(appt.appointment_code, reminder_codes)

        # Step 7: Patient Confirms Attendance via Telegram Callback
        confirm_payload = {
            'update_id': 999888002,
            'channel': 'telegram',
            'callback_query': {
                'id': 'cq_e2e_confirm',
                'data': f'confirm_attend_{appt.id}',
                'from': {'id': 98765432},
                'message': {'message_id': 102, 'chat': {'id': 98765432}}
            }
        }
        confirm_res = self.client.post('/api/v1/webhooks/telegram/inbound/', confirm_payload, format='json', HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN='prod-secret-tg-token-777')
        self.assertEqual(confirm_res.status_code, status.HTTP_200_OK)
        appt.refresh_from_db()
        self.assertIsNotNone(appt.confirmed_at)

        # Step 8: Receptionist Advances Patient through Live Visit Swimlanes
        # 8a: Patient Arrives at Clinic -> Status 'arrived'
        arrived_res = self.client.patch(f'/api/v1/appointments/{appt.id}/status/', {
            'status': 'arrived',
            'updated_by': 'receptionist_front_desk',
        }, format='json')
        self.assertEqual(arrived_res.status_code, status.HTTP_200_OK)
        appt.refresh_from_db()
        self.assertEqual(appt.status, 'arrived')
        self.assertIsNotNone(appt.arrival_at)

        # 8b: Doctor calls patient into Consultation Room -> Status 'in_consultation'
        consult_res = self.client.patch(f'/api/v1/appointments/{appt.id}/status/', {
            'status': 'in_consultation',
            'updated_by': 'nurse_station',
        }, format='json')
        self.assertEqual(consult_res.status_code, status.HTTP_200_OK)
        appt.refresh_from_db()
        self.assertEqual(appt.status, 'in_consultation')

        # 8c: Doctor completes consultation -> Status 'completed'
        complete_res = self.client.patch(f'/api/v1/appointments/{appt.id}/status/', {
            'status': 'completed',
            'updated_by': 'dr_bello',
        }, format='json')
        self.assertEqual(complete_res.status_code, status.HTTP_200_OK)
        appt.refresh_from_db()
        self.assertEqual(appt.status, 'completed')
        self.assertIsNotNone(appt.completed_at)

        # Step 9: Doctor Records Clinical Follow-up Recall Task (1-Week Post-Op)
        recall_date = today + datetime.timedelta(days=7)
        followup_res = self.client.post(f'/api/v1/appointments/{appt.id}/follow-up/', {
            'follow_up_date': recall_date.isoformat(),
            'notes': 'Review blood pressure readings and adjust medication',
        }, format='json')
        self.assertEqual(followup_res.status_code, status.HTTP_201_CREATED)
        self.assertTrue(FollowUpTask.objects.filter(appointment=appt).exists())

        # Step 10: Immutable Audit Log Verification
        audit_events = AuditLog.objects.filter(entity_name='Appointment')
        self.assertGreaterEqual(audit_events.count(), 1)

    def test_admin_killswitch_session_revocation_t603(self):
        """
        Task 6.3: Verifies that deactivating a receptionist immediately invalidates
        Bearer JWT, Cookie JWT, and Quick-PIN verification.
        """
        # Step 1: Staff logs in successfully
        login_res = self.client.post('/api/v1/auth/login/', {
            'email': self.staff.email,
            'password': self.staff_password,
        }, format='json')
        self.assertEqual(login_res.status_code, status.HTTP_200_OK)
        token = login_res.data['access']
        cookie_val = login_res.cookies['clinic_access_token'].value

        # Step 2: Make request with Bearer token -> 200 OK
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        res = self.client.get('/api/v1/auth/me/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Step 3: Admin deactivates staff member
        self.staff.is_active = False
        self.staff.save(update_fields=['is_active'])

        # Step 4: Immediate rejection on next Bearer JWT request -> 401 Unauthorized
        res_ejected = self.client.get('/api/v1/auth/me/')
        self.assertEqual(res_ejected.status_code, status.HTTP_401_UNAUTHORIZED)

        # Step 5: Immediate rejection on Cookie JWT request -> 401 Unauthorized
        self.client.credentials()  # clear headers
        self.client.cookies['clinic_access_token'] = cookie_val
        cookie_ejected = self.client.get('/api/v1/auth/me/')
        self.assertEqual(cookie_ejected.status_code, status.HTTP_401_UNAUTHORIZED)

        # Step 6: Quick-PIN verification rejected for inactive user -> 401 Unauthorized
        pin_res = self.client.post('/api/v1/auth/verify-pin/', {
            'email': self.staff.email,
            'pin': self.staff_pin,
        }, format='json')
        self.assertEqual(pin_res.status_code, status.HTTP_401_UNAUTHORIZED)


class StaffAuthSecurityHardeningTests(APITestCase):
    """
    Comprehensive tests for Staff Authentication, Two-Role RBAC & Multi-Vector Security Hardening:
    - Anti-Bot Honeypot Defense (website_url)
    - 5-Strike Brute-Force Rate Limiting (15-Minute Lockout)
    - Two-Role Dashboard Policy (Zero Doctor Accounts -> 403 Forbidden)
    - Side-Channel Timing Attack Mitigation
    - Response Payload Schema Alignment & Cookie Verification
    - Admin prohibition from creating doctor accounts
    """

    def setUp(self):
        cache.clear()
        self.clinic = ClinicSetting.get_settings()
        self.clinic.webhook_secret = 'clinic_dev_secret_2026'
        self.clinic.save()

        self.receptionist = StaffUser.objects.create(
            full_name='Sarah Aliyu',
            email='sarah@cedarcare.ng',
            role='receptionist',
            is_active=True,
        )
        self.receptionist.set_password('reception_pass123')
        self.receptionist.save()

        self.admin = StaffUser.objects.create(
            full_name='Dr. Ibrahim Musa',
            email='admin@cedarcare.ng',
            role='clinic_admin',
            is_active=True,
        )
        self.admin.set_password('admin_pass123')
        self.admin.save()

        # Doctor as clinical resource (no dashboard login account)
        self.doctor = Doctor.objects.create(
            name='Dr. Amina Bello',
            email='amina.bello@cedarcare.ng',
            specialty='Dentistry',
            shift_start=datetime.time(9, 0),
            shift_end=datetime.time(17, 0),
        )

    def tearDown(self):
        cache.clear()

    def test_bot_honeypot_rejection(self):
        """
        Anti-Bot Honeypot: Submitting website_url returns 400 Bad Request immediately.
        """
        res = self.client.post('/api/v1/auth/login/', {
            'email': 'sarah@cedarcare.ng',
            'password': 'reception_pass123',
            'website_url': 'https://bot-spammer.ru/payload',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res.data.get('error'), 'BOT_DETECTED')
        self.assertEqual(res.data.get('detail'), 'Automated submission blocked.')

    def test_brute_force_5_strike_lockout(self):
        """
        5-Strike Brute-Force:
        - Attempts 1-4 return 401 with remaining_attempts countdown.
        - Attempt 5 triggers 15-minute (900s) lockout returning HTTP 423.
        - Subsequent attempt while locked out returns HTTP 423.
        """
        email = self.receptionist.email

        # 4 consecutive bad attempts
        for attempt_num in range(1, 5):
            res = self.client.post('/api/v1/auth/login/', {
                'email': email,
                'password': 'wrong_password_test',
            }, format='json')
            self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
            self.assertEqual(res.data.get('error'), 'INVALID_CREDENTIALS')
            self.assertEqual(res.data.get('remaining_attempts'), 5 - attempt_num)

        # 5th attempt: Triggers lockout
        res_lockout = self.client.post('/api/v1/auth/login/', {
            'email': email,
            'password': 'wrong_password_test',
        }, format='json')
        self.assertEqual(res_lockout.status_code, getattr(status, 'HTTP_423_LOCKED', 423))
        self.assertEqual(res_lockout.data.get('error'), 'ACCOUNT_LOCKED')
        self.assertEqual(res_lockout.data.get('remaining_attempts'), 0)
        self.assertEqual(res_lockout.data.get('lockout_seconds'), 900)

        # 6th attempt (even with CORRECT password): Blocked by lockout
        res_subsequent = self.client.post('/api/v1/auth/login/', {
            'email': email,
            'password': 'reception_pass123',
        }, format='json')
        self.assertEqual(res_subsequent.status_code, getattr(status, 'HTTP_423_LOCKED', 423))
        self.assertEqual(res_subsequent.data.get('error'), 'ACCOUNT_LOCKED')

    def test_doctor_login_forbidden(self):
        """
        Strict Two-Role Dashboard Policy:
        - Attempt to log in with treating doctor email returns 403 Forbidden DOCTOR_LOGIN_FORBIDDEN.
        - Staff account with role='doctor' also returns 403 Forbidden.
        """
        # Clinician from Doctor model
        res_clinician = self.client.post('/api/v1/auth/login/', {
            'email': self.doctor.email,
            'password': 'any_doctor_password',
        }, format='json')
        self.assertEqual(res_clinician.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(res_clinician.data.get('error'), 'DOCTOR_LOGIN_FORBIDDEN')
        self.assertIn('Clinician accounts do not have dashboard login privileges', res_clinician.data.get('detail'))

        # Legacy/Unauthorized StaffUser with role='doctor'
        legacy_doctor_staff = StaffUser.objects.create(
            full_name='Dr. Legacy Test',
            email='legacy.doctor@cedarcare.ng',
            role='doctor',
            is_active=True,
        )
        legacy_doctor_staff.set_password('pass123')
        legacy_doctor_staff.save()

        res_legacy = self.client.post('/api/v1/auth/login/', {
            'email': 'legacy.doctor@cedarcare.ng',
            'password': 'pass123',
        }, format='json')
        self.assertEqual(res_legacy.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(res_legacy.data.get('error'), 'DOCTOR_LOGIN_FORBIDDEN')

    def test_timing_attack_mitigation_nonexistent_user(self):
        """
        Timing attack defense: Non-existent user returns identical generic error,
        runs dummy hash comparison, and decrements attempt counters.
        """
        res = self.client.post('/api/v1/auth/login/', {
            'email': 'nonexistent.ghost@cedarcare.ng',
            'password': 'arbitrary_password',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(res.data.get('error'), 'INVALID_CREDENTIALS')
        self.assertEqual(res.data.get('detail'), 'Invalid email or password.')
        self.assertEqual(res.data.get('remaining_attempts'), 4)

    def test_successful_login_payload_and_cookies(self):
        """
        Validates the aligned payload schema:
        { access, refresh, user: { id, full_name, email, role, role_label, shift, avatar, is_active } }
        and dual-mode HttpOnly cookies.
        """
        res = self.client.post('/api/v1/auth/login/', {
            'email': self.receptionist.email,
            'password': 'reception_pass123',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('access', res.data)
        self.assertIn('refresh', res.data)

        user_obj = res.data.get('user')
        self.assertIsNotNone(user_obj)
        self.assertEqual(user_obj.get('email'), self.receptionist.email)
        self.assertEqual(user_obj.get('role'), 'receptionist')
        # Wave 5 / Step 5.3: the REAL role display and the stored shift —
        # the old values were guessed from the name ("Amina Lead ...").
        self.assertEqual(user_obj.get('role_label'), 'Receptionist')
        self.assertEqual(user_obj.get('shift'), '')
        self.assertEqual(user_obj.get('avatar'), 'SA')
        self.assertTrue(user_obj.get('is_active'))

        # Verify HttpOnly cookies
        self.assertIn('clinic_access_token', res.cookies)
        self.assertIn('clinic_refresh_token', res.cookies)
        self.assertTrue(res.cookies['clinic_access_token']['httponly'])
        self.assertEqual(res.cookies['clinic_access_token']['samesite'].lower(), 'lax')

    def test_staff_logout_clears_cookies(self):
        """
        POST /api/v1/auth/logout/ deletes both clinic_access_token and clinic_refresh_token.
        """
        res = self.client.post('/api/v1/auth/logout/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data.get('detail'), 'Successfully logged out.')
        # Cookie deletion sets max-age=0 or expires in past
        self.assertIn('clinic_access_token', res.cookies)
        self.assertIn('clinic_refresh_token', res.cookies)

    def test_admin_cannot_create_doctor_account(self):
        """
        Admin creation endpoint strictly forbids role='doctor'.
        """
        # Admin authentication
        self.client.force_authenticate(user=self.admin)

        res = self.client.post('/api/v1/admin/staff/', {
            'full_name': 'Dr. Illegal Attempt',
            'email': 'illegal.doctor@cedarcare.ng',
            'role': 'doctor',
            'password': 'password123',
            'pin': '1234',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('role', res.data)


class ComprehensiveBackendSyncSpecificationTests(APITestCase):
    """
    Validates all 5 synchronization items specified in the Comprehensive Backend Sync Specification:
    1. Staff Roster & Access Governance (Staff detail, Password reset, PIN reset, Toggle active & Killswitch)
    2. Multi-Phone & Multi-Email Clinic Profile (phones/emails list & backwards-compatible properties)
    3. Plain English Scheduling Rules & Single-Field Auto-Save (camelCase & snake_case support)
    4. Doctor Consultation Load Horizons (today_count, week_count, two_weeks_count on workload endpoints)
    5. Clinical Services & Specialties Registry (Full CRUD + description)
    """

    def setUp(self):
        cache.clear()
        self.clinic = ClinicSetting.get_settings()
        self.clinic.webhook_secret = 'clinic_dev_secret_2026'
        self.clinic.save()
        self.clinic.phones = ['+234 803 000 1122', '+234 809 111 2233']
        self.clinic.emails = ['contact@cedarcare.ng', 'help@cedarcare.ng']
        self.clinic.save()

        self.admin = StaffUser.objects.create(
            full_name='Dr. Ibrahim Musa',
            email='admin@cedarcare.ng',
            role='clinic_admin',
            is_active=True,
        )
        self.admin.set_password('admin_pass123')
        self.admin.set_pin('9999')
        self.admin.save()

        self.receptionist = StaffUser.objects.create(
            full_name='Sarah Aliyu',
            email='sarah@cedarcare.ng',
            role='receptionist',
            shift='08:00 – 16:00 WAT',
            specialty='Patient Triage Desk',
            is_active=True,
        )
        self.receptionist.set_password('reception_pass123')
        self.receptionist.set_pin('1234')
        self.receptionist.save()

        self.doctor = Doctor.objects.create(
            name='Dr. Aminu Bello',
            email='dr.bello@cedarcare.ng',
            specialty='Dental Surgery & Implantology',
            shift_start=datetime.time(9, 0),
            shift_end=datetime.time(17, 0),
            working_days=[1, 2, 3, 4, 5],
            is_active=True,
        )

        self.service = Service.objects.create(
            name='Dental Consultation',
            category='Dental',
            description='Comprehensive oral examination and diagnostic review.',
            duration_minutes=30,
            buffer_minutes=10,
            price=15000.00,
            is_active=True,
        )

    # --- ITEM 1: STAFF ROSTER & ACCESS GOVERNANCE ---

    def test_admin_update_staff_details(self):
        """PATCH /api/v1/staff/<staff_id>/ updates name, email, specialty, shift, status."""
        self.client.force_authenticate(user=self.admin)

        res = self.client.patch(f'/api/v1/staff/{self.receptionist.id}/', {
            'name': 'Sarah Aliyu-Mohammed',
            'specialty': 'Senior Front Desk Lead',
            'shift': '07:30 – 15:30 WAT',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.receptionist.refresh_from_db()
        self.assertEqual(self.receptionist.full_name, 'Sarah Aliyu-Mohammed')
        self.assertEqual(self.receptionist.specialty, 'Senior Front Desk Lead')
        self.assertEqual(self.receptionist.shift, '07:30 – 15:30 WAT')

    def test_admin_update_doctor_details(self):
        """PATCH /api/v1/staff/<staff_id>/ also allows admin to update clinical doctor details."""
        self.client.force_authenticate(user=self.admin)

        res = self.client.patch(f'/api/v1/staff/{self.doctor.id}/', {
            'name': 'Dr. Aminu A. Bello',
            'specialty': 'Consultant Oral & Maxillofacial Surgeon',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.doctor.refresh_from_db()
        self.assertEqual(self.doctor.name, 'Dr. Aminu A. Bello')
        self.assertEqual(self.doctor.specialty, 'Consultant Oral & Maxillofacial Surgeon')

    def test_admin_reset_receptionist_password(self):
        """POST /api/v1/staff/<staff_id>/reset-password/ allows setting new password for receptionist."""
        self.client.force_authenticate(user=self.admin)

        res = self.client.post(f'/api/v1/staff/{self.receptionist.id}/reset-password/', {
            'new_password': 'brand_new_secret_password',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Verify old password fails, new password succeeds
        self.receptionist.refresh_from_db()
        self.assertFalse(self.receptionist.check_password('reception_pass123'))
        self.assertTrue(self.receptionist.check_password('brand_new_secret_password'))

    def test_admin_reset_doctor_password_rejected(self):
        """POST /api/v1/staff/<staff_id>/reset-password/ rejects doctors with HTTP 400."""
        self.client.force_authenticate(user=self.admin)

        res = self.client.post(f'/api/v1/staff/{self.doctor.id}/reset-password/', {
            'new_password': 'cannot_set_doc_password',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res.data.get('error'), 'DOCTOR_PASSWORD_NOT_SUPPORTED')

    def test_admin_reset_receptionist_pin(self):
        """POST /api/v1/staff/<staff_id>/reset-pin/ sets a new 4-digit PIN for receptionist."""
        self.client.force_authenticate(user=self.admin)

        res = self.client.post(f'/api/v1/staff/{self.receptionist.id}/reset-pin/', {
            'new_pin': '4321',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        self.receptionist.refresh_from_db()
        self.assertTrue(self.receptionist.check_pin('4321'))

    def test_admin_reset_doctor_pin_rejected(self):
        """POST /api/v1/staff/<staff_id>/reset-pin/ rejects doctors with HTTP 400."""
        self.client.force_authenticate(user=self.admin)

        res = self.client.post(f'/api/v1/staff/{self.doctor.id}/reset-pin/', {
            'new_pin': '9876',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res.data.get('error'), 'DOCTOR_PIN_NOT_SUPPORTED')

    def test_toggle_staff_active_and_session_killswitch(self):
        """
        POST /api/v1/staff/<staff_id>/toggle-active/ deactivates staff.
        Immediately revokes active JWT token resulting in HTTP 401 on next request.
        """
        # Step 1: Receptionist logs in and obtains token
        login_res = self.client.post('/api/v1/auth/login/', {
            'email': self.receptionist.email,
            'password': 'reception_pass123',
        }, format='json')
        self.assertEqual(login_res.status_code, status.HTTP_200_OK)
        token = login_res.data['access']

        # Verify token works
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        me_res = self.client.get('/api/v1/auth/me/')
        self.assertEqual(me_res.status_code, status.HTTP_200_OK)

        # Step 2: Admin toggles receptionist active status off
        self.client.credentials()  # clear receptionist creds
        self.client.force_authenticate(user=self.admin)
        toggle_res = self.client.post(f'/api/v1/staff/{self.receptionist.id}/toggle-active/', format='json')
        self.assertEqual(toggle_res.status_code, status.HTTP_200_OK)
        self.assertFalse(toggle_res.data.get('is_active'))

        # Step 3: Receptionist makes request with previous token -> 401 Unauthorized
        self.client.force_authenticate(user=None)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        blocked_res = self.client.get('/api/v1/auth/me/')
        self.assertEqual(blocked_res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_verify_pin_and_lockout(self):
        """POST /api/v1/auth/verify-pin/ verifies 4-digit PIN and locks out after 3 failures.

        Phase 2.5 (system review finding #3): an active staff session is
        required. An anonymous email+PIN probe is rejected before any user
        lookup — no staff-email enumeration signal, no unauthenticated
        brute-force surface.
        """
        # Anonymous probe (existing email, correct PIN) must still be rejected.
        anon_res = self.client.post('/api/v1/auth/verify-pin/', {
            'email': self.receptionist.email,
            'pin': '1234',
        }, format='json')
        self.assertEqual(anon_res.status_code, status.HTTP_401_UNAUTHORIZED)

        # Authenticated flow: valid PIN
        self.client.force_authenticate(user=self.receptionist)
        res = self.client.post('/api/v1/auth/verify-pin/', {
            'pin': '1234',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data.get('status'), 'unlocked')

        # 3 Failed attempts
        for attempt in range(2):
            fail_res = self.client.post('/api/v1/auth/verify-pin/', {
                'pin': '0000',
            }, format='json')
            self.assertEqual(fail_res.status_code, status.HTTP_400_BAD_REQUEST)

        # 3rd failed attempt triggers 60s lockout
        lock_res = self.client.post('/api/v1/auth/verify-pin/', {
            'pin': '0000',
        }, format='json')
        self.assertEqual(lock_res.status_code, status.HTTP_423_LOCKED)
        self.assertEqual(lock_res.data.get('error'), 'PIN_LOCKED')

    # --- ITEM 2: MULTI-PHONE & MULTI-EMAIL CLINIC PROFILE ---

    def test_get_and_patch_multi_phone_and_email(self):
        """
        GET /api/v1/clinic/settings/ returns clinic_profile with phones and emails list.
        PATCH /api/v1/clinic/settings/ updates phones and emails arrays.
        """
        self.client.force_authenticate(user=self.admin)

        # GET
        get_res = self.client.get('/api/v1/clinic/settings/')
        self.assertEqual(get_res.status_code, status.HTTP_200_OK)
        profile = get_res.data.get('clinic_profile')
        self.assertIsNotNone(profile)
        self.assertEqual(profile.get('phones'), ['+234 803 000 1122', '+234 809 111 2233'])
        self.assertEqual(profile.get('phone'), '+234 803 000 1122')
        self.assertEqual(profile.get('emails'), ['contact@cedarcare.ng', 'help@cedarcare.ng'])
        self.assertEqual(profile.get('email'), 'contact@cedarcare.ng')

        # PATCH with new phones and emails arrays
        patch_res = self.client.patch('/api/v1/clinic/settings/', {
            'phones': ['+234 800 CEDAR 1', '+234 800 CEDAR 2', '+234 800 CEDAR 3'],
            'emails': ['primary@cedarcare.ng', 'secondary@cedarcare.ng'],
        }, format='json')
        self.assertEqual(patch_res.status_code, status.HTTP_200_OK)

        self.clinic.refresh_from_db()
        self.assertEqual(len(self.clinic.phones), 3)
        self.assertEqual(self.clinic.phone, '+234 800 CEDAR 1')
        self.assertEqual(len(self.clinic.emails), 2)
        self.assertEqual(self.clinic.email, 'primary@cedarcare.ng')

    # --- ITEM 3: PLAIN ENGLISH SCHEDULING RULES & AUTO-SAVE ---

    def test_scheduling_rules_auto_save_and_camel_case(self):
        """
        PATCH /api/v1/clinic/settings/ cleanly accepts single-field partial updates
        and both camelCase and snake_case fields.
        """
        self.client.force_authenticate(user=self.admin)

        # Auto-save 24h reminder toggle
        res = self.client.patch('/api/v1/clinic/settings/', {
            'enable_24h_reminder': False,
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.clinic.refresh_from_db()
        self.assertFalse(self.clinic.enable_24h_reminder)

        # Auto-save via POST alias (as used in frontend apiService.js)
        res_post = self.client.post('/api/v1/clinic/settings/', {
            'offerExpiryMinutes': 45,
            'holdExpiryMinutes': 20,
            'enable2hReminder': True,
        }, format='json')
        self.assertEqual(res_post.status_code, status.HTTP_200_OK)
        self.clinic.refresh_from_db()
        self.assertEqual(self.clinic.offer_expiry_minutes, 45)
        self.assertEqual(self.clinic.hold_expiry_minutes, 20)
        self.assertTrue(self.clinic.enable_2h_reminder)

    # --- ITEM 4: DOCTOR CONSULTATION LOAD HORIZONS ---

    def test_doctor_workload_horizons(self):
        """
        GET /api/v1/doctors/workload/ and /api/v1/appointments/?include_workload=true
        return today_count, week_count, and two_weeks_count.
        """
        self.client.force_authenticate(user=self.receptionist)

        now = timezone.now()
        today_noon = now.replace(hour=12, minute=0, second=0, microsecond=0)
        # Appointment 1: Today
        Appointment.objects.create(
            appointment_code='AP-TEST-01',
            patient_name='Amina Lawal',
            patient_phone='+2348011111111',
            doctor=self.doctor,
            service=self.service,
            start_datetime=today_noon,
            end_datetime=today_noon + datetime.timedelta(minutes=30),
            status='confirmed',
        )

        # Appointment 2: 3 days ahead (in week horizon)
        Appointment.objects.create(
            appointment_code='AP-TEST-02',
            patient_name='Bello Garba',
            patient_phone='+2348022222222',
            doctor=self.doctor,
            service=self.service,
            start_datetime=now + datetime.timedelta(days=3),
            end_datetime=now + datetime.timedelta(days=3, minutes=30),
            status='confirmed',
        )

        # Appointment 3: 10 days ahead (in 2-week horizon)
        Appointment.objects.create(
            appointment_code='AP-TEST-03',
            patient_name='Chidi Nnamdi',
            patient_phone='+2348033333333',
            doctor=self.doctor,
            service=self.service,
            start_datetime=now + datetime.timedelta(days=10),
            end_datetime=now + datetime.timedelta(days=10, minutes=30),
            status='confirmed',
        )

        # Query dedicated doctor workload endpoint
        res = self.client.get('/api/v1/doctors/workload/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        doc_entry = next((d for d in res.data if d['id'] == str(self.doctor.id)), None)
        self.assertIsNotNone(doc_entry)
        self.assertEqual(doc_entry['today_count'], 1)
        self.assertEqual(doc_entry['week_count'], 2)
        self.assertEqual(doc_entry['two_weeks_count'], 3)

        # Query appointments list with include_workload=true
        res_appts = self.client.get(f'/api/v1/appointments/?doctor_id={self.doctor.id}&include_workload=true')
        self.assertEqual(res_appts.status_code, status.HTTP_200_OK)
        self.assertIn('workload', res_appts.data)
        self.assertEqual(res_appts.data['workload']['today_count'], 1)
        self.assertEqual(res_appts.data['workload']['week_count'], 2)
        self.assertEqual(res_appts.data['workload']['two_weeks_count'], 3)

    # --- ITEM 5: CLINICAL SERVICES & SPECIALTIES REGISTRY ---

    def test_services_crud_and_description(self):
        """
        Full CRUD at /api/v1/clinic/services/:
        GET, POST with description/camelCase, PATCH, and DELETE.
        """
        self.client.force_authenticate(user=self.admin)

        # 1. GET list
        list_res = self.client.get('/api/v1/clinic/services/')
        self.assertEqual(list_res.status_code, status.HTTP_200_OK)
        self.assertTrue(len(list_res.data) >= 1)

        # 2. POST create new service
        create_res = self.client.post('/api/v1/clinic/services/', {
            'name': 'Orthodontic Braces Adjustment',
            'category': 'Orthodontics',
            'durationMin': 40,
            'bufferMin': 15,
            'description': 'Realignment and bracket tightening for dental braces.',
            'price': 25000.00,
            'deposit_required': 5000.00,
        }, format='json')
        self.assertEqual(create_res.status_code, status.HTTP_201_CREATED)
        new_svc_id = create_res.data['id']
        self.assertEqual(create_res.data['duration_minutes'], 40)
        self.assertEqual(create_res.data['buffer_minutes'], 15)
        self.assertEqual(create_res.data['description'], 'Realignment and bracket tightening for dental braces.')

        # 3. PATCH edit service
        patch_res = self.client.patch(f'/api/v1/clinic/services/{new_svc_id}/', {
            'name': 'Comprehensive Orthodontic Consultation',
            'duration_minutes': 45,
        }, format='json')
        self.assertEqual(patch_res.status_code, status.HTTP_200_OK)
        self.assertEqual(patch_res.data['name'], 'Comprehensive Orthodontic Consultation')
        self.assertEqual(patch_res.data['duration_minutes'], 45)

        # 4. DELETE soft-delete service
        del_res = self.client.delete(f'/api/v1/clinic/services/{new_svc_id}/')
        self.assertEqual(del_res.status_code, status.HTTP_200_OK)

        svc_db = Service.objects.get(id=new_svc_id)
        self.assertFalse(svc_db.is_active)


class WebhookSecurityHardeningTests(APITestCase):
    """
    Phase 1 / Task 1.1 — Partner Readiness Roadmap:
    X-Webhook-Secret enforcement on every endpoint the n8n Dispatcher calls,
    and fail-closed behavior when secrets are unconfigured in production.
    """

    def setUp(self):
        cache.clear()
        self.clinic = ClinicSetting.get_settings()
        self.clinic.webhook_secret = 'clinic_dev_secret_2026'
        self.clinic.save()

        self.doctor = Doctor.objects.create(
            name='Dr. Security Test',
            specialty='General Medicine',
            working_days=[1, 2, 3, 4, 5],
            shift_start=datetime.time(8, 0),
            shift_end=datetime.time(17, 0),
            is_active=True,
        )
        self.service = Service.objects.create(
            name='Security Consultation',
            category='General',
            duration_minutes=30,
            buffer_minutes=10,
            price=10000.00,
        )
        DoctorService.objects.create(doctor=self.doctor, service=self.service)

        self.staff = StaffUser.objects.create(
            full_name='Security Receptionist',
            email='security@clinic.com',
            role='receptionist',
            is_active=True,
        )
        self.staff.set_password('SecurityPass123!')
        self.staff.save()

        # Wave 2 rules: bookings must land inside the clinic calendar, so the
        # fixture uses the shared legal-slot helper instead of "+7 days".
        hold_start = next_legal_slot(10)
        hold_end = hold_start + datetime.timedelta(minutes=30)
        self.hold_payload = {
            'doctor_id': str(self.doctor.id),
            'service_id': str(self.service.id),
            'start_datetime': hold_start.isoformat(),
            'end_datetime': hold_end.isoformat(),
            'patient_name': 'Hauwa Webhook',
            'patient_phone': '+2348099988777',
        }

    def tearDown(self):
        cache.clear()

    # --- POST /api/v1/slots/hold/ -------------------------------------------

    def test_slot_hold_rejects_missing_webhook_secret(self):
        """Anonymous request without X-Webhook-Secret must be rejected before any DB write."""
        initial_count = Appointment.objects.count()
        res = self.client.post('/api/v1/slots/hold/', self.hold_payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(res.data['error'], 'UNAUTHORIZED')
        self.assertEqual(Appointment.objects.count(), initial_count)

    def test_slot_hold_rejects_wrong_webhook_secret(self):
        res = self.client.post(
            '/api/v1/slots/hold/', self.hold_payload, format='json',
            HTTP_X_WEBHOOK_SECRET='attacker-guess-123'
        )
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(Appointment.objects.count(), 0)

    def test_slot_hold_accepts_valid_webhook_secret(self):
        res = self.client.post(
            '/api/v1/slots/hold/', self.hold_payload, format='json',
            HTTP_X_WEBHOOK_SECRET='clinic_dev_secret_2026'
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['status'], 'held')

    def test_slot_hold_allows_authenticated_staff_without_secret(self):
        """Dashboard / walk-in desk path: staff JWT works with no secret header."""
        self.client.force_authenticate(user=self.staff)
        res = self.client.post('/api/v1/slots/hold/', self.hold_payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    # --- POST /api/v1/booking-requests/{id}/re-request/ ----------------------

    def test_re_request_rejects_anonymous_without_secret(self):
        booking = BookingRequest.objects.create(
            patient_name='Musa ReRequest',
            patient_phone='+2348012345678',
            service=self.service,
            status='offer_expired',
        )
        res = self.client.post(f'/api/v1/booking-requests/{booking.id}/re-request/', {}, format='json')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

        booking.refresh_from_db()
        self.assertEqual(booking.status, 'offer_expired')

    def test_re_request_accepts_valid_webhook_secret(self):
        booking = BookingRequest.objects.create(
            patient_name='Musa ReRequest',
            patient_phone='+2348012345678',
            service=self.service,
            status='offer_expired',
        )
        res = self.client.post(
            f'/api/v1/booking-requests/{booking.id}/re-request/', {}, format='json',
            HTTP_X_WEBHOOK_SECRET='clinic_dev_secret_2026'
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        booking.refresh_from_db()
        self.assertEqual(booking.status, 're_requested')

    # --- POST /api/v1/webhooks/expiry-sweep/ ---------------------------------

    def test_expiry_sweep_rejects_missing_and_wrong_secret(self):
        """House auth contract: 401 + INVALID_WEBHOOK_SECRET, same as C.1/C.2 endpoints."""
        res_missing = self.client.post('/api/v1/webhooks/expiry-sweep/', {}, format='json')
        self.assertEqual(res_missing.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(res_missing.data['error'], 'INVALID_WEBHOOK_SECRET')

        res_wrong = self.client.post(
            '/api/v1/webhooks/expiry-sweep/', {}, format='json',
            HTTP_X_WEBHOOK_SECRET='wrong-secret'
        )
        self.assertEqual(res_wrong.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(res_wrong.data['error'], 'INVALID_WEBHOOK_SECRET')

    def test_expiry_sweep_accepts_valid_secret(self):
        res = self.client.post(
            '/api/v1/webhooks/expiry-sweep/', {'triggered_by': 'n8n_cron'}, format='json',
            HTTP_X_WEBHOOK_SECRET='clinic_dev_secret_2026'
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('expired_offers', res.data)

    # --- Fail-closed postures -------------------------------------------------

    def test_telegram_inbound_fail_closed_when_token_unconfigured(self):
        """Production posture: unconfigured Telegram secret rejects Telegram-shaped payloads."""
        self.clinic.custom_config.pop('telegram_secret_token', None)
        self.clinic.webhook_secret = 'clinic_dev_secret_2026'
        self.clinic.save()

        payload = {'update_id': 700100200, 'channel': 'telegram', 'message': {'text': 'hi'}}
        res = self.client.post('/api/v1/webhooks/messaging/inbound/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(res.data['error'], 'INVALID_WEBHOOK_SECRET')

    def test_unconfigured_secret_fails_closed_for_slot_hold(self):
        """No secret configured anywhere + DEBUG=False (test runner) -> every guarded call rejected."""
        self.clinic.webhook_secret = ''
        self.clinic.save()

        with override_settings(WEBHOOK_SECRET=''):
            res = self.client.post(
                '/api/v1/slots/hold/', self.hold_payload, format='json',
                HTTP_X_WEBHOOK_SECRET='clinic_dev_secret_2026'
            )
            self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_staff_deactivated_user_cannot_bypass_with_secret(self):
        """An inactive staff member is not a valid staff fallback even when a secret is present."""
        self.staff.is_active = False
        self.staff.save(update_fields=['is_active'])
        self.client.force_authenticate(user=self.staff)
        res = self.client.post('/api/v1/slots/hold/', self.hold_payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_non_ascii_secret_header_rejected_not_500(self):
        """
        Review Fix #1: secrets.compare_digest in str mode raises TypeError on
        non-ASCII input. A malformed header must produce a clean 401 on every
        guarded endpoint, never an unhandled 500.
        """
        res = self.client.post(
            '/api/v1/slots/hold/', self.hold_payload, format='json',
            HTTP_X_WEBHOOK_SECRET='héllo-malformed-attacker'
        )
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
        # Same guarantee on the interactions endpoint
        res = self.client.post(
            '/api/v1/interactions/',
            {'provider': 'system', 'channel': 'sms', 'patient_phone': '+2348030001122'},
            format='json',
            HTTP_X_WEBHOOK_SECRET='日本語ガベージヘッダー'
        )
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)


class SweeperMessagingTests(APITestCase):
    """
    Workflow B / B.0 - the sweep endpoint tells n8n who to remind, on which app,
    with the exact words. Django counts, dedupes and writes the copy; n8n only
    delivers (same split as C.1/C.2).

    Contract:
    - Nudge/recovery items mirror the channels the offer actually went out on
      (the request's own outbound InteractionLog rows). No record -> plain SMS.
      Voice is never a reminder channel.
    - Each item carries `channel`, `message` (copy composed here), a
      `claim_ref` and, for Telegram, `telegram_chat_id` + `reply_markup`.
    - The claim row IS the dedupe: one outbound InteractionLog row per item is
      created at emit time (status 'queued'); n8n's outcome POST upserts the
      same external_ref to sent/failed. A request inside the 15-minute nudge
      window would otherwise be emitted by every 60-second sweep.
    - Every swept offer also gets ONE system row (status 'expired') so the
      dossier shows the expiry event even if delivery later fails.
    """

    def setUp(self):
        cache.clear()
        self.clinic = ClinicSetting.get_settings()
        self.clinic.webhook_secret = 'clinic_dev_secret_2026'
        self.clinic.save()

        self.service = Service.objects.create(
            name='Sweep Consultation',
            category='General',
            duration_minutes=30,
            buffer_minutes=5,
            price=5000.00,
        )
        self.doctor = Doctor.objects.create(
            name='Dr. Sweep Test',
            specialty='General Medicine',
            working_days=[1, 2, 3, 4, 5],
            shift_start=datetime.time(8, 0),
            shift_end=datetime.time(17, 0),
            is_active=True,
        )

    def make_request(self, phone='+2348099977777', minutes_left=10, notes=''):
        req = BookingRequest.objects.create(
            patient_name='Sweep Test Patient',
            patient_phone=phone,
            service=self.service,
            status='slots_offered',
            patient_notes=notes,
            offer_expires_at=timezone.now() + datetime.timedelta(minutes=minutes_left),
        )
        base = timezone.now() + datetime.timedelta(hours=2)
        for offset in (0, 60):
            start = base + datetime.timedelta(minutes=offset)
            SlotOffer.objects.create(
                request=req,
                doctor=self.doctor,
                start_datetime=start,
                end_datetime=start + datetime.timedelta(minutes=30),
                expires_at=req.offer_expires_at,
                offered_at=timezone.now(),
            )
        return req

    def log_offer_row(self, req, channel):
        """Simulate the offer having gone out on one channel (Workflow D's log)."""
        return InteractionLog.objects.create(
            provider='voicebip' if channel in ('sms', 'voice') else ('meta_whatsapp' if channel == 'whatsapp' else 'telegram'),
            channel=channel,
            direction='outbound',
            status='sent',
            patient_name=req.patient_name,
            patient_phone=req.patient_phone,
            booking_request=req,
            external_ref=f'mock-{channel}-offer-{req.request_code}',
            summary='Slot options dispatched',
        )

    def sweep(self, secret='clinic_dev_secret_2026'):
        return self.client.post(
            '/api/v1/webhooks/expiry-sweep/',
            {'triggered_by': 'n8n_cron'}, format='json',
            HTTP_X_WEBHOOK_SECRET=secret,
        )

    # --- nudge items ---------------------------------------------------------

    def test_nudge_mirrors_the_channels_the_offer_went_out_on(self):
        req = self.make_request()
        self.log_offer_row(req, 'sms')
        self.log_offer_row(req, 'whatsapp')

        res = self.sweep()
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        nudges = res.data['pre_expiry_nudges']
        self.assertEqual(sorted(n['channel'] for n in nudges), ['sms', 'whatsapp'])
        for nudge in nudges:
            self.assertEqual(nudge['request_id'], req.request_code)
            self.assertEqual(nudge['patient_phone'], req.patient_phone)
            self.assertIn('message', nudge)
            self.assertTrue(nudge['message'].strip())
            self.assertIn('claim_ref', nudge)
            self.assertIn('Sweep Consultation', nudge['message'])
        self.assertEqual(
            sorted(n['claim_ref'] for n in nudges),
            sorted([f"nudge-{req.request_code}-sms", f"nudge-{req.request_code}-whatsapp"]),
        )

    def test_nudge_falls_back_to_sms_when_no_dispatch_record_exists(self):
        req = self.make_request()
        res = self.sweep()
        nudges = res.data['pre_expiry_nudges']
        self.assertEqual([n['channel'] for n in nudges], ['sms'])
        self.assertTrue(nudges[0]['message'].strip())

    def test_nudge_never_uses_voice_and_falls_back_to_sms(self):
        req = self.make_request()
        self.log_offer_row(req, 'voice')
        res = self.sweep()
        self.assertEqual([n['channel'] for n in res.data['pre_expiry_nudges']], ['sms'])

    def test_telegram_nudge_carries_chat_id_and_keyboard(self):
        req = self.make_request(notes='telegram_chat_id: 55882')
        self.log_offer_row(req, 'telegram')
        res = self.sweep()
        nudges = [n for n in res.data['pre_expiry_nudges'] if n['channel'] == 'telegram']
        self.assertEqual(len(nudges), 1)
        nudge = nudges[0]
        self.assertEqual(nudge['telegram_chat_id'], '55882')
        self.assertIn('inline_keyboard', nudge['reply_markup'])
        self.assertIn('Sweep Consultation', nudge['message'])

    def test_nudge_is_emitted_only_once_across_sweeps(self):
        req = self.make_request()
        first = self.sweep()
        self.assertEqual(len(first.data['pre_expiry_nudges']), 1)

        second = self.sweep()
        self.assertEqual(
            [n for n in second.data['pre_expiry_nudges'] if n['request_id'] == req.request_code],
            [],
        )
        claim = InteractionLog.objects.get(external_ref=f'nudge-{req.request_code}-sms')
        self.assertEqual(claim.status, 'queued')
        self.assertEqual(claim.direction, 'outbound')

    # --- recovery items ------------------------------------------------------

    def test_recovery_item_names_the_real_grammar_word(self):
        """The patient must be told to reply RESCHEDULE - the word C.1 actually accepts."""
        req = self.make_request(minutes_left=-1)
        self.log_offer_row(req, 'sms')

        res = self.sweep()
        self.assertEqual(res.data['expired_offers_count'], 1)
        recovery = res.data['expired_offers'][0]
        self.assertEqual(recovery['channel'], 'sms')
        self.assertIn('RESCHEDULE', recovery['message'].upper())
        self.assertEqual(recovery['claim_ref'], f"recovery-{req.request_code}-sms")

        req.refresh_from_db()
        self.assertEqual(req.status, 'offer_expired')
        self.assertTrue(AuditLog.objects.filter(entity_id=req.id, action='OFFER_EXPIRED_SWEEP').exists())

    def test_recovery_claims_are_separate_per_channel(self):
        req = self.make_request(minutes_left=-1)
        self.log_offer_row(req, 'sms')
        self.log_offer_row(req, 'whatsapp')

        res = self.sweep()
        refs = sorted(item['claim_ref'] for item in res.data['expired_offers'])
        self.assertEqual(refs, sorted([f"recovery-{req.request_code}-sms", f"recovery-{req.request_code}-whatsapp"]))
        for ref in refs:
            self.assertTrue(InteractionLog.objects.filter(external_ref=ref, status='queued').exists())

    def test_recovery_does_not_repeat_on_a_second_sweep(self):
        req = self.make_request(minutes_left=-1)
        self.log_offer_row(req, 'sms')
        self.sweep()
        second = self.sweep()
        self.assertEqual(
            [e for e in second.data['expired_offers'] if e['request_id'] == req.request_code],
            [],
        )

    def test_swept_offer_writes_one_expired_system_row(self):
        req = self.make_request(minutes_left=-1)
        self.log_offer_row(req, 'sms')
        self.sweep()

        row = InteractionLog.objects.get(external_ref=f'sweep-expiry-{req.request_code}')
        self.assertEqual(row.status, 'expired')
        self.assertEqual(row.direction, 'outbound')
        self.assertEqual(row.provider, 'system')
        self.assertEqual(row.booking_request_id, req.id)

    # --- untouched contract --------------------------------------------------

    def test_hold_expiry_sweep_is_still_reported_without_messaging(self):
        """15-minute hold expiry stays a silent state transition (no patient message)."""
        req = self.make_request()
        appt = Appointment.objects.create(
            patient_name=req.patient_name,
            patient_phone=req.patient_phone,
            doctor=self.doctor,
            service=req.service,
            booking_request=req,
            start_datetime=timezone.now() + datetime.timedelta(hours=2),
            end_datetime=timezone.now() + datetime.timedelta(hours=2, minutes=30),
            status='held',
            hold_expires_at=timezone.now() - datetime.timedelta(minutes=1),
        )
        res = self.sweep()
        self.assertEqual(res.data['expired_holds_count'], 1)
        appt.refresh_from_db()
        self.assertEqual(appt.status, 'hold_expired')


class ReminderMessagingTests(APITestCase):
    """
    Workflow A / A.0 - pre-visit reminders (24h & 2h) and doctor follow-up
    recalls. Same split as B.0: the sweep endpoint is the messaging brain - it
    decides WHO is due, on WHICH app, with WHICH words - and n8n only delivers.

    Contract:
    - One POST returns ALL due items (no per-kind parameter): 24h reminders,
      2h reminders, follow-up recalls.
    - Windows: 24h = start in (now, now+24h]; 2h = start in (now, now+2h].
      Only `confirmed` appointments are reminded (never held/cancelled/etc).
    - Channels mirror the patient's own outbound log (the booking request's
      rows, plus rows linked to the appointment itself). Walk-ins and patients
      with no dispatch record fall back to plain SMS. Voice is never a
      reminder channel.
    - Copy always states the actual date and time - never "tomorrow" - so the
      words stay truthful for any window.
    - The claim row IS the dedupe (status 'queued'); n8n's outcome POST upserts
      the same external_ref. One message per channel per reminder kind, ever.
    - Clinic flags gate the batches: enable_24h_reminder (default on) and
      enable_2h_reminder (default off).
    - Follow-up tasks (is_completed=False, reminder_sent=False, due today or
      overdue) are emitted once, then marked reminder_sent=True. An
      unresolvable channel writes no claim and no mark, so a later sweep
      retries (Workflow B's posture).
    """

    def setUp(self):
        cache.clear()
        self.clinic = ClinicSetting.get_settings()
        self.clinic.webhook_secret = 'clinic_dev_secret_2026'
        self.clinic.save()

        self.service = Service.objects.create(
            name='Reminder Consultation',
            category='General',
            duration_minutes=30,
            buffer_minutes=5,
            price=5000.00,
        )
        self.doctor = Doctor.objects.create(
            name='Dr. Reminder Test',
            specialty='General Medicine',
            working_days=[1, 2, 3, 4, 5, 6, 7],
            shift_start=datetime.time(8, 0),
            shift_end=datetime.time(17, 0),
            is_active=True,
        )

    def make_booking_request(self, phone='+2348099988888', notes=''):
        return BookingRequest.objects.create(
            patient_name='Reminder Test Patient',
            patient_phone=phone,
            service=self.service,
            status='converted',
            patient_notes=notes,
        )

    def log_row(self, booking_request, channel):
        """Simulate the patient having been reached on one channel before."""
        return InteractionLog.objects.create(
            provider='voicebip' if channel in ('sms', 'voice') else ('meta_whatsapp' if channel == 'whatsapp' else 'telegram'),
            channel=channel,
            direction='outbound',
            status='sent',
            patient_name=booking_request.patient_name,
            patient_phone=booking_request.patient_phone,
            booking_request=booking_request,
            external_ref=f'mock-{channel}-row-{booking_request.request_code}',
            summary='Prior outbound interaction',
        )

    def make_appointment(self, hours_ahead=23, status='confirmed', booking_request=None, phone='+2348099988888'):
        start = timezone.now() + datetime.timedelta(hours=hours_ahead)
        return Appointment.objects.create(
            patient_name='Reminder Test Patient',
            patient_phone=phone,
            doctor=self.doctor,
            service=self.service,
            booking_request=booking_request,
            start_datetime=start,
            end_datetime=start + datetime.timedelta(minutes=30),
            status=status,
        )

    def make_follow_up(self, appointment, days_ahead=0, is_completed=False, reminder_sent=False):
        return FollowUpTask.objects.create(
            appointment=appointment,
            doctor=self.doctor,
            follow_up_date=timezone.localdate() + datetime.timedelta(days=days_ahead),
            notes='Suture check',
            reminder_sent=reminder_sent,
            is_completed=is_completed,
        )

    def sweep(self, secret='clinic_dev_secret_2026'):
        return self.client.post(
            '/api/v1/webhooks/reminder-sweep/',
            {'triggered_by': 'n8n_cron'}, format='json',
            HTTP_X_WEBHOOK_SECRET=secret,
        )

    # --- 24h reminders -------------------------------------------------------

    def test_24h_reminder_mirrors_the_booking_channels(self):
        req = self.make_booking_request()
        self.log_row(req, 'sms')
        self.log_row(req, 'whatsapp')
        appt = self.make_appointment(hours_ahead=23, booking_request=req)

        res = self.sweep()
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['reminder_24h_count'], 2)
        self.assertEqual(res.data['reminder_2h_count'], 0)
        self.assertEqual(res.data['followup_count'], 0)
        items = res.data['reminder_items']
        self.assertEqual(sorted(i['channel'] for i in items), ['sms', 'whatsapp'])
        local_start = timezone.localtime(appt.start_datetime)
        date_str = local_start.strftime('%a %d %b')
        for item in items:
            self.assertEqual(item['kind'], '24h')
            self.assertEqual(item['request_id'], appt.appointment_code)
            self.assertEqual(item['patient_phone'], appt.patient_phone)
            self.assertIn('Reminder Consultation', item['message'])
            self.assertIn(date_str, item['message'])
        self.assertEqual(
            sorted(i['claim_ref'] for i in items),
            sorted([f"rem24-{appt.appointment_code}-sms", f"rem24-{appt.appointment_code}-whatsapp"]),
        )

    def test_24h_reminder_words_state_the_real_date_never_tomorrow(self):
        """The 24h window is (now, now+24h] - an appointment 3 hours out is not
        'tomorrow', so the copy must carry the actual date and time."""
        appt = self.make_appointment(hours_ahead=3)

        res = self.sweep()
        items = res.data['reminder_items']
        self.assertEqual(len(items), 1)
        message = items[0]['message']
        self.assertNotIn('omorrow', message)
        local_start = timezone.localtime(appt.start_datetime)
        self.assertIn(local_start.strftime('%a %d %b'), message)
        self.assertIn(local_start.strftime('%I:%M %p'), message)

    def test_24h_reminder_falls_back_to_sms_for_walk_in(self):
        appt = self.make_appointment(hours_ahead=23, booking_request=None)

        res = self.sweep()
        items = res.data['reminder_items']
        self.assertEqual([i['channel'] for i in items], ['sms'])
        self.assertTrue(items[0]['message'].strip())

    def test_24h_reminder_never_uses_voice(self):
        req = self.make_booking_request()
        self.log_row(req, 'voice')
        self.make_appointment(hours_ahead=23, booking_request=req)

        res = self.sweep()
        self.assertEqual([i['channel'] for i in res.data['reminder_items']], ['sms'])

    def test_reminders_skip_non_confirmed_appointments(self):
        self.make_appointment(hours_ahead=23, status='held')
        self.make_appointment(hours_ahead=23, status='cancelled', phone='+2348099988899')
        self.make_appointment(hours_ahead=23, status='completed', phone='+2348099988887')

        res = self.sweep()
        self.assertEqual(res.data['reminder_24h_count'], 0)
        self.assertEqual(res.data['reminder_items'], [])

    def test_out_of_window_appointments_are_silent(self):
        self.make_appointment(hours_ahead=30)   # beyond the 24h window
        self.make_appointment(hours_ahead=-1, phone='+2348099988898')  # already started

        res = self.sweep()
        self.assertEqual(res.data['reminder_24h_count'], 0)
        self.assertEqual(res.data['reminder_2h_count'], 0)

    def test_24h_flag_off_silences_the_batch(self):
        self.clinic.enable_24h_reminder = False
        self.clinic.save()
        self.make_appointment(hours_ahead=23)

        res = self.sweep()
        self.assertEqual(res.data['reminder_24h_count'], 0)
        self.assertEqual(res.data['reminder_items'], [])

    # --- 2h reminders --------------------------------------------------------

    def test_2h_reminder_is_off_by_default(self):
        self.make_appointment(hours_ahead=1.5)

        res = self.sweep()
        self.assertEqual(res.data['reminder_2h_count'], 0)
        self.assertFalse(any(i['kind'] == '2h' for i in res.data['reminder_items']))

    def test_2h_reminder_fires_when_flag_enabled(self):
        self.clinic.enable_2h_reminder = True
        self.clinic.save()
        appt = self.make_appointment(hours_ahead=1.5)

        res = self.sweep()
        self.assertEqual(res.data['reminder_2h_count'], 1)
        item = [i for i in res.data['reminder_items'] if i['kind'] == '2h'][0]
        self.assertEqual(item['channel'], 'sms')
        self.assertEqual(item['claim_ref'], f"rem2h-{appt.appointment_code}-sms")

    def test_2h_window_boundary_is_enforced(self):
        self.clinic.enable_2h_reminder = True
        self.clinic.save()
        self.make_appointment(hours_ahead=3)   # outside the 2h window
        self.make_appointment(hours_ahead=1.5, phone='+2348099988897')  # inside

        res = self.sweep()
        twos = [i for i in res.data['reminder_items'] if i['kind'] == '2h']
        self.assertEqual(len(twos), 1)

    def test_an_appointment_inside_both_windows_gets_each_reminder_once(self):
        self.clinic.enable_2h_reminder = True
        self.clinic.save()
        appt = self.make_appointment(hours_ahead=1.5)

        res = self.sweep()
        self.assertEqual(res.data['reminder_24h_count'], 1)
        self.assertEqual(res.data['reminder_2h_count'], 1)
        refs = sorted(i['claim_ref'] for i in res.data['reminder_items'])
        self.assertEqual(refs, [f"rem24-{appt.appointment_code}-sms", f"rem2h-{appt.appointment_code}-sms"])

    # --- telegram leg ----------------------------------------------------------

    def test_telegram_24h_item_carries_chat_id_and_wired_keyboard(self):
        req = self.make_booking_request(notes='telegram_chat_id: 55991')
        self.log_row(req, 'telegram')
        appt = self.make_appointment(hours_ahead=23, booking_request=req)

        res = self.sweep()
        items = [i for i in res.data['reminder_items'] if i['channel'] == 'telegram']
        self.assertEqual(len(items), 1)
        item = items[0]
        self.assertEqual(item['telegram_chat_id'], '55991')
        keyboard = item['reply_markup']['inline_keyboard']
        callbacks = [b['callback_data'] for row in keyboard for b in row]
        self.assertTrue(any(c.startswith('confirm_attend_') for c in callbacks))
        self.assertTrue(any(c.startswith('cancel_') for c in callbacks))
        # Only wired callbacks: a dead button would silently do nothing.
        self.assertFalse(any(c.startswith('reschedule_') for c in callbacks))
        self.assertIn(appt.appointment_code, item['message'])

    def test_telegram_row_without_resolvable_chat_writes_no_claim(self):
        """A Telegram interaction with no resolvable chat id can never be
        delivered: no claim, no mark - the next sweep retries (B's posture)."""
        req = self.make_booking_request()
        self.log_row(req, 'telegram')
        self.make_appointment(hours_ahead=23, booking_request=req)

        res = self.sweep()
        self.assertEqual(res.data['reminder_24h_count'], 0)
        self.assertFalse(InteractionLog.objects.filter(external_ref__startswith='rem24-').exists())

    # --- single-shot -----------------------------------------------------------

    def test_reminders_are_single_shot_across_sweeps(self):
        req = self.make_booking_request()
        self.log_row(req, 'sms')
        appt = self.make_appointment(hours_ahead=23, booking_request=req)

        first = self.sweep()
        self.assertEqual(first.data['reminder_24h_count'], 1)

        second = self.sweep()
        self.assertEqual(second.data['reminder_24h_count'], 0)
        claim = InteractionLog.objects.get(external_ref=f"rem24-{appt.appointment_code}-sms")
        self.assertEqual(claim.status, 'queued')
        self.assertEqual(claim.direction, 'outbound')
        self.assertEqual(claim.appointment_id, appt.id)

    # --- follow-up recalls -----------------------------------------------------

    def test_followup_recall_emits_and_marks_the_task_once(self):
        req = self.make_booking_request()
        self.log_row(req, 'whatsapp')
        appt = self.make_appointment(hours_ahead=-20, booking_request=req)  # visit already happened
        task = self.make_follow_up(appt, days_ahead=0)

        res = self.sweep()
        self.assertEqual(res.data['followup_count'], 1)
        item = res.data['followup_items'][0]
        self.assertEqual(item['kind'], 'followup')
        self.assertEqual(item['channel'], 'whatsapp')
        self.assertEqual(item['claim_ref'], f"followup-{task.id}-whatsapp")
        self.assertIn('Reminder Consultation', item['message'])

        task.refresh_from_db()
        self.assertTrue(task.reminder_sent)
        self.assertIsNotNone(task.reminder_sent_at)

        second = self.sweep()
        self.assertEqual(second.data['followup_count'], 0)

    def test_followup_falls_back_to_sms_for_walk_in(self):
        appt = self.make_appointment(hours_ahead=-20, booking_request=None)
        task = self.make_follow_up(appt, days_ahead=-1)  # overdue

        res = self.sweep()
        self.assertEqual(res.data['followup_count'], 1)
        item = res.data['followup_items'][0]
        self.assertEqual(item['channel'], 'sms')
        self.assertEqual(item['claim_ref'], f"followup-{task.id}-sms")

    def test_followup_ignores_completed_or_already_sent_tasks(self):
        appt = self.make_appointment(hours_ahead=-20)
        self.make_follow_up(appt, days_ahead=0, is_completed=True)
        self.make_follow_up(appt, days_ahead=0, reminder_sent=True)

        res = self.sweep()
        self.assertEqual(res.data['followup_count'], 0)
        self.assertEqual(res.data['followup_items'], [])

    # --- full contract ---------------------------------------------------------

    def test_full_item_and_response_contract(self):
        appt = self.make_appointment(hours_ahead=23)
        self.make_follow_up(appt, days_ahead=0)

        res = self.sweep()
        self.assertEqual(res.data['reminder_24h_count'], 1)
        self.assertEqual(res.data['followup_count'], 1)
        for key in ('timestamp', 'reminder_24h_count', 'reminder_2h_count', 'followup_count', 'reminder_items', 'followup_items'):
            self.assertIn(key, res.data)

        rem = res.data['reminder_items'][0]
        for key in ('request_id', 'id', 'kind', 'channel', 'claim_ref', 'patient_name',
                    'patient_phone', 'service_name', 'doctor_name', 'start_datetime', 'message'):
            self.assertIn(key, rem)
        self.assertEqual(rem['request_id'], appt.appointment_code)
        self.assertEqual(rem['id'], str(appt.id))
        self.assertEqual(rem['doctor_name'], 'Dr. Reminder Test')

        fu = res.data['followup_items'][0]
        for key in ('request_id', 'kind', 'channel', 'claim_ref', 'patient_name', 'message'):
            self.assertIn(key, fu)
        self.assertEqual(fu['request_id'], appt.appointment_code)

    # --- house auth ------------------------------------------------------------

    def test_webhook_requires_valid_secret(self):
        res = self.sweep(secret=None)
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(res.data['error'], 'INVALID_WEBHOOK_SECRET')

        res = self.sweep(secret='wrong_secret')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(res.data['error'], 'INVALID_WEBHOOK_SECRET')


class RBACTighteningTests(APITestCase):
    """
    Phase 1 / Task 1.2 — Partner Readiness Roadmap:
    Receptionists must never read integration secrets or mutate root clinic rules;
    clinic_admin retains full visibility and control; doctor login provisioning stays forbidden.
    """

    def setUp(self):
        cache.clear()
        self.clinic = ClinicSetting.get_settings()
        self.clinic.webhook_secret = 'clinic_dev_secret_2026'
        self.clinic.custom_config = {
            'currency': 'NGN',
            'bot_handle': '@cedarcare_bot',
            'telegram_bot_token': '123456:ABC-real-bot-token',
            'telegram_secret_token': 'tg-gateway-secret-999',
            'webhook_secret': 'legacy-config-secret',
        }
        self.clinic.save()

        self.receptionist = StaffUser.objects.create(
            full_name='Sarah Frontdesk',
            email='sarah.rbac@clinic.com',
            role='receptionist',
            is_active=True,
        )
        self.receptionist.set_password('SarahPass123!')
        self.receptionist.save()

        self.admin = StaffUser.objects.create(
            full_name='Ibrahim Admin',
            email='admin.rbac@clinic.com',
            role='clinic_admin',
            is_active=True,
        )
        self.admin.set_password('AdminPass123!')
        self.admin.save()

    def tearDown(self):
        cache.clear()

    def test_receptionist_settings_get_masks_integration_secrets(self):
        self.client.force_authenticate(user=self.receptionist)
        res = self.client.get('/api/v1/clinic/settings/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        cfg = res.data['custom_config']
        self.assertEqual(cfg['telegram_bot_token'], '•••••••• (admin only)')
        self.assertEqual(cfg['telegram_secret_token'], '•••••••• (admin only)')
        self.assertEqual(cfg['webhook_secret'], '•••••••• (admin only)')
        # Benign operational keys stay visible for the workstation UI
        self.assertEqual(cfg['currency'], 'NGN')
        self.assertEqual(cfg['bot_handle'], '@cedarcare_bot')
        # The dedicated webhook_secret DB field is never serialized at all
        self.assertNotIn('webhook_secret', res.data)

    def test_admin_settings_get_returns_full_secrets(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get('/api/v1/clinic/settings/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        cfg = res.data['custom_config']
        self.assertEqual(cfg['telegram_bot_token'], '123456:ABC-real-bot-token')
        self.assertEqual(cfg['telegram_secret_token'], 'tg-gateway-secret-999')
        self.assertEqual(cfg['webhook_secret'], 'legacy-config-secret')

    def test_receptionist_settings_export_masks_secrets(self):
        self.client.force_authenticate(user=self.receptionist)
        res = self.client.get('/api/v1/clinic/settings/export/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        body = res.content.decode('utf-8')
        # Real secret values must never appear; masked marker text must appear
        self.assertNotIn('ABC-real-bot-token', body)
        self.assertNotIn('tg-gateway-secret-999', body)
        self.assertIn('(admin only)', body)

    def test_receptionist_cannot_update_root_clinic_settings(self):
        self.client.force_authenticate(user=self.receptionist)
        res = self.client.patch('/api/v1/clinic/settings/', {
            'open_time': '06:00',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        self.clinic.refresh_from_db()
        self.assertEqual(self.clinic.open_time, datetime.time(8, 0))

    def test_admin_can_update_root_clinic_settings(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.patch('/api/v1/clinic/settings/', {
            'open_time': '07:30',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.clinic.refresh_from_db()
        self.assertEqual(self.clinic.open_time, datetime.time(7, 30))

    def test_admin_settings_patch_audit_excludes_custom_config_secrets(self):
        """
        Review Fix #4: the settings PATCH audit row must never contain the
        full custom_config (bot tokens etc.) even when the requester is an
        admin whose API response legitimately includes them.
        """
        self.client.force_authenticate(user=self.admin)
        res = self.client.patch('/api/v1/clinic/settings/', {
            'open_time': '07:45',
            'custom_config': {'telegram_bot_token': 'fresh-secret-token-123'},
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        audit = AuditLog.objects.filter(
            entity_name='ClinicSetting', action='CLINIC_SETTINGS_UPDATED'
        ).order_by('-created_at').first()
        self.assertIsNotNone(audit)
        self.assertNotIn('custom_config', str(audit.changes))
        self.assertNotIn('fresh-secret-token-123', str(audit.changes))
        # The secret itself was still saved for the admin (authoritative store)
        self.clinic.refresh_from_db()
        self.assertEqual(self.clinic.custom_config['telegram_bot_token'], 'fresh-secret-token-123')

    def test_admin_clinical_doctor_enrolment_without_credentials_succeeds(self):
        """Credential-free doctor enrolment creates a Doctor resource with NO dashboard login."""
        self.client.force_authenticate(user=self.admin)
        res = self.client.post('/api/v1/admin/staff/', {
            'full_name': 'Dr. Emeka Nwosu',
            'email': 'emeka.nwosu@cedarcare.ng',
            'role': 'doctor',
            'specialty': 'Optometry',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data['role'], 'doctor')
        self.assertTrue(Doctor.objects.filter(name='Dr. Emeka Nwosu').exists())
        # The security guarantee: no StaffUser login account may exist for a doctor
        self.assertFalse(StaffUser.objects.filter(role='doctor').exists())

    def test_admin_doctor_login_provisioning_with_credentials_rejected(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.post('/api/v1/admin/staff/', {
            'full_name': 'Dr. Sneaky Login',
            'email': 'sneaky@cedarcare.ng',
            'role': 'doctor',
            'password': 'password123',
            'pin': '1234',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('role', res.data)
        self.assertFalse(StaffUser.objects.filter(role='doctor').exists())
        self.assertFalse(Doctor.objects.filter(name='Dr. Sneaky Login').exists())


class PrivacyAndIPHardeningTests(TestCase):
    """
    Phase 1 / Tasks 1.3 + 1.4 — Partner Readiness Roadmap:
    Patient phone numbers never reach ephemeral server logs in full form, and
    client-IP extraction cannot be poisoned by malformed/spoofed edge headers.
    """

    def setUp(self):
        cache.clear()

    def tearDown(self):
        cache.clear()

    def test_mask_phone_variants(self):
        from .services.privacy import mask_phone
        self.assertEqual(mask_phone('+2348030001122'), '+234••••••1122')
        self.assertEqual(mask_phone('08030001122'), '•••••••1122')
        self.assertEqual(mask_phone(''), '')
        self.assertEqual(mask_phone(None), '')
        # Short inputs become fully masked
        self.assertEqual(mask_phone('12345'), '•••••')

    def test_safe_external_body_masks_phones_and_truncates(self):
        from .services.privacy import safe_external_body
        body = "Error for patient +2348030001122: slot taken. " + "x" * 500
        safe = safe_external_body(body, max_chars=100)
        self.assertNotIn('+2348030001122', safe)
        self.assertIn('1122', safe)
        self.assertLessEqual(len(safe), 100 + len('…[truncated]'))
        self.assertTrue(safe.endswith('…[truncated]'))

    def test_safe_external_body_none(self):
        from .services.privacy import safe_external_body
        self.assertEqual(safe_external_body(None), '')

    def _make_request(self, meta):
        from types import SimpleNamespace
        return SimpleNamespace(META=meta)

    def test_get_client_ip_trusted_valid_cf_header(self):
        from .views_booking import get_client_ip
        req = self._make_request({
            'REMOTE_ADDR': '10.0.0.1',
            'HTTP_CF_CONNECTING_IP': '102.89.44.7',
        })
        self.assertEqual(get_client_ip(req), '102.89.44.7')

    def test_get_client_ip_malformed_headers_fall_through(self):
        from .views_booking import get_client_ip
        req = self._make_request({
            'REMOTE_ADDR': '10.0.0.1',
            'HTTP_CF_CONNECTING_IP': 'not-an-ip',
            'HTTP_X_REAL_IP': 'also-garbage',
            'HTTP_X_FORWARDED_FOR': 'garbage<scrip>',
        })
        self.assertEqual(get_client_ip(req), '10.0.0.1')

    def test_get_client_ip_xff_chain_takes_first_hop(self):
        from .views_booking import get_client_ip
        req = self._make_request({
            'REMOTE_ADDR': '10.0.0.1',
            'HTTP_X_FORWARDED_FOR': '102.89.44.7, 172.71.1.1',
        })
        self.assertEqual(get_client_ip(req), '102.89.44.7')

    @override_settings()
    def test_get_client_ip_proxy_headers_ignored_when_toggle_off(self):
        import os
        from .views_booking import get_client_ip
        os.environ['TRUST_PROXY_IP_HEADERS'] = 'False'
        try:
            req = self._make_request({
                'REMOTE_ADDR': '10.0.0.1',
                'HTTP_CF_CONNECTING_IP': '102.89.44.7',
                'HTTP_X_FORWARDED_FOR': '102.89.44.8',
            })
            self.assertEqual(get_client_ip(req), '10.0.0.1')
        finally:
            os.environ['TRUST_PROXY_IP_HEADERS'] = 'True'

    def test_get_client_ip_xff_ignored_when_xff_toggle_off(self):
        """
        Review Fix #5: when the platform proxy merely APPENDS X-Forwarded-For
        (TRUSTED_PROXY_SETS_XFF=False), the first hop is client-controlled and
        must not be trusted for rate-limit bucketing. CF-Connecting-IP stays
        trusted (Cloudflare overwrites it).
        """
        import os
        from .views_booking import get_client_ip
        prev = os.environ.get('TRUSTED_PROXY_SETS_XFF')
        os.environ['TRUSTED_PROXY_SETS_XFF'] = 'False'
        try:
            req = self._make_request({
                'REMOTE_ADDR': '10.0.0.1',
                'HTTP_CF_CONNECTING_IP': '102.89.44.7',
                'HTTP_X_FORWARDED_FOR': '102.89.44.8',
            })
            self.assertEqual(get_client_ip(req), '102.89.44.7')  # CF still trusted

            req = self._make_request({
                'REMOTE_ADDR': '10.0.0.1',
                'HTTP_X_FORWARDED_FOR': '102.89.44.8',
                'HTTP_X_REAL_IP': '102.89.44.9',
            })
            self.assertEqual(get_client_ip(req), '10.0.0.1')  # XFF/X-Real-IP ignored
        finally:
            if prev is None:
                os.environ.pop('TRUSTED_PROXY_SETS_XFF', None)
            else:
                os.environ['TRUSTED_PROXY_SETS_XFF'] = prev

    def test_get_client_ip_defaults_to_loopback(self):
        from .views_booking import get_client_ip
        req = self._make_request({})
        self.assertEqual(get_client_ip(req), '127.0.0.1')

    def test_telegram_http_error_logs_masked_body(self):
        """
        End-to-end guard: the HTTPError handler path masks any patient phone
        found in a provider error body before it reaches the log/AuditLog.
        """
        from unittest.mock import patch
        from .services.telegram_service import TelegramService
        from .models import AuditLog

        clinic = ClinicSetting.get_settings()
        clinic.custom_config = {'telegram_bot_token': '123456:real-token'}
        clinic.save()

        captured = {}

        def fake_logger_warning(msg, *args):
            captured['log'] = msg % args if args else msg

        with patch('urllib.request.urlopen') as mock_open:
            try:
                raise __import__('urllib.error', fromlist=['HTTPError']).HTTPError(
                    url='https://api.telegram.org', code=403,
                    msg='Forbidden', hdrs=None,
                    fp=__import__('io').BytesIO(b'chat 08030001122 blocked')
                )
            except Exception:
                pass
            err = __import__('urllib.error', fromlist=['HTTPError']).HTTPError(
                url='https://api.telegram.org', code=403,
                msg='Forbidden', hdrs=None,
                fp=__import__('io').BytesIO(b'chat 08030001122 blocked')
            )
            mock_open.side_effect = err

            with patch(
                'appointments.services.telegram_service.logger.warning',
                side_effect=fake_logger_warning
            ):
                res = TelegramService.call_api('sendMessage', {'chat_id': '1', 'text': 'x'})

        self.assertFalse(res.get('ok'))
        self.assertIn('log', captured)
        self.assertNotIn('08030001122', captured['log'])
        self.assertIn('1122', captured['log'])
        audit = AuditLog.objects.filter(action='TELEGRAM_BOT_BLOCKED_BY_USER').order_by('-created_at').first()
        self.assertIsNotNone(audit)
        self.assertNotIn('08030001122', str(audit.changes))


class InteractionLogAPITests(APITestCase):
    """
    Phase 2 / Task 2.1 — Partner Readiness Roadmap:
    POST /api/v1/interactions/ accepts n8n Dispatcher results with the shared
    webhook secret (fail-closed otherwise) and is idempotent on external_ref;
    GET /api/v1/interactions/ is staff-only and filterable.
    """

    def setUp(self):
        cache.clear()
        self.clinic = ClinicSetting.get_settings()
        self.clinic.webhook_secret = 'clinic_dev_secret_2026'
        self.clinic.save()

        self.receptionist = StaffUser.objects.create(
            full_name='Sarah Intake',
            email='sarah.interactions@clinic.com',
            role='receptionist',
            is_active=True,
        )
        self.receptionist.set_password('SarahPass123!')
        self.receptionist.save()

        self.service = Service.objects.create(
            name='Dental Consultation',
            duration_minutes=30,
            buffer_minutes=5,
            price=10000,
        )
        self.booking = BookingRequest.objects.create(
            request_code='REQ-2026-0042',
            patient_name='Amina Test',
            patient_phone='+2348030001122',
            service=self.service,
            status='slots_offered',
        )
        self.appointment = Appointment.objects.create(
            appointment_code='AP-1042',
            patient_name='Amina Test',
            patient_phone='+2348030001122',
            doctor=Doctor.objects.create(name='Dr. Test'),
            service=self.service,
            start_datetime=timezone.now() + datetime.timedelta(days=1),
            end_datetime=timezone.now() + datetime.timedelta(days=1, minutes=30),
            status='confirmed',
        )

        self.valid_payload = {
            'provider': 'voicebip',
            'channel': 'voice',
            'status': 'answered',
            'patient_name': 'Amina Test',
            'patient_phone': '+234 803 000 1122',  # needs E.164 normalization
            'request_code': 'REQ-2026-0042',
            'external_ref': 'VB-CALL-7788',
            'call_duration_seconds': 45,
            'summary': 'Patient accepted 10:00 slot.',
        }

    def tearDown(self):
        cache.clear()

    def _post_with_secret(self, payload=None):
        return self.client.post(
            '/api/v1/interactions/',
            payload or self.valid_payload,
            format='json',
            HTTP_X_WEBHOOK_SECRET='clinic_dev_secret_2026'
        )

    def test_post_without_secret_or_staff_rejected(self):
        res = self.client.post('/api/v1/interactions/', self.valid_payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(InteractionLog.objects.count(), 0)

    def test_post_with_wrong_secret_rejected(self):
        res = self.client.post(
            '/api/v1/interactions/',
            self.valid_payload, format='json',
            HTTP_X_WEBHOOK_SECRET='wrong-secret'
        )
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(InteractionLog.objects.count(), 0)

    def test_post_with_secret_creates_log(self):
        res = self._post_with_secret()
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(InteractionLog.objects.count(), 1)

        log = InteractionLog.objects.first()
        # E.164 normalization applied
        self.assertEqual(log.patient_phone, '+2348030001122')
        self.assertEqual(log.provider, 'voicebip')
        self.assertEqual(log.channel, 'voice')
        self.assertEqual(log.status, 'answered')
        self.assertEqual(log.call_duration_seconds, 45)
        # FK resolved from request_code
        self.assertEqual(log.booking_request, self.booking)
        self.assertEqual(res.data['request_code'], 'REQ-2026-0042')

    def test_post_with_appointment_code_as_request_code_links_appointment(self):
        """Workflow A: reminder claims identify the APPOINTMENT by code. The
        outcome POST must resolve an appointment code too (BookingRequest
        first, then Appointment) - a hard 400 here left every reminder claim
        stuck 'queued' in the A.3 live proof."""
        payload = dict(self.valid_payload, request_code='AP-1042', external_ref='REM-PROBE-1')
        res = self._post_with_secret(payload)
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        log = InteractionLog.objects.get(external_ref='REM-PROBE-1')
        self.assertEqual(log.appointment, self.appointment)
        self.assertIsNone(log.booking_request)

    def test_post_with_staff_jwt_creates_log(self):
        self.client.force_authenticate(user=self.receptionist)
        res = self.client.post('/api/v1/interactions/', self.valid_payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

    def test_post_idempotent_on_external_ref(self):
        first = self._post_with_secret()
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)

        # Same provider delivery re-sent with an updated status
        re_delivery = dict(self.valid_payload)
        re_delivery['status'] = 'failed'
        re_delivery['error_detail'] = 'Line busy.'
        second = self._post_with_secret(re_delivery)

        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(InteractionLog.objects.count(), 1)
        log = InteractionLog.objects.first()
        self.assertEqual(log.status, 'failed')
        self.assertEqual(log.error_detail, 'Line busy.')

    def test_post_invalid_request_code_rejected(self):
        bad = dict(self.valid_payload)
        bad['request_code'] = 'REQ-2026-9999'
        res = self._post_with_secret(bad)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('request_code', res.data)
        self.assertEqual(InteractionLog.objects.count(), 0)

    # ---------- Stage D-4: out-of-order provider callbacks ----------

    def _post_status(self, new_status, **overrides):
        payload = dict(self.valid_payload)
        payload['status'] = new_status
        payload.update(overrides)
        return self._post_with_secret(payload)

    def test_late_delivery_report_does_not_downgrade_answered(self):
        self._post_status('answered')
        res = self._post_status('delivered')

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        log = InteractionLog.objects.get(external_ref='VB-CALL-7788')
        self.assertEqual(log.status, 'answered')

    def test_late_sent_event_does_not_downgrade_delivered(self):
        self._post_status('delivered')
        res = self._post_status('sent')

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(InteractionLog.objects.get().status, 'delivered')

    def test_newer_status_still_advances_the_row(self):
        self._post_status('sent')
        res = self._post_status('delivered')

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(InteractionLog.objects.get().status, 'delivered')

    def test_terminal_outcome_overrides_earlier_terminal(self):
        # answered -> no_answer is a same-rank terminal correction: last one wins.
        self._post_status('answered')
        self._post_status('no_answer')

        self.assertEqual(InteractionLog.objects.get().status, 'no_answer')

    def test_stale_event_fills_blanks_without_overwriting(self):
        self._post_status('answered', recording_url='', summary='Patient accepted 10:00 slot.')
        res = self._post_status(
            'sent',
            recording_url='https://recordings.example.com/vb-7788.mp3',
            summary='Late generic delivery report',
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        log = InteractionLog.objects.get()
        self.assertEqual(log.status, 'answered')
        self.assertEqual(log.recording_url, 'https://recordings.example.com/vb-7788.mp3')
        self.assertEqual(log.summary, 'Patient accepted 10:00 slot.')

    def test_stale_event_never_clears_a_failure_reason(self):
        self._post_status('failed', error_detail='Line busy.')
        self._post_status('sent', error_detail='')

        log = InteractionLog.objects.get()
        self.assertEqual(log.status, 'failed')
        self.assertEqual(log.error_detail, 'Line busy.')

    def test_callback_without_phone_reuses_stored_number(self):
        self._post_status('sent')

        # VoiceBip-style call outcome: provider id only, no destination number.
        payload = {
            'provider': 'voicebip',
            'channel': 'voice',
            'status': 'answered',
            'external_ref': 'VB-CALL-7788',
            'call_duration_seconds': 62,
        }
        res = self._post_with_secret(payload)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        log = InteractionLog.objects.get()
        self.assertEqual(log.status, 'answered')
        self.assertEqual(log.call_duration_seconds, 62)
        self.assertEqual(log.patient_phone, '+2348030001122')

    def test_post_without_phone_and_unknown_ref_rejected(self):
        payload = {
            'provider': 'voicebip',
            'channel': 'voice',
            'status': 'answered',
            'external_ref': 'VB-UNKNOWN-1',
        }
        res = self._post_with_secret(payload)

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('patient_phone', res.data)
        self.assertEqual(InteractionLog.objects.count(), 0)

    def test_queued_skip_row_without_phone_accepted(self):
        # Phase 2 skip visibility: a "held back, not attempted" row (status
        # queued) is internal bookkeeping linked to the booking request — it
        # carries no destination number because nothing was sent anywhere.
        payload = {
            'provider': 'voicebip',
            'channel': 'voice',
            'status': 'queued',
            'request_code': 'REQ-2026-0042',
            'external_ref': 'skip-voice-REQ-2026-0042',
            'summary': 'Held back: outside calling hours (08:00-19:00).',
            'error_detail': 'outside_call_window',
        }
        res = self._post_with_secret(payload)

        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        log = InteractionLog.objects.get(external_ref='skip-voice-REQ-2026-0042')
        self.assertEqual(log.status, 'queued')
        self.assertEqual(log.patient_phone, '')
        self.assertEqual(log.booking_request, self.booking)

    def test_queued_row_without_phone_and_without_request_link_rejected(self):
        # A phoneless queued row with no request link would be an orphan —
        # nothing to look it up by. The relaxation requires the link.
        payload = {
            'provider': 'voicebip',
            'channel': 'voice',
            'status': 'queued',
            'external_ref': 'skip-voice-ORPHAN',
        }
        res = self._post_with_secret(payload)

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('patient_phone', res.data)
        self.assertEqual(InteractionLog.objects.count(), 0)

    def test_phoneless_queued_row_advanced_by_later_delivery_event(self):
        # The skip row must not trap the history: when the channel later fires,
        # the real provider event (higher rank, carries a phone) advances the
        # row and fills the blank number. Our callback receiver always sends
        # request_code alongside the provider id, so the link survives.
        skip = {
            'provider': 'voicebip',
            'channel': 'voice',
            'status': 'queued',
            'request_code': 'REQ-2026-0042',
            'external_ref': 'VB-CALL-LATER-1',
            'error_detail': 'outside_call_window',
        }
        res = self._post_with_secret(skip)
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        delivered = {
            'provider': 'voicebip',
            'channel': 'voice',
            'status': 'answered',
            'request_code': 'REQ-2026-0042',
            'external_ref': 'VB-CALL-LATER-1',
            'patient_phone': '+234 803 000 1122',
            'call_duration_seconds': 30,
        }
        res = self._post_with_secret(delivered)
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        log = InteractionLog.objects.get(external_ref='VB-CALL-LATER-1')
        self.assertEqual(log.status, 'answered')
        self.assertEqual(log.patient_phone, '+2348030001122')
        self.assertEqual(log.booking_request, self.booking)
        self.assertEqual(InteractionLog.objects.count(), 1)

    def test_callback_cannot_reattribute_patient_phone(self):
        # Phase 3 / 3.7: a delivery receipt may FILL a blank number, never REWRITE
        # one that already exists. The delivery outcome is real, so the status still
        # advances - only the identity is refused. A silent overwrite would move the
        # patient's whole message history onto another number (sandbox call, provider
        # echoing a trunk DID, cross-wired external_ref) with nothing to show for it.
        self._post_status('sent')

        res = self._post_with_secret({
            'provider': 'voicebip',
            'channel': 'voice',
            'status': 'answered',
            'external_ref': 'VB-CALL-7788',
            'patient_phone': '08099998888',
            'call_duration_seconds': 30,
        })

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        log = InteractionLog.objects.get(external_ref='VB-CALL-7788')
        self.assertEqual(log.patient_phone, '+2348030001122')
        self.assertEqual(log.status, 'answered')
        self.assertEqual(log.call_duration_seconds, 30)
        # The discrepancy is on the row reception reads, not only in a log file.
        self.assertIn('did not match', log.summary)
        self.assertIn('Patient accepted 10:00 slot.', log.summary)

    def test_phone_mismatch_flag_is_not_duplicated(self):
        # Providers retry. A second mismatching callback must not stack the sentence.
        self._post_status('sent')
        mismatch = {
            'provider': 'voicebip',
            'channel': 'voice',
            'status': 'answered',
            'external_ref': 'VB-CALL-7788',
            'patient_phone': '08099998888',
        }
        self._post_with_secret(mismatch)
        self._post_with_secret(mismatch)

        log = InteractionLog.objects.get(external_ref='VB-CALL-7788')
        self.assertEqual(log.summary.count('did not match'), 1)

    def test_same_phone_in_another_format_is_not_a_mismatch(self):
        # Identity is the normalized number, not the string: '08030001122' and
        # '+234 803 000 1122' are the same patient and must not be flagged.
        self._post_status('sent')
        res = self._post_status('answered', patient_phone='08030001122')

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        log = InteractionLog.objects.get()
        self.assertEqual(log.patient_phone, '+2348030001122')
        self.assertEqual(log.status, 'answered')
        self.assertNotIn('did not match', log.summary)

    def test_lower_rank_event_with_different_phone_still_ignored(self):
        # The lower-rank branch already refused to overwrite. Pin it so the new guard
        # and the old one cannot drift apart.
        self._post_status('answered')
        res = self._post_status('sent', patient_phone='08099998888')

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        log = InteractionLog.objects.get()
        self.assertEqual(log.patient_phone, '+2348030001122')
        self.assertEqual(log.status, 'answered')
        self.assertNotIn('did not match', log.summary)

    def test_filling_a_blank_phone_is_not_flagged_as_mismatch(self):
        # The 2.1 contract: a queued skip row has no number, and the real delivery
        # event fills it. That is a fill, not a rewrite, so no warning sentence.
        self._post_with_secret({
            'provider': 'voicebip',
            'channel': 'voice',
            'status': 'queued',
            'request_code': 'REQ-2026-0042',
            'external_ref': 'VB-CALL-FILL-1',
            'error_detail': 'outside_call_window',
        })
        res = self._post_with_secret({
            'provider': 'voicebip',
            'channel': 'voice',
            'status': 'answered',
            'request_code': 'REQ-2026-0042',
            'external_ref': 'VB-CALL-FILL-1',
            'patient_phone': '+2348030001122',
        })

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        log = InteractionLog.objects.get(external_ref='VB-CALL-FILL-1')
        self.assertEqual(log.patient_phone, '+2348030001122')
        self.assertNotIn('did not match', log.summary)

    def test_callback_without_name_does_not_blank_stored_name(self):
        # Same rule as the phone: "said nothing" is not "clear it". A delivery receipt
        # that carries no patient name must not erase the name the first event carried.
        self._post_status('sent')
        self.assertEqual(InteractionLog.objects.get().patient_name, 'Amina Test')

        res = self._post_status('answered', patient_name='')

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        log = InteractionLog.objects.get()
        self.assertEqual(log.patient_name, 'Amina Test')
        self.assertEqual(log.status, 'answered')

    def test_id_only_advancing_event_preserves_links(self):
        # Phase 3 (hardening, link-clobber quirk from 2.1): a provider callback
        # that identifies the message by external_ref alone (typical VoiceBip
        # call outcome: id + status + duration, no request/appointment codes)
        # must not UNLINK a row that already carries its BookingRequest.
        self._post_with_secret({
            'provider': 'voicebip',
            'channel': 'voice',
            'status': 'sent',
            'request_code': 'REQ-2026-0042',
            'patient_phone': '+2348030001122',
            'external_ref': 'VB-LINKKEEP-1',
        })

        # Same ref advances the row — carried codes: none.
        res = self._post_with_secret({
            'provider': 'voicebip',
            'channel': 'voice',
            'status': 'answered',
            'external_ref': 'VB-LINKKEEP-1',
            'call_duration_seconds': 62,
        })

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        log = InteractionLog.objects.get(external_ref='VB-LINKKEEP-1')
        self.assertEqual(log.status, 'answered')
        self.assertEqual(log.call_duration_seconds, 62)
        self.assertEqual(log.patient_phone, '+2348030001122')  # reused, unchanged behavior
        self.assertEqual(log.booking_request, self.booking)    # <-- the fix under test

    def test_new_row_without_codes_stays_unlinked(self):
        # Pinned unchanged behavior: a genuinely unlinked event still creates
        # an unlinked row (preservation only applies to rows that had a link).
        res = self._post_with_secret({
            'provider': 'voicebip',
            'channel': 'sms',
            'status': 'delivered',
            'patient_phone': '+2348030001122',
            'external_ref': 'VB-NOLINK-1',
        })

        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        log = InteractionLog.objects.get(external_ref='VB-NOLINK-1')
        self.assertIsNone(log.booking_request)

    def test_event_with_code_relinks_existing_row(self):
        # Preservation must never block legitimate re-linking: an advancing
        # event that carries a resolvable request_code wins, even over a link
        # the row already had.
        self._post_with_secret({
            'provider': 'voicebip',
            'channel': 'voice',
            'status': 'sent',
            'request_code': 'REQ-2026-0042',
            'patient_phone': '+2348030001122',
            'external_ref': 'VB-RELINK-1',
        })
        other = BookingRequest.objects.create(
            request_code='REQ-2026-0099',
            patient_name='Relink Target',
            patient_phone='+2348099990099',
            service=self.service,
            status='awaiting_review',
        )

        res = self._post_with_secret({
            'provider': 'voicebip',
            'channel': 'voice',
            'status': 'answered',
            'request_code': other.request_code,
            'external_ref': 'VB-RELINK-1',
            'call_duration_seconds': 30,
        })

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        log = InteractionLog.objects.get(external_ref='VB-RELINK-1')
        self.assertEqual(log.status, 'answered')
        self.assertEqual(log.booking_request, other)

    def test_post_invalid_channel_rejected(self):
        bad = dict(self.valid_payload)
        bad['channel'] = 'carrier_pigeon'
        res = self._post_with_secret(bad)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('channel', res.data)

    def test_get_requires_staff(self):
        InteractionLog.objects.create(
            provider='voicebip', channel='voice', status='answered',
            patient_phone='+2348030001122',
        )
        res = self.client.get('/api/v1/interactions/')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_get_staff_filterable(self):
        InteractionLog.objects.create(
            provider='voicebip', channel='voice', status='answered',
            patient_phone='+2348030001122', booking_request=self.booking,
        )
        InteractionLog.objects.create(
            provider='meta_whatsapp', channel='whatsapp', status='delivered',
            patient_phone='+2348099999999',
        )

        self.client.force_authenticate(user=self.receptionist)

        res = self.client.get('/api/v1/interactions/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data), 2)

        res = self.client.get('/api/v1/interactions/', {'patient_phone': '+2348030001122'})
        self.assertEqual(len(res.data), 1)
        self.assertEqual(res.data[0]['channel'], 'voice')

        res = self.client.get('/api/v1/interactions/', {'request_code': 'REQ-2026-0042'})
        self.assertEqual(len(res.data), 1)

        res = self.client.get('/api/v1/interactions/', {'channel': 'whatsapp'})
        self.assertEqual(len(res.data), 1)
        self.assertEqual(res.data[0]['provider'], 'meta_whatsapp')

        res = self.client.get('/api/v1/interactions/', {'limit': '1'})
        self.assertEqual(len(res.data), 1)

    def test_get_includes_appointment_code(self):
        InteractionLog.objects.create(
            provider='meta_whatsapp', channel='whatsapp', status='delivered',
            patient_phone='+2348030001122', appointment=self.appointment,
        )
        self.client.force_authenticate(user=self.receptionist)
        res = self.client.get('/api/v1/interactions/')
        self.assertEqual(res.data[0]['appointment_code'], 'AP-1042')

    def test_phone_variants_collapse_to_one_identity(self):
        """
        Review Fix #3: '+234...', bare '234...', and local '0803...' must all
        normalize to the same E.164 key so the dossier filter finds every
        interaction for a patient regardless of source format.
        """
        self.client.force_authenticate(user=self.receptionist)
        for idx, variant in enumerate(('+2348030001122', '2348030001122', '08030001122', '+234 803 000 1122'), 1):
            res = self._post_with_secret({
                'provider': 'meta_whatsapp',
                'channel': 'whatsapp',
                'status': 'delivered',
                'patient_phone': variant,
                'external_ref': f'ref-variant-{idx}',
            })
            self.assertEqual(res.status_code, status.HTTP_201_CREATED, f'variant {variant} rejected')

        # All four rows share one canonical phone key
        self.assertEqual(
            set(InteractionLog.objects.values_list('patient_phone', flat=True)),
            {'+2348030001122'},
        )
        # A dossier-style lookup with any one variant finds them all
        res = self.client.get('/api/v1/interactions/', {'patient_phone': '08030001122'})
        self.assertEqual(len(res.data), 4)


class AsyncDispatchWebhookTests(APITestCase):
    """
    Phase 2 / Task 2.2 — Partner Readiness Roadmap:
    The receptionist "Approve & Dispatch" response must never wait on n8n.
    The webhook POST is a fire-and-forget daemon thread; a slow/unreachable
    n8n endpoint must not delay the HTTP response (receptionist modal closes
    immediately; offers are already committed to the DB).
    """

    def setUp(self):
        cache.clear()
        self.clinic = ClinicSetting.get_settings()

        self.receptionist = StaffUser.objects.create(
            full_name='Sarah Dispatch',
            email='sarah.dispatch@clinic.com',
            role='receptionist',
            is_active=True,
        )
        self.receptionist.set_password('SarahPass123!')
        self.receptionist.save()

        self.service = Service.objects.create(
            name='Dental Consultation',
            duration_minutes=30,
            buffer_minutes=5,
            price=10000,
        )
        # Wave 2: a doctor created without working_days defaults to [] and is
        # then off duty EVERY day - the booking engine treats the empty list
        # as "never works" (same as AvailabilityEngine). Fixtures must create
        # a realistic doctor with a real calendar and shift.
        self.doctor = Doctor.objects.create(
            name='Dr. Dispatch Test',
            working_days=[1, 2, 3, 4, 5, 6],
            shift_start=datetime.time(8, 0), shift_end=datetime.time(18, 0),
        )

    def tearDown(self):
        cache.clear()

    def test_slow_n8n_does_not_block_response(self):
        import time
        import os
        from unittest.mock import patch

        self.client.force_authenticate(user=self.receptionist)
        req = BookingRequest.objects.create(
            patient_name='Yusuf Bello',
            patient_phone='+2348055556666',
            service=self.service,
            preferred_doctor=self.doctor,
            status='awaiting_review',
        )

        now = timezone.now()
        slot_start = next_legal_slot(10)
        slot_end = slot_start + datetime.timedelta(minutes=30)

        payload = {
            'slots': [{
                'doctor_id': str(self.doctor.id),
                'start_datetime': slot_start.isoformat(),
                'end_datetime': slot_end.isoformat(),
                'is_alternative_date': False,
            }]
        }

        slow_calls = []

        def slow_urlopen(*args, **kwargs):
            slow_calls.append(time.monotonic())
            time.sleep(2.0)  # simulate a hanging n8n instance
            class FakeResp:
                def __enter__(self):
                    return self
                def __exit__(self, *a):
                    return False
            return FakeResp()

        with patch.dict(os.environ, {'N8N_DISPATCH_WEBHOOK_URL': 'https://n8n.example.com/webhook/slot-dispatch'}):
            with patch('appointments.services.dispatch_service.urllib.request.urlopen', side_effect=slow_urlopen):
                started = time.monotonic()
                # Task 3.1 hygiene: the fire now happens AFTER commit (transaction.on_commit);
                # captureOnCommitCallbacks executes those callbacks so the test stays non-vacuous.
                with self.captureOnCommitCallbacks(execute=True):
                    res = self.client.post(
                        f'/api/v1/booking-requests/{req.request_code}/dispatch-offers/',
                        payload, format='json'
                    )
                elapsed = time.monotonic() - started
                # Let the daemon thread finish cleanly before teardown
                import threading
                for t in threading.enumerate():
                    if t.name == 'n8n-dispatch-webhook' and t.is_alive():
                        t.join(timeout=5)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['status'], 'slots_offered')
        # The mock was actually exercised — the test is not vacuous
        self.assertEqual(len(slow_calls), 1, "Fire-and-forget webhook never attempted the POST")
        # The core guarantee: response returns in well under the 2s n8n hang
        self.assertLess(elapsed, 1.5, f"Dispatch response blocked for {elapsed:.2f}s")

    def test_dispatch_webhook_sends_webhook_secret_header(self):
        """
        Phase 0: the n8n dispatch webhook authenticates the caller before it can
        send anything to a patient. Django must therefore send X-Webhook-Secret,
        using the same value every other guarded endpoint verifies.
        """
        import os
        from unittest.mock import patch

        self.clinic.webhook_secret = 'clinic_dev_secret_2026'
        self.clinic.save()

        self.client.force_authenticate(user=self.receptionist)
        req = BookingRequest.objects.create(
            patient_name='Amina Yusuf',
            patient_phone='+2348077778888',
            service=self.service,
            preferred_doctor=self.doctor,
            status='awaiting_review',
        )

        now = timezone.now()
        slot_start = next_legal_slot(11)
        slot_end = slot_start + datetime.timedelta(minutes=30)

        payload = {
            'slots': [{
                'doctor_id': str(self.doctor.id),
                'start_datetime': slot_start.isoformat(),
                'end_datetime': slot_end.isoformat(),
                'is_alternative_date': False,
            }],
            'dispatch_channels': ['sms'],
        }

        captured = {}

        def capture_urlopen(request, timeout=None):
            captured['request'] = request

            class FakeResp:
                def __enter__(self):
                    return self

                def __exit__(self, *a):
                    return False

            return FakeResp()

        with patch.dict(os.environ, {'N8N_DISPATCH_WEBHOOK_URL': 'https://n8n.example.com/webhook/dispatch-offers'}):
            with patch('appointments.services.dispatch_service.urllib.request.urlopen', side_effect=capture_urlopen):
                with self.captureOnCommitCallbacks(execute=True):
                    res = self.client.post(
                        f'/api/v1/booking-requests/{req.request_code}/dispatch-offers/',
                        payload, format='json'
                    )
                import threading
                for t in threading.enumerate():
                    if t.name == 'n8n-dispatch-webhook' and t.is_alive():
                        t.join(timeout=5)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        request = captured.get('request')
        self.assertIsNotNone(request, "The dispatch webhook was never attempted")
        headers = {k.lower(): v for k, v in request.header_items()}
        self.assertEqual(headers.get('x-webhook-secret'), 'clinic_dev_secret_2026')
        self.assertEqual(headers.get('content-type'), 'application/json')


class DashboardBookingContractTests(APITestCase):
    """
    Wave 1 / Step 1.1 — the exact wire contract the dashboard POSTs.

    The queue "confirm slot", the calendar walk-in and the visits walk-in all
    go through SlotHoldRequestSerializer. This pins the payload shape the fixed
    apiService sends (`patient_name` / `patient_phone` / `request_id`) and keeps
    a regression guard for the old `name`/`phone` keys that made every dashboard
    confirm answer 400 while the UI toasted success.
    """

    def setUp(self):
        cache.clear()
        self.clinic = ClinicSetting.get_settings()
        self.clinic.webhook_secret = 'clinic_dev_secret_2026'
        self.clinic.save()

        self.doctor = Doctor.objects.create(
            name='Dr. Contract Hold',
            specialty='Dental Surgery',
            working_days=[1, 2, 3, 4, 5],
            shift_start=datetime.time(9, 0),
            shift_end=datetime.time(17, 0),
        )
        self.service = Service.objects.create(
            name='Dental Consultation',
            duration_minutes=30,
            buffer_minutes=5,
            price=10000,
        )
        self.booking = BookingRequest.objects.create(
            request_code='REQ-2026-0077',
            patient_name='Amina Dashboard',
            patient_phone='+2348030001177',
            service=self.service,
            status='slots_offered',
        )

        # The walk-in endpoint is staff-only (no webhook path), so the test logs
        # in exactly like the dashboard does.
        self.receptionist = StaffUser.objects.create(
            full_name='Reception Contract',
            email='reception.contract@clinic.com',
            role='receptionist',
            is_active=True,
        )
        self.receptionist.set_password('ContractPass123!')
        self.receptionist.save()
        login = self.client.post('/api/v1/auth/login/', {
            'email': 'reception.contract@clinic.com',
            'password': 'ContractPass123!',
        }, format='json')
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {login.data['access']}"
        )

    def _slot(self):
        """A clean WEEKDAY slot inside the doctor's shift, well past today."""
        day = timezone.localdate() + datetime.timedelta(days=1)
        while day.isoweekday() > 5:
            day += datetime.timedelta(days=1)
        return timezone.make_aware(datetime.datetime.combine(day, datetime.time(10, 0)))

    def _post(self, payload, url='/api/v1/slots/hold/'):
        return self.client.post(
            url, payload, format='json',
            HTTP_X_WEBHOOK_SECRET='clinic_dev_secret_2026',
        )

    def test_the_fixed_dashboard_payload_books(self):
        start = self._slot()
        response = self._post({
            'doctor_id': str(self.doctor.id),
            'service_id': str(self.service.id),
            'start_datetime': start.isoformat(),
            'patient_name': 'Amina Dashboard',
            'patient_phone': '+2348030001177',
            'request_id': self.booking.request_code,
            'is_instant_confirm': True,
        })

        # An instant confirm answers 200 with the full appointment payload.
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data['status'], 'confirmed')
        appt = Appointment.objects.get(patient_name='Amina Dashboard')
        self.assertEqual(appt.booking_request.request_code, 'REQ-2026-0077')
        self.assertEqual(appt.doctor.id, self.doctor.id)

    def test_the_fixed_walk_in_payload_books(self):
        start = self._slot()
        response = self._post({
            'doctor_id': str(self.doctor.id),
            'service_id': str(self.service.id),
            'start_datetime': start.isoformat(),
            'patient_name': 'Walkin Wura',
            'patient_phone': '08030001188',
        }, url='/api/v1/appointments/walk-in/')

        # A walk-in patient is already at the desk, so the backend registers
        # them as 'arrived' from the first moment. There is no persisted
        # is_walk_in flag - 'arrived' at registration time IS the walk-in mark.
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data['status'], 'arrived')
        appt = Appointment.objects.get(patient_name='Walkin Wura')
        self.assertEqual(appt.status, 'arrived')
        self.assertIsNotNone(appt.arrival_at)

    def test_the_old_raw_keys_are_rejected(self):
        """The broken payload the dashboard used to send must keep failing loudly."""
        start = self._slot()
        response = self._post({
            'doctor_id': str(self.doctor.id),
            'service_id': str(self.service.id),
            'start_datetime': start.isoformat(),
            'name': 'Amina Dashboard',
            'phone': '+2348030001177',
            'booking_request_id': self.booking.request_code,
        })

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Appointment.objects.count(), 0)

    def test_the_workflow_01_intake_body_is_accepted(self):
        """
        Wave 1 / Step 1.2 — the EXACT body n8n workflow 01 now sends.

        The normalize node builds this object in code (service_id omitted when
        the intake did not name one - the field has no allow_null), so this
        test posts that literal shape. If either side drifts, this fails
        before a real patient intake does.
        """
        response = self.client.post('/api/v1/booking-requests/', {
            'patient_name': "Ngozi O'Brien",
            'patient_phone': '08030001199',
            'preferred_dates': ['2026-12-01', '2026-12-14'],
            'preferred_time_window': 'morning',
            'channel': 'web',
            'patient_notes': 'sharp pain',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        booking = BookingRequest.objects.get(patient_name="Ngozi O'Brien")
        self.assertEqual(booking.patient_phone, '+2348030001199')
        self.assertEqual(booking.channel, 'web')

    def test_a_direct_booking_stores_the_e164_phone(self):
        """
        Wave 1 / Step 1.3 — the sanitisation result must actually be stored.

        The serializer used to compute `sanitize_phone_e164(phone)` and then
        overwrite it with the raw string, so every direct booking kept
        '0803-000-1188' while every lookup compares '+2348030001188' — the
        same patient stopped matching themselves.
        """
        start = self._slot()
        response = self._post({
            'doctor_id': str(self.doctor.id),
            'service_id': str(self.service.id),
            'start_datetime': start.isoformat(),
            'patient_name': 'Raw Phone Ada',
            'patient_phone': '0803-000-1188',
            'is_instant_confirm': True,
        })

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        appt = Appointment.objects.get(patient_name='Raw Phone Ada')
        self.assertEqual(appt.patient_phone, '+2348030001188')

    def test_an_unknown_named_service_is_rejected(self):
        """
        Wave 1 / Step 1.4 — a named-but-unknown service must not become a
        different, real service. The old resolver fell back to the first
        active service, so 'svc-does-not-exist' quietly booked the wrong
        treatment, duration and price.
        """
        start = self._slot()
        response = self._post({
            'doctor_id': str(self.doctor.id),
            'service_id': 'svc-does-not-exist',
            'start_datetime': start.isoformat(),
            'patient_name': 'Wrong Service Ada',
            'patient_phone': '+2348030001190',
            'is_instant_confirm': True,
        })

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Appointment.objects.count(), 0)

    def test_an_intake_with_an_unknown_service_is_rejected_not_swapped(self):
        response = self.client.post('/api/v1/booking-requests/', {
            'patient_name': 'Wrong Service Intake',
            'patient_phone': '08030001191',
            'service_id': 'svc-not-real',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(
            BookingRequest.objects.filter(patient_name='Wrong Service Intake').exists()
        )


class AcquireSlotClinicRulesTests(APITestCase):
    """
    Wave 2 / Step 2.1 — the clinic's rules follow the booking, not just the
    slot generator.

    acquire_slot used to check only doctor-active / on-leave / overlap, so a
    direct calendar booking or walk-in could land at 03:00, on a closed day,
    inside lunch, in the past, on a blocked date or past the daily cap. The
    engine that generates candidate slots enforces all of these; a
    human-picked slot must be held to the same standard.

    Each case books a slot that is legal on EVERY other axis, so exactly one
    rule fires — no test passes because of an unrelated rejection.
    """

    def setUp(self):
        cache.clear()
        self.clinic = ClinicSetting.get_settings()
        self.clinic.webhook_secret = 'clinic_dev_secret_2026'
        # Deterministic stage: Mon-Fri clinic, 08:00-18:00, lunch 13:00-14:00.
        self.clinic.working_days = [1, 2, 3, 4, 5]
        self.clinic.open_time = datetime.time(8, 0)
        self.clinic.close_time = datetime.time(18, 0)
        self.clinic.lunch_break_start = datetime.time(13, 0)
        self.clinic.lunch_break_end = datetime.time(14, 0)
        self.clinic.min_advance_hours = 2
        self.clinic.save()

        self.doctor = Doctor.objects.create(
            name='Dr. Rules Hold', specialty='Dental Surgery',
            working_days=[1, 2, 3, 4, 5],
            shift_start=datetime.time(9, 0), shift_end=datetime.time(17, 0),
            max_daily_appointments=12,
        )
        self.service = Service.objects.create(
            name='Dental Consultation', duration_minutes=30, buffer_minutes=5,
        )

    # -- helpers -----------------------------------------------------------

    def _weekday(self, n=1):
        """The n-th upcoming Mon-Fri date, regardless of when tests run."""
        day = timezone.localdate()
        found = 0
        for _ in range(21):
            day += datetime.timedelta(days=1)
            if day.isoweekday() <= 5:
                found += 1
                if found == n:
                    return day
        raise AssertionError('no weekday found')

    def _last_weekday(self):
        day = timezone.localdate()
        for _ in range(21):
            if day.isoweekday() <= 5:
                return day
            day -= datetime.timedelta(days=1)
        raise AssertionError('no weekday found')

    def _dt(self, day, hour, minute=0):
        return timezone.make_aware(datetime.datetime.combine(day, datetime.time(hour, minute)))

    def _hold(self, doctor, start, end=None, **extra):
        payload = {
            'doctor_id': str(doctor.id),
            'service_id': str(self.service.id),
            'start_datetime': start.isoformat(),
            'patient_name': 'Rules Ada',
            'patient_phone': '+2348030001200',
        }
        if end:
            payload['end_datetime'] = end.isoformat()
        payload.update(extra)
        return self.client.post(
            '/api/v1/slots/hold/', payload, format='json',
            HTTP_X_WEBHOOK_SECRET='clinic_dev_secret_2026',
        )

    def _hold_next_weekday(self, doctor, hour, n=1, minute=0, **extra):
        day = self._weekday(n)
        return self._hold(doctor, self._dt(day, hour, minute), **extra)

    # -- the control: ordinary legal bookings keep working ------------------

    def test_a_legal_slot_still_books(self):
        response = self._hold_next_weekday(self.doctor, 10)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

    # -- one rule per case -------------------------------------------------

    def test_a_past_slot_is_refused(self):
        response = self._hold(self.doctor, self._dt(self._last_weekday(), 10))
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data['error'], 'SLOT_IN_PAST')

    def test_a_closed_clinic_day_is_refused(self):
        saturday = timezone.localdate() + datetime.timedelta(days=1)
        while saturday.isoweekday() != 6:
            saturday += datetime.timedelta(days=1)
        response = self._hold(self.doctor, self._dt(saturday, 10))
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data['error'], 'CLINIC_CLOSED')

    def test_a_doctor_day_off_is_refused(self):
        off_doctor = Doctor.objects.create(
            name='Dr. Off Friday', specialty='Dental Surgery',
            working_days=[1, 2, 3, 4],  # never works Fridays
            shift_start=datetime.time(9, 0), shift_end=datetime.time(17, 0),
        )
        friday = timezone.localdate() + datetime.timedelta(days=1)
        while friday.isoweekday() != 5:
            friday += datetime.timedelta(days=1)
        response = self._hold(off_doctor, self._dt(friday, 10))
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data['error'], 'DOCTOR_OFF_DUTY')

    def test_before_the_shift_is_refused(self):
        response = self._hold_next_weekday(self.doctor, 8)  # clinic open, doctor starts 09:00
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data['error'], 'OUTSIDE_SHIFT')

    def test_past_the_shift_end_is_refused(self):
        # 16:40 + 30 min visit + 5 min buffer ends 17:15 - past 17:00.
        response = self._hold_next_weekday(self.doctor, 16, minute=40)
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data['error'], 'OUTSIDE_SHIFT')

    def test_inside_lunch_is_refused(self):
        response = self._hold_next_weekday(self.doctor, 13, minute=30)
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data['error'], 'LUNCH_BREAK')

    def test_a_blocked_date_is_refused(self):
        day = self._weekday(1)
        AvailabilityRule.objects.create(
            doctor=None, rule_type='blocked_date',
            start_datetime=self._dt(day, 0), end_datetime=self._dt(day, 23, 59),
            reason='Public holiday',
        )
        response = self._hold_next_weekday(self.doctor, 10)
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data['error'], 'DATE_BLOCKED')

    def test_an_emergency_reserve_is_refused_for_ordinary_bookings(self):
        day = self._weekday(2)
        AvailabilityRule.objects.create(
            doctor=self.doctor, rule_type='emergency_reserve',
            start_datetime=self._dt(day, 9), end_datetime=self._dt(day, 10),
            reason='Walk-in reserve',
        )
        response = self._hold_next_weekday(self.doctor, 9, n=2)
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data['error'], 'EMERGENCY_RESERVE_ONLY')

    def test_an_emergency_booking_may_use_the_reserve(self):
        day = self._weekday(2)
        AvailabilityRule.objects.create(
            doctor=self.doctor, rule_type='emergency_reserve',
            start_datetime=self._dt(day, 9), end_datetime=self._dt(day, 10),
            reason='Walk-in reserve',
        )
        response = self._hold_next_weekday(
            self.doctor, 9, n=2, is_emergency=True, is_instant_confirm=True,
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

    def test_too_little_notice_is_refused(self):
        # 192h of required notice makes any near-term slot too soon,
        # whatever wall-clock time the suite runs at.
        self.clinic.min_advance_hours = 192
        self.clinic.save()
        response = self._hold_next_weekday(self.doctor, 10)
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data['error'], 'TOO_SOON')

    def test_a_walk_in_is_exempt_from_the_notice_rule(self):
        # The patient is standing at the desk - the notice rule exists for
        # remote bookings only.
        self.clinic.min_advance_hours = 192
        self.clinic.save()
        response = self._hold_next_weekday(
            self.doctor, 10, is_walk_in=True, is_instant_confirm=True,
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data['status'], 'arrived')

    def test_the_daily_cap_is_enforced(self):
        capped = Doctor.objects.create(
            name='Dr. Cap One', specialty='Dental Surgery',
            working_days=[1, 2, 3, 4, 5],
            shift_start=datetime.time(9, 0), shift_end=datetime.time(17, 0),
            max_daily_appointments=1,
        )
        day = self._weekday(1)
        Appointment.objects.create(
            appointment_code='AP-CAP1', patient_name='Earlier Patient',
            patient_phone='+2348030001201', doctor=capped, service=self.service,
            start_datetime=self._dt(day, 10), end_datetime=self._dt(day, 10, 30),
            status='confirmed',
        )
        response = self._hold(capped, self._dt(day, 15))
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data['error'], 'DAILY_CAP_REACHED')

    def test_holds_count_against_the_daily_cap(self):
        capped = Doctor.objects.create(
            name='Dr. Cap Two', specialty='Dental Surgery',
            working_days=[1, 2, 3, 4, 5],
            shift_start=datetime.time(9, 0), shift_end=datetime.time(17, 0),
            max_daily_appointments=1,
        )
        day = self._weekday(1)
        Appointment.objects.create(
            appointment_code='AP-CAP2', patient_name='Holding Patient',
            patient_phone='+2348030001202', doctor=capped, service=self.service,
            start_datetime=self._dt(day, 10), end_datetime=self._dt(day, 10, 30),
            status='held', hold_expires_at=self._dt(day, 10) + datetime.timedelta(minutes=15),
        )
        response = self._hold(capped, self._dt(day, 15))
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data['error'], 'DAILY_CAP_REACHED')


class RescheduleClinicRulesTests(APITestCase):
    """
    Wave 2 / Step 2.2 — a reschedule is held to the same standard as a fresh
    booking. The view already re-checked leave and overlap; it used to accept
    any time of day, so a visit could be moved into lunch, before the shift,
    or into the past.
    """

    def setUp(self):
        cache.clear()
        self.clinic = ClinicSetting.get_settings()
        self.clinic.working_days = [1, 2, 3, 4, 5]
        self.clinic.open_time = datetime.time(8, 0)
        self.clinic.close_time = datetime.time(18, 0)
        self.clinic.lunch_break_start = datetime.time(13, 0)
        self.clinic.lunch_break_end = datetime.time(14, 0)
        self.clinic.min_advance_hours = 2
        self.clinic.save()

        self.doctor = Doctor.objects.create(
            name='Dr. Reschedule Rules', specialty='Dental Surgery',
            working_days=[1, 2, 3, 4, 5],
            shift_start=datetime.time(9, 0), shift_end=datetime.time(17, 0),
        )
        self.service = Service.objects.create(
            name='Dental Consultation', duration_minutes=30, buffer_minutes=5,
        )
        self.staff = StaffUser.objects.create(
            full_name='Reschedule Staff', email='reschedule.staff@clinic.com',
            role='receptionist', is_active=True,
        )
        self.staff.set_password('ReschedulePass123!')
        self.staff.save()
        login = self.client.post('/api/v1/auth/login/', {
            'email': 'reschedule.staff@clinic.com',
            'password': 'ReschedulePass123!',
        }, format='json')
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")

        day = timezone.localdate() + datetime.timedelta(days=1)
        while day.isoweekday() > 5:
            day += datetime.timedelta(days=1)
        self.day = day
        start = timezone.make_aware(datetime.datetime.combine(day, datetime.time(10, 0)))
        self.appointment = Appointment.objects.create(
            appointment_code='AP-RES1', patient_name='Reschedule Ada',
            patient_phone='+2348030001300', doctor=self.doctor, service=self.service,
            start_datetime=start, end_datetime=start + datetime.timedelta(minutes=30),
            status='confirmed',
        )

    def _reschedule(self, new_start):
        return self.client.post(
            f'/api/v1/appointments/{self.appointment.id}/reschedule/',
            {'start_datetime': new_start.isoformat()}, format='json',
        )

    def test_a_legal_move_still_works(self):
        new_start = timezone.make_aware(
            datetime.datetime.combine(self.day, datetime.time(15, 0))
        )
        response = self._reschedule(new_start)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.appointment.refresh_from_db()
        self.assertEqual(
            timezone.localtime(self.appointment.start_datetime).strftime('%H:%M'), '15:00'
        )

    def test_a_move_into_lunch_is_refused(self):
        new_start = timezone.make_aware(
            datetime.datetime.combine(self.day, datetime.time(13, 30))
        )
        response = self._reschedule(new_start)
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data['error'], 'LUNCH_BREAK')
        self.appointment.refresh_from_db()
        self.assertEqual(
            timezone.localtime(self.appointment.start_datetime).strftime('%H:%M'), '10:00'
        )

    def test_a_move_into_the_past_is_refused(self):
        past = timezone.now() - datetime.timedelta(days=1)
        response = self._reschedule(past)
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data['error'], 'SLOT_IN_PAST')

    def test_a_move_before_the_shift_is_refused(self):
        new_start = timezone.make_aware(
            datetime.datetime.combine(self.day, datetime.time(8, 0))
        )
        response = self._reschedule(new_start)
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data['error'], 'OUTSIDE_SHIFT')

    def test_the_moving_appointment_does_not_count_against_its_own_cap(self):
        self.doctor.max_daily_appointments = 1
        self.doctor.save()
        new_start = timezone.make_aware(
            datetime.datetime.combine(self.day, datetime.time(15, 0))
        )
        response = self._reschedule(new_start)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

    def test_a_move_to_a_fuller_day_is_refused_by_the_cap(self):
        self.doctor.max_daily_appointments = 1
        self.doctor.save()
        other = Appointment.objects.create(
            appointment_code='AP-RES2', patient_name='Cap Neighbour',
            patient_phone='+2348030001301', doctor=self.doctor, service=self.service,
            start_datetime=timezone.make_aware(
                datetime.datetime.combine(self.day, datetime.time(11, 0))
            ),
            end_datetime=timezone.make_aware(
                datetime.datetime.combine(self.day, datetime.time(11, 30))
            ),
            status='confirmed',
        )
        new_start = timezone.make_aware(
            datetime.datetime.combine(self.day, datetime.time(15, 0))
        )
        response = self._reschedule(new_start)
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data['error'], 'DAILY_CAP_REACHED')
        other.delete()


class AppointmentStatusTransitionTests(APITestCase):
    """
    Wave 2 / Step 2.3 — an appointment is a state machine, not a free text
    field. The status endpoint used to accept any value from the list, so
    `completed -> arrived`, `cancelled -> confirmed` and `no_show -> confirmed`
    all succeeded and were audited as if they had happened.

    Forward-only lifecycle:
        held -> confirmed | cancelled | hold_expired
        confirmed -> arrived | in_consultation | completed | no_show | cancelled
        arrived -> in_consultation | completed | no_show | cancelled
        in_consultation -> completed | cancelled
        completed / cancelled / no_show / hold_expired -> terminal

    Internal writers (sweeper expiry, patient replies, Telegram callbacks,
    slot selection) set status directly and are unaffected; this map governs
    the staff endpoint only.
    """

    def setUp(self):
        cache.clear()
        self.clinic = ClinicSetting.get_settings()
        self.doctor = Doctor.objects.create(
            name='Dr. Transition', specialty='Dental Surgery',
            working_days=[1, 2, 3, 4, 5],
            shift_start=datetime.time(9, 0), shift_end=datetime.time(17, 0),
        )
        self.service = Service.objects.create(
            name='Dental Consultation', duration_minutes=30, buffer_minutes=5,
        )
        self.staff = StaffUser.objects.create(
            full_name='Transition Staff', email='transition.staff@clinic.com',
            role='receptionist', is_active=True,
        )
        self.staff.set_password('TransitionPass123!')
        self.staff.save()
        login = self.client.post('/api/v1/auth/login/', {
            'email': 'transition.staff@clinic.com',
            'password': 'TransitionPass123!',
        }, format='json')
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")

    def _appointment(self, current_status):
        day = timezone.localdate() + datetime.timedelta(days=1)
        while day.isoweekday() > 5:
            day += datetime.timedelta(days=1)
        start = timezone.make_aware(datetime.datetime.combine(day, datetime.time(10, 0)))
        return Appointment.objects.create(
            appointment_code='AP-TRN%s' % current_status[:4].upper(),
            patient_name='Transition Ada',
            patient_phone='+2348030001400',
            doctor=self.doctor, service=self.service,
            start_datetime=start, end_datetime=start + datetime.timedelta(minutes=30),
            status=current_status,
        )

    def _set(self, appt, new_status, **extra):
        payload = {'status': new_status}
        payload.update(extra)
        return self.client.post(
            f'/api/v1/appointments/{appt.id}/status/', payload, format='json'
        )

    def test_the_normal_lifecycle_still_works(self):
        appt = self._appointment('confirmed')

        arrived = self._set(appt, 'arrived')
        self.assertEqual(arrived.status_code, status.HTTP_200_OK, arrived.data)

        consult = self._set(appt, 'in_consultation')
        self.assertEqual(consult.status_code, status.HTTP_200_OK, consult.data)

        done = self._set(appt, 'completed')
        self.assertEqual(done.status_code, status.HTTP_200_OK, done.data)
        appt.refresh_from_db()
        self.assertEqual(appt.status, 'completed')

    def test_a_completed_visit_cannot_come_back_to_life(self):
        appt = self._appointment('completed')
        response = self._set(appt, 'arrived')
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data['error'], 'INVALID_TRANSITION')
        self.assertEqual(response.data['current_status'], 'completed')
        appt.refresh_from_db()
        self.assertEqual(appt.status, 'completed')

    def test_a_cancelled_visit_cannot_be_resurrected(self):
        appt = self._appointment('cancelled')
        response = self._set(appt, 'confirmed')
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data['error'], 'INVALID_TRANSITION')

    def test_a_no_show_cannot_be_confirmed_after_the_fact(self):
        appt = self._appointment('no_show')
        response = self._set(appt, 'confirmed')
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data['error'], 'INVALID_TRANSITION')

    def test_a_held_appointment_cannot_be_marked_arrived_by_the_staff_endpoint(self):
        appt = self._appointment('held')
        response = self._set(appt, 'arrived')
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data['error'], 'INVALID_TRANSITION')

    def test_confirmed_may_be_cancelled_with_a_reason(self):
        appt = self._appointment('confirmed')
        response = self._set(appt, 'cancelled', cancellation_reason='Patient called back.')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        appt.refresh_from_db()
        self.assertEqual(appt.status, 'cancelled')

    def test_confirmed_may_be_marked_no_show(self):
        appt = self._appointment('confirmed')
        response = self._set(appt, 'no_show')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

    def test_the_ghost_rescheduled_status_is_refused(self):
        # 'rescheduled' is not a real model status; it used to be accepted
        # and silently stored on the row.
        appt = self._appointment('confirmed')
        response = self._set(appt, 'rescheduled')
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data['error'], 'INVALID_TRANSITION')
        appt.refresh_from_db()
        self.assertEqual(appt.status, 'confirmed')


class DispatchSlotRecheckTests(APITestCase):
    """
    Wave 2 / Step 2.4 — dispatch re-checks the slots reception picked.

    The explicit-slot branch used to create offer rows straight from the
    request payload with no validation at all, so a patient could be offered
    a slot that was taken seconds earlier, inside lunch, or on the doctor's
    day off — and discover it by replying into a 409.

    Now: every picked slot is validated under the doctor's row lock (rules +
    overlap); invalid picks are skipped with a named reason; if NOTHING
    survives, dispatch fails loudly and the request is left untouched.
    """

    def setUp(self):
        cache.clear()
        self.clinic = ClinicSetting.get_settings()
        self.clinic.working_days = [1, 2, 3, 4, 5]
        self.clinic.open_time = datetime.time(8, 0)
        self.clinic.close_time = datetime.time(18, 0)
        self.clinic.lunch_break_start = datetime.time(13, 0)
        self.clinic.lunch_break_end = datetime.time(14, 0)
        self.clinic.min_advance_hours = 2
        self.clinic.save()

        self.doctor = Doctor.objects.create(
            name='Dr. Dispatch Recheck', specialty='Dental Surgery',
            working_days=[1, 2, 3, 4, 5],
            shift_start=datetime.time(9, 0), shift_end=datetime.time(17, 0),
        )
        self.service = Service.objects.create(
            name='Dental Consultation', duration_minutes=30, buffer_minutes=5,
        )
        self.staff = StaffUser.objects.create(
            full_name='Dispatch Staff', email='dispatch.staff@clinic.com',
            role='receptionist', is_active=True,
        )
        self.staff.set_password('DispatchPass123!')
        self.staff.save()
        login = self.client.post('/api/v1/auth/login/', {
            'email': 'dispatch.staff@clinic.com',
            'password': 'DispatchPass123!',
        }, format='json')
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")

        self.booking = BookingRequest.objects.create(
            request_code='REQ-2026-0500',
            patient_name='Dispatch Ada', patient_phone='+2348030001500',
            service=self.service, status='awaiting_review',
        )

    def _day(self):
        day = timezone.localdate() + datetime.timedelta(days=1)
        while day.isoweekday() > 5:
            day += datetime.timedelta(days=1)
        return day

    def _dt(self, day, hour, minute=0):
        return timezone.make_aware(datetime.datetime.combine(day, datetime.time(hour, minute)))

    def _dispatch(self, slots):
        return self.client.post(
            f'/api/v1/booking-requests/{self.booking.request_code}/dispatch-offers/',
            {'slots': slots, 'dispatch_channels': ['sms']},
            format='json',
        )

    def _slot(self, hour, minute=0):
        return {
            'doctor_id': str(self.doctor.id),
            'start_datetime': self._dt(self._day(), hour, minute).isoformat(),
        }

    def test_a_clean_pick_still_dispatches(self):
        response = self._dispatch([self._slot(10)])
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(SlotOffer.objects.filter(request=self.booking).count(), 1)
        self.assertEqual(response.data.get('skipped_slots', []), [])

    def test_a_taken_slot_is_not_offered(self):
        day = self._day()
        Appointment.objects.create(
            appointment_code='AP-DSP1', patient_name='Earlier Patient',
            patient_phone='+2348030001501', doctor=self.doctor, service=self.service,
            start_datetime=self._dt(day, 10), end_datetime=self._dt(day, 10, 30),
            status='confirmed',
        )
        response = self._dispatch([self._slot(10), self._slot(15)])
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        offers = SlotOffer.objects.filter(request=self.booking)
        self.assertEqual(offers.count(), 1)
        self.assertEqual(timezone.localtime(offers.first().start_datetime).strftime('%H:%M'), '15:00')
        skipped = response.data.get('skipped_slots', [])
        self.assertEqual(len(skipped), 1)
        self.assertEqual(skipped[0]['reason'], 'SLOT_TAKEN')

    def test_an_illegal_time_is_not_offered(self):
        response = self._dispatch([self._slot(13, 30), self._slot(11)])
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        offers = SlotOffer.objects.filter(request=self.booking)
        self.assertEqual(offers.count(), 1)
        self.assertEqual(timezone.localtime(offers.first().start_datetime).strftime('%H:%M'), '11:00')
        skipped = response.data.get('skipped_slots', [])
        self.assertEqual(len(skipped), 1)
        self.assertEqual(skipped[0]['reason'], 'LUNCH_BREAK')

    def test_dispatch_fails_loudly_when_no_pick_survives(self):
        day = self._day()
        Appointment.objects.create(
            appointment_code='AP-DSP2', patient_name='Earlier Patient',
            patient_phone='+2348030001502', doctor=self.doctor, service=self.service,
            start_datetime=self._dt(day, 10), end_datetime=self._dt(day, 10, 30),
            status='confirmed',
        )
        response = self._dispatch([self._slot(10), self._slot(13, 30)])
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data['error'], 'ALL_SLOTS_INVALID')
        self.assertEqual(len(response.data['skipped_slots']), 2)
        self.assertEqual(SlotOffer.objects.filter(request=self.booking).count(), 0)
        self.booking.refresh_from_db()
        self.assertEqual(self.booking.status, 'awaiting_review')


class HealthClockContractTests(APITestCase):
    """
    Wave 3 / Step 3.1 — the clinic's clock is the site's only clock.

    The health endpoint publishes `server_time` and the clinic `timezone` so
    the frontend can correct a wrong device clock and render every date and
    hour in the clinic's own timezone (Africa/Lagos), never the visitor's.
    """

    def test_health_publishes_the_clinic_clock(self):
        response = self.client.get('/api/v1/health/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertIn('server_time', data)
        self.assertEqual(data['timezone'], 'Africa/Lagos')
        # An ISO instant with an offset, parseable by the browser's Date.
        parsed = datetime.datetime.fromisoformat(data['server_time'])
        self.assertIsNotNone(parsed.tzinfo)


class StaffRolePatchTests(APITestCase):
    """
    Wave 3 / Step 3.6 — a staff role edit must actually persist.

    AdminStaffDetailView.patch accepted name/email/specialty/shift/is_active
    and silently ignored `role`, so every role change in the staff edit modal
    was UI-only: the toast said saved, the roster snapped back on refresh.
    """

    def setUp(self):
        cache.clear()
        self.admin = StaffUser.objects.create(
            full_name='Admin Role Patch',
            email='admin.rolepatch@clinic.com',
            role='clinic_admin',
            is_active=True,
        )
        self.admin.set_password('RolePatch123!')
        self.admin.save()
        login = self.client.post('/api/v1/auth/login/', {
            'email': 'admin.rolepatch@clinic.com',
            'password': 'RolePatch123!',
        }, format='json')
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")

        self.receptionist = StaffUser.objects.create(
            full_name='Role Patch Target',
            email='rolepatch.target@clinic.com',
            role='receptionist',
            is_active=True,
        )

    def test_role_change_persists(self):
        response = self.client.patch(
            f'/api/v1/staff/{self.receptionist.id}/',
            {'role': 'clinic_admin'}, format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.receptionist.refresh_from_db()
        self.assertEqual(self.receptionist.role, 'clinic_admin')

    def test_an_invalid_role_is_rejected(self):
        response = self.client.patch(
            f'/api/v1/staff/{self.receptionist.id}/',
            {'role': 'supreme_leader'}, format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.receptionist.refresh_from_db()
        self.assertEqual(self.receptionist.role, 'receptionist')


class StaffRefreshFlowTests(APITestCase):
    """
    Wave 4 / Step 4.1 — the 30-day session finally exists.

    Login has ALWAYS returned the refresh token in its body (and as an
    HttpOnly cookie), but there was no endpoint to redeem it and the
    frontend never stored it — so staff were ejected after 60 minutes and
    had to retype email + password every hour.

    Owner decision (2026-11-20): the STORED refresh token — the login body's
    token goes to the client, and `POST /auth/refresh/` redeems it for a
    fresh access token. The cookie remains a second, optional path.

    Kill-switch preserved (T-303): a deactivated account cannot refresh.
    """

    def setUp(self):
        cache.clear()
        self.staff = StaffUser.objects.create(
            full_name='Refresh Flow Staff',
            email='refresh.flow@clinic.com',
            role='receptionist',
            is_active=True,
        )
        self.staff.set_password('RefreshPass123!')
        self.staff.save()

    def _login(self):
        res = self.client.post('/api/v1/auth/login/', {
            'email': 'refresh.flow@clinic.com',
            'password': 'RefreshPass123!',
        }, format='json')
        return res.data

    def test_a_valid_refresh_returns_a_working_access_token(self):
        session = self._login()
        refresh = session['refresh']

        res = self.client.post('/api/v1/auth/refresh/', {'refresh': refresh}, format='json')

        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertIn('access', res.data)
        # The new access token actually authenticates.
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {res.data['access']}")
        me = self.client.get('/api/v1/auth/me/')
        self.assertEqual(me.status_code, status.HTTP_200_OK)
        self.assertEqual(me.data['email'], 'refresh.flow@clinic.com')

    def test_a_garbage_refresh_token_is_rejected(self):
        res = self.client.post('/api/v1/auth/refresh/', {'refresh': 'not-a-token'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_a_deactivated_account_cannot_refresh(self):
        session = self._login()
        refresh = session['refresh']

        # The kill-switch (T-303) must hold on the refresh path too.
        self.staff.is_active = False
        self.staff.save(update_fields=['is_active'])

        res = self.client.post('/api/v1/auth/refresh/', {'refresh': refresh}, format='json')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_the_http_only_cookie_still_refreshes(self):
        """The dual-mode promise: the cookie path keeps working."""
        login = self.client.post('/api/v1/auth/login/', {
            'email': 'refresh.flow@clinic.com',
            'password': 'RefreshPass123!',
        }, format='json')
        cookie_refresh = login.cookies.get('clinic_refresh_token')

        res = self.client.post('/api/v1/auth/refresh/', {}, format='json',
                               HTTP_COOKIE=f'clinic_refresh_token={cookie_refresh.value}')

        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertIn('access', res.data)


class UpcomingRemindersChatIdTests(APITestCase):
    """
    Wave 4 / Step 4.2 — `telegram_chat_id` must be a chat id, not a phone.

    The reminders feed handed the workflow a PATIENT PHONE in the
    `telegram_chat_id` field; a Telegram send to a "chat id" of +234... can
    never succeed. The real chat id lives in the booking request's
    `telegram_chat_id:<id>` marker (the established inbound protocol); an
    appointment with no Telegram history answers None — honestly
    unreachable, not silently broken.
    """

    def setUp(self):
        cache.clear()
        self.clinic = ClinicSetting.get_settings()
        self.clinic.webhook_secret = 'clinic_dev_secret_2026'
        self.clinic.save()
        self.doctor = Doctor.objects.create(
            name='Dr. Reminder Chat', specialty='Dental Surgery',
            working_days=[1, 2, 3, 4, 5],
            shift_start=datetime.time(9, 0), shift_end=datetime.time(17, 0),
        )
        self.service = Service.objects.create(
            name='Dental Consultation', duration_minutes=30, buffer_minutes=5,
        )
        day = timezone.localdate() + datetime.timedelta(days=1)
        while day.isoweekday() > 5:
            day += datetime.timedelta(days=1)
        start = timezone.make_aware(datetime.datetime.combine(day, datetime.time(10, 0)))

        self.booking_with_chat = BookingRequest.objects.create(
            request_code='REQ-2026-0600',
            patient_name='Chat Ada', patient_phone='+2348030001600',
            service=self.service,
            patient_notes='telegram_chat_id:555001 requested via bot',
        )
        self.appt_with_chat = Appointment.objects.create(
            appointment_code='AP-CHAT1', patient_name='Chat Ada',
            patient_phone='+2348030001600', doctor=self.doctor, service=self.service,
            booking_request=self.booking_with_chat,
            start_datetime=start, end_datetime=start + datetime.timedelta(minutes=30),
            status='confirmed',
        )

        self.appt_without_chat = Appointment.objects.create(
            appointment_code='AP-CHAT2', patient_name='Web Bola',
            patient_phone='+2348030001601', doctor=self.doctor, service=self.service,
            start_datetime=start + datetime.timedelta(hours=2),
            end_datetime=start + datetime.timedelta(hours=2, minutes=30),
            status='confirmed',
        )

    def _reminders(self):
        res = self.client.get(
            '/api/v1/appointments/upcoming-reminders/',
            HTTP_X_WEBHOOK_SECRET='clinic_dev_secret_2026',
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        return {r['appointment_id']: r for r in res.data['reminders']}

    def test_a_telegram_booking_answers_its_real_chat_id(self):
        reminders = self._reminders()
        row = reminders[self.appt_with_chat.appointment_code]
        self.assertEqual(row['telegram_chat_id'], '555001')
        self.assertEqual(row['patient_phone'], '+2348030001600')

    def test_a_non_telegram_booking_answers_none(self):
        reminders = self._reminders()
        row = reminders[self.appt_without_chat.appointment_code]
        self.assertIsNone(row['telegram_chat_id'])
        self.assertEqual(row['patient_phone'], '+2348030001601')

    def test_no_phone_number_ever_poses_as_a_chat_id(self):
        reminders = self._reminders()
        for row in reminders.values():
            chat = row['telegram_chat_id']
            self.assertTrue(chat is None or not str(chat).startswith('+'))


class AskInfoTruthTests(APITestCase):
    """
    Wave 4 / Step 4.3 — "Ask for info" either delivers or tells the truth.

    The old view said `"status": "dispatched"` and audited
    `PATIENT_INQUIRY_DISPATCHED` while sending NOTHING — a receptionist
    believed the patient had been asked. Now:
      - a Telegram booking (chat id marker) gets a REAL send through
        TelegramService, logged as an InteractionLog row;
      - a booking with no reachable channel answers `recorded_only` and the
        audit says recorded, so nobody believes a message went out.
    """

    def setUp(self):
        from .services.telegram_service import TelegramService as _TelegramService
        globals()['TelegramService'] = _TelegramService

        cache.clear()
        self.clinic = ClinicSetting.get_settings()
        self.clinic.webhook_secret = 'clinic_dev_secret_2026'
        self.clinic.save()
        self.service = Service.objects.create(
            name='Dental Consultation', duration_minutes=30, buffer_minutes=5,
        )
        self.staff = StaffUser.objects.create(
            full_name='Ask Info Staff', email='askinfo.staff@clinic.com',
            role='receptionist', is_active=True,
        )
        self.staff.set_password('AskInfoPass123!')
        self.staff.save()
        login = self.client.post('/api/v1/auth/login/', {
            'email': 'askinfo.staff@clinic.com', 'password': 'AskInfoPass123!',
        }, format='json')
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")

        self.telegram_booking = BookingRequest.objects.create(
            request_code='REQ-2026-0610',
            patient_name='Ask Ada', patient_phone='+2348030001610',
            service=self.service, channel='telegram',
            patient_notes='telegram_chat_id:556001 came from the bot',
        )
        self.web_booking = BookingRequest.objects.create(
            request_code='REQ-2026-0611',
            patient_name='Web Bola', patient_phone='+2348030001611',
            service=self.service, channel='web',
        )

    def _ask(self, booking, message='Please confirm the preferred date.'):
        return self.client.post(
            f'/api/v1/booking-requests/{booking.request_code}/ask-info/',
            {'message': message, 'prompt_code': 'date_confirm'}, format='json',
        )

    def test_a_telegram_booking_is_actually_messaged(self):
        with patch.object(TelegramService, 'send_message', return_value=True) as sent:
            res = self._ask(self.telegram_booking)
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertEqual(res.data['status'], 'sent_via_telegram')
        sent.assert_called_once()
        self.assertIn('556001', str(sent.call_args))
        # The outcome is recorded against the request, like every send.
        self.assertTrue(
            InteractionLog.objects.filter(
                booking_request=self.telegram_booking, channel='telegram',
                status='sent',
            ).exists()
        )
        # The dossier still carries the note.
        self.telegram_booking.refresh_from_db()
        self.assertIn('Staff Inquiry', self.telegram_booking.patient_notes)

    def test_a_web_booking_answers_the_truth(self):
        res = self._ask(self.web_booking)

        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertEqual(res.data['status'], 'recorded_only')
        self.assertIn('No patient messaging channel', res.data['detail'])
        # Nothing was sent, so nothing pretends it was.
        self.assertFalse(
            InteractionLog.objects.filter(booking_request=self.web_booking).exists()
        )
        # The note is still useful — it stays on the dossier.
        self.web_booking.refresh_from_db()
        self.assertIn('Staff Inquiry', self.web_booking.patient_notes)

    def test_the_audit_action_matches_what_really_happened(self):
        with patch.object(TelegramService, 'send_message', return_value=True):
            self._ask(self.telegram_booking)
        self._ask(self.web_booking)

        dispatched = AuditLog.objects.filter(
            entity_name='BookingRequest', action='PATIENT_INQUIRY_DISPATCHED',
        ).exists()
        recorded = AuditLog.objects.filter(
            entity_name='BookingRequest', action='PATIENT_INQUIRY_RECORDED',
        ).exists()
        self.assertTrue(dispatched, 'the telegram send must audit as dispatched')
        self.assertTrue(recorded, 'the no-channel note must audit as recorded only')


class TelegramTextReplyUnificationTests(APITestCase):
    """
    Wave 4 / Step 4.4 — ONE reply engine on every channel.

    A plain TEXT reply on Telegram ("Reply 1") used to get the welcome menu
    while the same words on SMS selected the slot — two parallel inbound
    paths with different idempotency keys. Now a Telegram text routes
    through the SAME `handle_patient_reply` engine SMS/WhatsApp use: the
    chat id resolves the patient's request, the inbound row is the
    idempotency claim (same primitive, same key scheme), and the engine's
    answer is delivered back on Telegram. A chat with no booking history
    still gets the welcome menu — that is an inquiry, not a reply.
    """

    def setUp(self):
        from .services.telegram_service import TelegramService as _TelegramService
        globals()['TelegramService'] = _TelegramService

        cache.clear()
        self.clinic = ClinicSetting.get_settings()
        self.clinic.webhook_secret = 'clinic_dev_secret_2026'
        self.clinic.custom_config['telegram_secret_token'] = 'tg-unify-secret-1'
        self.clinic.save()
        self.client.credentials(HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN='tg-unify-secret-1')

        self.doctor = Doctor.objects.create(
            name='Dr. Unify Reply', specialty='Dental Surgery',
            working_days=[1, 2, 3, 4, 5],
            shift_start=datetime.time(9, 0), shift_end=datetime.time(17, 0),
        )
        self.service = Service.objects.create(
            name='Dental Consultation', duration_minutes=30, buffer_minutes=5,
        )
        self.booking = BookingRequest.objects.create(
            request_code='REQ-2026-0620',
            patient_name='Unify Ada', patient_phone='+2348030001620',
            service=self.service, channel='telegram',
            status='slots_offered',
            patient_notes='telegram_chat_id:777001 booked through the bot',
        )
        day = timezone.localdate() + datetime.timedelta(days=1)
        while day.isoweekday() > 5:
            day += datetime.timedelta(days=1)
        start = timezone.make_aware(datetime.datetime.combine(day, datetime.time(10, 0)))
        self.offer = SlotOffer.objects.create(
            request=self.booking, doctor=self.doctor,
            start_datetime=start, end_datetime=start + datetime.timedelta(minutes=30),
            expires_at=timezone.now() + datetime.timedelta(minutes=60),
        )

    def _tg_text(self, update_id, chat_id, text, message_id):
        return {
            'update_id': update_id,
            'channel': 'telegram',
            'message': {
                'message_id': message_id,
                'text': text,
                'chat': {'id': chat_id},
                'from': {'id': chat_id, 'first_name': 'Unify'},
            },
        }

    def test_a_text_reply_selects_the_slot_through_the_shared_engine(self):
        with patch.object(TelegramService, 'send_message', return_value=True) as sent:
            res = self.client.post(
                '/api/v1/webhooks/telegram/inbound/',
                self._tg_text(9101, 777001, 'Reply 1', 501), format='json',
            )

        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        tg = res.data['telegram_result']
        self.assertEqual(tg['status'], 'held')
        self.assertEqual(tg['request_id'], 'REQ-2026-0620')
        # The hold really exists — the same core the SMS path uses.
        self.assertTrue(
            Appointment.objects.filter(
                booking_request=self.booking, status='held',
            ).exists()
        )
        # The engine's answer was delivered back on Telegram.
        self.assertTrue(sent.call_count >= 1)
        # The inbound row is the idempotency claim, keyed like SMS/WhatsApp.
        self.assertTrue(
            InteractionLog.objects.filter(
                direction='inbound', channel='telegram',
                external_ref='tgmsg-501',
            ).exists()
        )

    def test_an_unknown_chat_still_gets_the_welcome_menu(self):
        with patch.object(TelegramService, 'send_message', return_value=True):
            res = self.client.post(
                '/api/v1/webhooks/telegram/inbound/',
                self._tg_text(9102, 999001, 'Hello', 502), format='json',
            )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['telegram_result']['status'], 'welcomed')

    def test_a_provider_retry_is_duplicate_ignored_like_every_channel(self):
        first = self.client.post(
            '/api/v1/webhooks/telegram/inbound/',
            self._tg_text(9103, 777001, 'Reply 1', 503), format='json',
        )
        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(first.data['telegram_result']['status'], 'held')

        # Same provider message id, a NEW gateway delivery: the shared claim
        # answers duplicate_ignored — the SMS/WhatsApp contract.
        second = self.client.post(
            '/api/v1/webhooks/telegram/inbound/',
            self._tg_text(9104, 777001, 'Reply 1', 503), format='json',
        )
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(second.data['telegram_result']['status'], 'duplicate_ignored')


class DutyLeaveSemanticsTests(APITestCase):
    """
    Wave 5 / Step 5.1 — "back on duty" cleans up ITS OWN row, not every
    open-ended leave.

    The switch opens an open-ended leave row when a doctor goes off duty and
    used to delete EVERY row with `end_date IS NULL` when they came back —
    including a legitimate "leave until further notice" entered in the
    planner, silently cutting a real absence short.
    """

    def setUp(self):
        cache.clear()
        self.clinic = ClinicSetting.get_settings()
        self.staff = StaffUser.objects.create(
            full_name='Duty Staff', email='duty.staff@clinic.com',
            role='clinic_admin', is_active=True,
        )
        self.staff.set_password('DutyPass123!')
        self.staff.save()
        login = self.client.post('/api/v1/auth/login/', {
            'email': 'duty.staff@clinic.com', 'password': 'DutyPass123!',
        }, format='json')
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")

        self.doctor = Doctor.objects.create(
            name='Dr. Duty Switch', specialty='General Practice',
            working_days=[1, 2, 3, 4, 5],
            shift_start=datetime.time(9, 0), shift_end=datetime.time(17, 0),
        )

    def _set_duty(self, on_leave):
        return self.client.patch(
            f'/api/v1/clinic/doctors/{self.doctor.id}/duty-status/',
            {'is_on_leave': on_leave}, format='json',
        )

    def test_turning_duty_on_keeps_a_real_open_ended_leave(self):
        legitimate = DoctorLeave.objects.create(
            doctor=self.doctor,
            start_date=timezone.localdate(),
            end_date=None,
            leave_type='maternity',
            reason='Leave until further notice',
            created_by='admin@clinic.com',
        )

        self.assertEqual(self._set_duty(True).status_code, status.HTTP_200_OK)
        self.assertEqual(self._set_duty(False).status_code, status.HTTP_200_OK)

        self.assertTrue(
            DoctorLeave.objects.filter(id=legitimate.id).exists(),
            'a real open-ended leave must survive the duty switch',
        )
        # The switch's own row is gone.
        self.assertFalse(
            DoctorLeave.objects.filter(
                doctor=self.doctor, reason='Marked off duty from the roster',
            ).exists()
        )

    def test_turning_duty_on_removes_the_switch_row(self):
        self.assertEqual(self._set_duty(True).status_code, status.HTTP_200_OK)
        self.assertTrue(
            DoctorLeave.objects.filter(
                doctor=self.doctor, reason='Marked off duty from the roster',
            ).exists()
        )

        self.assertEqual(self._set_duty(False).status_code, status.HTTP_200_OK)
        self.assertFalse(
            DoctorLeave.objects.filter(
                doctor=self.doctor, reason='Marked off duty from the roster',
            ).exists()
        )
        self.doctor.refresh_from_db()
        self.assertFalse(self.doctor.is_on_leave)

    def test_the_switch_does_not_touch_dated_leave(self):
        dated = DoctorLeave.objects.create(
            doctor=self.doctor,
            start_date=timezone.localdate() + datetime.timedelta(days=10),
            end_date=timezone.localdate() + datetime.timedelta(days=12),
            leave_type='annual',
            reason='Annual leave',
            created_by='admin@clinic.com',
        )

        self._set_duty(True)
        self._set_duty(False)

        self.assertTrue(DoctorLeave.objects.filter(id=dated.id).exists())


class ServiceDeleteGuardTests(APITestCase):
    """
    Wave 5 / Step 5.2 — a service with appointments cannot be deleted, and
    says so.

    `?permanent=true` called `service.delete()` unguarded; the PROTECT foreign
    key from Appointment raised `ProtectedError` and the client saw a raw 500.
    Now it answers 409 SERVICE_IN_USE with the count — and offers the honest
    alternative (deactivate). A service nobody references still deletes.
    """

    def setUp(self):
        cache.clear()
        self.clinic = ClinicSetting.get_settings()
        self.staff = StaffUser.objects.create(
            full_name='Service Admin', email='service.admin@clinic.com',
            role='clinic_admin', is_active=True,
        )
        self.staff.set_password('ServicePass123!')
        self.staff.save()
        login = self.client.post('/api/v1/auth/login/', {
            'email': 'service.admin@clinic.com', 'password': 'ServicePass123!',
        }, format='json')
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")

        self.doctor = Doctor.objects.create(
            name='Dr. Service Delete', specialty='General Practice',
            working_days=[1, 2, 3, 4, 5],
            shift_start=datetime.time(9, 0), shift_end=datetime.time(17, 0),
        )
        self.used = Service.objects.create(name='Used Service', duration_minutes=30)
        self.free = Service.objects.create(name='Free Service', duration_minutes=30)
        day = timezone.localdate() + datetime.timedelta(days=1)
        while day.isoweekday() > 5:
            day += datetime.timedelta(days=1)
        start = timezone.make_aware(datetime.datetime.combine(day, datetime.time(10, 0)))
        Appointment.objects.create(
            appointment_code='AP-DEL1', patient_name='Delete Ada',
            patient_phone='+2348030001800', doctor=self.doctor, service=self.used,
            start_datetime=start, end_datetime=start + datetime.timedelta(minutes=30),
            status='confirmed',
        )

    def test_a_used_service_answers_409_instead_of_500(self):
        response = self.client.delete(f'/api/v1/clinic/services/{self.used.id}/?permanent=true')

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data['error'], 'SERVICE_IN_USE')
        self.assertIn('1', str(response.data.get('appointment_count')))
        self.assertTrue(Service.objects.filter(id=self.used.id).exists())

    def test_an_unused_service_still_deletes(self):
        response = self.client.delete(f'/api/v1/clinic/services/{self.free.id}/?permanent=true')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(Service.objects.filter(id=self.free.id).exists())


class StaffRoleLabelHonestyTests(APITestCase):
    """
    Wave 5 / Step 5.3 — labels come from the data, not from the name.

    `get_role_label` turned any "sarah" into "Lead Receptionist" and
    `get_shift` guessed shifts from emails — so a NEW receptionist called
    Sarah inherited someone else's title and hours. The API now answers the
    real role display and the stored shift, and says so plainly when no
    shift is set.
    """

    def setUp(self):
        cache.clear()
        self.clinic = ClinicSetting.get_settings()
        self.admin = StaffUser.objects.create(
            full_name='Label Admin', email='label.admin@clinic.com',
            role='clinic_admin', is_active=True,
        )
        self.admin.set_password('LabelPass123!')
        self.admin.save()
        login = self.client.post('/api/v1/auth/login/', {
            'email': 'label.admin@clinic.com', 'password': 'LabelPass123!',
        }, format='json')
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")

    def test_a_new_sarah_is_just_a_receptionist(self):
        sarah = StaffUser.objects.create(
            full_name='Sarah Brand New', email='sarah.new@clinic.com',
            role='receptionist', is_active=True,
        )
        from .serializers import StaffUserSerializer
        data = StaffUserSerializer(sarah).data

        self.assertEqual(data['role_label'], 'Receptionist')
        self.assertNotIn('Lead', data['role_label'])
        # No stored shift: an honest empty value, not someone else's hours.
        self.assertEqual(data['shift'], '')

    def test_a_stored_shift_is_returned_verbatim(self):
        staff = StaffUser.objects.create(
            full_name='Shift Holder', email='shift.holder@clinic.com',
            role='receptionist', is_active=True, shift='09:00 – 17:00 WAT',
        )
        from .serializers import StaffUserSerializer
        data = StaffUserSerializer(staff).data

        self.assertEqual(data['shift'], '09:00 – 17:00 WAT')
        self.assertEqual(data['role_label'], 'Receptionist')


class SettingsRoundTripTests(APITestCase):
    """
    Wave 5 / Step 5.4 — export → import must not destroy a secret.

    The export masks every sensitive custom_config value with the sentinel
    `•••••••• (admin only)`; the importer wrote the payload back verbatim, so
    a round-trip replaced the real bot token with the mask. Now the importer
    SKIPS masked values (keeping the current secret) and still writes a
    genuinely new value.
    """

    MASK = '•••••••• (admin only)'

    def setUp(self):
        cache.clear()
        self.clinic = ClinicSetting.get_settings()
        self.admin = StaffUser.objects.create(
            full_name='Config Admin', email='config.admin@clinic.com',
            role='clinic_admin', is_active=True,
        )
        self.admin.set_password('ConfigPass123!')
        self.admin.save()
        self.receptionist = StaffUser.objects.create(
            full_name='Config Receptionist', email='config.receptionist@clinic.com',
            role='receptionist', is_active=True,
        )
        self.receptionist.set_password('ConfigPass123!')
        self.receptionist.save()

        self.clinic.custom_config = {
            **(self.clinic.custom_config or {}),
            'telegram_bot_token': 'real-secret-123',
            'currency': 'NGN',
        }
        self.clinic.save()

    def _login(self, email):
        res = self.client.post('/api/v1/auth/login/', {
            'email': email, 'password': 'ConfigPass123!',
        }, format='json')
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {res.data['access']}")

    def test_export_masks_and_import_keeps_the_real_secret(self):
        # A receptionist is a staff member: their export is masked.
        self._login('config.receptionist@clinic.com')
        export = self.client.get('/api/v1/clinic/settings/export/')
        self.assertEqual(export.status_code, status.HTTP_200_OK)
        payload = export.json()
        self.assertEqual(payload['custom_config']['telegram_bot_token'], self.MASK)
        self.assertEqual(payload['custom_config']['currency'], 'NGN')

        # An admin later imports that very file.
        self._login('config.admin@clinic.com')
        res = self.client.post('/api/v1/clinic/settings/import/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)

        self.clinic.refresh_from_db()
        self.assertEqual(self.clinic.custom_config['telegram_bot_token'], 'real-secret-123')
        self.assertEqual(self.clinic.custom_config['currency'], 'NGN')

    def test_a_genuinely_new_secret_is_written(self):
        self._login('config.admin@clinic.com')
        payload = {
            'clinic_name': self.clinic.clinic_name,
            'custom_config': {
                'currency': 'NGN',
                'telegram_bot_token': 'brand-new-token-456',
            },
        }
        res = self.client.post('/api/v1/clinic/settings/import/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)

        self.clinic.refresh_from_db()
        self.assertEqual(self.clinic.custom_config['telegram_bot_token'], 'brand-new-token-456')


class AttendanceCsvQueryTests(APITestCase):
    """
    Wave 5 / Step 5.5 — the attendance CSV is one query, not four per doctor.

    The export ran four counts per doctor in a loop; a 50-doctor clinic paid
    200+ queries for one file. The assertion compares the QUERY COUNT for one
    doctor against four doctors: equal counts prove no N+1, whatever the
    absolute number happens to be (auth adds its own query).
    """

    URL = '/api/v1/admin/export/attendance/'

    def setUp(self):
        cache.clear()
        self.clinic = ClinicSetting.get_settings()
        self.staff = StaffUser.objects.create(
            full_name='CSV Admin', email='csv.admin@clinic.com',
            role='clinic_admin', is_active=True,
        )
        self.staff.set_password('CsvPass123!')
        self.staff.save()
        login = self.client.post('/api/v1/auth/login/', {
            'email': 'csv.admin@clinic.com', 'password': 'CsvPass123!',
        }, format='json')
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")

        self.service = Service.objects.create(name='CSV Service', duration_minutes=30)

    def _doctor_with_appointments(self, name, completed, no_shows):
        doctor = Doctor.objects.create(
            name=name, specialty='General Practice',
            working_days=[1, 2, 3, 4, 5],
            shift_start=datetime.time(9, 0), shift_end=datetime.time(17, 0),
        )
        day = timezone.localdate() - datetime.timedelta(days=30)
        for index in range(completed + no_shows):
            Appointment.objects.create(
                appointment_code=f'AP-CSV{doctor.id.hex[:4]}{index}',
                patient_name=f'CSV Patient {index}',
                patient_phone=f'+23480300019{index:02d}',
                doctor=doctor, service=self.service,
                start_datetime=timezone.make_aware(
                    datetime.datetime.combine(day, datetime.time(9, 0))
                ) + datetime.timedelta(minutes=30 * index),
                end_datetime=timezone.make_aware(
                    datetime.datetime.combine(day, datetime.time(9, 30))
                ) + datetime.timedelta(minutes=30 * index),
                status='completed' if index < completed else 'no_show',
            )
        return doctor

    def _query_count(self):
        from django.db import connection
        from django.test.utils import CaptureQueriesContext
        with CaptureQueriesContext(connection) as ctx:
            response = self.client.get(self.URL)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return len(ctx.captured_queries), response

    def test_query_count_does_not_grow_with_doctors(self):
        first = self._doctor_with_appointments('Dr. CSV One', completed=2, no_shows=1)
        one_doctor_queries, response_one = self._query_count()
        self.assertIn('Dr. CSV One', response_one.content.decode())

        for i in range(2, 5):
            self._doctor_with_appointments(f'Dr. CSV {i}', completed=1, no_shows=1)
        four_doctors_queries, response_four = self._query_count()

        self.assertEqual(
            one_doctor_queries, four_doctors_queries,
            'the attendance CSV must not add queries per doctor',
        )
        self.assertIn('Dr. CSV 4', response_four.content.decode())

    def test_the_numbers_are_right(self):
        self._doctor_with_appointments('Dr. CSV Math', completed=3, no_shows=1)
        _, response = self._query_count()

        line = next(
            row for row in response.content.decode().splitlines()
            if row.startswith('Dr. CSV Math')
        )
        cells = line.split(',')
        # name, specialty, total, completed, no_shows, cancelled, rate
        self.assertEqual(cells[2], '4')
        self.assertEqual(cells[3], '3')
        self.assertEqual(cells[4], '1')
        self.assertEqual(cells[5], '0')
        self.assertEqual(cells[6], '75.0%')


class SingleApiMountTests(APITestCase):
    """
    Wave 5 / Step 5.6 — one mount, not two.

    The router served every endpoint at `/api/v1/` AND `/api/`. The duplicate
    hides URL mistakes (a client pointed at the wrong prefix still works)
    and doubles maintenance. Nothing in the frontend, the n8n workflows or
    the tests uses the bare prefix — verified before the change.
    """

    def test_the_versioned_mount_answers(self):
        response = self.client.get('/api/v1/health/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_the_bare_prefix_is_gone(self):
        response = self.client.get('/api/health/')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class LowSweepTests(APITestCase):
    """
    Wave 5 / Step 5.7 — the low findings, each with the honest behaviour.

    (a) Telegram confirmation said "See you tomorrow" for appointments next
        week; the sentence must name the real day.
    (b) find_slot_conflict looked back a hardcoded 60 minutes, so a prior
        service with a 120-minute buffer was never fetched and the overlap
        was missed.
    (c) Doctor.working_days defaulted to [] — a doctor created without days
        was silently never bookable; the default is now Mon-Fri.
    (d) The dispatch message hardcoded "Cedarcare Specialist Clinic" instead
        of the configured clinic name.
    """

    def setUp(self):
        cache.clear()
        self.clinic = ClinicSetting.get_settings()
        self.clinic.webhook_secret = 'clinic_dev_secret_2026'
        self.clinic.custom_config['telegram_secret_token'] = 'low-sweep-secret'
        self.clinic.save()

    # (a) ------------------------------------------------------------------
    def test_the_telegram_confirmation_names_the_real_day(self):
        from .services.telegram_service import TelegramService as TS

        doctor = Doctor.objects.create(
            name='Dr. Low Confirm', specialty='General Practice',
            working_days=[1, 2, 3, 4, 5],
            shift_start=datetime.time(9, 0), shift_end=datetime.time(17, 0),
        )
        service = Service.objects.create(name='Low Service', duration_minutes=30)
        day = timezone.localdate() + datetime.timedelta(days=5)
        while day.isoweekday() > 5:
            day += datetime.timedelta(days=1)
        start = timezone.make_aware(datetime.datetime.combine(day, datetime.time(10, 0)))
        appt = Appointment.objects.create(
            appointment_code='AP-LOW1', patient_name='Low Ada',
            patient_phone='+2348030001900', doctor=doctor, service=service,
            start_datetime=start, end_datetime=start + datetime.timedelta(minutes=30),
            status='confirmed',
        )

        with patch.object(TS, 'answer_callback_query') as answer, \
                patch.object(TS, 'send_message', return_value=True):
            TS._handle_confirm_attendance(appt.id, 'cb-low', 555001)

        text = answer.call_args.kwargs.get('text') if answer.call_args else ''
        self.assertTrue(text, 'the callback must be answered')
        self.assertNotIn('tomorrow', str(text).lower())
        self.assertIn(start.strftime('%a'), str(text))

    # (b) ------------------------------------------------------------------
    def test_a_long_prior_buffer_cannot_be_missed(self):
        doctor = Doctor.objects.create(
            name='Dr. Low Buffer', specialty='General Practice',
            working_days=[1, 2, 3, 4, 5],
            shift_start=datetime.time(8, 0), shift_end=datetime.time(18, 0),
        )
        long_service = Service.objects.create(
            name='Deep Clean', duration_minutes=30, buffer_minutes=120,
        )
        quick_service = Service.objects.create(
            name='Quick Check', duration_minutes=30, buffer_minutes=5,
        )
        day = timezone.localdate() + datetime.timedelta(days=1)
        while day.isoweekday() > 5:
            day += datetime.timedelta(days=1)

        def at(hour, minute=0):
            return timezone.make_aware(
                datetime.datetime.combine(day, datetime.time(hour, minute))
            )

        Appointment.objects.create(
            appointment_code='AP-LOW2', patient_name='Prior Buffer',
            patient_phone='+2348030001901', doctor=doctor, service=long_service,
            start_datetime=at(14), end_datetime=at(15), status='confirmed',
        )

        # 16:20 starts 80 minutes after the prior visit ended — inside its
        # 120-minute sterilization buffer, but OUTSIDE the old 60-min lookback.
        response = self.client.post('/api/v1/slots/hold/', {
            'doctor_id': str(doctor.id),
            'service_id': str(quick_service.id),
            'start_datetime': at(16, 20).isoformat(),
            'end_datetime': at(16, 50).isoformat(),
            'patient_name': 'Late Booking',
            'patient_phone': '+2348030001902',
        }, format='json', HTTP_X_WEBHOOK_SECRET='clinic_dev_secret_2026')

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT, response.data)
        self.assertEqual(response.data['error'], 'SLOT_CONFLICT')

    # (c) ------------------------------------------------------------------
    def test_a_doctor_created_without_days_is_bookable_on_a_weekday(self):
        doctor = Doctor.objects.create(
            name='Dr. Low Default', specialty='General Practice',
            shift_start=datetime.time(9, 0), shift_end=datetime.time(17, 0),
        )
        service = Service.objects.create(name='Default Service', duration_minutes=30)
        day = timezone.localdate() + datetime.timedelta(days=1)
        while day.isoweekday() > 5:
            day += datetime.timedelta(days=1)
        start = timezone.make_aware(datetime.datetime.combine(day, datetime.time(10, 0)))

        response = self.client.post('/api/v1/slots/hold/', {
            'doctor_id': str(doctor.id),
            'service_id': str(service.id),
            'start_datetime': start.isoformat(),
            'end_datetime': (start + datetime.timedelta(minutes=30)).isoformat(),
            'patient_name': 'Default Days',
            'patient_phone': '+2348030001903',
            'is_instant_confirm': True,
        }, format='json', HTTP_X_WEBHOOK_SECRET='clinic_dev_secret_2026')

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

    # (d) ------------------------------------------------------------------
    def test_the_dispatch_message_uses_the_configured_clinic_name(self):
        self.clinic.clinic_name = 'Low Sweep Clinic'
        self.clinic.save()
        doctor = Doctor.objects.create(
            name='Dr. Low Name', specialty='General Practice',
            working_days=[1, 2, 3, 4, 5],
            shift_start=datetime.time(9, 0), shift_end=datetime.time(17, 0),
        )
        service = Service.objects.create(name='Named Service', duration_minutes=30)
        staff = StaffUser.objects.create(
            full_name='Name Staff', email='name.staff@clinic.com',
            role='receptionist', is_active=True,
        )
        staff.set_password('NamePass123!')
        staff.save()
        login = self.client.post('/api/v1/auth/login/', {
            'email': 'name.staff@clinic.com', 'password': 'NamePass123!',
        }, format='json')
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access']}")

        booking = BookingRequest.objects.create(
            request_code='REQ-2026-0630', patient_name='Named Ada',
            patient_phone='+2348030001930', service=service,
            status='awaiting_review',
        )
        day = timezone.localdate() + datetime.timedelta(days=1)
        while day.isoweekday() > 5:
            day += datetime.timedelta(days=1)
        start = timezone.make_aware(datetime.datetime.combine(day, datetime.time(10, 0)))

        response = self.client.post(
            f'/api/v1/booking-requests/{booking.request_code}/dispatch-offers/',
            {'slots': [{'doctor_id': str(doctor.id),
                        'start_datetime': start.isoformat()}],
             'dispatch_channels': ['sms']},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        message = response.data['telegram_payload']['message']
        self.assertIn('Low Sweep Clinic', message)
        self.assertNotIn('Cedarcare', message)


class SeedClinicHygieneTests(TestCase):
    """
    Wave 1 / Step 1.5 — the seed ships clean.

    A live Telegram bot token used to sit in this file, the same people were
    seeded twice under two different emails, and every staff account shared
    the same published passwords. An agency template must never do any of
    that: the token comes from the environment only, one identity per person,
    and passwords are random unless the operator explicitly asks for the demo
    set (SEED_DEMO_PASSWORDS=1).
    """

    def test_the_seed_carries_no_secret_and_one_identity_per_person(self):
        with patch.dict(os.environ, {'TELEGRAM_BOT_TOKEN': '', 'SEED_DEMO_PASSWORDS': ''}):
            call_command('seed_clinic', verbosity=0)

        clinic = ClinicSetting.get_settings()
        self.assertNotIn('telegram_bot_token', clinic.custom_config)

        emails = list(StaffUser.objects.values_list('email', flat=True))
        self.assertEqual(len(emails), len(set(emails)))
        self.assertNotIn('sarah@cedarcare.ng', emails)
        self.assertNotIn('admin@cedarcare.ng', emails)

        # The published demo password must no longer open the admin account.
        admin = StaffUser.objects.get(email='admin@clinic.com')
        self.assertFalse(admin.check_password('adminpassword123'))
        # And two staff accounts must not share one generated password.
        sarah = StaffUser.objects.get(email='sarah@clinic.com')
        chioma = StaffUser.objects.get(email='chioma@clinic.com')
        self.assertNotEqual(sarah.password_hash, chioma.password_hash)

    def test_the_demo_credentials_are_opt_in(self):
        with patch.dict(os.environ, {'TELEGRAM_BOT_TOKEN': 'test-token-123',
                                     'SEED_DEMO_PASSWORDS': '1'}):
            call_command('seed_clinic', verbosity=0)

        clinic = ClinicSetting.get_settings()
        self.assertEqual(clinic.custom_config.get('telegram_bot_token'), 'test-token-123')
        admin = StaffUser.objects.get(email='admin@clinic.com')
        self.assertTrue(admin.check_password('adminpassword123'))


class SlotOptionNumberHoldTests(APITestCase):
    """
    n8n patient replies resolved BY THE BACKEND (Phase 4 prep / build-sheet contract):
    POST /api/v1/slots/hold/ accepts `option_number` + `request_id` instead of a
    slot_offer_id, so Workflow C never depends on Workflow D's memory. The number
    maps to the request's slot offers in ORIGINAL dispatch order and is never
    renumbered by prior selections. Also introduces the friendly ALREADY_CONFIRMED
    200 response for cross-channel double replies.
    """

    def setUp(self):
        cache.clear()
        self.clinic = ClinicSetting.get_settings()
        self.clinic.webhook_secret = 'clinic_dev_secret_2026'
        self.clinic.save()

        self.doctor = Doctor.objects.create(
            name='Dr. Test Doctor',
            specialty='Dental Surgery',
            working_days=[1, 2, 3, 4, 5],
            shift_start=datetime.time(9, 0),
            shift_end=datetime.time(17, 0),
        )
        self.service = Service.objects.create(
            name='Dental Consultation',
            duration_minutes=30,
            buffer_minutes=5,
            price=10000,
        )
        self.booking = BookingRequest.objects.create(
            request_code='REQ-2026-0099',
            patient_name='Amina Reply',
            patient_phone='+2348030001122',
            service=self.service,
            status='slots_offered',
        )
        # Three offers. Deliberately OUT of start-time order: offer 2 starts EARLIEST.
        # This proves resolution follows original dispatch order (offered_at),
        # never re-sorted by time and never renumbered by prior selections.
        base = timezone.make_aware(datetime.datetime(2026, 12, 1, 10, 0, 0))
        self.offer1 = SlotOffer.objects.create(
            request=self.booking, doctor=self.doctor,
            start_datetime=base, end_datetime=base + datetime.timedelta(minutes=30),
            expires_at=timezone.now() + datetime.timedelta(minutes=60),
        )
        self.offer2 = SlotOffer.objects.create(
            request=self.booking, doctor=self.doctor,
            start_datetime=base - datetime.timedelta(hours=1),
            end_datetime=base - datetime.timedelta(hours=1) + datetime.timedelta(minutes=30),
            expires_at=timezone.now() + datetime.timedelta(minutes=60),
        )
        self.offer3 = SlotOffer.objects.create(
            request=self.booking, doctor=self.doctor,
            start_datetime=base + datetime.timedelta(hours=2),
            end_datetime=base + datetime.timedelta(hours=2) + datetime.timedelta(minutes=30),
            expires_at=timezone.now() + datetime.timedelta(minutes=60),
        )
        # Force strictly distinct offered_at timestamps (auto_now_add ties are
        # possible at microsecond speed) so dispatch order is deterministic.
        t0 = timezone.now()
        SlotOffer.objects.filter(id=self.offer1.id).update(offered_at=t0 - datetime.timedelta(minutes=2))
        SlotOffer.objects.filter(id=self.offer2.id).update(offered_at=t0 - datetime.timedelta(minutes=1))
        SlotOffer.objects.filter(id=self.offer3.id).update(offered_at=t0)

    def tearDown(self):
        cache.clear()

    def _hold(self, payload):
        return self.client.post(
            '/api/v1/slots/hold/', payload, format='json',
            HTTP_X_WEBHOOK_SECRET='clinic_dev_secret_2026'
        )

    def test_reply_by_option_number_creates_appointment(self):
        """Patient replies '2' via n8n → backend resolves the 2nd dispatch offer."""
        res = self._hold({'request_id': 'REQ-2026-0099', 'option_number': 2})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['status'], 'held')
        self.assertIsNotNone(res.data['appointment_code'])
        # Resolved to offer2 (the 2nd CREATED offer), NOT the earliest start time
        self.assertEqual(
            res.data['appointment']['start_datetime'],
            self.offer2.start_datetime.isoformat(),
        )
        self.booking.refresh_from_db()
        # Patient replies create a 15-min HOLD; the request converts only when the
        # hold is confirmed (existing lifecycle: hold → confirm → converted).
        self.assertEqual(self.booking.status, 'slots_offered')
        self.offer2.refresh_from_db()
        self.assertTrue(self.offer2.is_selected)

    def test_option_number_accepts_request_uuid_or_code(self):
        res = self._hold({'request_id': str(self.booking.id), 'option_number': 1})
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_double_reply_is_already_confirmed_not_slot_conflict(self):
        """Cross-channel defense: second reply gets friendly ALREADY_CONFIRMED, no new row."""
        first = self._hold({'request_id': 'REQ-2026-0099', 'option_number': 1})
        self.assertEqual(first.status_code, status.HTTP_200_OK)
        code = first.data['appointment_code']

        second = self._hold({'request_id': 'REQ-2026-0099', 'option_number': 2})
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(second.data['error'], 'ALREADY_CONFIRMED')
        self.assertTrue(second.data['already_confirmed'])
        self.assertEqual(second.data['appointment_code'], code)
        # Exactly ONE appointment was ever created for this request
        self.assertEqual(Appointment.objects.filter(booking_request=self.booking).count(), 1)

    def test_expired_option_rejected(self):
        SlotOffer.objects.filter(id=self.offer3.id).update(
            expires_at=timezone.now() - datetime.timedelta(minutes=1)
        )
        res = self._hold({'request_id': 'REQ-2026-0099', 'option_number': 3})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('expired', str(res.data))

    def test_option_number_out_of_range(self):
        res = self._hold({'request_id': 'REQ-2026-0099', 'option_number': 4})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('option_number', res.data)

    def test_both_slot_offer_id_and_option_number_rejected(self):
        res = self._hold({
            'request_id': 'REQ-2026-0099',
            'option_number': 1,
            'slot_offer_id': str(self.offer1.id),
        })
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('option_number', res.data)

    def test_option_number_requires_request_id(self):
        res = self._hold({'option_number': 1})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('option_number', res.data)

    def test_unknown_request_code_rejected(self):
        res = self._hold({'request_id': 'REQ-2099-0000', 'option_number': 1})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('request_id', res.data)


class DispatchChannelSelectionTests(APITestCase):
    """
    Task 3.1 — receptionist channel checkboxes (Approve & Dispatch):
    - dispatch-offers accepts `dispatch_channels` ([whatsapp, sms, voice]; default = all
      three, so existing callers behave exactly as before),
    - the Telegram instant-message leg (the "WhatsApp" checkbox during the Telegram-first
      era) is skipped when 'whatsapp' is unchecked, and both outbound calls now run
      AFTER commit (transaction.on_commit),
    - dispatch is REFUSED with 409 PATIENT_ALREADY_BOOKED (clear detail message) when the
      patient already has an active hold or confirmed booking.
    """

    def setUp(self):
        cache.clear()
        self.clinic = ClinicSetting.get_settings()
        self.receptionist = StaffUser.objects.create(
            full_name='Sarah Channels',
            email='sarah.channels@clinic.com',
            role='receptionist',
            is_active=True,
        )
        self.receptionist.set_password('SarahPass123!')
        self.receptionist.save()
        self.client.force_authenticate(user=self.receptionist)

        self.service = Service.objects.create(
            name='Dental Consultation',
            duration_minutes=30,
            buffer_minutes=5,
            price=10000,
        )
        self.doctor = Doctor.objects.create(
            name='Dr. Channel Test',
            working_days=[1, 2, 3, 4, 5, 6],
            shift_start=datetime.time(8, 0), shift_end=datetime.time(18, 0),
        )
        self.booking = BookingRequest.objects.create(
            request_code='REQ-2026-0077',
            patient_name='Grace Channel',
            patient_phone='+2348066667777',
            service=self.service,
            status='awaiting_review',
        )

    def tearDown(self):
        cache.clear()

    def _slot_payload(self):
        slot_start = next_legal_slot(10)
        return {'slots': [{
            'doctor_id': str(self.doctor.id),
            'start_datetime': slot_start.isoformat(),
            'end_datetime': (slot_start + datetime.timedelta(minutes=30)).isoformat(),
            'is_alternative_date': False,
        }]}

    def _dispatch(self, extra=None, execute_commit=True):
        payload = self._slot_payload()
        if extra:
            payload.update(extra)
        if execute_commit:
            with self.captureOnCommitCallbacks(execute=True):
                return self.client.post(
                    f'/api/v1/booking-requests/{self.booking.request_code}/dispatch-offers/',
                    payload, format='json'
                )
        return self.client.post(
            f'/api/v1/booking-requests/{self.booking.request_code}/dispatch-offers/',
            payload, format='json'
        )

    def _capture_fire(self):
        """Patch the n8n pipe + env so we can inspect the exact payload handed over."""
        import os
        from unittest.mock import patch
        return patch.dict(os.environ, {'N8N_DISPATCH_WEBHOOK_URL': 'https://n8n.example.com/dispatch'}), \
            patch('appointments.views_booking.fire_and_forget_webhook')

    def test_default_channels_are_all_three(self):
        env_patch, fire_patch = self._capture_fire()
        with env_patch, fire_patch as mock_fire:
            res = self._dispatch()
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        payload = mock_fire.call_args[0][1]
        self.assertEqual(payload['dispatch_channels'], ['whatsapp', 'sms', 'voice'])

    def test_custom_subset_passed_through(self):
        env_patch, fire_patch = self._capture_fire()
        with env_patch, fire_patch as mock_fire:
            res = self._dispatch({'dispatch_channels': ['whatsapp', 'voice']})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        payload = mock_fire.call_args[0][1]
        self.assertEqual(payload['dispatch_channels'], ['whatsapp', 'voice'])

    def test_empty_channels_rejected(self):
        res = self._dispatch({'dispatch_channels': []})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res.data['error'], 'INVALID_DISPATCH_CHANNELS')

    def test_invalid_channel_value_rejected(self):
        res = self._dispatch({'dispatch_channels': ['carrier_pigeon']})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res.data['error'], 'INVALID_DISPATCH_CHANNELS')

    def test_active_hold_blocks_dispatch_with_clear_message(self):
        slot_start = next_legal_slot(10)
        Appointment.objects.create(
            appointment_code='AP-2001',
            patient_name=self.booking.patient_name,
            patient_phone=self.booking.patient_phone,
            doctor=self.doctor,
            service=self.service,
            booking_request=self.booking,
            start_datetime=slot_start,
            end_datetime=slot_start + datetime.timedelta(minutes=30),
            status='held',
            hold_expires_at=timezone.now() + datetime.timedelta(minutes=10),
        )
        res = self._dispatch()
        self.assertEqual(res.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(res.data['error'], 'PATIENT_ALREADY_BOOKED')
        self.assertIn('AP-2001', res.data['detail'])
        self.assertIn('Cancel or reschedule', res.data['detail'])
        # Nothing was dispatched and no offers were created
        self.assertEqual(SlotOffer.objects.filter(request=self.booking).count(), 0)
        self.booking.refresh_from_db()
        self.assertEqual(self.booking.status, 'awaiting_review')

    def test_confirmed_booking_blocks_dispatch(self):
        slot_start = next_legal_slot(10)
        Appointment.objects.create(
            appointment_code='AP-2002',
            patient_name=self.booking.patient_name,
            patient_phone=self.booking.patient_phone,
            doctor=self.doctor,
            service=self.service,
            booking_request=self.booking,
            start_datetime=slot_start,
            end_datetime=slot_start + datetime.timedelta(minutes=30),
            status='confirmed',
        )
        res = self._dispatch()
        self.assertEqual(res.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(res.data['error'], 'PATIENT_ALREADY_BOOKED')

    def test_expired_hold_does_NOT_block_dispatch(self):
        """A hold that already timed out is dead — reception can dispatch fresh options."""
        slot_start = next_legal_slot(10)
        Appointment.objects.create(
            appointment_code='AP-2003',
            patient_name=self.booking.patient_name,
            patient_phone=self.booking.patient_phone,
            doctor=self.doctor,
            service=self.service,
            booking_request=self.booking,
            start_datetime=slot_start,
            end_datetime=slot_start + datetime.timedelta(minutes=30),
            status='held',
            hold_expires_at=timezone.now() - datetime.timedelta(minutes=10),
        )
        res = self._dispatch()
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_telegram_leg_respects_whatsapp_checkbox(self):
        from unittest.mock import patch
        self.booking.patient_notes = 'telegram_chat_id: 555001'
        self.booking.save(update_fields=['patient_notes'])

        # WhatsApp unchecked → instant-message leg skipped entirely
        with patch('appointments.views_booking.TelegramService') as mock_tg, \
                patch('appointments.views_booking.fire_and_forget_webhook'):
            res = self._dispatch({'dispatch_channels': ['sms', 'voice']})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        mock_tg.format_slot_offers.assert_not_called()
        mock_tg.send_message.assert_not_called()

        # Default (all three) → Telegram leg fires after commit, exactly as before 3.1
        with patch('appointments.views_booking.TelegramService') as mock_tg, \
                patch('appointments.views_booking.fire_and_forget_webhook'):
            mock_tg.format_slot_offers.return_value = ('Offer text', 'Markup')
            res = self._dispatch()
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        mock_tg.format_slot_offers.assert_called_once()
        mock_tg.send_message.assert_called_once()

    def test_dispatch_blocked_means_no_n8n_fire(self):
        """The 409 guard fires BEFORE any outbound call — no wasted messages, ever."""
        from unittest.mock import patch
        slot_start = next_legal_slot(10)
        Appointment.objects.create(
            appointment_code='AP-2004',
            patient_name=self.booking.patient_name,
            patient_phone=self.booking.patient_phone,
            doctor=self.doctor,
            service=self.service,
            booking_request=self.booking,
            start_datetime=slot_start,
            end_datetime=slot_start + datetime.timedelta(minutes=30),
            status='confirmed',
        )
        env_patch, fire_patch = self._capture_fire()
        with env_patch, fire_patch as mock_fire, \
                patch('appointments.views_booking.TelegramService') as mock_tg:
            res = self._dispatch()
        self.assertEqual(res.status_code, status.HTTP_409_CONFLICT)
        mock_fire.assert_not_called()
        mock_tg.format_slot_offers.assert_not_called()


class RecalculateExcludesShownSlotsTests(APITestCase):
    """
    Task 3.3 fix: "Re-calculate Times" must return FRESH options. The availability
    engine is deterministic, so check-slots now accepts `exclude_start_datetimes`
    (the starts already on screen) and skips them (±1 min tolerance).
    """

    def setUp(self):
        cache.clear()
        self.clinic = ClinicSetting.get_settings()
        self.doctor = Doctor.objects.create(
            name='Dr. Recalc Test',
            specialty='Dental Surgery',
            working_days=[1, 2, 3, 4, 5, 6, 7],
            shift_start=datetime.time(8, 0),
            shift_end=datetime.time(17, 0),
        )
        self.service = Service.objects.create(
            name='Dental Consultation',
            duration_minutes=30,
            buffer_minutes=5,
            price=10000,
        )
        DoctorService.objects.create(doctor=self.doctor, service=self.service)
        # Engine respects the clinic's working days — open every weekday (1=Mon..7=Sun)
        self.clinic.working_days = [1, 2, 3, 4, 5, 6, 7]
        self.clinic.save()
        self.booking = BookingRequest.objects.create(
            request_code='REQ-2026-0123',
            patient_name='Recalc Test',
            patient_phone='+2348099990000',
            service=self.service,
            preferred_doctor=self.doctor,
            status='awaiting_review',
        )

    def tearDown(self):
        cache.clear()

    def _check(self, exclude=None):
        payload = {}
        if exclude:
            payload['exclude_start_datetimes'] = exclude
        return self.client.post(
            f'/api/v1/booking-requests/{self.booking.request_code}/check-slots/',
            payload, format='json'
        )

    def test_first_call_returns_slots(self):
        staff = StaffUser.objects.create(
            full_name='Sarah Recalc', email='sarah.recalc@clinic.com',
            role='receptionist', is_active=True,
        )
        staff.set_password('SarahPass123!')
        staff.save()
        self.client.force_authenticate(user=staff)
        res = self._check()
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(res.data['candidate_slots']), 1)
        return res.data['candidate_slots']

    def test_excluding_shown_starts_returns_fresh_slots(self):
        staff = StaffUser.objects.create(
            full_name='Sarah Recalc', email='sarah.recalc2@clinic.com',
            role='receptionist', is_active=True,
        )
        staff.set_password('SarahPass123!')
        staff.save()
        self.client.force_authenticate(user=staff)

        first = self._check().data['candidate_slots']
        self.assertGreaterEqual(len(first), 1)
        first_starts = [s['start_datetime'] for s in first]

        second = self._check(exclude=first_starts).data['candidate_slots']
        # Every fresh slot must start at a DIFFERENT time than the shown batch
        second_starts = [s['start_datetime'] for s in second]
        self.assertEqual(len(set(first_starts) & set(second_starts)), 0)


class NeedsAttentionFieldsTests(APITestCase):
    """
    Task 3.4: the queue list serializer exposes delivery-failure visibility
    (delivery_failures count + last_failure detail) computed from InteractionLog
    statuses failed / no_answer / expired — no new models.
    """

    def setUp(self):
        cache.clear()
        self.receptionist = StaffUser.objects.create(
            full_name='Sarah Needs', email='sarah.needs@clinic.com',
            role='receptionist', is_active=True,
        )
        self.receptionist.set_password('SarahPass123!')
        self.receptionist.save()
        self.service = Service.objects.create(
            name='Dental Consultation', duration_minutes=30, buffer_minutes=5, price=10000,
        )
        self.booking = BookingRequest.objects.create(
            request_code='REQ-2026-0200',
            patient_name='Amina Attention',
            patient_phone='+2348055550001',
            service=self.service,
            status='slots_offered',
        )

    def tearDown(self):
        cache.clear()

    def _queue_item(self):
        self.client.force_authenticate(user=self.receptionist)
        res = self.client.get('/api/v1/booking-requests/?status=slots_offered')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        return next(item for item in res.data if item['request_code'] == 'REQ-2026-0200')

    def test_no_failures_means_zero_and_null(self):
        InteractionLog.objects.create(
            provider='telegram', channel='telegram', direction='outbound',
            status='delivered', patient_phone='+2348055550001',
            booking_request=self.booking,
        )
        item = self._queue_item()
        self.assertEqual(item['delivery_failures'], 0)
        self.assertIsNone(item['last_failure'])

    def test_failure_count_excludes_successful_statuses(self):
        InteractionLog.objects.create(
            provider='meta_whatsapp', channel='whatsapp', status='failed',
            patient_phone='+2348055550001', booking_request=self.booking,
            error_detail='Template not approved',
        )
        InteractionLog.objects.create(
            provider='voicebip', channel='voice', status='no_answer',
            patient_phone='+2348055550001', booking_request=self.booking,
        )
        InteractionLog.objects.create(
            provider='voicebip', channel='sms', status='delivered',
            patient_phone='+2348055550001', booking_request=self.booking,
        )
        item = self._queue_item()
        self.assertEqual(item['delivery_failures'], 2)
        self.assertIsNotNone(item['last_failure'])
        self.assertIn(item['last_failure']['status'], ('failed', 'no_answer'))

    def test_last_failure_is_the_most_recent_failure(self):
        older = InteractionLog.objects.create(
            provider='meta_whatsapp', channel='whatsapp', status='failed',
            patient_phone='+2348055550001', booking_request=self.booking,
            error_detail='Old failure',
        )
        InteractionLog.objects.create(
            provider='voicebip', channel='voice', status='no_answer',
            patient_phone='+2348055550001', booking_request=self.booking,
            summary='Call not answered',
        )
        # auto_now_add pins created_at; bump the older row explicitly
        InteractionLog.objects.filter(pk=older.pk).update(
            created_at=timezone.now() - datetime.timedelta(minutes=10)
        )
        item = self._queue_item()
        self.assertEqual(item['delivery_failures'], 2)
        self.assertEqual(item['last_failure']['channel'], 'voice')
        self.assertEqual(item['last_failure']['status'], 'no_answer')
        self.assertEqual(item['last_failure']['summary'], 'Call not answered')

    def test_failures_do_not_leak_between_requests(self):
        other = BookingRequest.objects.create(
            request_code='REQ-2026-0201',
            patient_name='Other Patient',
            patient_phone='+2348055550002',
            service=self.service,
            status='slots_offered',
        )
        InteractionLog.objects.create(
            provider='meta_whatsapp', channel='whatsapp', status='failed',
            patient_phone='+2348055550002', booking_request=other,
        )
        item = self._queue_item()
        self.assertEqual(item['delivery_failures'], 0)
        self.assertIsNone(item['last_failure'])

    # --- Receptionist-approved resolution rule (Needs Attention exit) -----
    # A request must LEAVE the Needs Attention tab once a LATER outbound
    # send succeeds (sent / delivered / answered), and only return if a
    # NEWER failure lands. attention_open = newest failure is newer than
    # the newest successful outbound outcome.

    def test_attention_open_true_when_failure_is_latest_outcome(self):
        InteractionLog.objects.create(
            provider='meta_whatsapp', channel='whatsapp', status='sent',
            patient_phone='+2348055550001', booking_request=self.booking,
        )
        failure = InteractionLog.objects.create(
            provider='meta_whatsapp', channel='whatsapp', status='failed',
            patient_phone='+2348055550001', booking_request=self.booking,
            error_detail='Template not approved',
        )
        InteractionLog.objects.filter(pk=failure.pk).update(
            created_at=timezone.now() + datetime.timedelta(minutes=1)
        )
        item = self._queue_item()
        self.assertTrue(item['attention_open'])

    def test_attention_open_clears_after_successful_resend(self):
        failure = InteractionLog.objects.create(
            provider='meta_whatsapp', channel='whatsapp', status='failed',
            patient_phone='+2348055550001', booking_request=self.booking,
            error_detail='Template not approved',
        )
        InteractionLog.objects.filter(pk=failure.pk).update(
            created_at=timezone.now() - datetime.timedelta(minutes=10)
        )
        success = InteractionLog.objects.create(
            provider='voicebip', channel='sms', status='delivered',
            patient_phone='+2348055550001', booking_request=self.booking,
            summary='Slots re-sent via SMS after the failed attempt.',
        )
        InteractionLog.objects.filter(pk=success.pk).update(
            created_at=timezone.now()
        )
        item = self._queue_item()
        self.assertFalse(item['attention_open'])
        # The historical count is untouched — the card chip still shows it.
        self.assertEqual(item['delivery_failures'], 1)

    def test_attention_open_false_when_no_failure_ever(self):
        InteractionLog.objects.create(
            provider='telegram', channel='telegram', direction='outbound',
            status='delivered', patient_phone='+2348055550001',
            booking_request=self.booking,
        )
        item = self._queue_item()
        self.assertFalse(item['attention_open'])


class SeedClinicPasswordPersistenceTests(TestCase):
    """
    Receptionist-approved credential persistence: seed_clinic sets passwords/PINs
    only for NEWLY created staff (or blank hashes). A re-seed on server restart
    must never wipe credentials changed from the dashboard (the pre-launch
    defect: every restart reset the admin password back to the seed value,
    silently undoing admin resets).

    Wave 1 / Step 1.5: the deterministic demo passwords are OPT-IN
    (SEED_DEMO_PASSWORDS=1) so these persistence cases run against a known
    value; the default random-credential behaviour is pinned separately in
    SeedClinicHygieneTests.
    """

    DEMO_ENV = {'SEED_DEMO_PASSWORDS': '1', 'TELEGRAM_BOT_TOKEN': ''}

    def test_first_seed_sets_the_opt_in_demo_passwords(self):
        with patch.dict(os.environ, self.DEMO_ENV):
            call_command('seed_clinic', verbosity=0)
        admin = StaffUser.objects.get(email='admin@clinic.com')
        self.assertTrue(admin.check_password('adminpassword123'))
        self.assertTrue(admin.check_pin('9900'))

    def test_reseed_preserves_changed_password_and_pin(self):
        with patch.dict(os.environ, self.DEMO_ENV):
            call_command('seed_clinic', verbosity=0)
        admin = StaffUser.objects.get(email='admin@clinic.com')
        self.assertTrue(admin.check_password('adminpassword123'))

        admin.set_password('NewVaultPass456!')
        admin.set_pin('2468')
        admin.save()

        with patch.dict(os.environ, self.DEMO_ENV):
            call_command('seed_clinic', verbosity=0)  # simulates a server restart
        admin = StaffUser.objects.get(email='admin@clinic.com')
        self.assertTrue(admin.check_password('NewVaultPass456!'))
        self.assertTrue(admin.check_pin('2468'))
        self.assertFalse(admin.check_password('adminpassword123'))


class AutoResolveDisruptionTests(TestCase):
    """
    Item B.1 — one-click doctor-leave auto-resolver (DisruptionService.auto_resolve_disruption).

    Receptionist-approved pattern: ONE call declares the leave and places EVERY
    impacted patient in priority order — (1) a qualified colleague free at the
    EXACT same time, (2) any free colleague slot the SAME day, (3) the NEXT day
    — under the same zero-double-booking guarantees as HoldService, then queues
    WhatsApp + SMS notice messages whose words are written by Django.
    """

    def setUp(self):
        self.clinic = ClinicSetting.get_settings()
        self.clinic.webhook_secret = 'clinic_dev_secret_2026'
        self.clinic.save()
        self.doctor = Doctor.objects.create(
            name='Dr. Bello Ibrahim',
            specialty='Dental Surgery',
            working_days=[1, 2, 3, 4, 5],
            shift_start=datetime.time(9, 0),
            shift_end=datetime.time(17, 0),
            max_daily_appointments=12,
        )
        self.colleague = Doctor.objects.create(
            name='Dr. Chinwe Okafor',
            specialty='General Practice',
            working_days=[1, 2, 3, 4, 5, 6],
            shift_start=datetime.time(8, 0),
            shift_end=datetime.time(16, 0),
            max_daily_appointments=14,
        )
        self.service = Service.objects.create(
            name='Dental Examination',
            category='Dental Care',
            duration_minutes=30,
            buffer_minutes=10,
            price=15000.00,
        )
        DoctorService.objects.create(doctor=self.doctor, service=self.service)
        DoctorService.objects.create(doctor=self.colleague, service=self.service)

    def _next_monday(self):
        today = timezone.now().date()
        return today + datetime.timedelta(days=(1 - today.isoweekday()) % 7 + 7)

    def _book(self, doctor, day, hour, minute=0, name='Amina Auto', phone='+2348055557700'):
        start = timezone.make_aware(datetime.datetime.combine(day, datetime.time(hour, minute)))
        return HoldService.acquire_slot(
            doctor_id=doctor.id,
            service_id=self.service.id,
            start_datetime=start,
            end_datetime=start + datetime.timedelta(minutes=30),
            patient_name=name,
            patient_phone=phone,
            is_hold=False,
        )

    def test_same_day_same_time_colleague_wins(self):
        appt = self._book(self.doctor, self._next_monday(), 11, 0)
        original_start = appt.start_datetime
        report = DisruptionService.auto_resolve_disruption(
            doctor_id=self.doctor.id,
            leave_start_dt=original_start - datetime.timedelta(hours=1),
        )
        appt.refresh_from_db()
        self.assertEqual(appt.doctor.id, self.colleague.id)
        self.assertEqual(appt.start_datetime, original_start)  # same wall clock slot
        result = report['results'][0]
        self.assertEqual(result['outcome'], 'reassigned')
        self.assertEqual(result['placement'], 'same_day_same_time')
        self.assertEqual(result['new_doctor'], 'Dr. Chinwe Okafor')

    def test_same_day_new_time_when_exact_time_taken(self):
        self._book(self.colleague, self._next_monday(), 11, 0, name='Colleague Busy', phone='+2348055557701')
        appt = self._book(self.doctor, self._next_monday(), 11, 0, phone='+2348055557702')
        original_start = appt.start_datetime
        report = DisruptionService.auto_resolve_disruption(
            doctor_id=self.doctor.id,
            leave_start_dt=original_start - datetime.timedelta(hours=1),
        )
        appt.refresh_from_db()
        self.assertEqual(appt.doctor.id, self.colleague.id)
        self.assertEqual(timezone.localtime(appt.start_datetime).date(), self._next_monday())
        self.assertNotEqual(appt.start_datetime, original_start)
        self.assertEqual(report['results'][0]['placement'], 'same_day_new_time')

    def test_next_day_when_same_day_full(self):
        self.colleague.max_daily_appointments = 1
        self.colleague.save()
        self._book(self.colleague, self._next_monday(), 11, 0, name='Ceiling Filler', phone='+2348055557703')
        appt = self._book(self.doctor, self._next_monday(), 11, 0, phone='+2348055557704')
        report = DisruptionService.auto_resolve_disruption(
            doctor_id=self.doctor.id,
            leave_start_dt=appt.start_datetime - datetime.timedelta(hours=1),
        )
        appt.refresh_from_db()
        self.assertEqual(appt.doctor.id, self.colleague.id)
        self.assertGreater(timezone.localtime(appt.start_datetime).date(), self._next_monday())
        self.assertEqual(report['results'][0]['placement'], 'next_day_or_later')

    def test_zero_double_booking_after_auto_resolve(self):
        self._book(self.colleague, self._next_monday(), 11, 0, name='Existing Busy', phone='+2348055557705')
        for hour, phone in ((10, '+2348055557706'), (11, '+2348055557707'), (14, '+2348055557708')):
            self._book(self.doctor, self._next_monday(), hour, 0, phone=phone)
        DisruptionService.auto_resolve_disruption(
            doctor_id=self.doctor.id,
            leave_start_dt=timezone.make_aware(
                datetime.datetime.combine(self._next_monday(), datetime.time(8, 0))
            ),
            leave_end_dt=timezone.make_aware(
                datetime.datetime.combine(self._next_monday(), datetime.time(23, 59))
            ),
        )
        for doc in (self.doctor, self.colleague):
            booked = sorted(
                Appointment.objects.filter(doctor=doc).exclude(status__in=['cancelled', 'no_show', 'hold_expired']),
                key=lambda a: a.start_datetime,
            )
            for earlier, later in zip(booked, booked[1:]):
                self.assertLess(
                    earlier.end_datetime + datetime.timedelta(minutes=self.service.buffer_minutes),
                    later.start_datetime,
                    f"overlap for {doc.name}: {earlier.appointment_code} vs {later.appointment_code}",
                )

    def test_messages_queued_with_django_words(self):
        appt = self._book(self.doctor, self._next_monday(), 11, 0, name='Amina Words', phone='+2348055557709')
        report = DisruptionService.auto_resolve_disruption(
            doctor_id=self.doctor.id,
            leave_start_dt=appt.start_datetime - datetime.timedelta(hours=1),
        )
        messages = report['results'][0]['messages']
        self.assertEqual(sorted(m['channel'] for m in messages), ['sms', 'whatsapp'])
        words = messages[0]['message']
        self.assertIn('Dr. Bello Ibrahim', words)      # the doctor they expected
        self.assertIn('Dr. Chinwe Okafor', words)      # the doctor they now have
        self.assertIn('emergency', words.lower())
        self.assertIn(appt.appointment_code, words)
        # claim rows exist and are single-shot
        for m in messages:
            claim = InteractionLog.objects.get(external_ref=m['claim_ref'])
            self.assertEqual(claim.status, 'queued')
            self.assertEqual(claim.appointment_id, appt.id)
            self.assertEqual(claim.direction, 'outbound')

    def test_unplaced_flagged_without_message(self):
        DoctorService.objects.filter(doctor=self.colleague).delete()
        appt = self._book(self.doctor, self._next_monday(), 11, 0, name='Stuck Patient', phone='+2348055557710')
        # Step 1b: the doctor is now blocked only on the leave DATES, so "same
        # doctor, next day" is a valid placement. To test the no-option case,
        # look at the leave day only and leave no qualified colleague.
        report = DisruptionService.auto_resolve_disruption(
            doctor_id=self.doctor.id,
            leave_start_dt=appt.start_datetime - datetime.timedelta(hours=1),
            max_lookahead_days=0,
        )
        appt.refresh_from_db()
        self.assertEqual(appt.doctor.id, self.doctor.id)  # untouched
        result = report['results'][0]
        self.assertEqual(result['outcome'], 'unplaced')
        self.assertEqual(result['messages'], [])
        self.assertFalse(InteractionLog.objects.filter(appointment=appt).exists())

    def test_leave_period_recorded_and_flag_not_stuck(self):
        """
        Step 1b: a future-dated leave must NOT flip the roster switch forever.
        The dates go into DoctorLeave; `is_on_leave` stays honest (it only
        means 'off duty today').
        """
        appt = self._book(self.doctor, self._next_monday(), 11, 0, phone='+2348055557711')
        DisruptionService.auto_resolve_disruption(
            doctor_id=self.doctor.id,
            leave_start_dt=appt.start_datetime - datetime.timedelta(hours=1),
        )
        self.doctor.refresh_from_db()
        self.assertFalse(self.doctor.is_on_leave)
        leave = DoctorLeave.objects.get(doctor=self.doctor)
        self.assertEqual(
            leave.start_date, timezone.localtime(appt.start_datetime).date()
        )
        self.assertTrue(self.doctor.is_on_leave_on(leave.start_date))
        self.assertTrue(AuditLog.objects.filter(action='DISRUPTION_AUTO_RESOLVED').exists())


class AutoResolveEndpointTests(APITestCase):
    """
    Item B.2 — POST /api/v1/disruptions/{doctor_id}/auto-resolve/
    Staff-only one-click resolver. After resolving, Django fire-and-forget
    pushes the queued notice items to n8n's disruption webhook (workflow 08,
    env-driven URL + X-Webhook-Secret). Unset URL is fail-safe: nothing
    fires and the queued items are never lost.
    """

    def setUp(self):
        cache.clear()
        self.clinic = ClinicSetting.get_settings()
        self.clinic.webhook_secret = 'clinic_dev_secret_2026'
        self.clinic.save()
        self.receptionist = StaffUser.objects.create(
            full_name='Sarah Auto', email='sarah.auto@clinic.com',
            role='receptionist', is_active=True,
        )
        self.receptionist.set_password('SarahPass123!')
        self.receptionist.save()
        self.doctor = Doctor.objects.create(
            name='Dr. Bello Auto', specialty='Dental Surgery',
            working_days=[1, 2, 3, 4, 5], shift_start=datetime.time(9, 0),
            shift_end=datetime.time(17, 0), max_daily_appointments=12,
        )
        self.colleague = Doctor.objects.create(
            name='Dr. Chinwe Auto', specialty='General Practice',
            working_days=[1, 2, 3, 4, 5, 6], shift_start=datetime.time(8, 0),
            shift_end=datetime.time(16, 0), max_daily_appointments=14,
        )
        self.service = Service.objects.create(
            name='Dental Examination', category='Dental Care',
            duration_minutes=30, buffer_minutes=10, price=15000.00,
        )
        DoctorService.objects.create(doctor=self.doctor, service=self.service)
        DoctorService.objects.create(doctor=self.colleague, service=self.service)

    def tearDown(self):
        cache.clear()

    def _next_monday(self):
        today = timezone.now().date()
        return today + datetime.timedelta(days=(1 - today.isoweekday()) % 7 + 7)

    def _leave_window(self):
        day = self._next_monday()
        return {
            'leave_start': timezone.make_aware(datetime.datetime.combine(day, datetime.time(8, 0))).isoformat(),
            'leave_end': timezone.make_aware(datetime.datetime.combine(day, datetime.time(23, 59))).isoformat(),
        }

    def _book(self, doctor, phone):
        start = timezone.make_aware(datetime.datetime.combine(self._next_monday(), datetime.time(11, 0)))
        return HoldService.acquire_slot(
            doctor_id=doctor.id, service_id=self.service.id,
            start_datetime=start, end_datetime=start + datetime.timedelta(minutes=30),
            patient_name='Amina Endpoint', patient_phone=phone, is_hold=False)

    def _post(self, doctor_id=None):
        import os
        from unittest.mock import patch  # noqa: F401 — used by individual tests via module patching
        with self.captureOnCommitCallbacks(execute=True):
            return self.client.post(
                f"/api/v1/disruptions/{doctor_id or self.doctor.id}/auto-resolve/",
                {'reason': 'Acute Malaria', **self._leave_window()}, format='json')

    def test_requires_staff_auth(self):
        res = self._post()
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_resolves_and_reports(self):
        appt = self._book(self.doctor, '+2348055557801')
        self.client.force_authenticate(user=self.receptionist)
        res = self._post()
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['auto_resolved_count'], 1)
        self.assertEqual(res.data['results'][0]['appointment_id'], str(appt.id))
        appt.refresh_from_db()
        self.assertEqual(appt.doctor.id, self.colleague.id)

    def test_pushes_items_to_n8n_when_configured(self):
        import os
        from unittest.mock import patch
        self._book(self.doctor, '+2348055557802')
        self.client.force_authenticate(user=self.receptionist)
        with patch.dict(os.environ, {'N8N_DISRUPTION_WEBHOOK_URL': 'https://n8n.example.com/disruption-alerts'}), \
                patch('appointments.views_appointment.fire_and_forget_webhook') as mock_fire:
            res = self._post()
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(mock_fire.call_count, 1)
        self.assertEqual(mock_fire.call_args[0][0], 'https://n8n.example.com/disruption-alerts')
        payload = mock_fire.call_args[0][1]
        self.assertEqual(payload['doctor_name'], 'Dr. Bello Auto')
        items = payload['items']
        self.assertEqual(sorted(i['channel'] for i in items), ['sms', 'whatsapp'])
        self.assertTrue(all(i['message'].strip() for i in items))
        # workflow 08 authenticates the push with the shared clinic secret
        self.assertEqual(mock_fire.call_args.kwargs.get('secret'), 'clinic_dev_secret_2026')

    def test_unconfigured_url_is_fail_safe(self):
        import os
        from unittest.mock import patch
        self._book(self.doctor, '+2348055557803')
        self.client.force_authenticate(user=self.receptionist)
        with patch.dict(os.environ, {'N8N_DISRUPTION_WEBHOOK_URL': ''}), \
                patch('appointments.views_appointment.fire_and_forget_webhook') as mock_fire:
            res = self._post()
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        mock_fire.assert_not_called()
        # the notice items stay queued — nothing is lost, delivery can be configured later
        self.assertEqual(InteractionLog.objects.filter(status='queued').count(), 2)

    def test_unknown_doctor_404(self):
        self.client.force_authenticate(user=self.receptionist)
        res = self._post(doctor_id='00000000-0000-0000-0000-000000000000')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)


class DisruptionPreviewTests(APITestCase):
    """
    Step 1a — POST /api/v1/disruptions/{doctor_id}/preview/

    A dry run of the REAL resolver. It must produce the same placement
    decisions and report, while saving nothing: no leave flag, no moved
    appointment, no queued message, no audit row, no webhook.
    """

    def setUp(self):
        cache.clear()
        self.clinic = ClinicSetting.get_settings()
        self.clinic.webhook_secret = 'clinic_dev_secret_2026'
        self.clinic.save()
        self.receptionist = StaffUser.objects.create(
            full_name='Sarah Preview', email='sarah.preview@clinic.com',
            role='receptionist', is_active=True,
        )
        self.receptionist.set_password('SarahPass123!')
        self.receptionist.save()
        self.doctor = Doctor.objects.create(
            name='Dr. Bello Preview', specialty='Dental Surgery',
            working_days=[1, 2, 3, 4, 5], shift_start=datetime.time(9, 0),
            shift_end=datetime.time(17, 0), max_daily_appointments=12,
        )
        self.colleague = Doctor.objects.create(
            name='Dr. Chinwe Preview', specialty='General Practice',
            working_days=[1, 2, 3, 4, 5, 6], shift_start=datetime.time(8, 0),
            shift_end=datetime.time(16, 0), max_daily_appointments=14,
        )
        self.service = Service.objects.create(
            name='Dental Examination', category='Dental Care',
            duration_minutes=30, buffer_minutes=10, price=15000.00,
        )
        DoctorService.objects.create(doctor=self.doctor, service=self.service)
        DoctorService.objects.create(doctor=self.colleague, service=self.service)

        # Only the leaving doctor performs this one -> nobody can take it.
        self.exclusive_service = Service.objects.create(
            name='Orthodontic Surgery', category='Dental Care',
            duration_minutes=30, buffer_minutes=10, price=85000.00,
        )
        DoctorService.objects.create(doctor=self.doctor, service=self.exclusive_service)

    def tearDown(self):
        cache.clear()

    def _next_monday(self):
        today = timezone.now().date()
        return today + datetime.timedelta(days=(1 - today.isoweekday()) % 7 + 7)

    def _window(self, start_day=None, end_day=None):
        start_day = start_day or self._next_monday()
        end_day = end_day or start_day
        return {
            'leave_start': timezone.make_aware(
                datetime.datetime.combine(start_day, datetime.time(8, 0))
            ).isoformat(),
            'leave_end': timezone.make_aware(
                datetime.datetime.combine(end_day, datetime.time(23, 59))
            ).isoformat(),
        }

    def _book(self, phone, service=None, day=None, hour=11):
        day = day or self._next_monday()
        start = timezone.make_aware(datetime.datetime.combine(day, datetime.time(hour, 0)))
        service = service or self.service
        return HoldService.acquire_slot(
            doctor_id=self.doctor.id, service_id=service.id,
            start_datetime=start,
            end_datetime=start + datetime.timedelta(minutes=service.duration_minutes),
            patient_name='Amina Preview', patient_phone=phone, is_hold=False,
        )

    def _preview(self, doctor_id=None, body=None):
        return self.client.post(
            f"/api/v1/disruptions/{doctor_id or self.doctor.id}/preview/",
            body if body is not None else {'reason': 'Planned leave', **self._window()},
            format='json',
        )

    def test_requires_staff_auth(self):
        res = self._preview()
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_preview_plans_without_touching_the_database(self):
        appt = self._book('+2348055557901')
        expected_start = appt.start_datetime
        self.client.force_authenticate(user=self.receptionist)
        audit_before = AuditLog.objects.count()

        res = self._preview()

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data['preview'])
        self.assertFalse(res.data['delivery_pushed'])
        self.assertEqual(res.data['auto_resolved_count'], 1)
        self.assertEqual(res.data['results'][0]['outcome'], 'reassigned')
        self.assertEqual(res.data['results'][0]['new_doctor'], 'Dr. Chinwe Preview')

        # Nothing was saved.
        appt.refresh_from_db()
        self.doctor.refresh_from_db()
        self.assertEqual(appt.doctor.id, self.doctor.id)
        self.assertEqual(appt.start_datetime, expected_start)
        self.assertFalse(self.doctor.is_on_leave)
        self.assertEqual(InteractionLog.objects.count(), 0)
        self.assertEqual(AuditLog.objects.count(), audit_before)

    def test_preview_never_pushes_to_n8n(self):
        import os
        from unittest.mock import patch
        self._book('+2348055557902')
        self.client.force_authenticate(user=self.receptionist)
        with patch.dict(os.environ, {'N8N_DISRUPTION_WEBHOOK_URL': 'https://n8n.example.com/disruption-alerts'}), \
                patch('appointments.views_appointment.fire_and_forget_webhook') as mock_fire:
            res = self._preview()
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        mock_fire.assert_not_called()

    def test_preview_reports_unplaceable_patient(self):
        appt = self._book('+2348055557903', service=self.exclusive_service)
        self.client.force_authenticate(user=self.receptionist)
        monday = self._next_monday()

        # The resolver looks up to 3 days ahead, so the leave must cover that
        # window before this patient is truly unplaceable.
        res = self._preview(body={
            'reason': 'Planned leave',
            **self._window(monday, monday + datetime.timedelta(days=3)),
        })

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['unplaced_count'], 1)
        self.assertEqual(res.data['auto_resolved_count'], 0)
        self.assertEqual(res.data['results'][0]['appointment_id'], str(appt.id))
        self.assertEqual(res.data['results'][0]['outcome'], 'unplaced')
        self.assertEqual(res.data['results'][0]['messages'], [])
        self.assertEqual(res.data['messages_queued_count'], 0)

    def test_preview_handles_a_multi_day_window(self):
        monday = self._next_monday()
        tuesday = monday + datetime.timedelta(days=1)
        first = self._book('+2348055557904', day=monday)
        second = self._book('+2348055557905', day=tuesday)
        self.client.force_authenticate(user=self.receptionist)

        res = self._preview(body={'reason': 'Annual leave', **self._window(monday, tuesday)})

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['auto_resolved_count'], 2)
        self.assertEqual(res.data['same_day_count'], 2)
        by_id = {r['appointment_id']: r for r in res.data['results']}
        self.assertEqual(by_id[str(first.id)]['new_start'][:10], monday.isoformat())
        self.assertEqual(by_id[str(second.id)]['new_start'][:10], tuesday.isoformat())
        # Two patients * two channels would be four messages if this were real.
        self.assertEqual(res.data['messages_queued_count'], 4)
        self.assertEqual(InteractionLog.objects.count(), 0)

    def test_unknown_doctor_404(self):
        self.client.force_authenticate(user=self.receptionist)
        res = self._preview(doctor_id='00000000-0000-0000-0000-000000000000')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_bad_datetime_400(self):
        self.client.force_authenticate(user=self.receptionist)
        res = self._preview(body={'leave_start': 'not-a-date', 'leave_end': 'also-bad'})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res.data['error'], 'INVALID_DATETIME')


class DisruptionDistributionTests(TestCase):
    """
    Step 2 — the receptionist chooses who takes the patients.

    `colleague_ids` is a hard allow-list (only those doctors are considered),
    and `colleague_caps` limits how many EXTRA patients this plan may give a
    doctor on any ONE day (a cap of 1 still means 1 on Monday and 1 on Tuesday).
    The same pass runs for preview and approve, so the plan stays honest.
    """

    def setUp(self):
        self.clinic = ClinicSetting.get_settings()
        self.clinic.webhook_secret = 'clinic_dev_secret_2026'
        self.clinic.save()
        self.doctor = Doctor.objects.create(
            name='Dr. Bello Distribute', specialty='Dental Surgery',
            working_days=[1, 2, 3, 4, 5], shift_start=datetime.time(9, 0),
            shift_end=datetime.time(17, 0), max_daily_appointments=12,
        )
        self.okafor = Doctor.objects.create(
            name='Dr. Chinwe Okafor', specialty='General Practice',
            working_days=[1, 2, 3, 4, 5, 6], shift_start=datetime.time(8, 0),
            shift_end=datetime.time(16, 0), max_daily_appointments=14,
        )
        self.babawo = Doctor.objects.create(
            name='Dr. Babawo', specialty='Consultant Surgery',
            working_days=[1, 2, 3, 4, 5, 6], shift_start=datetime.time(8, 0),
            shift_end=datetime.time(16, 0), max_daily_appointments=14,
        )
        self.unqualified = Doctor.objects.create(
            name='Dr. No Skills', specialty='General Practice',
            working_days=[1, 2, 3, 4, 5, 6], shift_start=datetime.time(8, 0),
            shift_end=datetime.time(16, 0), max_daily_appointments=14,
        )
        self.service = Service.objects.create(
            name='Dental Examination', category='Dental Care',
            duration_minutes=30, buffer_minutes=10, price=15000.00,
        )
        for doc in (self.doctor, self.okafor, self.babawo):
            DoctorService.objects.create(doctor=doc, service=self.service)

    def _next_monday(self):
        today = timezone.now().date()
        return today + datetime.timedelta(days=(1 - today.isoweekday()) % 7 + 7)

    def _book(self, doctor, day, hour, minute=0, phone='+2348055557800'):
        start = timezone.make_aware(datetime.datetime.combine(day, datetime.time(hour, minute)))
        return HoldService.acquire_slot(
            doctor_id=doctor.id, service_id=self.service.id,
            start_datetime=start,
            end_datetime=start + datetime.timedelta(minutes=30),
            patient_name='Amina Distribute', patient_phone=phone, is_hold=False,
        )

    def _resolve(self, day=None, colleague_ids=None, colleague_caps=None, max_lookahead_days=0):
        day = day or self._next_monday()
        return DisruptionService.auto_resolve_disruption(
            doctor_id=self.doctor.id,
            leave_start_dt=timezone.make_aware(
                datetime.datetime.combine(day, datetime.time(8, 0))
            ),
            leave_end_dt=timezone.make_aware(
                datetime.datetime.combine(day, datetime.time(23, 59))
            ),
            max_lookahead_days=max_lookahead_days,
            colleague_ids=colleague_ids,
            colleague_caps=colleague_caps,
        )

    def test_allow_list_restricts_who_receives_patients(self):
        """Only the chosen colleague may take this patient."""
        self._book(self.doctor, self._next_monday(), 11, phone='+2348055557801')
        report = self._resolve(colleague_ids=[str(self.babawo.id)])

        self.assertEqual(report['results'][0]['new_doctor'], 'Dr. Babawo')
        self.assertFalse(
            Appointment.objects.filter(doctor=self.okafor).exists(),
            'Dr. Okafor was not chosen and must not receive the patient',
        )

    def test_cap_spills_the_next_patient_to_another_chosen_colleague(self):
        for hour, phone in ((10, '+2348055557802'), (11, '+2348055557803'), (12, '+2348055557804')):
            self._book(self.doctor, self._next_monday(), hour, phone=phone)

        report = self._resolve(
            colleague_ids=[str(self.okafor.id), str(self.babawo.id)],
            colleague_caps={str(self.okafor.id): 1},
        )

        self.assertEqual(report['distribution']['placed_by_doctor'].get('Dr. Chinwe Okafor'), 1)
        self.assertEqual(report['distribution']['placed_by_doctor'].get('Dr. Babawo'), 2)
        self.assertEqual(report['unplaced_count'], 0)
        self.assertIn('Dr. Chinwe Okafor', report['distribution']['caps_hit'])

    def test_cap_zero_means_do_not_use_that_doctor(self):
        self._book(self.doctor, self._next_monday(), 11, phone='+2348055557805')
        report = self._resolve(
            colleague_ids=[str(self.okafor.id), str(self.babawo.id)],
            colleague_caps={str(self.okafor.id): 0},
        )

        self.assertEqual(report['results'][0]['new_doctor'], 'Dr. Babawo')
        self.assertFalse(Appointment.objects.filter(doctor=self.okafor).exists())

    def test_cap_applies_per_day_not_per_leave_plan(self):
        monday = self._next_monday()
        tuesday = monday + datetime.timedelta(days=1)
        self._book(self.doctor, monday, 11, phone='+2348055557806')
        self._book(self.doctor, tuesday, 11, phone='+2348055557807')

        report = DisruptionService.auto_resolve_disruption(
            doctor_id=self.doctor.id,
            leave_start_dt=timezone.make_aware(datetime.datetime.combine(monday, datetime.time(8, 0))),
            leave_end_dt=timezone.make_aware(datetime.datetime.combine(tuesday, datetime.time(23, 59))),
            max_lookahead_days=0,
            colleague_ids=[str(self.okafor.id)],
            colleague_caps={str(self.okafor.id): 1},
        )

        self.assertEqual(report['auto_resolved_count'], 2)
        self.assertEqual(report['distribution']['placed_by_doctor'].get('Dr. Chinwe Okafor'), 2)
        days = sorted(
            timezone.localtime(Appointment.objects.get(appointment_code=r['appointment_code']).start_datetime).date()
            for r in report['results']
        )
        self.assertEqual(days, [monday, tuesday])

    def test_one_colleague_plan_receives_every_patient(self):
        for hour, phone in ((10, '+2348055557808'), (11, '+2348055557809'), (12, '+2348055557810')):
            self._book(self.doctor, self._next_monday(), hour, phone=phone)

        report = self._resolve(colleague_ids=[str(self.babawo.id)])

        self.assertEqual(report['auto_resolved_count'], 3)
        self.assertEqual(report['distribution']['placed_by_doctor'], {'Dr. Babawo': 3})

    def test_unqualified_choice_is_named_not_silently_dropped(self):
        self._book(self.doctor, self._next_monday(), 11, phone='+2348055557811')
        report = self._resolve(colleague_ids=[str(self.unqualified.id)])

        result = report['results'][0]
        self.assertEqual(result['outcome'], 'unplaced')
        self.assertEqual(result['unplaced_reason'], 'NONE_QUALIFIED')
        self.assertIn('Dental Examination', result['unplaced_text'])
        self.assertIn('Dr. No Skills', result['unplaced_text'])

    def test_all_at_cap_is_named_with_the_doctor(self):
        self._book(self.doctor, self._next_monday(), 11, phone='+2348055557812')
        report = self._resolve(
            colleague_ids=[str(self.okafor.id)],
            colleague_caps={str(self.okafor.id): 0},
        )

        result = report['results'][0]
        self.assertEqual(result['outcome'], 'unplaced')
        self.assertEqual(result['unplaced_reason'], 'ALL_AT_CAP')
        self.assertIn('Dr. Chinwe Okafor', result['unplaced_text'])
        self.assertIn('0 of 0', result['unplaced_text'])

    def test_no_chosen_colleague_is_an_honest_empty_plan(self):
        self._book(self.doctor, self._next_monday(), 11, phone='+2348055557813')
        report = self._resolve(colleague_ids=[])

        result = report['results'][0]
        self.assertEqual(result['outcome'], 'unplaced')
        self.assertEqual(result['unplaced_reason'], 'NO_COLLEAGUE_CHOSEN')

    def test_cap_counts_extra_patients_only(self):
        """A doctor with a busy morning can still take the cap in extras."""
        existing_day = self._next_monday()
        self._book(self.okafor, existing_day, 9, phone='+2348055557814')
        self._book(self.doctor, existing_day, 11, phone='+2348055557815')

        report = self._resolve(
            colleague_ids=[str(self.okafor.id)],
            colleague_caps={str(self.okafor.id): 1},
        )

        self.assertEqual(report['auto_resolved_count'], 1)
        self.assertEqual(
            Appointment.objects.filter(doctor=self.okafor, status='confirmed').count(), 2
        )

    def test_report_echoes_the_chosen_distribution(self):
        self._book(self.doctor, self._next_monday(), 11, phone='+2348055557816')
        report = self._resolve(
            colleague_ids=[str(self.okafor.id)],
            colleague_caps={str(self.okafor.id): 2},
        )

        distribution = report['distribution']
        self.assertEqual(distribution['colleague_ids'], [str(self.okafor.id)])
        self.assertEqual(distribution['colleague_caps'], {str(self.okafor.id): 2})
        self.assertEqual(distribution['placed_by_doctor'], {'Dr. Chinwe Okafor': 1})

    def test_preview_matches_approve_under_caps(self):
        for hour, phone in ((10, '+2348055557817'), (11, '+2348055557818'), (12, '+2348055557819')):
            self._book(self.doctor, self._next_monday(), hour, phone=phone)

        kwargs = {
            'doctor_id': self.doctor.id,
            'leave_start_dt': timezone.make_aware(
                datetime.datetime.combine(self._next_monday(), datetime.time(8, 0))
            ),
            'leave_end_dt': timezone.make_aware(
                datetime.datetime.combine(self._next_monday(), datetime.time(23, 59))
            ),
            'max_lookahead_days': 0,
            'colleague_ids': [str(self.okafor.id), str(self.babawo.id)],
            'colleague_caps': {str(self.okafor.id): 1},
        }
        preview = DisruptionService.preview_disruption(**kwargs)
        planned = [
            (r['appointment_code'], r['new_doctor'], r['new_start'])
            for r in preview['results']
        ]
        self.assertFalse(Appointment.objects.filter(doctor=self.okafor).exists())

        approved = DisruptionService.auto_resolve_disruption(**kwargs)
        actual = [
            (r['appointment_code'], r['new_doctor'], r['new_start'])
            for r in approved['results']
        ]
        self.assertEqual(planned, actual)
        self.assertEqual(
            preview['distribution']['placed_by_doctor'],
            approved['distribution']['placed_by_doctor'],
        )

    def test_unknown_colleague_is_rejected(self):
        self._book(self.doctor, self._next_monday(), 11, phone='+2348055557820')
        with self.assertRaises(ValueError):
            self._resolve(colleague_ids=[str(uuid.uuid4())])

    def test_negative_cap_is_rejected(self):
        self._book(self.doctor, self._next_monday(), 11, phone='+2348055557821')
        with self.assertRaises(ValueError):
            self._resolve(
                colleague_ids=[str(self.okafor.id)],
                colleague_caps={str(self.okafor.id): -1},
            )

    def test_leaving_doctor_cannot_be_in_the_plan(self):
        self._book(self.doctor, self._next_monday(), 11, phone='+2348055557822')
        with self.assertRaises(ValueError):
            self._resolve(colleague_ids=[str(self.doctor.id)])


class DisruptionDistributionEndpointTests(APITestCase):
    """
    Step 2 — both resolver endpoints accept the same distribution payload, so
    preview and approve can never read different plans.
    """

    def setUp(self):
        cache.clear()
        self.clinic = ClinicSetting.get_settings()
        self.clinic.webhook_secret = 'clinic_dev_secret_2026'
        self.clinic.save()
        self.receptionist = StaffUser.objects.create(
            full_name='Sarah Distribute', email='sarah.distribute@clinic.com',
            role='receptionist', is_active=True,
        )
        self.receptionist.set_password('SarahPass123!')
        self.receptionist.save()
        self.doctor = Doctor.objects.create(
            name='Dr. Bello Endpoint', specialty='Dental Surgery',
            working_days=[1, 2, 3, 4, 5], shift_start=datetime.time(9, 0),
            shift_end=datetime.time(17, 0), max_daily_appointments=12,
        )
        self.okafor = Doctor.objects.create(
            name='Dr. Chinwe Endpoint', specialty='General Practice',
            working_days=[1, 2, 3, 4, 5, 6], shift_start=datetime.time(8, 0),
            shift_end=datetime.time(16, 0), max_daily_appointments=14,
        )
        self.service = Service.objects.create(
            name='Dental Examination', category='Dental Care',
            duration_minutes=30, buffer_minutes=10, price=15000.00,
        )
        DoctorService.objects.create(doctor=self.doctor, service=self.service)
        DoctorService.objects.create(doctor=self.okafor, service=self.service)

    def tearDown(self):
        cache.clear()

    def _next_monday(self):
        today = timezone.now().date()
        return today + datetime.timedelta(days=(1 - today.isoweekday()) % 7 + 7)

    def _book(self, phone='+2348055557830'):
        day = self._next_monday()
        start = timezone.make_aware(datetime.datetime.combine(day, datetime.time(11, 0)))
        return HoldService.acquire_slot(
            doctor_id=self.doctor.id, service_id=self.service.id,
            start_datetime=start, end_datetime=start + datetime.timedelta(minutes=30),
            patient_name='Amina Endpoint', patient_phone=phone, is_hold=False,
        )

    def _body(self, **extra):
        day = self._next_monday()
        return {
            'reason': 'Planned leave',
            'leave_start': timezone.make_aware(
                datetime.datetime.combine(day, datetime.time(8, 0))
            ).isoformat(),
            'leave_end': timezone.make_aware(
                datetime.datetime.combine(day, datetime.time(23, 59))
            ).isoformat(),
            **extra,
        }

    def test_preview_accepts_the_chosen_colleague_and_cap(self):
        self._book()
        self.client.force_authenticate(user=self.receptionist)
        res = self.client.post(
            f"/api/v1/disruptions/{self.doctor.id}/preview/",
            self._body(colleague_ids=[str(self.okafor.id)], colleague_caps={str(self.okafor.id): 1}),
            format='json',
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['distribution']['colleague_ids'], [str(self.okafor.id)])
        self.assertEqual(res.data['results'][0]['new_doctor'], 'Dr. Chinwe Endpoint')

    def test_auto_resolve_applies_the_same_choice(self):
        self._book()
        self.client.force_authenticate(user=self.receptionist)
        res = self.client.post(
            f"/api/v1/disruptions/{self.doctor.id}/auto-resolve/",
            self._body(colleague_ids=[str(self.okafor.id)]),
            format='json',
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['results'][0]['new_doctor'], 'Dr. Chinwe Endpoint')

    def test_wrong_shape_is_a_clear_400(self):
        self.client.force_authenticate(user=self.receptionist)
        res = self.client.post(
            f"/api/v1/disruptions/{self.doctor.id}/preview/",
            self._body(colleague_caps=[1, 2]),
            format='json',
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res.data['error'], 'INVALID_DISTRIBUTION')
        self.assertIn('colleague_caps', res.data['detail'])

    def test_unknown_colleague_is_a_clear_400(self):
        self.client.force_authenticate(user=self.receptionist)
        res = self.client.post(
            f"/api/v1/disruptions/{self.doctor.id}/preview/",
            self._body(colleague_ids=[str(uuid.uuid4())]),
            format='json',
        )

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res.data['error'], 'INVALID_DISTRIBUTION')
        self.assertIn('active doctor', res.data['detail'])


class DispatchContractEnrichmentTests(APITestCase):
    """
    Task 3.5 — Workflow D contract enrichment:
    - the n8n dispatch payload now carries clinic_name, expiry_minutes,
      offer_expires_at and pre-formatted date_label/time_label per slot
      (so n8n does no timezone math),
    - Django's own Telegram send is logged to the InteractionLog (sent/failed),
    - GET dispatch-status/ lets n8n skip the 30s voice nudge when the patient
      already replied (readable with X-Webhook-Secret).
    """

    def setUp(self):
        cache.clear()
        self.clinic = ClinicSetting.get_settings()
        self.clinic.webhook_secret = 'clinic_dev_secret_2026'
        self.clinic.clinic_name = 'Cedarcare Specialist Clinic'
        self.clinic.offer_expiry_minutes = 60
        self.clinic.save()

        self.receptionist = StaffUser.objects.create(
            full_name='Sarah Contract', email='sarah.contract@clinic.com',
            role='receptionist', is_active=True,
        )
        self.receptionist.set_password('SarahPass123!')
        self.receptionist.save()

        self.service = Service.objects.create(
            name='Dental Consultation', duration_minutes=30, buffer_minutes=5, price=10000,
        )
        self.doctor = Doctor.objects.create(
            name='Dr. Contract Test',
            working_days=[1, 2, 3, 4, 5, 6],
            shift_start=datetime.time(8, 0), shift_end=datetime.time(18, 0),
        )
        self.booking = BookingRequest.objects.create(
            request_code='REQ-2026-0300',
            patient_name='Grace Contract',
            patient_phone='+2348077770001',
            service=self.service,
            status='awaiting_review',
        )

    def tearDown(self):
        cache.clear()

    def _slot_payload(self):
        slot_start = next_legal_slot(10)
        return {'slots': [{
            'doctor_id': str(self.doctor.id),
            'start_datetime': slot_start.isoformat(),
            'end_datetime': (slot_start + datetime.timedelta(minutes=30)).isoformat(),
            'is_alternative_date': False,
        }]}

    def _dispatch(self, extra=None):
        payload = self._slot_payload()
        if extra:
            payload.update(extra)
        with self.captureOnCommitCallbacks(execute=True):
            return self.client.post(
                f'/api/v1/booking-requests/{self.booking.request_code}/dispatch-offers/',
                payload, format='json'
            )

    def test_payload_is_enriched_for_n8n(self):
        import os
        from unittest.mock import patch
        self.client.force_authenticate(user=self.receptionist)
        with patch.dict(os.environ, {'N8N_DISPATCH_WEBHOOK_URL': 'https://n8n.example.com/dispatch'}), \
                patch('appointments.views_booking.fire_and_forget_webhook') as mock_fire:
            res = self._dispatch()
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        payload = mock_fire.call_args[0][1]

        self.assertEqual(payload['clinic_name'], 'Cedarcare Specialist Clinic')
        self.assertEqual(payload['expiry_minutes'], 60)
        self.assertIn('offer_expires_at', payload)
        slot = payload['candidate_slots'][0]
        self.assertTrue(slot['date_label'])
        self.assertTrue(slot['time_label'])
        # e.g. "Tue, 10 Nov 2026" / "1:05 PM" — no ISO string needed by n8n
        self.assertIn(',', slot['date_label'])
        self.assertTrue(slot['time_label'].endswith('AM') or slot['time_label'].endswith('PM'))

    def test_telegram_send_is_logged_as_sent(self):
        from unittest.mock import patch
        self.client.force_authenticate(user=self.receptionist)
        self.booking.patient_notes = 'telegram_chat_id: 55881'
        self.booking.save(update_fields=['patient_notes'])

        with patch('appointments.views_booking.TelegramService') as mock_tg, \
                patch('appointments.views_booking.fire_and_forget_webhook'):
            mock_tg.format_slot_offers.return_value = ('Offer text', 'Markup')
            mock_tg.send_message.return_value = {'ok': True, 'result': {'message_id': 9001}}
            res = self._dispatch()
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        log = InteractionLog.objects.get(external_ref='telegram-msg-9001')
        self.assertEqual(log.provider, 'telegram')
        self.assertEqual(log.channel, 'telegram')
        self.assertEqual(log.status, 'sent')
        self.assertEqual(log.booking_request_id, self.booking.id)

    def test_telegram_failure_is_logged_and_surfaces_as_needs_attention(self):
        from unittest.mock import patch
        self.client.force_authenticate(user=self.receptionist)
        self.booking.patient_notes = 'telegram_chat_id: 55882'
        self.booking.save(update_fields=['patient_notes'])

        with patch('appointments.views_booking.TelegramService') as mock_tg, \
                patch('appointments.views_booking.fire_and_forget_webhook'):
            mock_tg.format_slot_offers.return_value = ('Offer text', 'Markup')
            mock_tg.send_message.side_effect = Exception('telegram network down')
            res = self._dispatch()
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        log = InteractionLog.objects.get(booking_request=self.booking, status='failed')
        self.assertIn('telegram network down', log.error_detail)

        res = self.client.get('/api/v1/booking-requests/?status=slots_offered')
        item = next(i for i in res.data if i['request_code'] == 'REQ-2026-0300')
        self.assertEqual(item['delivery_failures'], 1)
        self.assertEqual(item['last_failure']['channel'], 'telegram')

    def test_dispatch_status_requires_secret_or_staff(self):
        res = self.client.get(f'/api/v1/booking-requests/{self.booking.request_code}/dispatch-status/')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_dispatch_status_reports_proceed_then_skip(self):
        # 1. Nobody has replied yet → n8n should place the call
        res = self.client.get(
            f'/api/v1/booking-requests/{self.booking.request_code}/dispatch-status/',
            HTTP_X_WEBHOOK_SECRET='clinic_dev_secret_2026',
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertFalse(res.data['should_skip_voice_call'])
        self.assertFalse(res.data['has_active_hold'])

        # 2. Patient selected an option (active 15-min hold) → skip the call
        Appointment.objects.create(
            appointment_code='AP-3001',
            patient_name=self.booking.patient_name,
            patient_phone=self.booking.patient_phone,
            doctor=self.doctor,
            service=self.service,
            booking_request=self.booking,
            start_datetime=timezone.now() + datetime.timedelta(days=1),
            end_datetime=timezone.now() + datetime.timedelta(days=1, minutes=30),
            status='held',
            hold_expires_at=timezone.now() + datetime.timedelta(minutes=15),
        )
        res = self.client.get(
            f'/api/v1/booking-requests/{self.booking.request_code}/dispatch-status/',
            HTTP_X_WEBHOOK_SECRET='clinic_dev_secret_2026',
        )
        self.assertTrue(res.data['should_skip_voice_call'])
        self.assertTrue(res.data['has_active_hold'])
        self.assertEqual(res.data['appointment_code'], 'AP-3001')

        # 3. Confirmed booking also skips
        Appointment.objects.filter(appointment_code='AP-3001').update(status='confirmed')
        res = self.client.get(
            f'/api/v1/booking-requests/{self.booking.request_code}/dispatch-status/',
            HTTP_X_WEBHOOK_SECRET='clinic_dev_secret_2026',
        )
        self.assertTrue(res.data['should_skip_voice_call'])
        self.assertTrue(res.data['has_confirmed_booking'])


class ChannelAvailabilityTests(APITestCase):
    """
    Option B, Layer 1 — read-only channel availability resolver + endpoint.

    Purely additive: DispatchOffersView is untouched in this layer, so these
    tests also assert that availability reporting changes no dispatch behaviour.

    Coverage:
    - resolver: no providers + no Telegram → `none` is True,
    - Telegram chat id + bot token makes the `whatsapp` leg reachable via Telegram
      (matching what DispatchOffersView actually does today),
    - explicit provider flags (SMS_ENABLED / VOICE_ENABLED / WHATSAPP_ENABLED) mark
      the matching channel reachable,
    - a chat id without a bot token is NOT reachable,
    - GET endpoint: 200 shape, 401 unauthenticated, 404 unknown request.
    """

    def setUp(self):
        cache.clear()
        self.receptionist = StaffUser.objects.create(
            full_name='Sarah Availability',
            email='sarah.availability@clinic.com',
            role='receptionist',
            is_active=True,
        )
        self.receptionist.set_password('SarahPass123!')
        self.receptionist.save()

        self.service = Service.objects.create(
            name='Dental Consultation', duration_minutes=30, buffer_minutes=5, price=10000,
        )
        self.booking = BookingRequest.objects.create(
            request_code='REQ-2026-0400',
            patient_name='Grace Availability',
            patient_phone='+2348088880001',
            service=self.service,
            status='awaiting_review',
        )

    def tearDown(self):
        cache.clear()

    def _flags(self, **overrides):
        """Deterministic provider flags regardless of the developer's shell env."""
        values = {'WHATSAPP_ENABLED': '', 'SMS_ENABLED': '', 'VOICE_ENABLED': ''}
        values.update(overrides)
        import os
        from unittest.mock import patch
        return patch.dict(os.environ, values)

    def _url(self):
        return f'/api/v1/booking-requests/{self.booking.request_code}/channel-availability/'

    # ---------------------------------------------------------------- resolver
    def test_no_providers_and_no_telegram_reports_none(self):
        from .services.channel_availability import resolve_channel_availability
        with self._flags(), override_settings(TELEGRAM_BOT_TOKEN=''):
            data = resolve_channel_availability(self.booking)

        self.assertTrue(data['none'])
        self.assertEqual(data['reachable'], [])
        self.assertEqual(data['unreachable'], ['whatsapp', 'sms', 'voice'])
        self.assertIsNone(data['telegram_chat_id'])
        self.assertFalse(data['channels']['telegram']['reachable'])

    def test_telegram_chat_id_and_token_makes_whatsapp_leg_reachable(self):
        from .services.channel_availability import resolve_channel_availability
        self.booking.patient_notes = 'telegram_chat_id: 55882'
        self.booking.save(update_fields=['patient_notes'])

        with self._flags(), override_settings(TELEGRAM_BOT_TOKEN='test-bot-token'):
            data = resolve_channel_availability(self.booking)

        self.assertFalse(data['none'])
        self.assertEqual(data['telegram_chat_id'], '55882')
        self.assertIn('whatsapp', data['reachable'])
        self.assertEqual(data['channels']['whatsapp']['via'], 'telegram')
        self.assertNotIn('sms', data['reachable'])
        self.assertNotIn('voice', data['reachable'])
        self.assertTrue(data['channels']['telegram']['reachable'])

    def test_explicit_provider_flags_mark_channels_reachable(self):
        from .services.channel_availability import resolve_channel_availability
        with self._flags(WHATSAPP_ENABLED='true', SMS_ENABLED='true', VOICE_ENABLED='true'), \
                override_settings(TELEGRAM_BOT_TOKEN=''):
            data = resolve_channel_availability(self.booking)

        self.assertFalse(data['none'])
        self.assertEqual(sorted(data['reachable']), ['sms', 'voice', 'whatsapp'])
        self.assertEqual(data['channels']['whatsapp']['via'], 'whatsapp')
        self.assertIsNone(data['channels']['sms']['reason'])

    def test_chat_id_without_bot_token_is_not_reachable(self):
        from .services.channel_availability import resolve_channel_availability
        self.booking.patient_notes = 'telegram_chat_id: 55882'
        self.booking.save(update_fields=['patient_notes'])

        with self._flags(), override_settings(TELEGRAM_BOT_TOKEN=''):
            data = resolve_channel_availability(self.booking)

        self.assertEqual(data['telegram_chat_id'], '55882')
        self.assertFalse(data['channels']['whatsapp']['reachable'])
        self.assertTrue(data['none'])

    def test_explicit_request_chat_id_overrides_stored_value(self):
        from .services.channel_availability import resolve_channel_availability
        with self._flags(), override_settings(TELEGRAM_BOT_TOKEN='test-bot-token'):
            data = resolve_channel_availability(
                self.booking, request_data={'telegram_chat_id': '99001'}
            )

        self.assertEqual(data['telegram_chat_id'], '99001')
        self.assertIn('whatsapp', data['reachable'])

    def test_phoneless_booking_reaches_nothing_without_telegram(self):
        # Phase 2: reachability must reflect the patient's data, not just the
        # provider flags — a booking with no number cannot be texted, called or
        # messaged, and pretending otherwise hides the problem until after
        # dispatch. The Telegram card is the one road that needs no phone.
        from .services.channel_availability import (
            resolve_channel_availability, build_delivery_plan,
        )
        self.booking.patient_phone = ''
        self.booking.save(update_fields=['patient_phone'])

        with self._flags(WHATSAPP_ENABLED='true', SMS_ENABLED='true', VOICE_ENABLED='true'), \
                override_settings(TELEGRAM_BOT_TOKEN=''):
            data = resolve_channel_availability(self.booking)
            plan = build_delivery_plan(data, ['whatsapp', 'sms', 'voice'])

        self.assertTrue(data['none'])
        self.assertEqual(data['unreachable'], ['whatsapp', 'sms', 'voice'])
        for channel in ('whatsapp', 'sms', 'voice'):
            self.assertEqual(
                data['channels'][channel]['reason'],
                'No phone number on file for this patient.',
                f'{channel} should name the missing phone number',
            )
        self.assertIn('nothing will be delivered', plan['warning'])

    def test_phoneless_booking_whatsapp_still_reachable_via_telegram(self):
        # Even with every provider flag on, a phoneless patient's only honest
        # instant-message road is the Telegram card — 'via' must say so.
        from .services.channel_availability import resolve_channel_availability
        self.booking.patient_phone = ''
        self.booking.patient_notes = 'telegram_chat_id: 55882'
        self.booking.save(update_fields=['patient_phone', 'patient_notes'])

        with self._flags(WHATSAPP_ENABLED='true', SMS_ENABLED='true', VOICE_ENABLED='true'), \
                override_settings(TELEGRAM_BOT_TOKEN='test-bot-token'):
            data = resolve_channel_availability(self.booking)

        self.assertFalse(data['none'])
        self.assertIn('whatsapp', data['reachable'])
        self.assertEqual(data['channels']['whatsapp']['via'], 'telegram')
        self.assertNotIn('sms', data['reachable'])
        self.assertNotIn('voice', data['reachable'])
        self.assertEqual(
            data['channels']['sms']['reason'],
            'No phone number on file for this patient.',
        )

    # ---------------------------------------------------------------- endpoint
    def test_endpoint_returns_availability_shape(self):
        self.client.force_authenticate(user=self.receptionist)
        self.booking.patient_notes = 'telegram_chat_id: 55882'
        self.booking.save(update_fields=['patient_notes'])

        with self._flags(), override_settings(TELEGRAM_BOT_TOKEN='test-bot-token'):
            res = self.client.get(self._url())

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['request_id'], 'REQ-2026-0400')
        self.assertIn('channels', res.data)
        self.assertIn('whatsapp', res.data['reachable'])
        self.assertFalse(res.data['none'])
        self.assertEqual(
            set(res.data['channels'].keys()),
            {'whatsapp', 'sms', 'voice', 'telegram'},
        )

    def test_endpoint_requires_staff_auth(self):
        res = self.client.get(self._url())
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_endpoint_unknown_request_returns_404(self):
        self.client.force_authenticate(user=self.receptionist)
        res = self.client.get('/api/v1/booking-requests/REQ-2099-9999/channel-availability/')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)


class DispatchDeliveryAdvisoryTests(APITestCase):
    """
    Option B, Layer 2 — advisory `delivery` / `delivery_warning` on dispatch.

    These tests pin the safety properties of the layer:
    - dispatch still returns 200 and still creates the offers (nothing blocked),
    - every pre-existing response key is still present,
    - the advisory tells the truth about reachable / unreachable channels,
    - `PATIENT_ALREADY_BOOKED` still wins (first guard, unchanged precedence).
    """

    def setUp(self):
        cache.clear()
        self.clinic = ClinicSetting.get_settings()
        self.receptionist = StaffUser.objects.create(
            full_name='Sarah Advisory',
            email='sarah.advisory@clinic.com',
            role='receptionist',
            is_active=True,
        )
        self.receptionist.set_password('SarahPass123!')
        self.receptionist.save()
        self.client.force_authenticate(user=self.receptionist)

        self.service = Service.objects.create(
            name='Dental Consultation', duration_minutes=30, buffer_minutes=5, price=10000,
        )
        self.doctor = Doctor.objects.create(
            name='Dr. Advisory Test',
            working_days=[1, 2, 3, 4, 5, 6],
            shift_start=datetime.time(8, 0), shift_end=datetime.time(18, 0),
        )
        self.booking = BookingRequest.objects.create(
            request_code='REQ-2026-0500',
            patient_name='Grace Advisory',
            patient_phone='+2348099990001',
            service=self.service,
            status='awaiting_review',
        )

    def tearDown(self):
        cache.clear()

    def _flags(self, **overrides):
        import os
        from unittest.mock import patch
        values = {
            'WHATSAPP_ENABLED': '',
            'SMS_ENABLED': '',
            'VOICE_ENABLED': '',
            'N8N_DISPATCH_WEBHOOK_URL': '',
        }
        values.update(overrides)
        return patch.dict(os.environ, values)

    def _dispatch(self, extra=None):
        slot_start = next_legal_slot(10)
        payload = {'slots': [{
            'doctor_id': str(self.doctor.id),
            'start_datetime': slot_start.isoformat(),
            'end_datetime': (slot_start + datetime.timedelta(minutes=30)).isoformat(),
            'is_alternative_date': False,
        }]}
        if extra:
            payload.update(extra)
        with self.captureOnCommitCallbacks(execute=True):
            return self.client.post(
                f'/api/v1/booking-requests/{self.booking.request_code}/dispatch-offers/',
                payload, format='json',
            )

    def test_no_reachable_channel_is_advisory_only(self):
        with self._flags(), override_settings(TELEGRAM_BOT_TOKEN=''):
            res = self._dispatch()

        # Behaviour unchanged: still succeeds and still creates the offers.
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['status'], 'slots_offered')
        self.assertEqual(len(res.data['offers']), 1)
        self.assertEqual(
            SlotOffer.objects.filter(request=self.booking).count(), 1
        )

        self.assertEqual(res.data['delivery']['requested'], ['whatsapp', 'sms', 'voice'])
        self.assertEqual(res.data['delivery']['reachable'], [])
        self.assertEqual(
            res.data['delivery']['unreachable'], ['whatsapp', 'sms', 'voice']
        )
        self.assertIn('None of the selected channels', res.data['delivery_warning'])
        self.assertEqual(res.data['delivery_warning'], res.data['delivery']['warning'])

    def test_partial_reachability_via_telegram_is_reported(self):
        self.booking.patient_notes = 'telegram_chat_id: 55882'
        self.booking.save(update_fields=['patient_notes'])

        from unittest.mock import patch
        with self._flags(), override_settings(TELEGRAM_BOT_TOKEN='test-bot-token'), \
                patch('appointments.views_booking.TelegramService') as mock_tg:
            mock_tg.format_slot_offers.return_value = ('Offer text', 'Markup')
            mock_tg.send_message.return_value = {'ok': True, 'result': {'message_id': 77}}
            res = self._dispatch({'dispatch_channels': ['whatsapp', 'sms']})

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['delivery']['requested'], ['whatsapp', 'sms'])
        self.assertEqual(res.data['delivery']['reachable'], ['whatsapp'])
        self.assertEqual(res.data['delivery']['unreachable'], ['sms'])
        self.assertIn('SMS cannot reach this patient', res.data['delivery_warning'])
        self.assertIn('only WhatsApp will be used', res.data['delivery_warning'])

    def test_warning_is_none_when_every_selected_channel_is_reachable(self):
        with self._flags(WHATSAPP_ENABLED='true', SMS_ENABLED='true', VOICE_ENABLED='true'), \
                override_settings(TELEGRAM_BOT_TOKEN=''):
            res = self._dispatch()

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['delivery']['unreachable'], [])
        self.assertIsNone(res.data['delivery_warning'])

    def test_existing_response_keys_are_preserved(self):
        with self._flags(), override_settings(TELEGRAM_BOT_TOKEN=''):
            res = self._dispatch()

        for key in ('detail', 'request_id', 'status', 'offer_expires_at',
                    'offers', 'telegram_payload'):
            self.assertIn(key, res.data)

    def test_patient_already_booked_still_wins(self):
        Appointment.objects.create(
            appointment_code='AP-5001',
            patient_name=self.booking.patient_name,
            patient_phone=self.booking.patient_phone,
            doctor=self.doctor,
            service=self.service,
            booking_request=self.booking,
            start_datetime=timezone.now() + datetime.timedelta(days=1),
            end_datetime=timezone.now() + datetime.timedelta(days=1, minutes=30),
            status='held',
            hold_expires_at=timezone.now() + datetime.timedelta(minutes=10),
        )

        with self._flags(), override_settings(TELEGRAM_BOT_TOKEN=''):
            res = self._dispatch()

        self.assertEqual(res.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(res.data['error'], 'PATIENT_ALREADY_BOOKED')
        self.assertNotIn('delivery', res.data)


class DispatchEnforcementTests(APITestCase):
    """
    Option B, Layer 4 — `DISPATCH_REQUIRE_REACHABLE_CHANNEL` (DEFAULT OFF).

    Off: behaviour is exactly today's (200 + advisory warning).
    On:  a selection that reaches nobody is refused with 409 NO_REACHABLE_CHANNEL
         BEFORE any offer is deleted/created and before any provider is called.
    """

    def setUp(self):
        cache.clear()
        self.clinic = ClinicSetting.get_settings()
        self.receptionist = StaffUser.objects.create(
            full_name='Sarah Enforcement',
            email='sarah.enforcement@clinic.com',
            role='receptionist',
            is_active=True,
        )
        self.receptionist.set_password('SarahPass123!')
        self.receptionist.save()
        self.client.force_authenticate(user=self.receptionist)

        self.service = Service.objects.create(
            name='Dental Consultation', duration_minutes=30, buffer_minutes=5, price=10000,
        )
        self.doctor = Doctor.objects.create(
            name='Dr. Enforcement Test',
            working_days=[1, 2, 3, 4, 5, 6],
            shift_start=datetime.time(8, 0), shift_end=datetime.time(18, 0),
        )
        self.booking = BookingRequest.objects.create(
            request_code='REQ-2026-0600',
            patient_name='Grace Enforcement',
            patient_phone='+2348011110001',
            service=self.service,
            status='awaiting_review',
        )

    def tearDown(self):
        cache.clear()

    def _flags(self, **overrides):
        import os
        from unittest.mock import patch
        values = {
            'WHATSAPP_ENABLED': '',
            'SMS_ENABLED': '',
            'VOICE_ENABLED': '',
            'N8N_DISPATCH_WEBHOOK_URL': '',
        }
        values.update(overrides)
        return patch.dict(os.environ, values)

    def _slot_payload(self):
        slot_start = next_legal_slot(10)
        return {'slots': [{
            'doctor_id': str(self.doctor.id),
            'start_datetime': slot_start.isoformat(),
            'end_datetime': (slot_start + datetime.timedelta(minutes=30)).isoformat(),
            'is_alternative_date': False,
        }]}

    def _dispatch(self, extra=None):
        payload = self._slot_payload()
        if extra:
            payload.update(extra)
        with self.captureOnCommitCallbacks(execute=True):
            return self.client.post(
                f'/api/v1/booking-requests/{self.booking.request_code}/dispatch-offers/',
                payload, format='json',
            )

    def test_flag_is_off_by_default(self):
        from django.conf import settings
        self.assertFalse(settings.DISPATCH_REQUIRE_REACHABLE_CHANNEL)

    def test_off_still_dispatches_with_no_reachable_channel(self):
        with self._flags(), override_settings(
            TELEGRAM_BOT_TOKEN='', DISPATCH_REQUIRE_REACHABLE_CHANNEL=False
        ):
            res = self._dispatch()

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['delivery']['reachable'], [])
        self.assertTrue(res.data['delivery_warning'])

    def test_on_refuses_with_no_reachable_channel(self):
        old_offer = SlotOffer.objects.create(
            request=self.booking,
            doctor=self.doctor,
            start_datetime=timezone.now() + datetime.timedelta(days=2),
            end_datetime=timezone.now() + datetime.timedelta(days=2, minutes=30),
            expires_at=timezone.now() + datetime.timedelta(days=2, minutes=90),
        )

        with self._flags(), override_settings(
            TELEGRAM_BOT_TOKEN='', DISPATCH_REQUIRE_REACHABLE_CHANNEL=True
        ):
            res = self._dispatch()

        self.assertEqual(res.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(res.data['error'], 'NO_REACHABLE_CHANNEL')
        self.assertIn('reach this patient', res.data['detail'])
        self.assertEqual(res.data['delivery']['reachable'], [])
        self.assertEqual(res.data['delivery']['unreachable'], ['whatsapp', 'sms', 'voice'])

        # No side effects: nothing deleted, nothing created, request untouched.
        self.booking.refresh_from_db()
        self.assertEqual(self.booking.status, 'awaiting_review')
        self.assertIsNone(self.booking.offer_expires_at)
        self.assertEqual(SlotOffer.objects.filter(request=self.booking).count(), 1)
        self.assertTrue(SlotOffer.objects.filter(id=old_offer.id).exists())

    def test_on_allows_dispatch_when_telegram_can_reach_patient(self):
        self.booking.patient_notes = 'telegram_chat_id: 55882'
        self.booking.save(update_fields=['patient_notes'])

        from unittest.mock import patch
        with self._flags(), override_settings(
            TELEGRAM_BOT_TOKEN='test-bot-token', DISPATCH_REQUIRE_REACHABLE_CHANNEL=True
        ), patch('appointments.views_booking.TelegramService') as mock_tg:
            mock_tg.format_slot_offers.return_value = ('Offer text', 'Markup')
            mock_tg.send_message.return_value = {'ok': True, 'result': {'message_id': 88}}
            res = self._dispatch()

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['delivery']['reachable'], ['whatsapp'])

    def test_on_allows_partial_selection_when_one_channel_reaches(self):
        self.booking.patient_notes = 'telegram_chat_id: 55882'
        self.booking.save(update_fields=['patient_notes'])

        from unittest.mock import patch
        with self._flags(), override_settings(
            TELEGRAM_BOT_TOKEN='test-bot-token', DISPATCH_REQUIRE_REACHABLE_CHANNEL=True
        ), patch('appointments.views_booking.TelegramService') as mock_tg:
            mock_tg.format_slot_offers.return_value = ('Offer text', 'Markup')
            mock_tg.send_message.return_value = {'ok': True, 'result': {'message_id': 89}}
            res = self._dispatch({'dispatch_channels': ['whatsapp', 'sms']})

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['delivery']['reachable'], ['whatsapp'])
        self.assertEqual(res.data['delivery']['unreachable'], ['sms'])

    def test_on_keeps_patient_already_booked_precedence(self):
        Appointment.objects.create(
            appointment_code='AP-6001',
            patient_name=self.booking.patient_name,
            patient_phone=self.booking.patient_phone,
            doctor=self.doctor,
            service=self.service,
            booking_request=self.booking,
            start_datetime=timezone.now() + datetime.timedelta(days=1),
            end_datetime=timezone.now() + datetime.timedelta(days=1, minutes=30),
            status='held',
            hold_expires_at=timezone.now() + datetime.timedelta(minutes=10),
        )

        with self._flags(), override_settings(
            TELEGRAM_BOT_TOKEN='', DISPATCH_REQUIRE_REACHABLE_CHANNEL=True
        ):
            res = self._dispatch()

        self.assertEqual(res.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(res.data['error'], 'PATIENT_ALREADY_BOOKED')


class PatientReplyWebhookTests(APITestCase):
    """
    Workflow C / C.1 (2026-11-16) — the channel-neutral patient-reply endpoint.

        POST /api/v1/webhooks/patient-reply/
        X-Webhook-Secret: <shared>          (fail closed)
        {"phone", "text", "channel", "provider_message_id"}

    Telegram already works because its button carries `select_slot_<offer>`. An SMS
    says only "2" plus the sender's number, so Django must answer two questions:
    which open request belongs to this phone, and which offer is number 2.

    The endpoint owns INTERPRETATION; n8n stays a transport that delivers `reply_text`.
    Tests R1-R12 pin: resolution (R3, R8), select intent (R1, R4, R5, R11),
    idempotency (R2, R12), lifecycle effects (R6, R7), auth (R9), inbound logging (R10).
    """

    ENDPOINT = '/api/v1/webhooks/patient-reply/'
    SECRET = 'clinic_dev_secret_2026'

    def setUp(self):
        cache.clear()
        self.clinic = ClinicSetting.get_settings()
        self.clinic.webhook_secret = self.SECRET
        self.clinic.save()

        self.doctor = Doctor.objects.create(
            name='Dr. Reply Doctor',
            specialty='Dental Surgery',
            working_days=[1, 2, 3, 4, 5],
            shift_start=datetime.time(9, 0),
            shift_end=datetime.time(17, 0),
        )
        self.service = Service.objects.create(
            name='Dental Consultation',
            duration_minutes=30,
            buffer_minutes=5,
            price=10000,
        )
        self.booking = BookingRequest.objects.create(
            request_code='REQ-2026-0101',
            patient_name='Amina Reply',
            patient_phone='+2348030001122',
            service=self.service,
            status='slots_offered',
        )
        # Three offers, deliberately NOT in start-time order (same shape as
        # SlotOptionNumberHoldTests): "2" must mean the 2nd offer in ORIGINAL
        # dispatch order, never the 2nd-earliest time.
        base = timezone.make_aware(datetime.datetime(2026, 12, 1, 10, 0, 0))
        self.offer1 = SlotOffer.objects.create(
            request=self.booking, doctor=self.doctor,
            start_datetime=base, end_datetime=base + datetime.timedelta(minutes=30),
            expires_at=timezone.now() + datetime.timedelta(minutes=60),
        )
        self.offer2 = SlotOffer.objects.create(
            request=self.booking, doctor=self.doctor,
            start_datetime=base - datetime.timedelta(hours=1),
            end_datetime=base - datetime.timedelta(hours=1) + datetime.timedelta(minutes=30),
            expires_at=timezone.now() + datetime.timedelta(minutes=60),
        )
        self.offer3 = SlotOffer.objects.create(
            request=self.booking, doctor=self.doctor,
            start_datetime=base + datetime.timedelta(hours=2),
            end_datetime=base + datetime.timedelta(hours=2) + datetime.timedelta(minutes=30),
            expires_at=timezone.now() + datetime.timedelta(minutes=60),
        )
        t0 = timezone.now()
        SlotOffer.objects.filter(id=self.offer1.id).update(offered_at=t0 - datetime.timedelta(minutes=2))
        SlotOffer.objects.filter(id=self.offer2.id).update(offered_at=t0 - datetime.timedelta(minutes=1))
        SlotOffer.objects.filter(id=self.offer3.id).update(offered_at=t0)

    def tearDown(self):
        cache.clear()

    def _reply(self, payload=None, secret='__default__'):
        body = {
            'phone': '+2348030001122',
            'text': '2',
            'channel': 'sms',
            'provider_message_id': 'vb-in-0001',
        }
        if payload:
            body.update(payload)
        kwargs = {'format': 'json'}
        if secret == '__default__':
            kwargs['HTTP_X_WEBHOOK_SECRET'] = self.SECRET
        elif secret is not None:
            kwargs['HTTP_X_WEBHOOK_SECRET'] = secret
        return self.client.post(self.ENDPOINT, body, **kwargs)

    # --- R1: select by option number -------------------------------------

    def test_r1_option_two_holds_the_second_dispatched_offer(self):
        res = self._reply({'text': '2', 'provider_message_id': 'vb-in-1001'})

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['status'], 'held')
        self.assertEqual(res.data['intent'], 'select')
        self.assertTrue(res.data['appointment_code'].startswith('AP-'))
        self.assertEqual(res.data['request_id'], 'REQ-2026-0101')

        self.assertEqual(Appointment.objects.filter(booking_request=self.booking).count(), 1)
        self.offer2.refresh_from_db()
        self.assertTrue(self.offer2.is_selected)
        self.offer1.refresh_from_db()
        self.assertFalse(self.offer1.is_selected)

        # The reply names the slot the patient actually picked (early offer, not 10:00).
        expected_time = timezone.localtime(self.offer2.start_datetime).strftime('%I:%M %p')
        self.assertIn(expected_time, res.data['reply_text'])

    # --- R2: provider retries the same message ---------------------------

    def test_r2_same_provider_message_id_is_duplicate_ignored(self):
        first = self._reply({'text': '2', 'provider_message_id': 'vb-in-1002'})
        self.assertEqual(first.data['status'], 'held')

        second = self._reply({'text': '2', 'provider_message_id': 'vb-in-1002'})
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(second.data['status'], 'duplicate_ignored')

        self.assertEqual(Appointment.objects.filter(booking_request=self.booking).count(), 1)
        self.assertEqual(
            InteractionLog.objects.filter(
                direction='inbound', external_ref='vb-in-1002'
            ).count(),
            1,
        )

    # --- R3: phone with no open request ----------------------------------

    def test_r3_unknown_phone_is_a_normal_unmatched_answer(self):
        res = self._reply({
            'phone': '+2348099990000',
            'text': '2',
            'provider_message_id': 'vb-in-1003',
        })

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['status'], 'unmatched')
        self.assertEqual(res.data['intent'], 'none')
        self.assertTrue(res.data['reply_text'])
        self.assertEqual(Appointment.objects.count(), 0)
        self.assertEqual(InteractionLog.objects.count(), 0)

    # --- R4: option number with no matching offer ------------------------

    def test_r4_option_nine_is_out_of_range_without_a_hold(self):
        res = self._reply({'text': '9', 'provider_message_id': 'vb-in-1004'})

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['status'], 'out_of_range')
        self.assertEqual(res.data['intent'], 'select')
        self.assertIsNone(res.data.get('appointment_code'))
        self.assertTrue(res.data['reply_text'])
        self.assertEqual(Appointment.objects.count(), 0)
        self.assertFalse(SlotOffer.objects.filter(is_selected=True).exists())

    # --- R5: the 60-minute window has passed -----------------------------

    def test_r5_expired_offers_do_not_hold(self):
        SlotOffer.objects.filter(request=self.booking).update(
            expires_at=timezone.now() - datetime.timedelta(minutes=1)
        )
        res = self._reply({'text': '2', 'provider_message_id': 'vb-in-1005'})

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['status'], 'expired')
        self.assertTrue(res.data['reply_text'])
        self.assertEqual(Appointment.objects.count(), 0)

    # --- R6: cancel ------------------------------------------------------

    def test_r6_cancel_cancels_the_live_appointment(self):
        appt = Appointment.objects.create(
            appointment_code='AP-7106',
            patient_name=self.booking.patient_name,
            patient_phone=self.booking.patient_phone,
            doctor=self.doctor,
            service=self.service,
            booking_request=self.booking,
            start_datetime=self.offer1.start_datetime,
            end_datetime=self.offer1.end_datetime,
            status='confirmed',
            confirmed_at=timezone.now(),
        )

        res = self._reply({'text': 'cancel', 'provider_message_id': 'vb-in-1006'})

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['status'], 'cancelled')
        self.assertEqual(res.data['intent'], 'cancel')
        self.assertIn('cancel', res.data['reply_text'].lower())
        appt.refresh_from_db()
        self.assertEqual(appt.status, 'cancelled')
        self.assertIsNotNone(appt.cancelled_at)
        self.assertEqual(res.data['appointment_code'], 'AP-7106')

    # --- R7: reschedule --------------------------------------------------

    def test_r7_reschedule_moves_the_request_to_priority_tab(self):
        self.booking.status = 'offer_expired'
        self.booking.save(update_fields=['status'])

        res = self._reply({'text': 'reschedule', 'provider_message_id': 'vb-in-1007'})

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['status'], 're_requested')
        self.assertEqual(res.data['intent'], 'reschedule')
        self.assertTrue(res.data['reply_text'])
        self.booking.refresh_from_db()
        self.assertEqual(self.booking.status, 're_requested')
        self.assertTrue(
            AuditLog.objects.filter(
                entity_id=self.booking.id,
                action='PATIENT_RE_REQUESTED_TIMES',
            ).exists()
        )

    # --- R8: local phone format ------------------------------------------

    def test_r8_local_phone_resolves_to_the_same_patient(self):
        res = self._reply({
            'phone': '08030001122',
            'text': '1',
            'provider_message_id': 'vb-in-1008',
        })

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['status'], 'held')
        appointment = Appointment.objects.get(booking_request=self.booking)
        self.assertEqual(appointment.patient_phone, '+2348030001122')

    # --- R9: fail-closed auth --------------------------------------------

    def test_r9_missing_or_wrong_secret_rejects_without_writing(self):
        missing = self._reply({'provider_message_id': 'vb-in-1009'}, secret=None)
        self.assertEqual(missing.status_code, status.HTTP_401_UNAUTHORIZED)

        wrong = self._reply({'provider_message_id': 'vb-in-1009b'}, secret='attacker-guess-123')
        self.assertEqual(wrong.status_code, status.HTTP_401_UNAUTHORIZED)

        self.assertEqual(Appointment.objects.count(), 0)
        self.assertEqual(InteractionLog.objects.count(), 0)

    # --- R10: the patient's side of the conversation is recorded ---------

    def test_r10_one_inbound_interaction_row_is_written(self):
        res = self._reply({'text': '2', 'channel': 'sms', 'provider_message_id': 'vb-in-1010'})
        self.assertEqual(res.data['status'], 'held')

        log = InteractionLog.objects.get(external_ref='vb-in-1010')
        self.assertEqual(log.direction, 'inbound')
        self.assertEqual(log.channel, 'sms')
        self.assertEqual(log.patient_phone, '+2348030001122')
        self.assertEqual(log.booking_request_id, self.booking.id)
        self.assertEqual(log.appointment_id, Appointment.objects.get().id)
        self.assertNotIn('+2348030001122', log.summary)

    # --- R11: the request already has a live appointment -----------------

    def test_r11_already_confirmed_returns_the_original_code(self):
        Appointment.objects.create(
            appointment_code='AP-7111',
            patient_name=self.booking.patient_name,
            patient_phone=self.booking.patient_phone,
            doctor=self.doctor,
            service=self.service,
            booking_request=self.booking,
            start_datetime=self.offer1.start_datetime,
            end_datetime=self.offer1.end_datetime,
            status='held',
            hold_expires_at=timezone.now() + datetime.timedelta(minutes=10),
        )

        res = self._reply({'text': '2', 'provider_message_id': 'vb-in-1011'})

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['status'], 'already_confirmed')
        self.assertEqual(res.data['appointment_code'], 'AP-7111')
        self.assertEqual(Appointment.objects.filter(booking_request=self.booking).count(), 1)

    # --- R12: two channels, one booking ----------------------------------

    def test_r12_cross_channel_replies_stay_idempotent(self):
        first = self._reply({'text': '2', 'channel': 'sms', 'provider_message_id': 'vb-in-2001'})
        self.assertEqual(first.data['status'], 'held')
        code = first.data['appointment_code']

        # A different message on another channel: friendly, no second appointment.
        second = self._reply({'text': '3', 'channel': 'whatsapp', 'provider_message_id': 'vb-in-2002'})
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(second.data['status'], 'already_confirmed')
        self.assertEqual(second.data['appointment_code'], code)
        self.assertEqual(Appointment.objects.filter(booking_request=self.booking).count(), 1)

        # The provider retries the FIRST message, now on the other channel.
        third = self._reply({'text': '2', 'channel': 'whatsapp', 'provider_message_id': 'vb-in-2001'})
        self.assertEqual(third.data['status'], 'duplicate_ignored')
        self.assertEqual(Appointment.objects.filter(booking_request=self.booking).count(), 1)
        self.assertEqual(
            InteractionLog.objects.filter(direction='inbound', external_ref='vb-in-2001').count(),
            1,
        )


class DoubleBookingConflictTests(TestCase):
    """
    Item C.1 - ConflictService.find_double_bookings.

    The booking engine prevents double-bookings at write time; this detector is
    the safety net for data that got in another way (import, manual SQL,
    migration). It must name the doctor, both appointment codes and the exact
    overlap window, and it must never fire on a clean schedule.
    """

    def setUp(self):
        self.clinic = ClinicSetting.get_settings()
        self.doctor = Doctor.objects.create(
            name='Dr. Bello Ibrahim',
            specialty='Dental Surgery',
            working_days=[1, 2, 3, 4, 5],
            shift_start=datetime.time(9, 0),
            shift_end=datetime.time(17, 0),
            max_daily_appointments=12,
        )
        self.other_doctor = Doctor.objects.create(
            name='Dr. Chinwe Okafor',
            specialty='General Practice',
            working_days=[1, 2, 3, 4, 5, 6],
            shift_start=datetime.time(8, 0),
            shift_end=datetime.time(16, 0),
            max_daily_appointments=14,
        )
        self.service = Service.objects.create(
            name='Dental Examination',
            category='Dental Care',
            duration_minutes=30,
            buffer_minutes=10,
            price=15000.00,
        )
        DoctorService.objects.create(doctor=self.doctor, service=self.service)
        DoctorService.objects.create(doctor=self.other_doctor, service=self.service)

        # Fixed "now" so the scan window is deterministic.
        self.now = timezone.now().replace(microsecond=0) + datetime.timedelta(days=1)

    def _slot(self, hour, minute=0, day_offset=0):
        return self.now.replace(hour=hour, minute=minute, second=0) + datetime.timedelta(days=day_offset)

    def _appt(self, start, end, doctor=None, status='confirmed', name='Patient', hold_expires_at=None):
        return Appointment.objects.create(
            appointment_code='',
            patient_name=name,
            patient_phone='+2348000000000',
            doctor=doctor or self.doctor,
            service=self.service,
            start_datetime=start,
            end_datetime=end,
            status=status,
            hold_expires_at=hold_expires_at,
        )

    def test_detects_overlap_and_names_doctor_and_both_codes(self):
        a = self._appt(self._slot(10, 0), self._slot(11, 0), name='Ada')
        b = self._appt(self._slot(10, 30), self._slot(11, 30), name='Bola')

        conflicts = ConflictService.find_double_bookings(now=self.now)

        self.assertEqual(len(conflicts), 1)
        c = conflicts[0]
        self.assertEqual(c['doctor_id'], str(self.doctor.id))
        self.assertEqual(c['doctor_name'], 'Dr. Bello Ibrahim')
        self.assertEqual(
            sorted([c['appointment_a']['code'], c['appointment_b']['code']]),
            sorted([a.appointment_code, b.appointment_code]),
        )
        self.assertEqual(
            sorted([c['appointment_a']['patient'], c['appointment_b']['patient']]),
            ['Ada', 'Bola'],
        )

    def test_overlap_window_is_exact(self):
        self._appt(self._slot(10, 0), self._slot(11, 0))
        self._appt(self._slot(10, 30), self._slot(11, 30))

        c = ConflictService.find_double_bookings(now=self.now)[0]

        self.assertEqual(c['overlap_start'], self._slot(10, 30).isoformat())
        self.assertEqual(c['overlap_end'], self._slot(11, 0).isoformat())

    def test_appointment_fully_inside_another_is_flagged(self):
        self._appt(self._slot(9, 0), self._slot(12, 0))
        self._appt(self._slot(10, 0), self._slot(10, 30))

        c = ConflictService.find_double_bookings(now=self.now)[0]

        self.assertEqual(c['overlap_start'], self._slot(10, 0).isoformat())
        self.assertEqual(c['overlap_end'], self._slot(10, 30).isoformat())

    def test_adjacent_appointments_are_clean(self):
        self._appt(self._slot(10, 0), self._slot(11, 0))
        self._appt(self._slot(11, 0), self._slot(12, 0))

        self.assertEqual(ConflictService.find_double_bookings(now=self.now), [])

    def test_cancelled_no_show_and_completed_are_ignored(self):
        self._appt(self._slot(10, 0), self._slot(11, 0))
        self._appt(self._slot(10, 15), self._slot(10, 45), status='cancelled')
        self._appt(self._slot(10, 20), self._slot(10, 40), status='no_show')
        self._appt(self._slot(10, 25), self._slot(10, 35), status='completed')

        self.assertEqual(ConflictService.find_double_bookings(now=self.now), [])

    def test_expired_hold_is_ignored(self):
        self._appt(self._slot(10, 0), self._slot(11, 0))
        self._appt(
            self._slot(10, 30),
            self._slot(11, 30),
            status='held',
            hold_expires_at=self.now - datetime.timedelta(minutes=5),
        )

        self.assertEqual(ConflictService.find_double_bookings(now=self.now), [])

    def test_live_hold_overlapping_confirmed_is_flagged(self):
        self._appt(self._slot(10, 0), self._slot(11, 0))
        self._appt(
            self._slot(10, 30),
            self._slot(11, 30),
            status='held',
            hold_expires_at=self.now + datetime.timedelta(minutes=15),
        )

        self.assertEqual(len(ConflictService.find_double_bookings(now=self.now)), 1)

    def test_other_doctors_are_independent(self):
        self._appt(self._slot(10, 0), self._slot(11, 0))
        self._appt(self._slot(10, 0), self._slot(11, 0), doctor=self.other_doctor)

        self.assertEqual(ConflictService.find_double_bookings(now=self.now), [])

    def test_arrived_and_in_consultation_are_active(self):
        self._appt(self._slot(10, 0), self._slot(11, 0), status='arrived')
        self._appt(self._slot(10, 30), self._slot(11, 30), status='in_consultation')

        self.assertEqual(len(ConflictService.find_double_bookings(now=self.now)), 1)

    def test_three_way_stack_reports_every_pair(self):
        self._appt(self._slot(10, 0), self._slot(11, 0), name='One')
        self._appt(self._slot(10, 15), self._slot(11, 15), name='Two')
        self._appt(self._slot(10, 30), self._slot(11, 30), name='Three')

        conflicts = ConflictService.find_double_bookings(now=self.now)

        self.assertEqual(len(conflicts), 3)  # (1,2) (1,3) (2,3)
        pairs = {
            frozenset([c['appointment_a']['patient'], c['appointment_b']['patient']])
            for c in conflicts
        }
        self.assertEqual(len(pairs), 3)

    def test_results_are_sorted_by_overlap_start(self):
        self._appt(self._slot(14, 0), self._slot(15, 0), name='LateA')
        self._appt(self._slot(14, 30), self._slot(15, 30), name='LateB')
        self._appt(self._slot(9, 0), self._slot(10, 0), name='EarlyA')
        self._appt(self._slot(9, 30), self._slot(10, 30), name='EarlyB')

        conflicts = ConflictService.find_double_bookings(now=self.now)

        self.assertEqual(len(conflicts), 2)
        self.assertLess(conflicts[0]['overlap_start'], conflicts[1]['overlap_start'])

    def test_appointments_outside_the_scan_window_are_ignored(self):
        # Beyond the 1-day lookback.
        self._appt(self._slot(10, 0, day_offset=-5), self._slot(11, 0, day_offset=-5))
        self._appt(self._slot(10, 30, day_offset=-5), self._slot(11, 30, day_offset=-5))

        # Beyond the 14-day lookahead.
        self._appt(self._slot(10, 0, day_offset=40), self._slot(11, 0, day_offset=40))
        self._appt(self._slot(10, 30, day_offset=40), self._slot(11, 30, day_offset=40))

        self.assertEqual(ConflictService.find_double_bookings(now=self.now), [])


class DoubleBookingEndpointTests(APITestCase):
    """
    Item C.2 - GET /api/v1/conflicts/double-bookings/

    Read-only staff endpoint that feeds the red dashboard alert. It wraps
    ConflictService, so the rules (active statuses, expired holds, real
    intervals) live in exactly one place.
    """

    URL = '/api/v1/conflicts/double-bookings/'

    def setUp(self):
        cache.clear()
        self.receptionist = StaffUser.objects.create(
            full_name='Sarah Conflicts',
            email='sarah.conflicts@clinic.com',
            role='receptionist',
            is_active=True,
        )
        self.receptionist.set_password('SarahPass123!')
        self.receptionist.save()
        self.doctor = Doctor.objects.create(
            name='Dr. Bello Ibrahim',
            specialty='Dental Surgery',
            working_days=[1, 2, 3, 4, 5],
            shift_start=datetime.time(9, 0),
            shift_end=datetime.time(17, 0),
            max_daily_appointments=12,
        )
        self.service = Service.objects.create(
            name='Dental Examination',
            category='Dental Care',
            duration_minutes=30,
            buffer_minutes=10,
            price=15000.00,
        )
        DoctorService.objects.create(doctor=self.doctor, service=self.service)
        self.now = timezone.now().replace(microsecond=0) + datetime.timedelta(days=1)

    def tearDown(self):
        cache.clear()

    def _appt(self, hour, minute, status='confirmed'):
        start = self.now.replace(hour=hour, minute=minute, second=0)
        return Appointment.objects.create(
            appointment_code='',
            patient_name=f'Patient {hour}:{minute}',
            patient_phone='+2348000000000',
            doctor=self.doctor,
            service=self.service,
            start_datetime=start,
            end_datetime=start + datetime.timedelta(minutes=30),
            status=status,
        )

    def test_requires_staff_authentication(self):
        res = self.client.get(self.URL)

        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_returns_detected_conflicts(self):
        self.client.force_authenticate(user=self.receptionist)
        a = self._appt(10, 0)
        b = self._appt(10, 15)

        res = self.client.get(self.URL)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['count'], 1)
        self.assertEqual(len(res.data['conflicts']), 1)
        conflict = res.data['conflicts'][0]
        self.assertEqual(conflict['doctor_id'], str(self.doctor.id))
        self.assertEqual(conflict['doctor_name'], 'Dr. Bello Ibrahim')
        self.assertEqual(
            sorted([conflict['appointment_a']['code'], conflict['appointment_b']['code']]),
            sorted([a.appointment_code, b.appointment_code]),
        )
        self.assertEqual(
            conflict['overlap_start'],
            self.now.replace(hour=10, minute=15, second=0).isoformat(),
        )
        self.assertEqual(
            conflict['overlap_end'],
            self.now.replace(hour=10, minute=30, second=0).isoformat(),
        )
        self.assertIn('generated_at', res.data)

    def test_clean_schedule_is_an_empty_list(self):
        self.client.force_authenticate(user=self.receptionist)
        self._appt(10, 0)
        self._appt(10, 30)  # back-to-back, not overlapping

        res = self.client.get(self.URL)

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['count'], 0)
        self.assertEqual(res.data['conflicts'], [])


class DoctorLeaveAvailabilityTests(TestCase):
    """
    Step 1b — leave is a DATED period, not a permanent switch.

    Before this, one click put `is_on_leave = True` on the doctor forever, so
    every future date looked blocked until someone remembered to restore duty.
    A leave period must block only its own dates and the doctor must stay
    bookable everywhere else.
    """

    def setUp(self):
        cache.clear()
        self.clinic = ClinicSetting.get_settings()
        self.clinic.webhook_secret = 'clinic_dev_secret_2026'
        self.clinic.save()
        self.doctor = Doctor.objects.create(
            name='Dr. Leave Bello', specialty='Dental Surgery',
            working_days=[1, 2, 3, 4, 5], shift_start=datetime.time(9, 0),
            shift_end=datetime.time(17, 0), max_daily_appointments=12,
        )
        self.service = Service.objects.create(
            name='Dental Examination', category='Dental Care',
            duration_minutes=30, buffer_minutes=10, price=15000.00,
        )
        DoctorService.objects.create(doctor=self.doctor, service=self.service)

    def tearDown(self):
        cache.clear()

    def _next_monday(self):
        today = timezone.now().date()
        return today + datetime.timedelta(days=(1 - today.isoweekday()) % 7 + 7)

    def _leave(self, start_date, end_date, leave_type='annual'):
        return DoctorLeave.objects.create(
            doctor=self.doctor, start_date=start_date, end_date=end_date,
            leave_type=leave_type, reason='Planned leave',
        )

    def _book(self, day, hour=11):
        start = timezone.make_aware(datetime.datetime.combine(day, datetime.time(hour, 0)))
        return HoldService.acquire_slot(
            doctor_id=self.doctor.id, service_id=self.service.id,
            start_datetime=start,
            end_datetime=start + datetime.timedelta(minutes=30),
            patient_name='Leave Patient', patient_phone='+2348055557101',
            is_hold=False,
        )

    def test_leave_blocks_only_its_own_dates(self):
        monday = self._next_monday()
        tuesday = monday + datetime.timedelta(days=1)
        wednesday = monday + datetime.timedelta(days=2)
        self._leave(monday, tuesday)

        self.assertTrue(self.doctor.is_on_leave_on(monday))
        self.assertTrue(self.doctor.is_on_leave_on(tuesday))
        self.assertFalse(self.doctor.is_on_leave_on(wednesday))
        self.assertFalse(self.doctor.is_on_leave_on(monday - datetime.timedelta(days=7)))

    def test_open_ended_leave_blocks_every_date_after_it_starts(self):
        monday = self._next_monday()
        self._leave(monday, None, leave_type='sick')

        self.assertFalse(self.doctor.is_on_leave_on(monday - datetime.timedelta(days=1)))
        self.assertTrue(self.doctor.is_on_leave_on(monday))
        self.assertTrue(self.doctor.is_on_leave_on(monday + datetime.timedelta(days=30)))

    def test_future_leave_does_not_flag_the_doctor_off_today(self):
        monday = self._next_monday()
        DoctorLeave.record(self.doctor, monday, monday + datetime.timedelta(days=3),
                           reason='Annual leave')
        self.doctor.refresh_from_db()

        self.assertFalse(self.doctor.is_on_leave)
        # A week later is a normal working day, so booking still works.
        appt = self._book(monday + datetime.timedelta(days=7))
        self.assertEqual(appt.doctor_id, self.doctor.id)

    def test_hold_rejects_a_booking_inside_a_dated_leave(self):
        monday = self._next_monday()
        self._leave(monday, monday)
        self.doctor.refresh_from_db()
        self.assertFalse(self.doctor.is_on_leave)  # the flag is not the gate

        with self.assertRaises(SlotConflictException):
            self._book(monday)

    def test_availability_engine_skips_only_the_leave_dates(self):
        monday = self._next_monday()
        self._leave(monday, monday)
        engine = AvailabilityEngine()

        self.assertEqual(engine.get_available_slots_for_date(self.service, monday), [])
        later = engine.get_available_slots_for_date(
            self.service, monday + datetime.timedelta(days=2)
        )
        self.assertNotEqual(later, [])

    def test_stale_flag_clears_itself_after_the_period_ends(self):
        yesterday = timezone.localdate() - datetime.timedelta(days=1)
        self._leave(yesterday - datetime.timedelta(days=2), yesterday, leave_type='sick')
        Doctor.objects.filter(id=self.doctor.id).update(is_on_leave=True)
        self.doctor.refresh_from_db()
        self.assertTrue(self.doctor.is_on_leave)  # left behind by the old flow

        self.doctor.sync_leave_flag()

        self.doctor.refresh_from_db()
        self.assertFalse(self.doctor.is_on_leave)
        self.assertFalse(self.doctor.is_on_leave_on(timezone.localdate()))

    def test_a_manual_off_duty_flag_without_periods_still_blocks(self):
        self.doctor.is_on_leave = True
        self.doctor.save(update_fields=['is_on_leave'])

        self.assertTrue(self.doctor.is_on_leave_on(self._next_monday()))
        with self.assertRaises(SlotConflictException):
            self._book(self._next_monday())


class DoctorLeavePlanTests(APITestCase):
    """
    Step 1b — approving a leave plan records the dates, keeps the roster flag
    honest, and exposes the periods to the calendar feed.
    """

    def setUp(self):
        cache.clear()
        self.clinic = ClinicSetting.get_settings()
        self.clinic.webhook_secret = 'clinic_dev_secret_2026'
        self.clinic.save()
        self.receptionist = StaffUser.objects.create(
            full_name='Sarah Leave', email='sarah.leave@clinic.com',
            role='receptionist', is_active=True,
        )
        self.receptionist.set_password('SarahPass123!')
        self.receptionist.save()
        self.doctor = Doctor.objects.create(
            name='Dr. Leave Bello', specialty='Dental Surgery',
            working_days=[1, 2, 3, 4, 5], shift_start=datetime.time(9, 0),
            shift_end=datetime.time(17, 0), max_daily_appointments=12,
        )
        self.colleague = Doctor.objects.create(
            name='Dr. Leave Chinwe', specialty='General Practice',
            working_days=[1, 2, 3, 4, 5], shift_start=datetime.time(9, 0),
            shift_end=datetime.time(17, 0), max_daily_appointments=14,
        )
        self.service = Service.objects.create(
            name='Dental Examination', category='Dental Care',
            duration_minutes=30, buffer_minutes=10, price=15000.00,
        )
        DoctorService.objects.create(doctor=self.doctor, service=self.service)
        DoctorService.objects.create(doctor=self.colleague, service=self.service)

    def tearDown(self):
        cache.clear()

    def _next_monday(self):
        today = timezone.now().date()
        return today + datetime.timedelta(days=(1 - today.isoweekday()) % 7 + 7)

    def _book(self, day, hour=11):
        start = timezone.make_aware(datetime.datetime.combine(day, datetime.time(hour, 0)))
        return HoldService.acquire_slot(
            doctor_id=self.doctor.id, service_id=self.service.id,
            start_datetime=start,
            end_datetime=start + datetime.timedelta(minutes=30),
            patient_name='Plan Patient', patient_phone='+2348055557201',
            is_hold=False,
        )

    def _window(self, start_day, end_day):
        return {
            'leave_start': timezone.make_aware(
                datetime.datetime.combine(start_day, datetime.time(8, 0))
            ).isoformat(),
            'leave_end': timezone.make_aware(
                datetime.datetime.combine(end_day, datetime.time(23, 59))
            ).isoformat(),
        }

    def test_auto_resolve_records_the_leave_period(self):
        monday = self._next_monday()
        tuesday = monday + datetime.timedelta(days=1)
        appt = self._book(monday)
        self.client.force_authenticate(user=self.receptionist)

        res = self.client.post(
            f"/api/v1/disruptions/{self.doctor.id}/auto-resolve/",
            {'reason': 'Annual leave', **self._window(monday, tuesday)},
            format='json',
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        appt.refresh_from_db()
        self.assertEqual(appt.doctor.id, self.colleague.id)
        leave = DoctorLeave.objects.get(doctor=self.doctor)
        self.assertEqual(leave.start_date, monday)
        self.assertEqual(leave.end_date, tuesday)
        self.doctor.refresh_from_db()
        self.assertFalse(self.doctor.is_on_leave)  # not stuck off duty
        self.assertTrue(self.doctor.is_on_leave_on(monday))

    def test_running_the_same_plan_twice_does_not_duplicate_the_period(self):
        monday = self._next_monday()
        self._book(monday)
        self.client.force_authenticate(user=self.receptionist)
        body = {'reason': 'Annual leave', **self._window(monday, monday)}

        self.client.post(f"/api/v1/disruptions/{self.doctor.id}/auto-resolve/", body, format='json')
        self.client.post(f"/api/v1/disruptions/{self.doctor.id}/auto-resolve/", body, format='json')

        self.assertEqual(DoctorLeave.objects.filter(doctor=self.doctor).count(), 1)

    def test_duty_toggle_creates_an_open_leave_and_restore_duty_clears_it(self):
        self.client.force_authenticate(user=self.receptionist)
        url = f'/api/v1/clinic/doctors/{self.doctor.id}/duty-status/'

        sick = self.client.patch(url, {'duty_mode': 'on_sick_leave'}, format='json')
        self.assertEqual(sick.status_code, status.HTTP_200_OK)
        self.assertTrue(sick.data['is_on_leave'])
        open_leave = DoctorLeave.objects.get(doctor=self.doctor)
        self.assertIsNone(open_leave.end_date)

        back = self.client.patch(url, {'duty_mode': 'on_duty'}, format='json')
        self.assertEqual(back.status_code, status.HTTP_200_OK)
        self.assertFalse(back.data['is_on_leave'])
        self.assertFalse(DoctorLeave.objects.filter(doctor=self.doctor).exists())

    def test_calendar_schedule_exposes_leave_periods(self):
        monday = self._next_monday()
        DoctorLeave.objects.create(
            doctor=self.doctor, start_date=monday,
            end_date=monday + datetime.timedelta(days=1),
            leave_type='annual', reason='Annual leave',
        )
        self.client.force_authenticate(user=self.receptionist)

        res = self.client.get('/api/v1/calendar/schedule/', {
            'start_date': monday.isoformat(),
            'end_date': (monday + datetime.timedelta(days=6)).isoformat(),
        })

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        entry = next(d for d in res.data['doctors'] if d['doctor_id'] == str(self.doctor.id))
        self.assertEqual(len(entry['leave_periods']), 1)
        self.assertEqual(entry['leave_periods'][0]['start_date'], monday.isoformat())
        self.assertEqual(
            entry['leave_periods'][0]['end_date'],
            (monday + datetime.timedelta(days=1)).isoformat(),
        )

    def test_reassign_to_colleague_on_dated_leave_rejected_409(self):
        monday = self._next_monday()
        movable = self._book(monday)
        DoctorLeave.objects.create(
            doctor=self.colleague, start_date=monday, end_date=monday,
            leave_type='annual', reason='Annual leave',
        )
        self.client.force_authenticate(user=self.receptionist)

        res = self.client.post(f'/api/v1/appointments/{movable.id}/reassign-leave/', {
            'new_doctor_id': str(self.colleague.id),
        }, format='json')

        self.assertEqual(res.status_code, status.HTTP_409_CONFLICT)
        movable.refresh_from_db()
        self.assertEqual(movable.doctor.id, self.doctor.id)

    def test_preview_leaves_no_leave_period_behind(self):
        monday = self._next_monday()
        self._book(monday)
        self.client.force_authenticate(user=self.receptionist)

        res = self.client.post(
            f"/api/v1/disruptions/{self.doctor.id}/preview/",
            {'reason': 'Annual leave', **self._window(monday, monday)},
            format='json',
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(DoctorLeave.objects.count(), 0)










# ======================================================================
# Leave flow Step 3 - stranded queue, undo of the last distribution,
# and notify-once.
# ======================================================================


class _DisruptionFixture(TestCase):
    """Shared three-doctor clinic for the Step 3 classes below."""

    def setUp(self):
        self.clinic = ClinicSetting.get_settings()
        self.clinic.webhook_secret = 'clinic_dev_secret_2026'
        self.clinic.save()
        self.doctor = Doctor.objects.create(
            name='Dr. Bello Strand', specialty='Dental Surgery',
            working_days=[1, 2, 3, 4, 5], shift_start=datetime.time(9, 0),
            shift_end=datetime.time(17, 0), max_daily_appointments=12,
        )
        self.colleague = Doctor.objects.create(
            name='Dr. Chinwe Strand', specialty='General Practice',
            working_days=[1, 2, 3, 4, 5, 6], shift_start=datetime.time(8, 0),
            shift_end=datetime.time(16, 0), max_daily_appointments=14,
        )
        self.third = Doctor.objects.create(
            name='Dr. Tunde Strand', specialty='General Practice',
            working_days=[1, 2, 3, 4, 5, 6], shift_start=datetime.time(8, 0),
            shift_end=datetime.time(16, 0), max_daily_appointments=14,
        )
        self.service = Service.objects.create(
            name='Dental Examination', category='Dental Care',
            duration_minutes=30, buffer_minutes=10, price=15000.00,
        )
        for doc in (self.doctor, self.colleague, self.third):
            DoctorService.objects.create(doctor=doc, service=self.service)

    def _next_monday(self):
        today = timezone.now().date()
        return today + datetime.timedelta(days=(1 - today.isoweekday()) % 7 + 7)

    def _book(self, doctor, day, hour, minute=0, name='Strand Patient',
              phone='+2348055567000', is_hold=False):
        start = timezone.make_aware(
            datetime.datetime.combine(day, datetime.time(hour, minute))
        )
        return HoldService.acquire_slot(
            doctor_id=doctor.id, service_id=self.service.id,
            start_datetime=start,
            end_datetime=start + datetime.timedelta(minutes=30),
            patient_name=name, patient_phone=phone, is_hold=is_hold,
        )

    def _window(self, start_day, end_day=None):
        end_day = end_day or start_day
        return {
            'leave_start_dt': timezone.make_aware(
                datetime.datetime.combine(start_day, datetime.time(8, 0))
            ),
            'leave_end_dt': timezone.make_aware(
                datetime.datetime.combine(end_day, datetime.time(23, 59))
            ),
        }

    def _approve(self, start_day, end_day=None, **kwargs):
        window = self._window(start_day, end_day)
        return DisruptionService.auto_resolve_disruption(
            doctor_id=self.doctor.id, **window, **kwargs
        )


class StrandedPatientsTests(_DisruptionFixture):
    """
    Step 3a - nobody disappears. Every confirmed/held patient still booked
    under a doctor who is on leave is listed, grouped by day, with Django's
    own reason when a plan could not place them.
    """

    def test_unplaced_patient_is_listed_on_the_leave_day(self):
        monday = self._next_monday()
        appt = self._book(self.doctor, monday, 11, 0, name='Amina Stranded')
        report = self._approve(monday, colleague_ids=[], max_lookahead_days=0)
        self.assertEqual(report['unplaced_count'], 1)

        stranded = DisruptionService.list_stranded()

        self.assertEqual(stranded['count'], 1)
        day = stranded['days'][0]
        self.assertEqual(day['date'], monday.isoformat())
        self.assertEqual(day['doctor_name'], 'Dr. Bello Strand')
        patient = day['patients'][0]
        self.assertEqual(patient['appointment_code'], appt.appointment_code)
        self.assertEqual(patient['patient_name'], 'Amina Stranded')
        self.assertEqual(patient['unplaced_reason'], 'NO_COLLEAGUE_CHOSEN')
        self.assertIn('No colleague is selected', patient['unplaced_text'])
        self.assertEqual(patient['batch_id'], report['batch']['id'])

    def test_placed_and_cancelled_patients_are_not_stranded(self):
        monday = self._next_monday()
        placed = self._book(self.doctor, monday, 10, 0, name='Placed Away',
                            phone='+2348055567001')
        cancelled = self._book(self.doctor, monday, 15, 0, name='Called Off',
                               phone='+2348055567002')
        self._approve(monday)
        placed.refresh_from_db()
        self.assertEqual(placed.doctor.id, self.colleague.id)
        cancelled.status = 'cancelled'
        cancelled.save(update_fields=['status'])

        stranded = DisruptionService.list_stranded()

        self.assertEqual(stranded['count'], 0)
        self.assertEqual(stranded['days'], [])

    def test_groups_by_day_and_counts_every_patient(self):
        monday = self._next_monday()
        tuesday = monday + datetime.timedelta(days=1)
        self._book(self.doctor, monday, 10, 0, name='Mon One', phone='+2348055567003')
        self._book(self.doctor, monday, 15, 0, name='Mon Two', phone='+2348055567004')
        self._book(self.doctor, tuesday, 10, 0, name='Tue One', phone='+2348055567005')

        self._approve(monday, tuesday, colleague_ids=[], max_lookahead_days=0)
        stranded = DisruptionService.list_stranded()

        self.assertEqual(stranded['count'], 3)
        self.assertEqual([day['date'] for day in stranded['days']],
                         [monday.isoformat(), tuesday.isoformat()])
        self.assertEqual(len(stranded['days'][0]['patients']), 2)
        self.assertEqual(len(stranded['days'][1]['patients']), 1)
        # patients inside a day are ordered by time
        times = [p['time_label'] for p in stranded['days'][0]['patients']]
        self.assertEqual(times, ['10:00 AM', '3:00 PM'])

    def test_held_patient_is_listed_with_its_expiry(self):
        monday = self._next_monday()
        self._book(self.doctor, monday, 11, 0, name='Holding Patient',
                   phone='+2348055567006', is_hold=True)
        self._approve(monday, colleague_ids=[], max_lookahead_days=0)

        stranded = DisruptionService.list_stranded()

        self.assertEqual(stranded['count'], 1)
        self.assertEqual(stranded['days'][0]['patients'][0]['status'], 'held')
        self.assertIsNotNone(stranded['days'][0]['patients'][0]['hold_expires_at'])

    def test_legacy_off_duty_doctor_is_included(self):
        tomorrow = timezone.now().date() + datetime.timedelta(days=1)
        while tomorrow.isoweekday() > 5:
            tomorrow += datetime.timedelta(days=1)
        appt = self._book(self.doctor, tomorrow, 10, 0, phone='+2348055567007')
        self.doctor.is_on_leave = True
        self.doctor.save(update_fields=['is_on_leave'])

        stranded = DisruptionService.list_stranded()

        self.assertEqual(stranded['count'], 1)
        self.assertEqual(stranded['days'][0]['patients'][0]['appointment_code'],
                         appt.appointment_code)
        self.assertIsNone(stranded['days'][0]['leave_id'])

    def test_planned_leave_without_any_batch_still_lists_patients(self):
        monday = self._next_monday()
        appt = self._book(self.doctor, monday, 11, 0, phone='+2348055567008')
        DisruptionService.record_leave_window(
            self.doctor, **self._window(monday), reason='Annual leave',
            performed_by='receptionist', leave_type='annual',
        )

        stranded = DisruptionService.list_stranded()

        self.assertEqual(stranded['count'], 1)
        self.assertEqual(stranded['days'][0]['patients'][0]['appointment_code'],
                         appt.appointment_code)
        self.assertIsNone(stranded['days'][0]['patients'][0]['batch_id'])


class DisruptionUndoTests(_DisruptionFixture):
    """
    Step 3b - undo the LAST distribution. Only while nothing has reached a
    patient and no later plan has touched the same days.
    """

    def _undo(self, batch_id):
        return DisruptionService.undo_disruption_batch(batch_id, performed_by='sarah@clinic.com')

    def test_undo_restores_every_patient_and_removes_the_leave(self):
        monday = self._next_monday()
        appt = self._book(self.doctor, monday, 11, 0, phone='+2348055567101')
        original_start = appt.start_datetime
        report = self._approve(monday)
        batch_id = report['batch']['id']
        self.assertTrue(report['batch']['can_undo'])

        result = self._undo(batch_id)

        appt.refresh_from_db()
        self.assertEqual(appt.doctor.id, self.doctor.id)
        self.assertEqual(appt.start_datetime, original_start)
        self.assertEqual(result['restored_count'], 1)
        self.assertTrue(result['leave_removed'])
        self.assertEqual(DoctorLeave.objects.filter(doctor=self.doctor).count(), 0)
        self.assertFalse(self.doctor.__class__.objects.get(id=self.doctor.id).is_on_leave)
        self.assertTrue(AuditLog.objects.filter(action='DISRUPTION_BATCH_UNDONE').exists())
        # the queued notice must never reach the patient now
        self.assertFalse(
            InteractionLog.objects.filter(
                appointment=appt, status__in=['queued', 'sent', 'delivered']
            ).exists()
        )

    def test_batch_reports_why_it_cannot_be_undone(self):
        monday = self._next_monday()
        self._book(self.doctor, monday, 11, 0, phone='+2348055567102')
        DisruptionService.record_leave_window(
            self.doctor, **self._window(monday), reason='Already booked',
            performed_by='receptionist', leave_type='annual',
        )
        report = self._approve(monday)

        self.assertFalse(report['batch']['can_undo'])
        self.assertIn('already in place', report['batch']['undo_reason'])

    def test_undo_refuses_after_a_notice_reached_the_patient(self):
        monday = self._next_monday()
        appt = self._book(self.doctor, monday, 11, 0, phone='+2348055567103')
        report = self._approve(monday)
        InteractionLog.objects.filter(appointment=appt).update(status='delivered')

        with self.assertRaises(DisruptionUndoError) as caught:
            self._undo(report['batch']['id'])

        self.assertEqual(caught.exception.code, 'NOTICES_DELIVERED')
        appt.refresh_from_db()
        self.assertEqual(appt.doctor.id, self.colleague.id)
        self.assertEqual(DoctorLeave.objects.filter(doctor=self.doctor).count(), 1)

    def test_undo_refuses_when_the_leave_predates_the_plan(self):
        monday = self._next_monday()
        self._book(self.doctor, monday, 11, 0, phone='+2348055567104')
        DisruptionService.record_leave_window(
            self.doctor, **self._window(monday), reason='Annual',
            performed_by='receptionist', leave_type='annual',
        )
        report = self._approve(monday)

        with self.assertRaises(DisruptionUndoError) as caught:
            self._undo(report['batch']['id'])

        self.assertEqual(caught.exception.code, 'LEAVE_NOT_FROM_PLAN')

    def test_undo_refuses_when_a_later_plan_covers_the_same_days(self):
        monday = self._next_monday()
        self._book(self.doctor, monday, 11, 0, phone='+2348055567105')
        first = self._approve(monday)

        # Reception cancels the leave, a new patient books in, then the leave
        # is declared again with a fresh plan for the same day.
        DoctorLeave.objects.filter(doctor=self.doctor).delete()
        self.doctor.sync_leave_flag()
        self._book(self.doctor, monday, 15, 0, phone='+2348055567106')
        second = self._approve(monday)

        with self.assertRaises(DisruptionUndoError) as caught:
            self._undo(first['batch']['id'])

        self.assertEqual(caught.exception.code, 'SUPERSEDED')
        self.assertNotEqual(first['batch']['id'], second['batch']['id'])

    def test_a_later_plan_on_other_days_does_not_block_undo(self):
        monday = self._next_monday()
        tuesday = monday + datetime.timedelta(days=1)
        self._book(self.doctor, monday, 11, 0, phone='+2348055567107')
        self._book(self.doctor, tuesday, 11, 0, phone='+2348055567108')
        first = self._approve(monday, colleague_ids=[], max_lookahead_days=0)
        self._approve(tuesday, colleague_ids=[], max_lookahead_days=0)

        result = self._undo(first['batch']['id'])

        self.assertEqual(result['restored_count'], 0)  # nothing was moved
        self.assertTrue(result['leave_removed'])

    def test_undo_refuses_when_the_patient_was_moved_again(self):
        monday = self._next_monday()
        appt = self._book(self.doctor, monday, 11, 0, phone='+2348055567109')
        report = self._approve(monday)
        DisruptionService.reassign_to_colleague(
            appt.id, self.third.id, performed_by='sarah@clinic.com'
        )

        with self.assertRaises(DisruptionUndoError) as caught:
            self._undo(report['batch']['id'])

        self.assertEqual(caught.exception.code, 'MOVES_CHANGED')

    def test_undo_refuses_twice(self):
        monday = self._next_monday()
        self._book(self.doctor, monday, 11, 0, phone='+2348055567110')
        report = self._approve(monday)
        self._undo(report['batch']['id'])

        with self.assertRaises(DisruptionUndoError) as caught:
            self._undo(report['batch']['id'])

        self.assertEqual(caught.exception.code, 'ALREADY_UNDONE')

    def test_undo_rolls_back_everything_when_an_old_slot_was_taken(self):
        monday = self._next_monday()
        appt = self._book(self.doctor, monday, 11, 0, phone='+2348055567111')
        squatter = self._book(self.colleague, monday, 9, 0, name='Later Booking',
                              phone='+2348055567112')
        report = self._approve(monday)
        # Someone bypassed the leave check and took the freed slot.
        squatter.doctor = self.doctor
        squatter.start_datetime = timezone.make_aware(
            datetime.datetime.combine(monday, datetime.time(11, 0))
        )
        squatter.end_datetime = squatter.start_datetime + datetime.timedelta(minutes=30)
        squatter.save(update_fields=['doctor', 'start_datetime', 'end_datetime'])

        with self.assertRaises(DisruptionUndoError) as caught:
            self._undo(report['batch']['id'])

        self.assertEqual(caught.exception.code, 'SLOT_TAKEN')
        appt.refresh_from_db()
        self.assertEqual(appt.doctor.id, self.colleague.id)
        self.assertEqual(DoctorLeave.objects.filter(doctor=self.doctor).count(), 1)


class NotifyOnceTests(_DisruptionFixture):
    """
    Step 3c - one truthful message per placement. The same placement is never
    announced twice; a plan that changed before delivery leaves no stale
    message behind; a patient who already heard the old plan gets exactly one
    correction.
    """

    def test_same_placement_is_queued_only_once(self):
        monday = self._next_monday()
        appt = self._book(self.doctor, monday, 11, 0, phone='+2348055567201')
        self._approve(monday)
        before = InteractionLog.objects.filter(appointment=appt).count()
        self.assertEqual(before, 2)
        appt.refresh_from_db()

        items = DisruptionService._queue_notice_messages(
            appt, 'Dr. Bello Strand', self.clinic
        )

        self.assertEqual(items, [])
        self.assertEqual(InteractionLog.objects.filter(appointment=appt).count(), before)

    def test_undelivered_stale_notice_is_expired_before_the_new_one(self):
        monday = self._next_monday()
        appt = self._book(self.doctor, monday, 11, 0, phone='+2348055567202')
        self._approve(monday)
        # A manual 1-click reassignment moves the patient again before delivery.
        DisruptionService.reassign_to_colleague(
            appt.id, self.third.id, performed_by='sarah@clinic.com'
        )
        appt.refresh_from_db()

        items = DisruptionService._queue_notice_messages(
            appt, 'Dr. Bello Strand', self.clinic
        )

        self.assertEqual(sorted(i['channel'] for i in items), ['sms', 'whatsapp'])
        self.assertIn('Dr. Tunde Strand', items[0]['message'])
        live = InteractionLog.objects.filter(appointment=appt).exclude(status='expired')
        self.assertEqual(live.count(), 2)
        self.assertTrue(all(row.status == 'queued' for row in live))
        self.assertEqual(
            InteractionLog.objects.filter(
                appointment=appt, status='expired'
            ).count(), 2
        )

    def test_delivered_notice_gets_one_correction(self):
        monday = self._next_monday()
        appt = self._book(self.doctor, monday, 11, 0, phone='+2348055567203')
        self._approve(monday)
        InteractionLog.objects.filter(appointment=appt).update(status='delivered')
        DisruptionService.reassign_to_colleague(
            appt.id, self.third.id, performed_by='sarah@clinic.com'
        )
        appt.refresh_from_db()

        items = DisruptionService._queue_notice_messages(
            appt, 'Dr. Bello Strand', self.clinic
        )

        self.assertEqual(len(items), 2)
        self.assertTrue(items[0]['message'].startswith('Correction:'))
        self.assertIn('Dr. Tunde Strand', items[0]['message'])
        # Delivered rows are history and stay untouched.
        self.assertEqual(
            InteractionLog.objects.filter(
                appointment=appt, status='delivered'
            ).count(), 2
        )
        # Repeating the same move never queues a second correction.
        again = DisruptionService._queue_notice_messages(
            appt, 'Dr. Bello Strand', self.clinic
        )
        self.assertEqual(again, [])
        self.assertEqual(
            InteractionLog.objects.filter(appointment=appt, status='queued').count(), 2
        )


class DisruptionStrandedEndpointTests(_DisruptionFixture, APITestCase):
    """GET /api/v1/disruptions/stranded/ - staff-only stranded queue."""

    def setUp(self):
        super().setUp()
        cache.clear()
        self.receptionist = StaffUser.objects.create(
            full_name='Sarah Strand', email='sarah.strand@clinic.com',
            role='receptionist', is_active=True,
        )
        self.receptionist.set_password('SarahPass123!')
        self.receptionist.save()

    def tearDown(self):
        cache.clear()

    def test_requires_staff_auth(self):
        res = self.client.get('/api/v1/disruptions/stranded/')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_lists_the_stranded_patients(self):
        monday = self._next_monday()
        appt = self._book(self.doctor, monday, 11, 0, phone='+2348055567301')
        self._approve(monday, colleague_ids=[], max_lookahead_days=0)
        self.client.force_authenticate(user=self.receptionist)

        res = self.client.get('/api/v1/disruptions/stranded/')

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['count'], 1)
        self.assertEqual(
            res.data['days'][0]['patients'][0]['appointment_code'],
            appt.appointment_code,
        )


class DisruptionUndoEndpointTests(_DisruptionFixture, APITestCase):
    """POST /api/v1/disruptions/batches/{id}/undo/"""

    def setUp(self):
        super().setUp()
        cache.clear()
        self.receptionist = StaffUser.objects.create(
            full_name='Sarah Undo', email='sarah.undo@clinic.com',
            role='receptionist', is_active=True,
        )
        self.receptionist.set_password('SarahPass123!')
        self.receptionist.save()

    def tearDown(self):
        cache.clear()

    def _url(self, batch_id):
        return f'/api/v1/disruptions/batches/{batch_id}/undo/'

    def test_requires_staff_auth(self):
        res = self.client.post(self._url(uuid.uuid4()), {}, format='json')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_undo_restores_the_plan(self):
        monday = self._next_monday()
        appt = self._book(self.doctor, monday, 11, 0, phone='+2348055567401')
        report = self._approve(monday)
        self.client.force_authenticate(user=self.receptionist)

        res = self.client.post(self._url(report['batch']['id']), {}, format='json')

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['restored_count'], 1)
        appt.refresh_from_db()
        self.assertEqual(appt.doctor.id, self.doctor.id)

    def test_blocked_undo_is_a_conflict_with_a_reason(self):
        monday = self._next_monday()
        appt = self._book(self.doctor, monday, 11, 0, phone='+2348055567402')
        report = self._approve(monday)
        InteractionLog.objects.filter(appointment=appt).update(status='delivered')
        self.client.force_authenticate(user=self.receptionist)

        res = self.client.post(self._url(report['batch']['id']), {}, format='json')

        self.assertEqual(res.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(res.data['error'], 'NOTICES_DELIVERED')
        self.assertTrue(res.data['detail'])

    def test_unknown_batch_is_404(self):
        self.client.force_authenticate(user=self.receptionist)
        res = self.client.post(self._url(uuid.uuid4()), {}, format='json')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)


# ======================================================================
# Fix 4 - a manual transfer may only go to a doctor who offers the service.
# The automatic resolver already filters by qualification; this path did not.
# ======================================================================


class ManualReassignQualificationTests(_DisruptionFixture, APITestCase):
    """reassign_to_colleague / POST reassign-leave/ must refuse an
    unqualified colleague with a named, plain reason."""

    def setUp(self):
        super().setUp()
        cache.clear()
        # A doctor who does not offer this service: no DoctorService row.
        self.unqualified = Doctor.objects.create(
            name='Dr. Ada Unqualified', specialty='General Practice',
            working_days=[1, 2, 3, 4, 5, 6], shift_start=datetime.time(8, 0),
            shift_end=datetime.time(16, 0), max_daily_appointments=10,
        )
        self.receptionist = StaffUser.objects.create(
            full_name='Sarah Qualify', email='sarah.qualify@clinic.com',
            role='receptionist', is_active=True,
        )
        self.receptionist.set_password('SarahPass123!')
        self.receptionist.save()

    def tearDown(self):
        cache.clear()

    def test_unqualified_colleague_is_refused_and_nothing_moves(self):
        monday = self._next_monday()
        appt = self._book(self.doctor, monday, 11, 0, phone='+2348055567501')

        with self.assertRaises(DisruptionRefusal) as caught:
            DisruptionService.reassign_to_colleague(
                appt.id, self.unqualified.id, performed_by='sarah@clinic.com'
            )

        self.assertEqual(caught.exception.code, 'NOT_QUALIFIED')
        self.assertIn('Dr. Ada Unqualified', caught.exception.text)
        self.assertIn(self.service.name, caught.exception.text)
        appt.refresh_from_db()
        self.assertEqual(appt.doctor.id, self.doctor.id)
        self.assertFalse(
            AuditLog.objects.filter(action='DISRUPTION_COLLEAGUE_REASSIGNMENT').exists()
        )

    def test_qualified_colleague_still_moves(self):
        monday = self._next_monday()
        appt = self._book(self.doctor, monday, 11, 0, phone='+2348055567502')

        DisruptionService.reassign_to_colleague(
            appt.id, self.colleague.id, performed_by='sarah@clinic.com'
        )

        appt.refresh_from_db()
        self.assertEqual(appt.doctor.id, self.colleague.id)

    def test_endpoint_refuses_with_409_and_a_plain_sentence(self):
        monday = self._next_monday()
        appt = self._book(self.doctor, monday, 11, 0, phone='+2348055567503')
        self.client.force_authenticate(user=self.receptionist)

        res = self.client.post(
            f'/api/v1/appointments/{appt.id}/reassign-leave/',
            {'new_doctor_id': str(self.unqualified.id)},
            format='json',
        )

        self.assertEqual(res.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(res.data['error'], 'NOT_QUALIFIED')
        self.assertIn('Dr. Ada Unqualified', res.data['detail'])
        appt.refresh_from_db()
        self.assertEqual(appt.doctor.id, self.doctor.id)

    def test_undo_is_not_blocked_when_qualification_data_changed_later(self):
        # Undo puts a patient back with the doctor who already had them, so a
        # later roster edit must never trap them on the leave day.
        monday = self._next_monday()
        appt = self._book(self.doctor, monday, 11, 0, phone='+2348055567504')
        report = self._approve(monday)
        DoctorService.objects.filter(
            doctor=self.doctor, service=self.service
        ).delete()

        DisruptionService.undo_disruption_batch(
            report['batch']['id'], performed_by='sarah@clinic.com'
        )

        appt.refresh_from_db()
        self.assertEqual(appt.doctor.id, self.doctor.id)


# ======================================================================
# Fix 1 - the undo strip must survive a refresh (and another receptionist).
# The batch was always in the database; nothing ever read it back.
# ======================================================================


class DisruptionLastBatchTests(_DisruptionFixture, APITestCase):
    """GET /api/v1/disruptions/batches/last/ - what the strip shows on load."""

    def setUp(self):
        super().setUp()
        cache.clear()
        self.receptionist = StaffUser.objects.create(
            full_name='Sarah Reload', email='sarah.reload@clinic.com',
            role='receptionist', is_active=True,
        )
        self.receptionist.set_password('SarahPass123!')
        self.receptionist.save()

    def tearDown(self):
        cache.clear()

    def _get(self):
        self.client.force_authenticate(user=self.receptionist)
        return self.client.get('/api/v1/disruptions/batches/last/')

    def test_requires_staff_auth(self):
        res = self.client.get('/api/v1/disruptions/batches/last/')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_no_plan_yet_means_no_strip(self):
        res = self._get()
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIsNone(res.data['batch'])

    def test_returns_the_plan_that_was_just_approved(self):
        monday = self._next_monday()
        self._book(self.doctor, monday, 11, 0, phone='+2348055567601')
        report = self._approve(monday)

        res = self._get()

        batch = res.data['batch']
        self.assertEqual(batch['id'], report['batch']['id'])
        self.assertEqual(batch['doctor_name'], 'Dr. Bello Strand')
        self.assertEqual(batch['placed_count'], 1)
        self.assertEqual(batch['unplaced_count'], 0)
        self.assertTrue(batch['can_undo'])
        self.assertIsNone(batch['undo_reason'])

    def test_after_undo_there_is_nothing_left_to_undo(self):
        monday = self._next_monday()
        self._book(self.doctor, monday, 11, 0, phone='+2348055567602')
        report = self._approve(monday)
        DisruptionService.undo_disruption_batch(
            report['batch']['id'], performed_by='sarah@clinic.com'
        )

        res = self._get()

        self.assertIsNone(res.data['batch'])

    def test_a_blocked_plan_comes_back_with_djangos_reason(self):
        monday = self._next_monday()
        appt = self._book(self.doctor, monday, 11, 0, phone='+2348055567603')
        self._approve(monday)
        InteractionLog.objects.filter(appointment=appt).update(status='delivered')

        res = self._get()

        batch = res.data['batch']
        self.assertFalse(batch['can_undo'])
        self.assertIn('reached patients', batch['undo_reason'])

    def test_a_plan_from_days_ago_is_history_not_a_button(self):
        monday = self._next_monday()
        self._book(self.doctor, monday, 11, 0, phone='+2348055567604')
        report = self._approve(monday)
        DisruptionBatch.objects.filter(id=report['batch']['id']).update(
            created_at=timezone.now() - datetime.timedelta(days=3)
        )

        res = self._get()

        self.assertIsNone(res.data['batch'])


# ======================================================================
# Gap 2 - the stranded panel needs a real per-patient move. Django decides
# who can take the patient at that exact time, using the same gate the move
# itself uses (_apply_move): qualified, active, working that day, inside
# their shift, under the daily limit, and free at that time.
# ======================================================================


class StrandedMoveOptionsTests(_DisruptionFixture):
    """Every stranded patient lists the colleagues who could take them,
    each with Django's own reason when they cannot."""

    def _options_for(self, appointment_code):
        stranded = DisruptionService.list_stranded()
        for day in stranded['days']:
            for patient in day['patients']:
                if patient['appointment_code'] == appointment_code:
                    return patient['colleagues']
        self.fail(f'{appointment_code} is not in the stranded list')

    def _strand_one(self, hour=11, minute=0, name='Move Candidate',
                    phone='+2348055567700'):
        monday = self._next_monday()
        appt = self._book(self.doctor, monday, hour, minute, name=name, phone=phone)
        self._approve(monday, colleague_ids=[], max_lookahead_days=0)
        return monday, appt

    def test_only_colleagues_who_offer_the_service_are_offered(self):
        unqualified = Doctor.objects.create(
            name='Dr. Ada General', specialty='General Practice',
            working_days=[1, 2, 3, 4, 5, 6], shift_start=datetime.time(8, 0),
            shift_end=datetime.time(16, 0), max_daily_appointments=10,
        )
        monday, appt = self._strand_one()

        options = self._options_for(appt.appointment_code)

        names = [option['name'] for option in options]
        self.assertNotIn(unqualified.name, names)
        self.assertIn('Dr. Chinwe Strand', names)
        self.assertIn('Dr. Tunde Strand', names)

    def test_a_free_qualified_colleague_is_available(self):
        monday, appt = self._strand_one()

        options = self._options_for(appt.appointment_code)
        chinwe = next(o for o in options if o['name'] == 'Dr. Chinwe Strand')

        self.assertTrue(chinwe['available'])
        self.assertIsNone(chinwe['reason'])
        self.assertIsNone(chinwe['text'])
        self.assertTrue(chinwe['id'])

    def test_a_busy_colleague_carries_djangos_reason(self):
        monday, appt = self._strand_one()
        self._book(self.colleague, monday, 11, 0, name='Already There',
                   phone='+2348055567701')

        options = self._options_for(appt.appointment_code)
        chinwe = next(o for o in options if o['name'] == 'Dr. Chinwe Strand')

        self.assertFalse(chinwe['available'])
        self.assertEqual(chinwe['reason'], 'BUSY')
        self.assertEqual(chinwe['text'], 'Busy at 11:00 AM.')

    def test_a_colleague_at_the_daily_limit_is_named_as_such(self):
        monday, appt = self._strand_one()
        self.third.max_daily_appointments = 1
        self.third.save()
        self._book(self.third, monday, 14, 0, name='Filling The Day',
                   phone='+2348055567702')

        options = self._options_for(appt.appointment_code)
        tunde = next(o for o in options if o['name'] == 'Dr. Tunde Strand')

        self.assertFalse(tunde['available'])
        self.assertEqual(tunde['reason'], 'AT_CAP')
        self.assertEqual(tunde['text'], 'Already at the daily limit (1 of 1).')

    def test_a_colleague_on_leave_that_day_is_named_as_such(self):
        monday, appt = self._strand_one()
        DoctorLeave.objects.create(
            doctor=self.third, start_date=monday, end_date=monday,
            leave_type='sick', reason='Sick leave',
        )

        options = self._options_for(appt.appointment_code)
        tunde = next(o for o in options if o['name'] == 'Dr. Tunde Strand')

        self.assertFalse(tunde['available'])
        self.assertEqual(tunde['reason'], 'ON_LEAVE')
        self.assertEqual(tunde['text'], 'On leave that day.')

    def test_a_colleague_off_duty_that_weekday_is_named_as_such(self):
        monday, appt = self._strand_one()
        self.third.working_days = [2, 3, 4, 5, 6]
        self.third.save()

        options = self._options_for(appt.appointment_code)
        tunde = next(o for o in options if o['name'] == 'Dr. Tunde Strand')

        self.assertFalse(tunde['available'])
        self.assertEqual(tunde['reason'], 'OFF_DUTY')
        self.assertEqual(tunde['text'], 'Not on duty that day.')

    def test_a_colleague_outside_their_shift_is_named_as_such(self):
        monday, appt = self._strand_one(hour=11)
        self.third.shift_start = datetime.time(8, 0)
        self.third.shift_end = datetime.time(10, 30)
        self.third.save()

        options = self._options_for(appt.appointment_code)
        tunde = next(o for o in options if o['name'] == 'Dr. Tunde Strand')

        self.assertFalse(tunde['available'])
        self.assertEqual(tunde['reason'], 'OUTSIDE_SHIFT')
        self.assertEqual(tunde['text'], 'Outside their shift (8:00 AM to 10:30 AM).')

    def test_available_colleagues_come_first(self):
        monday, appt = self._strand_one()
        self._book(self.colleague, monday, 11, 0, name='Already There',
                   phone='+2348055567703')

        options = self._options_for(appt.appointment_code)

        availability = [option['available'] for option in options]
        self.assertEqual(availability, sorted(availability, reverse=True))

    def test_a_patient_nobody_qualifies_for_has_an_empty_list(self):
        monday, appt = self._strand_one()
        DoctorService.objects.filter(service=self.service).exclude(
            doctor=self.doctor
        ).delete()

        options = self._options_for(appt.appointment_code)

        self.assertEqual(options, [])


# ======================================================================
# Gap 3 - workflow 08 must ask before it sends. "queued" in Django means
# "not sent yet", not "never will be": an undo can mark a claim expired
# while the workflow is already running. Django answers per claim whether
# the notice is still safe to deliver.
# ======================================================================


class DisruptionClaimCheckTests(_DisruptionFixture, APITestCase):
    """The claim-liveness endpoint n8n calls before any send node."""

    URL = '/api/v1/webhooks/disruption-claims/check/'

    def _queued_refs(self):
        monday = self._next_monday()
        self._book(self.doctor, monday, 11, 0, name='Amina Claimed',
                   phone='+2348055567800')
        self._approve(monday, max_lookahead_days=0)
        return list(
            InteractionLog.objects.filter(
                direction='outbound', external_ref__startswith='disrupt-'
            ).values_list('external_ref', flat=True)
        )

    def _check(self, refs, secret='clinic_dev_secret_2026'):
        kwargs = {'format': 'json'}
        if secret is not None:
            kwargs['HTTP_X_WEBHOOK_SECRET'] = secret
        return self.client.post(self.URL, {'claim_refs': refs}, **kwargs)

    def test_a_queued_notice_is_live(self):
        refs = self._queued_refs()
        self.assertEqual(len(refs), 2)  # one per channel

        response = self._check(refs)

        self.assertEqual(response.status_code, 200)
        for ref in refs:
            self.assertTrue(response.data['claims'][ref]['live'])
            self.assertEqual(response.data['claims'][ref]['status'], 'queued')

    def test_an_expired_notice_is_not_live(self):
        refs = self._queued_refs()
        InteractionLog.objects.filter(external_ref=refs[0]).update(status='expired')

        response = self._check(refs)

        claim = response.data['claims'][refs[0]]
        self.assertFalse(claim['live'])
        self.assertEqual(claim['status'], 'expired')

    def test_a_sent_notice_is_not_live(self):
        refs = self._queued_refs()
        InteractionLog.objects.filter(external_ref=refs[0]).update(status='sent')

        response = self._check(refs)

        claim = response.data['claims'][refs[0]]
        self.assertFalse(claim['live'])
        self.assertEqual(claim['status'], 'sent')

    def test_a_failed_notice_is_not_live(self):
        refs = self._queued_refs()
        InteractionLog.objects.filter(external_ref=refs[0]).update(status='failed')

        response = self._check(refs)

        claim = response.data['claims'][refs[0]]
        self.assertFalse(claim['live'])
        self.assertEqual(claim['status'], 'failed')

    def test_an_unknown_ref_is_not_live(self):
        response = self._check(['disrupt-AP-0000-deadbeef-sms'])

        claim = response.data['claims']['disrupt-AP-0000-deadbeef-sms']
        self.assertFalse(claim['live'])
        self.assertEqual(claim['status'], 'missing')

    def test_mixed_refs_are_answered_one_by_one(self):
        refs = self._queued_refs()
        InteractionLog.objects.filter(external_ref=refs[1]).update(status='expired')

        response = self._check(refs + ['disrupt-AP-0000-deadbeef-sms'])

        claims = response.data['claims']
        self.assertTrue(claims[refs[0]]['live'])
        self.assertFalse(claims[refs[1]]['live'])
        self.assertFalse(claims['disrupt-AP-0000-deadbeef-sms']['live'])

    def test_an_inbound_or_foreign_ref_never_counts_as_a_claim(self):
        InteractionLog.objects.create(
            provider='meta_whatsapp', channel='whatsapp', direction='inbound',
            status='queued', patient_name='Amina Claimed',
            patient_phone='+2348055567800', external_ref='wamid.NOTACLAIM',
            summary='patient reply',
        )

        response = self._check(['wamid.NOTACLAIM'])

        claim = response.data['claims']['wamid.NOTACLAIM']
        self.assertFalse(claim['live'])
        self.assertEqual(claim['status'], 'missing')

    def test_missing_secret_is_rejected(self):
        refs = self._queued_refs()

        response = self._check(refs, secret=None)

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data['error'], 'INVALID_WEBHOOK_SECRET')

    def test_wrong_secret_is_rejected(self):
        refs = self._queued_refs()

        response = self._check(refs, secret='attacker-guess-123')

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data['error'], 'INVALID_WEBHOOK_SECRET')

    def test_missing_claim_refs_is_a_bad_request(self):
        response = self.client.post(
            self.URL, {'claim_refs': 'not-a-list'}, format='json',
            HTTP_X_WEBHOOK_SECRET='clinic_dev_secret_2026',
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['error'], 'CLAIM_REFS_REQUIRED')

    def test_empty_list_returns_no_claims(self):
        response = self._check([])

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['claims'], {})

    def test_an_oversized_batch_is_rejected(self):
        refs = [f'disrupt-AP-{i:04d}-deadbeef-sms' for i in range(501)]

        response = self._check(refs)

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['error'], 'TOO_MANY_CLAIMS')

class ClaimCloseOnLogTests(_DisruptionFixture, APITestCase):
    """
    Gap 4 - a delivered notice closes its claim.

    Workflow 08's log nodes report the provider's own id as `external_ref`
    (``mock-sms-AP-0007-...``), while the claim row Django queued is keyed by
    ``disrupt-<code>-<signature>-<channel>``. Without a `claim_ref` in the same
    payload the outcome lands on a second row and the claim stays `queued`
    forever, so the claim gate keeps saying `live: true` for a message the
    patient has already received.
    """

    URL = '/api/v1/interactions/'
    CHECK = '/api/v1/webhooks/disruption-claims/check/'
    SECRET = 'clinic_dev_secret_2026'

    def _queued_refs(self):
        monday = self._next_monday()
        self._book(self.doctor, monday, 11, 0, name='Amina Closed',
                   phone='+2348055567801')
        self._approve(monday, max_lookahead_days=0)
        return list(
            InteractionLog.objects.filter(
                direction='outbound', external_ref__startswith='disrupt-'
            ).values_list('external_ref', flat=True)
        )

    def _log(self, **overrides):
        payload = {
            'provider': 'voicebip',
            'channel': 'sms',
            'direction': 'outbound',
            'status': 'sent',
            'patient_name': 'Amina Closed',
            'patient_phone': '+2348055567801',
            'external_ref': 'mock-sms-AP-0007-provider',
            'summary': 'Disruption notice sent via SMS',
        }
        payload.update(overrides)
        return self.client.post(
            self.URL, payload, format='json', HTTP_X_WEBHOOK_SECRET=self.SECRET
        )

    def _claim(self, ref):
        return InteractionLog.objects.get(external_ref=ref)

    def _live(self, ref):
        response = self.client.post(
            self.CHECK, {'claim_refs': [ref]}, format='json',
            HTTP_X_WEBHOOK_SECRET=self.SECRET,
        )
        return response.data['claims'][ref]['live']

    def test_a_sent_log_closes_its_claim(self):
        refs = self._queued_refs()
        sms = next(ref for ref in refs if ref.endswith('-sms'))

        response = self._log(claim_ref=sms)

        self.assertEqual(response.status_code, 201)
        claim = self._claim(sms)
        self.assertEqual(claim.status, 'sent')
        self.assertEqual(claim.summary, 'Disruption notice sent via SMS')
        # the provider's own row still exists for delivery receipts
        self.assertTrue(
            InteractionLog.objects.filter(
                external_ref='mock-sms-AP-0007-provider'
            ).exists()
        )
        # and the gate now refuses to deliver it again
        self.assertFalse(self._live(sms))

    def test_closing_the_claim_never_moves_its_identity(self):
        refs = self._queued_refs()
        sms = next(ref for ref in refs if ref.endswith('-sms'))

        self._log(claim_ref=sms)

        claim = self._claim(sms)
        self.assertEqual(claim.external_ref, sms)
        self.assertEqual(claim.patient_phone, '+2348055567801')

    def test_a_late_sent_event_never_downgrades_a_delivered_claim(self):
        refs = self._queued_refs()
        sms = next(ref for ref in refs if ref.endswith('-sms'))
        InteractionLog.objects.filter(external_ref=sms).update(status='delivered')

        response = self._log(claim_ref=sms, status='sent')

        self.assertEqual(response.status_code, 201)
        self.assertEqual(self._claim(sms).status, 'delivered')

    def test_a_failed_log_closes_the_claim_as_failed(self):
        refs = self._queued_refs()
        sms = next(ref for ref in refs if ref.endswith('-sms'))

        response = self._log(
            claim_ref=sms, status='failed', external_ref='',
            error_detail='Provider rejected the request: bad sender id',
        )

        self.assertEqual(response.status_code, 201)
        claim = self._claim(sms)
        self.assertEqual(claim.status, 'failed')
        self.assertIn('bad sender id', claim.error_detail)
        self.assertFalse(self._live(sms))

    def test_an_unknown_claim_ref_is_ignored(self):
        refs = self._queued_refs()

        response = self._log(claim_ref='disrupt-AP-0000-deadbeef-sms')

        self.assertEqual(response.status_code, 201)
        self.assertTrue(
            InteractionLog.objects.filter(
                external_ref='mock-sms-AP-0007-provider'
            ).exists()
        )
        self.assertTrue(all(self._claim(ref).status == 'queued' for ref in refs))

    def test_a_claim_ref_for_the_other_channel_is_ignored(self):
        refs = self._queued_refs()
        whatsapp = next(ref for ref in refs if ref.endswith('-whatsapp'))

        response = self._log(claim_ref=whatsapp, channel='sms')

        self.assertEqual(response.status_code, 201)
        self.assertEqual(self._claim(whatsapp).status, 'queued')

    def test_an_inbound_row_is_never_closed_by_a_log(self):
        InteractionLog.objects.create(
            provider='meta_whatsapp', channel='whatsapp', direction='inbound',
            status='queued', patient_name='Amina Closed',
            patient_phone='+2348055567801', external_ref='wamid.NOTACLAIM',
            summary='patient reply',
        )

        self._log(claim_ref='wamid.NOTACLAIM', channel='whatsapp',
                  provider='meta_whatsapp')

        self.assertEqual(self._claim('wamid.NOTACLAIM').status, 'queued')

    def test_closing_a_claim_blocks_undo(self):
        monday = self._next_monday()
        self._book(self.doctor, monday, 11, 0, name='Amina Undo',
                   phone='+2348055567802')
        report = self._approve(monday, max_lookahead_days=0)
        sms = next(
            ref for ref in
            InteractionLog.objects.filter(
                direction='outbound', external_ref__startswith='disrupt-'
            ).values_list('external_ref', flat=True)
            if ref.endswith('-sms')
        )

        self._log(claim_ref=sms, patient_phone='+2348055567802')

        from appointments.services.disruption_service import DisruptionService
        batch = DisruptionBatch.objects.get(id=report['batch']['id'])
        blocker = DisruptionService._undo_blocker(batch)
        self.assertIsNotNone(blocker)
        self.assertEqual(blocker[0], 'NOTICES_DELIVERED')

