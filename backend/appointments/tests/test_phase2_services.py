"""
Automated Test Suite for Phase 2 Scheduling & Availability Services.
Tests:
- Task 2.1: AvailabilityEngine core calculation & scoring
- Task 2.2: Nearest-Alternative Fallback
- Task 2.3: HoldService atomic holds and conflict prevention
- Task 2.4: DisruptionService doctor leave reassignment
- Task 2.5: SweepService 60s offer & hold expiry cleanup
"""

import uuid
from datetime import date, time, timedelta
from django.test import TestCase
from django.utils import timezone
from django.contrib.auth import get_user_model
from appointments.models import (
    ClinicSetting,
    Doctor,
    Service,
    DoctorService,
    BookingRequest,
    Appointment,
    AuditLog,
)
from appointments.services.availability import AvailabilityEngine
from appointments.services.hold_service import HoldService
from appointments.services.disruption_service import DisruptionService
from appointments.services.sweep_service import SweepService

User = get_user_model()


class Phase2ServicesTestCase(TestCase):
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
            default_buffer_minutes=10,
            emergency_slots_per_shift=1,
        )

        # 2. Doctors
        self.dr_bello = Doctor.objects.create(
            name='Dr. Aminu Bello',
            specialty='Dentistry',
            working_days=[1, 2, 3, 4, 5],  # Mon-Fri
            shift_start=time(9, 0),
            shift_end=time(17, 0),
            is_active=True,
            is_on_leave=False,
        )

        self.dr_okafor = Doctor.objects.create(
            name='Dr. Ngozi Okafor',
            specialty='Dentistry',
            working_days=[1, 2, 3, 4, 5],  # Mon-Fri
            shift_start=time(9, 0),
            shift_end=time(17, 0),
            is_active=True,
            is_on_leave=False,
        )

        # 3. Service (30m consult + 10m buffer = 40m total)
        self.dental_service = Service.objects.create(
            name='Dental Consultation',
            duration_minutes=30,
            buffer_minutes=10,
            price=15000.00,
            deposit_required=True,
            is_active=True,
        )

        # Link both doctors to service
        DoctorService.objects.create(doctor=self.dr_bello, service=self.dental_service)
        DoctorService.objects.create(doctor=self.dr_okafor, service=self.dental_service)

    def test_availability_calculation_and_scoring(self):
        """Tests that eligible slots are generated with correct durations and scores."""
        engine = AvailabilityEngine(clinic_setting=self.clinic)

        # Pick next Monday
        today = timezone.now().date()
        days_ahead = (0 - today.weekday()) % 7
        if days_ahead == 0:
            days_ahead = 7
        next_monday = today + timedelta(days=days_ahead)

        slots = engine.calculate_available_slots(
            service=self.dental_service,
            start_date=next_monday,
            end_date=next_monday,
            preferred_doctor=self.dr_bello,
            preferred_time_window='morning',
            limit=5,
        )

        self.assertGreater(len(slots), 0)
        first_slot = slots[0]
        self.assertEqual(first_slot['doctor_name'], self.dr_bello.name)
        self.assertEqual(first_slot['duration_minutes'], 30)
        self.assertEqual(first_slot['buffer_minutes'], 10)
        self.assertFalse(first_slot['is_alternative_date'])
        self.assertIn('p_date', first_slot['score_breakdown'])
        self.assertGreaterEqual(first_slot['score'], 90)

    def test_hold_service_atomic_acquisition_and_conflict(self):
        """Tests slot hold acquisition and race-condition conflict handling."""
        hold_service = HoldService(clinic_setting=self.clinic)

        now = timezone.now()
        slot_start = (now + timedelta(days=2)).replace(hour=10, minute=0, second=0, microsecond=0)
        slot_end = slot_start + timedelta(minutes=40)

        # First patient acquires the slot
        res1 = hold_service.acquire_slot(
            doctor=self.dr_bello,
            service=self.dental_service,
            start_datetime=slot_start,
            end_datetime=slot_end,
            patient_name='Patient Alpha',
            patient_phone='+2348011111111',
            actor='Patient Alpha',
        )

        self.assertTrue(res1['success'])
        self.assertEqual(res1['status'], 'held')
        self.assertIsNotNone(res1['hold_expires_at'])

        # Second patient tries to acquire the EXACT same slot concurrently
        res2 = hold_service.acquire_slot(
            doctor=self.dr_bello,
            service=self.dental_service,
            start_datetime=slot_start,
            end_datetime=slot_end,
            patient_name='Patient Beta',
            patient_phone='+2348022222222',
            actor='Patient Beta',
        )

        self.assertFalse(res2['success'])
        self.assertTrue(res2['conflict'])
        self.assertIn('secured by another patient', res2['message'])
        self.assertIn('alternative_slots', res2)

    def test_disruption_service_colleague_reassignment(self):
        """Tests colleague matching when doctor is marked on leave."""
        disruption_service = DisruptionService(clinic_setting=self.clinic)

        now = timezone.now()
        slot_start = (now + timedelta(days=2)).replace(hour=11, minute=0, second=0, microsecond=0)
        slot_end = slot_start + timedelta(minutes=40)

        # Create booking with Dr. Bello
        appt = Appointment.objects.create(
            appointment_code='AP-TEST-LEAVE',
            patient_name='Emergency Patient',
            patient_phone='+2348099999999',
            doctor=self.dr_bello,
            service=self.dental_service,
            start_datetime=slot_start,
            end_datetime=slot_end,
            status='confirmed',
        )

        # Assess impact for Dr. Bello
        report = disruption_service.assess_doctor_leave_impact(self.dr_bello)
        self.assertEqual(report['affected_count'], 1)
        self.assertEqual(report['reassignable_count'], 1)
        self.assertTrue(report['disruptions'][0]['can_instant_reassign'])
        self.assertEqual(report['disruptions'][0]['suggested_doctor_id'], str(self.dr_okafor.id))

        # Reassign to Dr. Okafor
        reassign_res = disruption_service.reassign_appointment(
            appointment_id=str(appt.id),
            new_doctor_id=str(self.dr_okafor.id),
        )

        self.assertTrue(reassign_res['success'])
        appt.refresh_from_db()
        self.assertEqual(appt.doctor.id, self.dr_okafor.id)

    def test_sweep_service_offer_and_hold_expiry(self):
        """Tests automatic garbage collection of expired offers and holds."""
        sweep_service = SweepService()
        now = timezone.now()

        # 1. Expired slot offer
        expired_req = BookingRequest.objects.create(
            request_code='REQ-EXPIRED-TEST',
            patient_name='Late Responder',
            patient_phone='+2348077777777',
            service=self.dental_service,
            preferred_date_start=now.date(),
            status='slots_offered',
            offer_expires_at=now - timedelta(minutes=10),
        )

        # 2. Expired temporary hold
        expired_appt = Appointment.objects.create(
            appointment_code='AP-HOLD-EXPIRED',
            patient_name='Unpaid Patient',
            patient_phone='+2348066666666',
            doctor=self.dr_bello,
            service=self.dental_service,
            start_datetime=now + timedelta(days=1),
            end_datetime=now + timedelta(days=1, minutes=40),
            status='held',
            hold_expires_at=now - timedelta(minutes=5),
        )

        # Run sweep
        sweep_result = sweep_service.sweep_all()

        self.assertGreaterEqual(sweep_result['expired_offers_count'], 1)
        self.assertGreaterEqual(sweep_result['expired_holds_count'], 1)

        expired_req.refresh_from_db()
        self.assertEqual(expired_req.status, 'offer_expired')

        expired_appt.refresh_from_db()
        self.assertEqual(expired_appt.status, 'cancelled')
        self.assertIn('hold expired', expired_appt.cancellation_reason.lower())
