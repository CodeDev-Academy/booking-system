"""
Relational Database Models for Clinic Booking System.
Agency Template Master Schema.
"""

import uuid
from django.db import models
from django.utils import timezone


class ClinicSetting(models.Model):
    """
    Singleton / Tenant configuration model for clinic operations.
    Allows non-technical managers to edit rules via visual settings dashboard.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    clinic_name = models.CharField(max_length=200, default='Cedarcare Specialist Clinic')
    tagline = models.CharField(max_length=300, default='Modern Family & Dental Healthcare')
    address = models.CharField(max_length=400, default='Plot 1042 Aminu Kano Crescent, Wuse 2, Abuja')
    phone = models.CharField(max_length=30, default='+2348012345678')
    whatsapp_phone_id = models.CharField(max_length=100, blank=True, null=True)
    telegram_bot_token = models.CharField(max_length=200, blank=True, null=True)

    # Operating hours
    open_time = models.TimeField(default='08:00:00')
    close_time = models.TimeField(default='18:00:00')
    working_days = models.JSONField(
        default=list,
        help_text="List of active weekday integers, e.g. [1, 2, 3, 4, 5, 6] (1=Monday, 7=Sunday)"
    )
    lunch_break_start = models.TimeField(default='13:00:00')
    lunch_break_end = models.TimeField(default='14:00:00')

    # Booking & Hold Durations
    offer_expiry_minutes = models.PositiveIntegerField(default=60, help_text="Duration patient has to pick an offered slot")
    hold_expiry_minutes = models.PositiveIntegerField(default=15, help_text="Duration slot is locked awaiting confirmation/deposit")
    default_buffer_minutes = models.PositiveIntegerField(default=10, help_text="Default sanitization & rest buffer")
    emergency_slots_per_shift = models.PositiveIntegerField(default=1, help_text="Floating emergency reserve slots per shift")

    # Automated Reminders Policy
    enable_24h_reminder = models.BooleanField(default=True)
    enable_2h_reminder = models.BooleanField(default=False)

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Clinic Setting'
        verbose_name_plural = 'Clinic Settings'

    def __str__(self):
        return f"{self.clinic_name} Settings"


class StaffUser(models.Model):
    """
    Staff accounts for Receptionists, Doctors, and Clinic Admins.
    Supports 30-day session cookies and 20-min Quick PIN lock.
    """
    ROLE_CHOICES = [
        ('receptionist', 'Front Desk Receptionist'),
        ('doctor', 'Doctor / Specialist'),
        ('clinic_admin', 'Clinic Administrator / Owner'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    full_name = models.CharField(max_length=150)
    email = models.EmailField(unique=True)
    password_hash = models.CharField(max_length=255)
    quick_pin_hash = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text="Hashed 4-to-6 digit quick PIN for front desk screen resume"
    )
    role = models.CharField(max_length=30, choices=ROLE_CHOICES, default='receptionist')
    is_active = models.BooleanField(default=True, help_text="Set to False to instantly revoke all sessions and lock account")
    last_login = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['full_name']
        indexes = [
            models.Index(fields=['email'], name='idx_staff_email'),
            models.Index(fields=['is_active', 'role'], name='idx_staff_status_role'),
        ]

    def __str__(self):
        return f"{self.full_name} ({self.get_role_display()})"


class Doctor(models.Model):
    """
    Medical specialists with working days, shift hours, and leave status.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=150)
    email = models.EmailField(blank=True, null=True)
    phone = models.CharField(max_length=30, blank=True, null=True)
    specialty = models.CharField(max_length=120, help_text="e.g. Dentistry, General Practice, Pediatrics")
    working_days = models.JSONField(
        default=list,
        help_text="Active weekdays e.g. [1, 2, 3, 4, 5] (1=Monday, 7=Sunday)"
    )
    shift_start = models.TimeField(default='09:00:00')
    shift_end = models.TimeField(default='17:00:00')
    is_active = models.BooleanField(default=True, help_text="Soft-delete toggle preserving past appointments")
    is_on_leave = models.BooleanField(default=False, help_text="Emergency sick leave toggle triggering reassignment protocol")

    class Meta:
        ordering = ['name']
        indexes = [
            models.Index(fields=['is_active', 'is_on_leave'], name='idx_doc_active_leave'),
            models.Index(fields=['specialty'], name='idx_doc_specialty'),
        ]

    def __str__(self):
        return f"{self.name} — {self.specialty}"


