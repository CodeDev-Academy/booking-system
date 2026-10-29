import uuid
import datetime
from django.test import TestCase, override_settings
from django.utils import timezone
from django.core.cache import cache
from rest_framework.test import APITestCase
from rest_framework import status
from .models import (
    ClinicSetting,
    StaffUser,
    Doctor,
    Service,
    DoctorService,
    AvailabilityRule,
    BookingRequest,
    SlotOffer,
    Appointment,
    FollowUpTask,
    AuditLog,
    IdempotencyKey,
)
from .services.availability import AvailabilityEngine
from .services.hold_service import HoldService, SlotConflictException
from .services.disruption_service import DisruptionService
from .services.sweep_service import SweepService


class DomainModelTests(TestCase):
    """
    Verifies that all 11 clinical domain models, constraint rules,
    PIN hashing, password hashing, and auto-generated codes behave as specified.
    """

    def setUp(self):
        self.clinic = ClinicSetting.get_settings()
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
        slot1_start = now + datetime.timedelta(days=1, hours=2)
        slot1_end = slot1_start + datetime.timedelta(minutes=30)
        slot2_start = now + datetime.timedelta(days=1, hours=4)
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

    def test_front_desk_inquiry_dispatch_t307(self):
        """
        T-307: POST /api/v1/booking-requests/{id}/ask-info/ logs clarification inquiry
        to patient_notes and creates an AuditLog entry.
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
        self.assertEqual(res.data['status'], 'dispatched')

        # Verify patient_notes updated
        req.refresh_from_db()
        self.assertIn('would 10:30 AM or 2:00 PM suit you better?', req.patient_notes)

        # Verify AuditLog created
        audit = AuditLog.objects.filter(
            entity_name='BookingRequest',
            entity_id=req.id,
            action='PATIENT_INQUIRY_DISPATCHED'
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

        tomorrow = timezone.now() + datetime.timedelta(days=1)
        slot_start = tomorrow.replace(hour=10, minute=0, second=0, microsecond=0)
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
        }, format='json')

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
        tomorrow = timezone.now() + datetime.timedelta(days=1)
        start1 = tomorrow.replace(hour=11, minute=0, second=0, microsecond=0)
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
        }, format='json')

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
        GET /api/v1/realtime/events/?limit=1 connects to SSE stream,
        returns text/event-stream with X-Accel-Buffering: no, and yields initial connected event.
        """
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
        res1 = self.client.post('/api/v1/webhooks/messaging/inbound/', webhook_payload, format='json')
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
        res2 = self.client.post('/api/v1/webhooks/messaging/inbound/', webhook_payload, format='json')
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
        self.offer = SlotOffer.objects.create(
            request=self.booking,
            doctor=self.doctor,
            start_datetime=now + datetime.timedelta(days=1, hours=2),
            end_datetime=now + datetime.timedelta(days=1, hours=2, minutes=30),
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
        Patient clicks a service button (book_svc_<id>) in Telegram -> creates BookingRequest
        with telegram_chat_id in patient_notes, and receptionist can dispatch offers without error.
        """
        payload = {
            'update_id': 100200308,
            'channel': 'telegram',
            'callback_query': {
                'id': 'cq_book_svc_1',
                'data': f'book_svc_{self.service.id}',
                'from': {'id': 98765432, 'first_name': 'Musa', 'last_name': 'Yusuf'},
                'message': {'message_id': 562, 'chat': {'id': 98765432}}
            }
        }
        res = self.client.post('/api/v1/webhooks/telegram/inbound/', payload, format='json')
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

        slot_start = timezone.now() + datetime.timedelta(days=1, hours=3)
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
        res = self.client.post('/api/v1/slots/hold/', overlap_payload, format='json')
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
        select_res = self.client.post('/api/v1/webhooks/telegram/inbound/', tg_payload, format='json')
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
        confirm_res = self.client.post('/api/v1/webhooks/telegram/inbound/', confirm_payload, format='json')
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
        self.assertEqual(user_obj.get('role_label'), 'Lead Receptionist')
        self.assertEqual(user_obj.get('shift'), 'Morning Shift (08:00 – 16:00)')
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
        """POST /api/v1/auth/verify-pin/ verifies 4-digit PIN and locks out after 3 failures."""
        # Valid PIN
        res = self.client.post('/api/v1/auth/verify-pin/', {
            'email': self.receptionist.email,
            'pin': '1234',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data.get('status'), 'unlocked')

        # 3 Failed attempts
        for attempt in range(2):
            fail_res = self.client.post('/api/v1/auth/verify-pin/', {
                'email': self.receptionist.email,
                'pin': '0000',
            }, format='json')
            self.assertEqual(fail_res.status_code, status.HTTP_400_BAD_REQUEST)

        # 3rd failed attempt triggers 60s lockout
        lock_res = self.client.post('/api/v1/auth/verify-pin/', {
            'email': self.receptionist.email,
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








