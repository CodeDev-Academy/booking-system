import uuid
import datetime
from django.core.management.base import BaseCommand
from django.utils import timezone
from appointments.models import (
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
)


class Command(BaseCommand):
    help = 'Seeds Cedarcare Specialist Clinic demo data for live testing and agency pitch.'

    def handle(self, *args, **options):
        self.stdout.write(self.style.NOTICE('Seeding Cedarcare Specialist Clinic database...'))

        # 1. Clinic Settings
        clinic, created = ClinicSetting.objects.update_or_create(
            id=uuid.UUID('00000000-0000-0000-0000-000000000001'),
            defaults={
                'clinic_name': 'Cedarcare Specialist Clinic',
                'tagline': 'Excellence in Dental & Family Healthcare',
                'address': 'Plot 1042 Aminu Kano Crescent, Wuse 2, Abuja, FCT',
                'phone': '+2348030001122',
                'whatsapp_phone_id': 'cedarcare_wa_live',
                'open_time': datetime.time(8, 0),
                'close_time': datetime.time(18, 0),
                'working_days': [1, 2, 3, 4, 5, 6],
                'lunch_break_start': datetime.time(13, 0),
                'lunch_break_end': datetime.time(14, 0),
                'grid_increment_minutes': 15,
                'booking_horizon_days': 14,
                'min_advance_hours': 2,
                'offer_expiry_minutes': 60,
                'hold_expiry_minutes': 15,
                'default_buffer_minutes': 10,
                'emergency_slots_per_shift': 1,
                'enable_24h_reminder': True,
                'enable_2h_reminder': False,
                'custom_config': {
                    'currency': 'NGN',
                    'currency_symbol': '₦',
                    'telegram_bot': '@babawo_bot',
                    'telegram_bot_token': '8461748218:AAESXX8H8Z9HCk7id_me37fDTfQ5Dqm8xtY',
                    'theme': 'ember_dark',
                }
            }
        )
        self.stdout.write(self.style.SUCCESS(f"[OK] Clinic Setting: {clinic.clinic_name}"))

        # 2. Staff Accounts
        staff_data = [
            {
                'email': 'admin@clinic.com',
                'full_name': 'Dr. Ibrahim Musa (Medical Director)',
                'role': 'clinic_admin',
                'pin': '9900',
                'password': 'adminpassword123',
            },
            {
                'email': 'sarah@clinic.com',
                'full_name': 'Sarah Aliyu (Lead Receptionist)',
                'role': 'receptionist',
                'pin': '1234',
                'password': 'password123',
            },
            {
                'email': 'chioma@clinic.com',
                'full_name': 'Chioma Okeke (Front Desk Receptionist)',
                'role': 'receptionist',
                'pin': '5678',
                'password': 'password123',
            },
            {
                'email': 'amina@clinic.com',
                'full_name': 'Amina Garba (Front Desk Officer)',
                'role': 'receptionist',
                'pin': '1234',
                'password': 'password123',
            },
            {
                'email': 'sarah@cedarcare.ng',
                'full_name': 'Sarah Aliyu (Lead Receptionist)',
                'role': 'receptionist',
                'pin': '1234',
                'password': 'password123',
            },
            {
                'email': 'admin@cedarcare.ng',
                'full_name': 'Dr. Ibrahim Musa (Practice Manager)',
                'role': 'clinic_admin',
                'pin': '9900',
                'password': 'adminpassword123',
            },
        ]
        for s in staff_data:
            staff, _ = StaffUser.objects.update_or_create(
                email=s['email'],
                defaults={
                    'full_name': s['full_name'],
                    'role': s['role'],
                    'is_active': True,
                }
            )
            staff.set_password(s['password'])
            staff.set_pin(s['pin'])
            staff.save()
            self.stdout.write(self.style.SUCCESS(f"[OK] Staff Account: {staff.full_name} ({staff.email} | PIN: {s['pin']})"))

        # 3. Doctors
        doc_bello, _ = Doctor.objects.update_or_create(
            name='Dr. Bello Ibrahim',
            defaults={
                'email': 'bello@clinic.com',
                'phone': '+2348021112233',
                'specialty': 'Lead Dental Surgeon',
                'working_days': [1, 2, 3, 4, 5],
                'shift_start': datetime.time(9, 0),
                'shift_end': datetime.time(17, 0),
                'max_daily_appointments': 12,
                'is_active': True,
                'is_on_leave': False,
            }
        )
        self.stdout.write(self.style.SUCCESS(f"[OK] Doctor: {doc_bello.name} ({doc_bello.specialty})"))

        doc_okafor, _ = Doctor.objects.update_or_create(
            name='Dr. Chinwe Okafor',
            defaults={
                'email': 'okafor@clinic.com',
                'phone': '+2348039998877',
                'specialty': 'Family Health & General Practitioner',
                'working_days': [1, 2, 3, 4, 5, 6],
                'shift_start': datetime.time(8, 0),
                'shift_end': datetime.time(16, 0),
                'max_daily_appointments': 14,
                'is_active': True,
                'is_on_leave': False,
            }
        )
        self.stdout.write(self.style.SUCCESS(f"[OK] Doctor: {doc_okafor.name} ({doc_okafor.specialty})"))

        doc_babawo, _ = Doctor.objects.update_or_create(
            name='Dr. Babawo',
            defaults={
                'email': 'dr.babawo@cedarcare.ng',
                'phone': '+2348024448899',
                'specialty': 'Consultant Physician & Surgeon',
                'working_days': [1, 2, 3, 4, 5],
                'shift_start': datetime.time(8, 0),
                'shift_end': datetime.time(17, 0),
                'max_daily_appointments': 16,
                'is_active': True,
                'is_on_leave': False,
            }
        )
        self.stdout.write(self.style.SUCCESS(f"[OK] Doctor: {doc_babawo.name} ({doc_babawo.specialty})"))

        # 4. Services
        services_data = [
            {
                'name': 'Dental Consultation & Examination',
                'category': 'Dental Care',
                'duration_minutes': 30,
                'buffer_minutes': 10,
                'price': 15000.00,
                'deposit_required': False,
            },
            {
                'name': 'Tooth Extraction & Minor Surgery',
                'category': 'Dental Surgery',
                'duration_minutes': 45,
                'buffer_minutes': 15,
                'price': 35000.00,
                'deposit_required': True,
            },
            {
                'name': 'Comprehensive General Health Check-up',
                'category': 'Preventative Care',
                'duration_minutes': 25,
                'buffer_minutes': 10,
                'price': 12500.00,
                'deposit_required': False,
            },
        ]
        service_map = {}
        for s in services_data:
            svc, _ = Service.objects.update_or_create(
                name=s['name'],
                defaults=s
            )
            service_map[s['name']] = svc
            self.stdout.write(self.style.SUCCESS(f"[OK] Service: {svc.name} (NGN {svc.price:,.2f})"))

        # 5. Doctor-Service Qualifications
        DoctorService.objects.get_or_create(doctor=doc_bello, service=service_map['Dental Consultation & Examination'])
        DoctorService.objects.get_or_create(doctor=doc_bello, service=service_map['Tooth Extraction & Minor Surgery'])
        DoctorService.objects.get_or_create(doctor=doc_okafor, service=service_map['Comprehensive General Health Check-up'])
        DoctorService.objects.get_or_create(doctor=doc_babawo, service=service_map['Comprehensive General Health Check-up'])
        DoctorService.objects.get_or_create(doctor=doc_babawo, service=service_map['Dental Consultation & Examination'])
        DoctorService.objects.get_or_create(doctor=doc_babawo, service=service_map['Tooth Extraction & Minor Surgery'])
        self.stdout.write(self.style.SUCCESS("[OK] Doctor Service Qualifications linked"))

        # 6. Availability Rules (Emergency Reserve)
        now = timezone.now()
        today = now.date()
        today_start = timezone.make_aware(datetime.datetime.combine(today, datetime.time(12, 0)))
        today_end = timezone.make_aware(datetime.datetime.combine(today, datetime.time(12, 30)))
        AvailabilityRule.objects.get_or_create(
            doctor=doc_bello,
            rule_type='emergency_reserve',
            start_datetime=today_start,
            end_datetime=today_end,
            defaults={'reason': 'Emergency floating slot reserve'}
        )

        # 7. Inbound Booking Requests
        req1, _ = BookingRequest.objects.update_or_create(
            request_code='REQ-2026-0042',
            defaults={
                'patient_name': 'Amina Yusuf',
                'patient_phone': '+2348031234567',
                'patient_type': 'returning',
                'service': service_map['Tooth Extraction & Minor Surgery'],
                'preferred_doctor': doc_bello,
                'preferred_date_range': {'start': str(today), 'end': str(today + datetime.timedelta(days=7))},
                'preferred_time_window': 'morning',
                'channel': 'web',
                'status': 'awaiting_review',
                'patient_notes': 'Experiencing persistent throbbing pain in upper right molar since yesterday.',
            }
        )

        req2, _ = BookingRequest.objects.update_or_create(
            request_code='REQ-2026-0043',
            defaults={
                'patient_name': 'Chukwuma Eze',
                'patient_phone': '+2348099887766',
                'patient_type': 'new',
                'service': service_map['Comprehensive General Health Check-up'],
                'preferred_doctor': doc_okafor,
                'preferred_date_range': {'start': str(today + datetime.timedelta(days=1)), 'end': str(today + datetime.timedelta(days=5))},
                'preferred_time_window': 'afternoon',
                'channel': 'telegram',
                'status': 'awaiting_review',
                'patient_notes': 'Annual physical routine blood work request.',
            }
        )

        req3, _ = BookingRequest.objects.update_or_create(
            request_code='REQ-2026-0040',
            defaults={
                'patient_name': 'Zainab Abba',
                'patient_phone': '+2348123456789',
                'patient_type': 'returning',
                'service': service_map['Dental Consultation & Examination'],
                'preferred_doctor': doc_bello,
                'preferred_date_range': {'start': str(today), 'end': str(today + datetime.timedelta(days=3))},
                'preferred_time_window': 'morning',
                'channel': 'web',
                'status': 're_requested',
                'patient_notes': 'Previous offer expired while in meeting. Re-requested fresh slots.',
            }
        )

        req4, _ = BookingRequest.objects.update_or_create(
            request_code='REQ-2026-0038',
            defaults={
                'patient_name': 'Emeka Okonkwo',
                'patient_phone': '+2348055443322',
                'patient_type': 'new',
                'service': service_map['Dental Consultation & Examination'],
                'preferred_doctor': doc_bello,
                'preferred_date_range': {'start': str(today - datetime.timedelta(days=1)), 'end': str(today + datetime.timedelta(days=4))},
                'preferred_time_window': 'afternoon',
                'channel': 'web',
                'status': 'offer_expired',
                'offer_expires_at': now - datetime.timedelta(minutes=25),
            }
        )
        self.stdout.write(self.style.SUCCESS("[OK] Inbound Triage Requests seeded (New, Re-Requested, Expired)"))

        # 8. Appointments on Master Calendar
        # AP 1: Waiting Room (arrived 14 mins ago)
        appt1_start = timezone.make_aware(datetime.datetime.combine(today, datetime.time(9, 30)))
        appt1_end = timezone.make_aware(datetime.datetime.combine(today, datetime.time(10, 0)))
        Appointment.objects.update_or_create(
            appointment_code='AP-1040',
            defaults={
                'patient_name': 'Mariam Bello',
                'patient_phone': '+2348037776655',
                'doctor': doc_bello,
                'service': service_map['Dental Consultation & Examination'],
                'start_datetime': appt1_start,
                'end_datetime': appt1_end,
                'status': 'arrived',
                'confirmed_at': now - datetime.timedelta(days=1),
                'arrival_at': now - datetime.timedelta(minutes=14),
            }
        )

        # AP 2: In Consultation
        appt2_start = timezone.make_aware(datetime.datetime.combine(today, datetime.time(10, 15)))
        appt2_end = timezone.make_aware(datetime.datetime.combine(today, datetime.time(10, 45)))
        Appointment.objects.update_or_create(
            appointment_code='AP-1039',
            defaults={
                'patient_name': 'Ibrahim Musa',
                'patient_phone': '+2348028889900',
                'doctor': doc_okafor,
                'service': service_map['Comprehensive General Health Check-up'],
                'start_datetime': appt2_start,
                'end_datetime': appt2_end,
                'status': 'in_consultation',
                'confirmed_at': now - datetime.timedelta(days=2),
                'arrival_at': now - datetime.timedelta(minutes=30),
            }
        )

        # AP 3: Completed earlier today with follow-up task
        appt3_start = timezone.make_aware(datetime.datetime.combine(today, datetime.time(8, 30)))
        appt3_end = timezone.make_aware(datetime.datetime.combine(today, datetime.time(9, 15)))
        appt3, _ = Appointment.objects.update_or_create(
            appointment_code='AP-1038',
            defaults={
                'patient_name': 'Ngozi Ade',
                'patient_phone': '+2348061122334',
                'doctor': doc_bello,
                'service': service_map['Tooth Extraction & Minor Surgery'],
                'start_datetime': appt3_start,
                'end_datetime': appt3_end,
                'status': 'completed',
                'confirmed_at': now - datetime.timedelta(days=3),
                'arrival_at': appt3_start - datetime.timedelta(minutes=10),
                'completed_at': appt3_end,
            }
        )
        FollowUpTask.objects.get_or_create(
            appointment=appt3,
            doctor=doc_bello,
            follow_up_date=today + datetime.timedelta(days=7),
            defaults={
                'notes': '1-week suture inspection and healing review after upper premolar extraction.',
                'reminder_sent': False,
                'is_completed': False,
            }
        )

        # AP 4: Held slot with 15m countdown
        appt4_start = timezone.make_aware(datetime.datetime.combine(today, datetime.time(14, 0)))
        appt4_end = timezone.make_aware(datetime.datetime.combine(today, datetime.time(14, 30)))
        Appointment.objects.update_or_create(
            appointment_code='AP-1041',
            defaults={
                'patient_name': 'Tunde Bakare',
                'patient_phone': '+2348074455667',
                'doctor': doc_bello,
                'service': service_map['Dental Consultation & Examination'],
                'start_datetime': appt4_start,
                'end_datetime': appt4_end,
                'status': 'held',
                'hold_expires_at': now + datetime.timedelta(minutes=9),
            }
        )

        # AP 5: Dr. Babawo - Waiting / Confirmed
        appt5_start = timezone.make_aware(datetime.datetime.combine(today, datetime.time(11, 0)))
        appt5_end = timezone.make_aware(datetime.datetime.combine(today, datetime.time(11, 30)))
        Appointment.objects.update_or_create(
            appointment_code='AP-1043',
            defaults={
                'patient_name': 'Aliyu Garba',
                'patient_phone': '+2348024448899',
                'doctor': doc_babawo,
                'service': service_map['Comprehensive General Health Check-up'],
                'start_datetime': appt5_start,
                'end_datetime': appt5_end,
                'status': 'confirmed',
                'confirmed_at': now - datetime.timedelta(days=1),
                'arrival_at': appt5_start - datetime.timedelta(minutes=5),
            }
        )

        # AP 6: Dr. Babawo - Confirmed Afternoon Consultation
        appt6_start = timezone.make_aware(datetime.datetime.combine(today, datetime.time(14, 30)))
        appt6_end = timezone.make_aware(datetime.datetime.combine(today, datetime.time(15, 15)))
        Appointment.objects.update_or_create(
            appointment_code='AP-1044',
            defaults={
                'patient_name': 'Halima Sadiq',
                'patient_phone': '+2348135551212',
                'doctor': doc_babawo,
                'service': service_map['Tooth Extraction & Minor Surgery'],
                'start_datetime': appt6_start,
                'end_datetime': appt6_end,
                'status': 'confirmed',
                'confirmed_at': now - datetime.timedelta(days=2),
            }
        )
        self.stdout.write(self.style.SUCCESS("[OK] Master Calendar appointments & follow-up tasks seeded"))

        # 9. Audit Log
        AuditLog.objects.create(
            entity_name='ClinicSetting',
            entity_id=clinic.id,
            action='SEED_DATABASE',
            performed_by='system_init',
            changes={'message': 'Demo database successfully seeded for Cedarcare Specialist Clinic'},
        )
        self.stdout.write(self.style.SUCCESS("[OK] Audit log record created"))
        self.stdout.write(self.style.SUCCESS("[SUCCESS] Cedarcare Specialist Clinic database seeding COMPLETE!"))