class Service(models.Model):
    """
    Clinic services with duration, sanitation buffer, and pricing.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=150, help_text="e.g. Dental Consultation, Tooth Extraction")
    category = models.CharField(max_length=100, default='General', help_text="e.g. Dentistry, Consultation, Surgery")
    duration_minutes = models.PositiveIntegerField(default=30)
    buffer_minutes = models.PositiveIntegerField(default=10, help_text="Rest & room sanitization buffer after appointment")
    price = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    deposit_required = models.BooleanField(default=False, help_text="If True, holds slot for 15m awaiting payment verification")
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['category', 'name']
        indexes = [
            models.Index(fields=['is_active', 'category'], name='idx_service_active_cat'),
        ]

    def __str__(self):
        return f"{self.name} ({self.duration_minutes}m + {self.buffer_minutes}m buffer)"

    @property
    def total_block_minutes(self):
        return self.duration_minutes + self.buffer_minutes


class DoctorService(models.Model):
    """
    Many-to-many relationship linking doctors to qualified services with optional duration override.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    doctor = models.ForeignKey(Doctor, on_delete=models.CASCADE, related_name='doctor_services')
    service = models.ForeignKey(Service, on_delete=models.CASCADE, related_name='service_doctors')
    custom_duration_minutes = models.PositiveIntegerField(
        blank=True,
        null=True,
        help_text="Optional custom duration override for this doctor"
    )

    class Meta:
        unique_together = ('doctor', 'service')
        verbose_name = 'Doctor Service Mapping'

    def __str__(self):
        return f"{self.doctor.name} -> {self.service.name}"


