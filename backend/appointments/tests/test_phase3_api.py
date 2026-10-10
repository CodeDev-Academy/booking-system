"""
Automated Test Suite for Phase 3 REST API Viewsets, Staff Auth & Real-Time Events.
Tests:
- Task 3.1: Staff Auth API (Login, PIN unlock, Deactivation)
- Task 3.2: Intake & Booking Requests API (FIFO queue, check-slots, dispatch-offers, ask-info)
- Task 3.3: Appointments & Live Visit API (Slot hold, status progression, follow-up)
- Task 3.4: Clinic Settings & Staff Directory API
- Task 3.5: Analytics Summary & CSV Export
"""

import hashlib
from datetime import date, time, timedelta
from django.urls import reverse
from django.utils import timezone
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase
from appointments.models import (
    ClinicSetting,
    StaffUser,
    Doctor,
    Service,
    DoctorService,
    BookingRequest,
    Appointment,
)

User = get_user_model()


class Phase3APITestCase(APITestCase):
    def setUp(self):
        # 1. Clinic Setting
        self.clinic = ClinicSetting.objects.create(
            clinic_name='Cedarcare Specialist Clinic',
            open_time=time(8, 0),
            close_time=time(18, 0),
            working_days=[1, 2, 3, 4, 5, 6],
            lunch_break_start=time(13, 0),
            lunch_break_end=time(14, 0),
            offer_expiry_minutes=60,
            hold_expiry_minutes=15,
        )

        # 2. Staff User (Sarah - Receptionist)
        self.user_sarah = User.objects.create_user(
            username='sarah@clinic.com',
            email='sarah@clinic.com',
            password='reception123',
            first_name='Sarah',
            last_name='Receptionist',
        )
        self.staff_sarah = StaffUser.objects.create(
            user=self.user_sarah,
            role='receptionist',
            quick_pin_hash=hashlib.sha256('1234'.encode()).hexdigest(),
            is_active=True,
        )

        # 3. Doctor & Service
        self.doctor = Doctor.objects.create(
            name='Dr. Aminu Bello',
            specialty='Dentistry',
            working_days=[1, 2, 3, 4, 5],
            shift_start=time(9, 0),
            shift_end=time(17, 0),
            is_active=True,
        )

        self.service = Service.objects.create(
            name='Dental Consultation',
            duration_minutes=30,
            buffer_minutes=10,
            price=15000.00,
            deposit_required=True,
            is_active=True,
        )
        DoctorService.objects.create(doctor=self.doctor, service=self.service)

    # --- Task 3.1 Tests: Staff Auth & Governance ---
    def test_login_success_and_failure(self):
        # Valid login
        url = reverse('appointments:auth-login')
        res = self.client.post(url, {'email': 'sarah@clinic.com', 'password': 'reception123'})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('access', res.data)
        self.assertIn('refresh', res.data)
        self.assertEqual(res.data['user']['role'], 'receptionist')

        # Invalid password
        bad_res = self.client.post(url, {'email': 'sarah@clinic.com', 'password': 'wrongpassword'})
        self.assertEqual(bad_res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_pin_unlock(self):
        url = reverse('appointments:auth-pin-unlock')
        res = self.client.post(url, {'pin': '1234', 'email': 'sarah@clinic.com'})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data['success'])

        # Bad PIN
        bad_res = self.client.post(url, {'pin': '0000', 'email': 'sarah@clinic.com'})
        self.assertEqual(bad_res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_staff_deactivation(self):
        url = reverse('appointments:admin-staff-deactivate', kwargs={'pk': str(self.staff_sarah.id)})
        res = self.client.post(url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertFalse(res.data['is_active'])

        # Attempt login after deactivation
        login_url = reverse('appointments:auth-login')
        login_res = self.client.post(login_url, {'email': 'sarah@clinic.com', 'password': 'reception123'})
        self.assertEqual(login_res.status_code, status.HTTP_403_FORBIDDEN)

    # --- Task 3.2 Tests: Booking Requests Lifecycle ---
    def test_booking_request_create_and_list(self):
        create_url = reverse('appointments:booking-request-list')
        payload = {
            'patient_name': 'Amina Yusuf',
            'patient_phone': '+2348012345678',
            'patient_type': 'new',
            'service_id': str(self.service.id),
            'preferred_dates': [str(timezone.now().date() + timedelta(days=2))],
            'preferred_time_window': 'morning',
            'channel': 'web',
        }
        res = self.client.post(create_url, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertIn('request_id', res.data)
        self.assertEqual(res.data['status'], 'awaiting_review')

        # List requests with FIFO ordering
        list_res = self.client.get(create_url)
        self.assertEqual(list_res.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(list_res.data), 1)

    def test_check_slots_and_dispatch_offers(self):
        # Create request
        req = BookingRequest.objects.create(
            request_code='REQ-TEST-SLOTS',
            patient_name='Chinedu Eze',
            patient_phone='+2348055555555',
            service=self.service,
            preferred_doctor=self.doctor,
            preferred_date_start=timezone.now().date() + timedelta(days=2),
            status='awaiting_review',
        )

        # Check slots
        check_url = reverse('appointments:booking-request-check-slots', kwargs={'pk': str(req.id)})
        check_res = self.client.post(check_url)
        self.assertEqual(check_res.status_code, status.HTTP_200_OK)
        self.assertIn('suggested_slots', check_res.data)

        # Dispatch offers
        dispatch_url = reverse('appointments:booking-request-dispatch-offers', kwargs={'pk': str(req.id)})
        slots_to_dispatch = check_res.data['suggested_slots'][:3]
        dispatch_res = self.client.post(dispatch_url, {'slots': slots_to_dispatch}, format='json')
        self.assertEqual(dispatch_res.status_code, status.HTTP_200_OK)
        self.assertEqual(dispatch_res.data['status'], 'slots_offered')
        self.assertIsNotNone(dispatch_res.data['expires_at'])

        req.refresh_from_db()
        self.assertEqual(req.status, 'slots_offered')
        self.assertIsNotNone(req.offer_expires_at)

    # --- Task 3.3 Tests: Appointment Hold & Live Visit Status ---
    def test_slot_hold_and_status_progression(self):
        now = timezone.now()
        start_dt = now + timedelta(days=3)
        end_dt = start_dt + timedelta(minutes=40)

        # Hold slot
        hold_url = reverse('appointments:slots-hold')
        hold_res = self.client.post(hold_url, {
            'doctor_id': str(self.doctor.id),
            'service_id': str(self.service.id),
            'start_datetime': start_dt.isoformat(),
            'end_datetime': end_dt.isoformat(),
            'patient_name': 'Test Hold Patient',
            'patient_phone': '+2348033333333',
        }, format='json')

        self.assertIn(hold_res.status_code, [status.HTTP_200_OK, status.HTTP_201_CREATED])
        appt_code = hold_res.data['appointment_id']

        appt = Appointment.objects.get(appointment_code=appt_code)

        # Advance status: Arrived
        status_url = reverse('appointments:appointment-status', kwargs={'pk': str(appt.id)})
        res_arrived = self.client.patch(status_url, {'status': 'arrived'}, format='json')
        self.assertEqual(res_arrived.status_code, status.HTTP_200_OK)
        appt.refresh_from_db()
        self.assertEqual(appt.status, 'arrived')
        self.assertIsNotNone(appt.arrival_at)

        # Advance status: In Consultation
        res_consult = self.client.patch(status_url, {'status': 'in_consultation'}, format='json')
        self.assertEqual(res_consult.status_code, status.HTTP_200_OK)
        appt.refresh_from_db()
        self.assertEqual(appt.status, 'in_consultation')

        # Advance status: Completed
        res_done = self.client.patch(status_url, {'status': 'completed'}, format='json')
        self.assertEqual(res_done.status_code, status.HTTP_200_OK)
        appt.refresh_from_db()
        self.assertEqual(appt.status, 'completed')
        self.assertIsNotNone(appt.completed_at)

    # --- Task 3.4 & 3.6 Tests: Settings, Directory & Analytics ---
    def test_clinic_settings_and_staff_directory(self):
        # Settings GET
        settings_url = reverse('appointments:clinic-settings')
        res = self.client.get(settings_url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['clinic_name'], 'Cedarcare Specialist Clinic')

        # Settings PATCH
        patch_res = self.client.patch(settings_url, {'tagline': 'Premium Healthcare Wuse 2'}, format='json')
        self.assertEqual(patch_res.status_code, status.HTTP_200_OK)
        self.assertEqual(patch_res.data['tagline'], 'Premium Healthcare Wuse 2')

        # Staff Directory GET
        directory_url = reverse('appointments:clinic-staff-directory')
        dir_res = self.client.get(directory_url)
        self.assertEqual(dir_res.status_code, status.HTTP_200_OK)
        self.assertIn('doctors', dir_res.data)
        self.assertIn('staff', dir_res.data)

    def test_analytics_and_csv_export(self):
        summary_url = reverse('appointments:analytics-summary')
        res = self.client.get(summary_url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('kpis', res.data)

        # CSV Export
        export_url = reverse('appointments:analytics-export', kwargs={'report_type': 'appointments'})
        csv_res = self.client.get(export_url)
        self.assertEqual(csv_res.status_code, status.HTTP_200_OK)
        self.assertEqual(csv_res['Content-Type'], 'text/csv')
