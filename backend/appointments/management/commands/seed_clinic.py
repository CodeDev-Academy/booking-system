"""
One-Click Demo Seeder Management Command.
Seeds realistic clinic settings, doctors, services, staff accounts, and demo requests.
Usage: python manage.py seed_clinic [--clear]
"""

import hashlib
from datetime import time, timedelta
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.utils import timezone
from appointments.models import (
    ClinicSetting,
    StaffUser,
    Doctor,
    Service,
    DoctorService,
    AvailabilityRule,
    BookingRequest,
    Appointment,
    FollowUpTask,
    AuditLog,
)

User = get_user_model()


class Command(BaseCommand):
    help = 'Seeds database with realistic demo clinic configuration, staff, doctors, and sample requests.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--clear',
            action='store_true',
            help='Wipes existing demo data before seeding fresh records',
        )

    def handle(self, *args, **options):
        if options['clear']:
            self.stdout.write(self.style.WARNING("Clearing existing appointments, requests, and clinic records..."))
            BookingRequest.objects.all().delete()
            Appointment.objects.all().delete()
            AvailabilityRule.objects.all().delete()
            DoctorService.objects.all().delete()
            Doctor.objects.all().delete()
            Service.objects.all().delete()
            StaffUser.objects.all().delete()
            ClinicSetting.objects.all().delete()

        self.stdout.write(self.style.MIGRATE_HEADING("1. Seeding Clinic Settings..."))
        setting, created = ClinicSetting.objects.get_or_create(
            clinic_name='Cedarcare Specialist Clinic',
            defaults={
                'tagline': 'Modern Family & Dental Healthcare',
                'address': 'Plot 1042 Aminu Kano Crescent, Wuse 2, Abuja',
                'phone': '+2348012345678',
                'open_time': time(8, 0),
                'close_time': time(18, 0),
                'working_days': [1, 2, 3, 4, 5, 6],  # Mon-Sat
                'lunch_break_start': time(13, 0),
                'lunch_break_end': time(14, 0),
                'offer_expiry_minutes': 60,
                'hold_expiry_minutes': 15,
                'default_buffer_minutes': 10,
                'emergency_slots_per_shift': 1,
                'enable_24h_reminder': True,
                'enable_2h_reminder': True,
            }
        )
        self.stdout.write(self.style.SUCCESS(f"   [OK] Clinic settings verified: '{setting.clinic_name}'"))

        self.stdout.write(self.style.MIGRATE_HEADING("2. Seeding Staff Accounts..."))
        # Receptionist: Sarah (Password: reception123, Quick PIN: 1234)
        receptionist_user, _ = User.objects.get_or_create(
            username='sarah@clinic.com',
            defaults={
                'email': 'sarah@clinic.com',
                'first_name': 'Sarah',
                'last_name': 'Danladi',
                'is_staff': True,
            }
        )
        receptionist_user.set_password('reception123')
        receptionist_user.save()

        pin_1234_hash = hashlib.sha256('1234'.encode()).hexdigest()
        StaffUser.objects.update_or_create(
            user=receptionist_user,
            defaults={
                'role': 'receptionist',
                'quick_pin_hash': pin_1234_hash,
                'is_active': True,
            }
        )

        # Clinic Administrator: Dr. Victor (Password: admin123, Quick PIN: 9999)
        admin_user, _ = User.objects.get_or_create(
            username='admin@clinic.com',
            defaults={
                'email': 'admin@clinic.com',
                'first_name': 'Victor',
                'last_name': 'Adeyemi',
                'is_staff': True,
                'is_superuser': True,
            }
        )
        admin_user.set_password('admin123')
        admin_user.save()

        pin_9999_hash = hashlib.sha256('9999'.encode()).hexdigest()
        StaffUser.objects.update_or_create(
            user=admin_user,
            defaults={
                'role': 'clinic_admin',
                'quick_pin_hash': pin_9999_hash,
                'is_active': True,
            }
        )
        self.stdout.write(self.style.SUCCESS("   [OK] Receptionist: sarah@clinic.com / PIN: 1234"))
        self.stdout.write(self.style.SUCCESS("   [OK] Admin: admin@clinic.com / PIN: 9999"))

        self.stdout.write(self.style.MIGRATE_HEADING("3. Seeding Doctors..."))
        dr_bello, _ = Doctor.objects.get_or_create(
            name='Dr. Aminu Bello',
            defaults={
                'specialty': 'Dentistry & Implantology',
                'email': 'dr.bello@cedarcare.ng',
                'phone': '+2348023456789',
                'working_days': [1, 2, 3, 4, 5],  # Mon-Fri
                'shift_start': time(9, 0),
                'shift_end': time(17, 0),
                'is_active': True,
                'is_on_leave': False,
            }
        )

        dr_okafor, _ = Doctor.objects.get_or_create(
            name='Dr. Ngozi Okafor',
            defaults={
                'specialty': 'Family Medicine & General Practice',
                'email': 'dr.okafor@cedarcare.ng',
                'phone': '+2348034567890',
                'working_days': [1, 2, 3, 4, 5, 6],  # Mon-Sat
                'shift_start': time(8, 30),
                'shift_end': time(16, 30),
                'is_active': True,
                'is_on_leave': False,
            }
        )
        self.stdout.write(self.style.SUCCESS(f"   [OK] {dr_bello.name} (Mon-Fri 09:00-17:00)"))
        self.stdout.write(self.style.SUCCESS(f"   [OK] {dr_okafor.name} (Mon-Sat 08:30-16:30)"))

        self.stdout.write(self.style.MIGRATE_HEADING("4. Seeding Services & Specialties..."))
        srv_dental_consult, _ = Service.objects.get_or_create(
            name='Dental Consultation & Oral Health Exam',
            defaults={
                'category': 'Dental Care',
                'duration_minutes': 30,
                'buffer_minutes': 10,
                'price': 15000.00,
                'deposit_required': True,
                'is_active': True,
            }
        )

        srv_extraction, _ = Service.objects.get_or_create(
            name='Surgical Tooth Extraction',
            defaults={
                'category': 'Dental Surgery',
                'duration_minutes': 45,
                'buffer_minutes': 15,
                'price': 35000.00,
                'deposit_required': True,
                'is_active': True,
            }
        )

        srv_gp_checkup, _ = Service.objects.get_or_create(
            name='Comprehensive Wellness & Physical Check-up',
            defaults={
                'category': 'General Practice',
                'duration_minutes': 30,
                'buffer_minutes': 10,
                'price': 12000.00,
                'deposit_required': False,
                'is_active': True,
            }
        )

        # Associate Doctors with Services
        DoctorService.objects.get_or_create(doctor=dr_bello, service=srv_dental_consult)
        DoctorService.objects.get_or_create(doctor=dr_bello, service=srv_extraction)
        DoctorService.objects.get_or_create(doctor=dr_okafor, service=srv_gp_checkup)
        self.stdout.write(self.style.SUCCESS("   [OK] 3 Services configured and linked to medical staff."))

        self.stdout.write(self.style.MIGRATE_HEADING("5. Seeding Availability Rules..."))
        now = timezone.now()
        # Doctor break next Wednesday 14:00 - 15:30
        wednesday_offset = (2 - now.weekday()) % 7
        if wednesday_offset == 0:
            wednesday_offset = 7
        wed_target = (now + timedelta(days=wednesday_offset)).replace(hour=14, minute=0, second=0, microsecond=0)
        
        AvailabilityRule.objects.get_or_create(
            doctor=dr_bello,
            start_datetime=wed_target,
            end_datetime=wed_target + timedelta(hours=1, minutes=30),
            defaults={
                'rule_type': 'doctor_break',
                'reason': 'Departmental Clinical Review Meeting',
            }
        )
        self.stdout.write(self.style.SUCCESS("   [OK] Dr. Bello meeting block scheduled."))

        self.stdout.write(self.style.MIGRATE_HEADING("6. Seeding Demo Booking Requests & Visits..."))
        # 1 Awaiting Review Request
        tomorrow = now.date() + timedelta(days=1)
        req1, _ = BookingRequest.objects.get_or_create(
            request_code='REQ-2026-0042',
            defaults={
                'patient_name': 'Chinedu Eze',
                'patient_phone': '+2348055512345',
                'patient_type': 'new',
                'service': srv_dental_consult,
                'preferred_doctor': dr_bello,
                'preferred_date_start': tomorrow,
                'preferred_date_end': tomorrow + timedelta(days=14),
                'preferred_time_window': 'morning',
                'channel': 'web',
                'status': 'awaiting_review',
            }
        )

        # 1 Confirmed Visit for Today
        today_10am = now.replace(hour=10, minute=0, second=0, microsecond=0)
        appt1, _ = Appointment.objects.get_or_create(
            appointment_code='AP-1042',
            defaults={
                'patient_name': 'Amina Yusuf',
                'patient_phone': '+2348077712345',
                'doctor': dr_okafor,
                'service': srv_gp_checkup,
                'start_datetime': today_10am,
                'end_datetime': today_10am + timedelta(minutes=30),
                'status': 'confirmed',
                'confirmed_at': now - timedelta(hours=2),
            }
        )

        self.stdout.write(self.style.SUCCESS(f"   [OK] Active Intake Request: {req1.request_code} (Chinedu Eze)"))
        self.stdout.write(self.style.SUCCESS(f"   [OK] Confirmed Visit: {appt1.appointment_code} (Amina Yusuf)"))

        self.stdout.write(self.style.MIGRATE_HEADING("7. Recording Audit Log Entry..."))
        AuditLog.objects.create(
            actor='System Seeder',
            action='INITIAL_DEMO_SEED',
            entity_name='ClinicSetting',
            entity_id=str(setting.id),
            changes={'status': 'completed', 'version': '1.0'},
        )
        self.stdout.write(self.style.SUCCESS("   [OK] Audit trail verified."))

        self.stdout.write(self.style.SUCCESS("\n[SUCCESS] Clinic Booking System successfully seeded!"))