class AvailabilityRule(models.Model):
    """
    Dynamic breaks, emergency reserves, or blocked dates.
    """
    RULE_TYPE_CHOICES = [
        ('break', 'Staff Break / Lunch'),
        ('blocked_date', 'Clinic / Doctor Blocked Date'),
        ('emergency_reserve', 'Emergency & Walk-in Protected Slot'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    doctor = models.ForeignKey(
        Doctor,
        on_delete=models.CASCADE,
        related_name='availability_rules',
        blank=True,
        null=True,
        help_text="Leave blank if rule applies clinic-wide"
    )
    rule_type = models.CharField(max_length=30, choices=RULE_TYPE_CHOICES, default='break')
    start_datetime = models.DateTimeField()
    end_datetime = models.DateTimeField()
    reason = models.CharField(max_length=255, blank=True, null=True)

    class Meta:
        ordering = ['start_datetime']
        indexes = [
            models.Index(fields=['start_datetime', 'end_datetime'], name='idx_rule_timerange'),
        ]

    def __str__(self):
        target = self.doctor.name if self.doctor else "Clinic-Wide"
        return f"{self.get_rule_type_display()} ({target}) {self.start_datetime:%Y-%m-%d %H:%M}"


class BookingRequest(models.Model):
    """
    Intake record for patient booking requests.
    Ordered by FIFO (created_at ASC) for receptionist review.
    """
    CHANNEL_CHOICES = [
        ('web', 'Website Booking Widget'),
        ('telegram', 'Telegram Bot'),
        ('whatsapp', 'WhatsApp Cloud API'),
    ]

    STATUS_CHOICES = [
        ('awaiting_review', 'Awaiting Receptionist Review'),
        ('re_requested', 'Re-Requested (Priority after Expiry)'),
        ('slots_offered', 'Slots Offered to Patient (1h Window)'),
        ('offer_expired', 'Offer Expired (Unselected)'),
        ('converted', 'Converted to Appointment'),
        ('rejected', 'Rejected by Receptionist'),
    ]

    TIME_WINDOW_CHOICES = [
        ('morning', 'Morning (08:00 - 12:00)'),
        ('afternoon', 'Afternoon (12:00 - 16:00)'),
        ('evening', 'Evening (16:00 - 18:00)'),
        ('any', 'Any Available Time'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    request_code = models.CharField(max_length=30, unique=True, db_index=True)
    patient_name = models.CharField(max_length=150)
    patient_phone = models.CharField(max_length=30, db_index=True, help_text="E.164 format e.g. +2348012345678")
    patient_type = models.CharField(max_length=20, default='new', choices=[('new', 'New Patient'), ('returning', 'Returning Patient')])
    
    # Returning patient reference link
    previous_patient = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name='subsequent_requests',
        help_text="Linked past request for returning patient record"
    )

    service = models.ForeignKey(Service, on_delete=models.PROTECT, related_name='booking_requests')
    preferred_doctor = models.ForeignKey(
        Doctor,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name='preferred_requests'
    )
    
    # 2-Week Requested Window
    preferred_date_start = models.DateField()
    preferred_date_end = models.DateField()
    preferred_time_window = models.CharField(max_length=20, choices=TIME_WINDOW_CHOICES, default='morning')
    
    channel = models.CharField(max_length=20, choices=CHANNEL_CHOICES, default='web')
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default='awaiting_review')
    
    # Offer Expiry Timestamp (60 minutes from receptionist dispatch)
    offer_expires_at = models.DateTimeField(blank=True, null=True)
    
    # Multi-receptionist desk presence (locks card if another staff member is reviewing)
    reviewed_by = models.ForeignKey(
        StaffUser,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name='active_reviews'
    )
    reviewed_at = models.DateTimeField(blank=True, null=True)

    rejection_reason = models.CharField(max_length=255, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['created_at']  # FIFO Order: Earliest patients on top
        indexes = [
            models.Index(fields=['status', 'created_at'], name='idx_req_status_fifo'),
            models.Index(fields=['patient_phone'], name='idx_req_patient_phone'),
            models.Index(fields=['status', 'offer_expires_at'], name='idx_req_offer_sweep'),
        ]

    def __str__(self):
        return f"{self.request_code} — {self.patient_name} ({self.get_status_display()})"

    @property
    def is_offer_active(self):
        if self.status == 'slots_offered' and self.offer_expires_at:
            return timezone.now() < self.offer_expires_at
        return False


class SlotOffer(models.Model):
    """
    Candidate time slots offered to a patient for receptionist-approved selection.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    request = models.ForeignKey(BookingRequest, on_delete=models.CASCADE, related_name='slot_offers')
    doctor = models.ForeignKey(Doctor, on_delete=models.PROTECT, related_name='offered_slots')
    start_datetime = models.DateTimeField()
    end_datetime = models.DateTimeField()
    is_alternative_date = models.BooleanField(
        default=False,
        help_text="True if slot falls outside requested 2-week range because requested dates were full"
    )
    offered_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(help_text="Matches request.offer_expires_at (60m window)")
    is_selected = models.BooleanField(default=False)

    class Meta:
        ordering = ['start_datetime']
        indexes = [
            models.Index(fields=['request', 'is_selected'], name='idx_offer_req_sel'),
        ]

    def __str__(self):
        return f"Offer {self.start_datetime:%Y-%m-%d %H:%M} (Dr. {self.doctor.name})"


class Appointment(models.Model):
    """
    Official Clinic Appointment record with two-phase lock (held vs confirmed)
    and live visit status transitions.
    """
    STATUS_CHOICES = [
        ('held', 'Temporarily Held (Awaiting Confirmation / Deposit)'),
        ('confirmed', 'Confirmed & Booked'),
        ('arrived', 'Patient Arrived in Waiting Room'),
        ('in_consultation', 'In Consultation with Doctor'),
        ('completed', 'Consultation Completed'),
        ('cancelled', 'Cancelled by Patient / Clinic'),
        ('no_show', 'No-Show (Patient Missed Visit)'),
        ('hold_expired', 'Hold Expired (Slot Released)'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    appointment_code = models.CharField(max_length=30, unique=True, db_index=True)
    patient_name = models.CharField(max_length=150)
    patient_phone = models.CharField(max_length=30, db_index=True)
    
    doctor = models.ForeignKey(Doctor, on_delete=models.PROTECT, related_name='appointments')
    service = models.ForeignKey(Service, on_delete=models.PROTECT, related_name='appointments')
    booking_request = models.ForeignKey(
        BookingRequest,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name='converted_appointments'
    )

    start_datetime = models.DateTimeField(db_index=True)
    end_datetime = models.DateTimeField(db_index=True)
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default='confirmed', db_index=True)

    # Temporary Hold Timer (15-30m)
    hold_expires_at = models.DateTimeField(blank=True, null=True, db_index=True)
    
    # Milestone timestamps
    confirmed_at = models.DateTimeField(blank=True, null=True)
    arrival_at = models.DateTimeField(blank=True, null=True)
    completed_at = models.DateTimeField(blank=True, null=True)
    cancelled_at = models.DateTimeField(blank=True, null=True)
    cancellation_reason = models.CharField(max_length=255, blank=True, null=True)

    # Reminders Dispatch Log
    reminder_24h_sent = models.BooleanField(default=False)
    reminder_2h_sent = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['start_datetime']
        indexes = [
            models.Index(fields=['doctor', 'start_datetime', 'end_datetime', 'status'], name='idx_appt_doctor_overlap'),
            models.Index(fields=['status', 'hold_expires_at'], name='idx_appt_hold_sweep'),
            models.Index(fields=['start_datetime', 'status'], name='idx_appt_date_status'),
        ]

    def __str__(self):
        return f"{self.appointment_code}: {self.patient_name} - {self.start_datetime:%Y-%m-%d %H:%M} ({self.get_status_display()})"

    @property
    def is_held_active(self):
        if self.status == 'held' and self.hold_expires_at:
            return timezone.now() < self.hold_expires_at
        return False


class FollowUpTask(models.Model):
    """
    Doctor-directed follow-up appointment scheduled upon visit completion.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    appointment = models.ForeignKey(Appointment, on_delete=models.CASCADE, related_name='follow_up_tasks')
    doctor = models.ForeignKey(Doctor, on_delete=models.PROTECT, related_name='assigned_follow_ups')
    follow_up_date = models.DateField()
    notes = models.TextField(blank=True, null=True, help_text="Clinical administrative recall instructions")
    reminder_sent = models.BooleanField(default=False)
    reminder_sent_at = models.DateTimeField(blank=True, null=True)
    is_completed = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['follow_up_date']
        indexes = [
            models.Index(fields=['follow_up_date', 'reminder_sent', 'is_completed'], name='idx_followup_reminder'),
        ]

    def __str__(self):
        return f"Follow-up for {self.appointment.patient_name} on {self.follow_up_date}"


class AuditLog(models.Model):
    """
    Immutable audit logging table tracking every clinical and front-desk action.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    actor = models.CharField(max_length=150, help_text="Name or ID of staff member, or 'System Sweeper'")
    action = models.CharField(max_length=100, help_text="e.g. APPROVED_SLOTS, MARKED_ARRIVED, DEACTIVATED_STAFF")
    entity_name = models.CharField(max_length=100)
    entity_id = models.CharField(max_length=100)
    changes = models.JSONField(default=dict, blank=True)
    ip_address = models.GenericIPAddressField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['created_at', 'action'], name='idx_audit_time_action'),
            models.Index(fields=['entity_name', 'entity_id'], name='idx_audit_entity'),
        ]

    def __str__(self):
        return f"[{self.created_at:%Y-%m-%d %H:%M:%S}] {self.actor}: {self.action} on {self.entity_name}"
