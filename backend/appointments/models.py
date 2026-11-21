import uuid
import datetime
from django.db import models
from django.utils import timezone
from django.contrib.auth.hashers import make_password, check_password


def default_working_days():
    """Wave 5 / Step 5.7(c): Mon–Fri for a doctor created without days."""
    return [1, 2, 3, 4, 5]


class ClinicSetting(models.Model):
    """
    Central operational & scheduling configuration for the clinic.
    Stores customizable business rules with zero hardcoded values.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    clinic_name = models.CharField(max_length=255, default='Cedarcare Specialist Clinic')
    tagline = models.CharField(max_length=255, blank=True, default='Excellence in Dental & Family Care')
    address = models.TextField(default='Plot 1042 Aminu Kano Crescent, Wuse 2, Abuja')
    phone = models.CharField(max_length=32, default='+2348030001122')
    phones = models.JSONField(default=list, blank=True)
    emails = models.JSONField(default=list, blank=True)
    whatsapp_phone_id = models.CharField(max_length=64, blank=True, default='')

    @property
    def email(self):
        if self.emails and len(self.emails) > 0:
            return self.emails[0]
        if self.custom_config and isinstance(self.custom_config, dict):
            return self.custom_config.get('email', 'contact@cedarcare.ng')
        return 'contact@cedarcare.ng'

    @email.setter
    def email(self, value):
        if not self.emails:
            self.emails = [value]
        else:
            self.emails[0] = value
        if not self.custom_config:
            self.custom_config = {}
        self.custom_config['email'] = value

    @property
    def primary_phone(self):
        if self.phones and len(self.phones) > 0:
            return self.phones[0]
        return self.phone

    @property
    def primary_email(self):
        return self.email

    # Operating hours
    open_time = models.TimeField(default=datetime.time(8, 0))
    close_time = models.TimeField(default=datetime.time(18, 0))
    working_days = models.JSONField(default=list)  # [1, 2, 3, 4, 5, 6] (1=Mon, 7=Sun)
    lunch_break_start = models.TimeField(default=datetime.time(13, 0))
    lunch_break_end = models.TimeField(default=datetime.time(14, 0))

    # Engine constraints & buffers
    grid_increment_minutes = models.PositiveIntegerField(default=15)
    booking_horizon_days = models.PositiveIntegerField(default=14)
    min_advance_hours = models.PositiveIntegerField(default=2)
    offer_expiry_minutes = models.PositiveIntegerField(default=60)
    hold_expiry_minutes = models.PositiveIntegerField(default=15)
    default_buffer_minutes = models.PositiveIntegerField(default=10)
    emergency_slots_per_shift = models.PositiveIntegerField(default=1)

    # Automated reminder toggles
    enable_24h_reminder = models.BooleanField(default=True)
    enable_2h_reminder = models.BooleanField(default=False)

    # Shared secret n8n / external gateways must present as `X-Webhook-Secret`
    # to reach guarded endpoints (slots/hold, re-request, expiry-sweep, interactions).
    # Empty value = fail-closed in production (see services/webhook_security.py).
    webhook_secret = models.CharField(max_length=255, blank=True, default='')

    # Dynamic white-label JSON configuration (currency, bot tokens, custom metadata)
    custom_config = models.JSONField(default=dict, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'clinic_settings'
        verbose_name = 'Clinic Setting'
        verbose_name_plural = 'Clinic Settings'

    def __str__(self):
        return f"{self.clinic_name} Settings"

    def save(self, *args, **kwargs):
        if self.phones and len(self.phones) > 0:
            self.phone = self.phones[0]
        elif self.phone and not self.phones:
            self.phones = [self.phone]
        super().save(*args, **kwargs)

    @classmethod
    def get_settings(cls):
        setting, _ = cls.objects.get_or_create(
            id=uuid.UUID('00000000-0000-0000-0000-000000000001'),
            defaults={
                'working_days': [1, 2, 3, 4, 5, 6],
                'custom_config': {
                    'currency': 'NGN',
                    'currency_symbol': '₦',
                    'bot_handle': '@cedarcare_bot',
                }
            }
        )
        return setting


class StaffUser(models.Model):
    """
    Staff accounts (Receptionists, Doctors, Clinic Admins) with role-based access
    and 4-6 digit quick PIN support for the 20-minute idle lock overlay.
    """
    ROLE_CHOICES = (
        ('receptionist', 'Receptionist'),
        ('doctor', 'Doctor'),
        ('clinic_admin', 'Clinic Admin'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    full_name = models.CharField(max_length=255)
    email = models.EmailField(unique=True, db_index=True)
    password_hash = models.CharField(max_length=255)
    quick_pin_hash = models.CharField(max_length=255, blank=True, null=True)
    role = models.CharField(max_length=32, choices=ROLE_CHOICES, default='receptionist')
    shift = models.CharField(max_length=255, blank=True, default='')
    specialty = models.CharField(max_length=255, blank=True, default='')
    is_active = models.BooleanField(default=True, db_index=True)
    last_login = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'staff_users'
        verbose_name = 'Staff User'
        verbose_name_plural = 'Staff Users'

    def __str__(self):
        return f"{self.full_name} ({self.get_role_display()})"

    def set_password(self, raw_password):
        self.password_hash = make_password(raw_password)

    def check_password(self, raw_password):
        return check_password(raw_password, self.password_hash)

    def set_pin(self, raw_pin):
        self.quick_pin_hash = make_password(str(raw_pin))

    def check_pin(self, raw_pin):
        if not self.quick_pin_hash:
            return False
        return check_password(str(raw_pin), self.quick_pin_hash)

    @property
    def is_authenticated(self):
        return True

    @is_authenticated.setter
    def is_authenticated(self, value):
        pass

    @property
    def is_anonymous(self):
        return False



class Doctor(models.Model):
    """
    Clinical practitioners with designated shift hours, qualified services,
    and burnout limits (max daily appointments).
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=32, blank=True)
    specialty = models.CharField(max_length=255, default='General Practice')
    # Wave 5 / Step 5.7(c): a doctor created without explicit days works
    # Mon–Fri (the same default the seed and the admin UI use). The old `[]`
    # made such a doctor silently never bookable. A clinic that wants a
    # day-less doctor sets [] explicitly.
    working_days = models.JSONField(default=default_working_days)
    shift_start = models.TimeField(default=datetime.time(9, 0))
    shift_end = models.TimeField(default=datetime.time(17, 0))
    max_daily_appointments = models.PositiveIntegerField(default=12)
    is_active = models.BooleanField(default=True, db_index=True)
    is_on_leave = models.BooleanField(default=False, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'doctors'
        verbose_name = 'Doctor'
        verbose_name_plural = 'Doctors'

    def __str__(self):
        return f"{self.name} - {self.specialty}"

    # ---- Dated leave (Step 1b) -------------------------------------------------
    # `is_on_leave` is only honest for TODAY. Leave that starts next week must not
    # block every future date, so the real source of truth is the DoctorLeave rows.

    def leave_period_covering(self, date):
        """The leave row that blocks `date`, or None."""
        for period in self.leaves.all():
            if period.covers(date):
                return period
        return None

    def is_on_leave_on(self, date):
        """
        True when this doctor cannot work on `date`.

        - a dated leave period covers it, or
        - the legacy `is_on_leave` switch is on and the doctor has no leave rows
          at all (a free-form "off duty until someone restores me" block).
        """
        periods = list(self.leaves.all())
        if any(p.covers(date) for p in periods):
            return True
        return bool(self.is_on_leave and not periods)

    def sync_leave_flag(self, today=None):
        """
        Re-derive `is_on_leave` from the leave periods so a finished leave stops
        marking the doctor off duty. Safe to call often; writes only on change.
        """
        today = today or timezone.localdate()
        periods = list(self.leaves.all())
        if periods:
            should = any(p.covers(today) for p in periods)
        else:
            should = self.is_on_leave
        if self.is_on_leave != should:
            self.is_on_leave = should
            self.save(update_fields=['is_on_leave'])
        return self.is_on_leave


class DoctorLeave(models.Model):
    """
    A dated leave period (annual, sick, training...). Inclusive on both ends.
    `end_date = None` means "until further notice" — used by the manual
    off-duty switch so that 1-click sick leave is still a leave row.
    """
    LEAVE_TYPE_CHOICES = (
        ('annual', 'Annual Leave'),
        ('sick', 'Sick Leave'),
        ('emergency', 'Emergency Leave'),
        ('training', 'Training / Conference'),
        ('other', 'Other'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    doctor = models.ForeignKey(Doctor, on_delete=models.CASCADE, related_name='leaves')
    start_date = models.DateField(db_index=True)
    end_date = models.DateField(null=True, blank=True, db_index=True)  # inclusive
    leave_type = models.CharField(max_length=32, choices=LEAVE_TYPE_CHOICES, default='annual')
    reason = models.CharField(max_length=255, blank=True, default='')
    created_by = models.CharField(max_length=255, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'doctor_leaves'
        ordering = ('start_date', 'created_at')
        verbose_name = 'Doctor Leave'
        verbose_name_plural = 'Doctor Leaves'
        indexes = [
            models.Index(fields=['doctor', 'start_date', 'end_date'], name='doctor_leave_window_idx'),
        ]

    def __str__(self):
        end = self.end_date.isoformat() if self.end_date else 'until further notice'
        return f"{self.doctor.name}: {self.start_date.isoformat()} -> {end}"

    def covers(self, date):
        if date < self.start_date:
            return False
        return self.end_date is None or date <= self.end_date

    @classmethod
    def record(cls, doctor, start_date, end_date, reason='', leave_type='annual',
               created_by='', performed_by=None):
        """
        Save a leave window without stacking duplicates: an overlapping period is
        stretched to cover the union instead of adding a second row. That keeps a
        re-run of the same plan (or a preview followed by approve) idempotent.
        """
        if end_date is not None and end_date < start_date:
            start_date, end_date = end_date, start_date

        horizon = end_date or datetime.date.max
        existing = doctor.leaves.filter(
            start_date__lte=horizon,
        ).filter(
            models.Q(end_date__isnull=True) | models.Q(end_date__gte=start_date)
        ).order_by('start_date').first()

        if existing is not None:
            changed = []
            if start_date < existing.start_date:
                existing.start_date = start_date
                changed.append('start_date')
            if existing.end_date is not None:
                if end_date is None:
                    existing.end_date = None
                    changed.append('end_date')
                elif end_date > existing.end_date:
                    existing.end_date = end_date
                    changed.append('end_date')
            if changed and reason:
                existing.reason = reason
                changed.append('reason')
            if changed:
                existing.save(update_fields=changed)
            return existing

        return cls.objects.create(
            doctor=doctor, start_date=start_date, end_date=end_date,
            leave_type=leave_type, reason=reason,
            created_by=created_by or (performed_by or ''),
        )


class DisruptionBatch(models.Model):
    """
    One approved leave distribution: what was moved, from where, to where,
    which notices carried the news, and whether the receptionist undid it.

    The audit log is prose for humans; this row is the durable contract Undo
    works from. `placements` is a list of dicts (appointment, from/to doctor
    and times, notice refs); `unplaced` keeps the named failures for the
    stranded queue and for later reporting.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    doctor = models.ForeignKey(
        Doctor, on_delete=models.CASCADE, related_name='disruption_batches'
    )
    leave = models.ForeignKey(
        DoctorLeave, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='disruption_batches',
    )
    leave_created = models.BooleanField(default=False)
    performed_by = models.CharField(max_length=255, blank=True, default='')
    reason = models.CharField(max_length=255, blank=True, default='')
    leave_start = models.DateTimeField()
    leave_end = models.DateTimeField()
    distribution = models.JSONField(default=dict, blank=True)
    placements = models.JSONField(default=list, blank=True)
    unplaced = models.JSONField(default=list, blank=True)
    undone_at = models.DateTimeField(null=True, blank=True)
    undone_by = models.CharField(max_length=255, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = 'disruption_batches'
        ordering = ['-created_at']
        verbose_name = 'Disruption Batch'
        verbose_name_plural = 'Disruption Batches'

    def __str__(self):
        return f"{self.doctor.name} · {self.created_at:%Y-%m-%d %H:%M}"


class Service(models.Model):
    """
    Clinical treatments and consultations with standard duration,
    sanitization/buffer minutes, and pricing.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    category = models.CharField(max_length=128, default='General')
    description = models.TextField(blank=True, default='')
    duration_minutes = models.PositiveIntegerField(default=30)
    buffer_minutes = models.PositiveIntegerField(default=10)
    price = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    deposit_required = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        db_table = 'services'
        verbose_name = 'Service'
        verbose_name_plural = 'Services'

    def __str__(self):
        return f"{self.name} ({self.duration_minutes}m + {self.buffer_minutes}m buffer)"


class DoctorService(models.Model):
    """
    Many-to-many relationship linking doctors to qualified procedures,
    with an optional custom duration override.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    doctor = models.ForeignKey(Doctor, on_delete=models.CASCADE, related_name='doctor_services')
    service = models.ForeignKey(Service, on_delete=models.CASCADE, related_name='service_doctors')
    custom_duration_minutes = models.PositiveIntegerField(blank=True, null=True)

    class Meta:
        db_table = 'doctor_services'
        unique_together = ('doctor', 'service')
        verbose_name = 'Doctor Service Qualification'
        verbose_name_plural = 'Doctor Service Qualifications'

    def __str__(self):
        duration = self.custom_duration_minutes or self.service.duration_minutes
        return f"{self.doctor.name} -> {self.service.name} ({duration}m)"


class AvailabilityRule(models.Model):
    """
    Non-working blocks, clinic holidays, emergency reserves, and doctor breaks.
    """
    RULE_TYPE_CHOICES = (
        ('break', 'Break / Meeting'),
        ('blocked_date', 'Blocked Date / Holiday'),
        ('emergency_reserve', 'Emergency Walk-In Reserve'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    doctor = models.ForeignKey(Doctor, on_delete=models.CASCADE, null=True, blank=True, related_name='availability_rules')
    rule_type = models.CharField(max_length=32, choices=RULE_TYPE_CHOICES)
    start_datetime = models.DateTimeField(db_index=True)
    end_datetime = models.DateTimeField(db_index=True)
    reason = models.CharField(max_length=255, blank=True, default='')

    class Meta:
        db_table = 'availability_rules'
        verbose_name = 'Availability Rule'
        verbose_name_plural = 'Availability Rules'

    def __str__(self):
        scope = self.doctor.name if self.doctor else "Clinic-Wide"
        return f"{scope} [{self.get_rule_type_display()}]: {self.start_datetime} to {self.end_datetime}"


class BookingRequest(models.Model):
    """
    Patient booking requests ingested from Web widget, Telegram, or WhatsApp.
    Managed through a human-in-the-loop reception queue.
    """
    CHANNEL_CHOICES = (
        ('web', 'Web Booking Form'),
        ('telegram', 'Telegram Bot'),
        ('whatsapp_flow', 'WhatsApp Flow'),
    )

    STATUS_CHOICES = (
        ('awaiting_review', 'Awaiting Review'),
        ('re_requested', 'Re-Requested (Priority)'),
        ('slots_offered', 'Slots Offered'),
        ('offer_expired', 'Offer Expired'),
        ('converted', 'Converted'),
        ('rejected', 'Rejected'),
    )

    PATIENT_TYPE_CHOICES = (
        ('new', 'New Patient'),
        ('returning', 'Returning Patient'),
    )

    TIME_WINDOW_CHOICES = (
        ('morning', 'Morning (08:00 - 12:00)'),
        ('afternoon', 'Afternoon (12:00 - 16:00)'),
        ('evening', 'Evening (16:00 - 18:00)'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    request_code = models.CharField(max_length=32, unique=True, db_index=True)
    patient_name = models.CharField(max_length=255)
    patient_phone = models.CharField(max_length=32, db_index=True)
    patient_type = models.CharField(max_length=16, choices=PATIENT_TYPE_CHOICES, default='new')
    date_of_birth = models.DateField(null=True, blank=True)
    gender = models.CharField(max_length=16, blank=True, default='')  # 'male', 'female', 'other'
    is_emergency = models.BooleanField(default=False)
    previous_patient_id = models.UUIDField(null=True, blank=True)
    service = models.ForeignKey(Service, on_delete=models.PROTECT, related_name='booking_requests')
    preferred_doctor = models.ForeignKey(Doctor, on_delete=models.SET_NULL, null=True, blank=True, related_name='requested_bookings')
    preferred_date_range = models.JSONField(default=dict)  # {'start': '2026-10-16', 'end': '2026-10-30'}
    preferred_time_window = models.CharField(max_length=16, choices=TIME_WINDOW_CHOICES, default='morning')
    channel = models.CharField(max_length=32, choices=CHANNEL_CHOICES, default='web')
    status = models.CharField(max_length=32, choices=STATUS_CHOICES, default='awaiting_review', db_index=True)
    channel_blocked = models.BooleanField(default=False)
    # Zero-partner route / Step 2 — the key that binds a patient's Telegram chat
    # to THIS request. Random by design: request codes are sequential and
    # guessable, so they can never be a link credential. Never exposed in staff
    # list payloads.
    telegram_link_token = models.CharField(max_length=64, unique=True, null=True, blank=True, db_index=True)
    patient_notes = models.TextField(blank=True, default='')
    offer_expires_at = models.DateTimeField(null=True, blank=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'booking_requests'
        verbose_name = 'Booking Request'
        verbose_name_plural = 'Booking Requests'
        indexes = [
            models.Index(fields=['status', 'offer_expires_at'], name='idx_req_status_expiry'),
            models.Index(fields=['patient_phone', 'created_at'], name='idx_req_phone_created'),
        ]

    def __str__(self):
        return f"{self.request_code} - {self.patient_name} ({self.get_status_display()})"

    @classmethod
    def _new_telegram_link_token(cls):
        """
        A random, URL-safe token for `t.me/<bot>?start=<token>`.

        Telegram start payloads accept A-Z a-z 0-9 _ and - only, which is
        exactly what token_urlsafe produces. 16 bytes ≈ 22 characters — far
        beyond guessing, and the uniqueness check keeps the DB constraint calm.
        """
        import secrets
        for _ in range(6):
            token = secrets.token_urlsafe(16)
            if not cls.objects.filter(telegram_link_token=token).exists():
                return token
        return secrets.token_urlsafe(24)

    def save(self, *args, **kwargs):
        if not self.telegram_link_token:
            self.telegram_link_token = self._new_telegram_link_token()
        if not self.request_code:
            from django.db import IntegrityError, transaction
            current_year = timezone.now().year
            count = BookingRequest.objects.filter(created_at__year=current_year).count() + 1
            for attempt in range(10):
                candidate = f"REQ-{current_year}-{count:04d}"
                while BookingRequest.objects.filter(request_code=candidate).exists():
                    count += 1
                    candidate = f"REQ-{current_year}-{count:04d}"
                self.request_code = candidate
                try:
                    with transaction.atomic():
                        return super().save(*args, **kwargs)
                except IntegrityError:
                    self.request_code = ''
                    count += 1
                    if attempt == 9:
                        raise
        return super().save(*args, **kwargs)


class SlotOffer(models.Model):
    """
    Candidate appointment slots calculated by the engine and approved by reception,
    dispatched to the patient with a strict 60-minute selection window.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    request = models.ForeignKey(BookingRequest, on_delete=models.CASCADE, related_name='slot_offers')
    doctor = models.ForeignKey(Doctor, on_delete=models.CASCADE, related_name='offered_slots')
    start_datetime = models.DateTimeField()
    end_datetime = models.DateTimeField()
    is_alternative_date = models.BooleanField(default=False)
    offered_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    is_selected = models.BooleanField(default=False)

    class Meta:
        db_table = 'slot_offers'
        verbose_name = 'Slot Offer'
        verbose_name_plural = 'Slot Offers'

    def __str__(self):
        return f"Offer for {self.request.patient_name}: {self.start_datetime.strftime('%Y-%m-%d %H:%M')}"


class Appointment(models.Model):
    """
    Clinical appointment holding or booking on the calendar.
    Protects against double-booking with atomic database transactions.
    """
    STATUS_CHOICES = (
        ('held', 'Held (Temporary 15m)'),
        ('confirmed', 'Confirmed'),
        ('arrived', 'Arrived / In Waiting Room'),
        ('in_consultation', 'In Consultation'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
        ('no_show', 'No Show'),
        ('hold_expired', 'Hold Expired'),
    )

    # Wave 2 / Step 2.3 — the lifecycle as a map, not a wish list. The staff
    # status endpoint accepts exactly these edges; everything else answers
    # 409 INVALID_TRANSITION and the row is left untouched. Internal writers
    # (sweeper expiry, patient replies, Telegram callbacks, slot selection)
    # set status directly and are not routed through this map — every edge
    # they take is listed here so the map documents the whole system.
    # completed / cancelled / no_show / hold_expired are terminal: a visit
    # that is history can never be edited back into the present.
    STATUS_TRANSITIONS = {
        'held': {'confirmed', 'cancelled', 'hold_expired'},
        'confirmed': {'arrived', 'in_consultation', 'completed', 'no_show', 'cancelled'},
        'arrived': {'in_consultation', 'completed', 'no_show', 'cancelled'},
        'in_consultation': {'completed', 'cancelled'},
        'completed': set(),
        'cancelled': set(),
        'no_show': set(),
        'hold_expired': set(),
    }

    def allowed_status_targets(self):
        return self.STATUS_TRANSITIONS.get(self.status, set())

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    appointment_code = models.CharField(max_length=32, unique=True, db_index=True)
    patient_name = models.CharField(max_length=255)
    patient_phone = models.CharField(max_length=32, db_index=True)
    date_of_birth = models.DateField(null=True, blank=True)
    gender = models.CharField(max_length=16, blank=True, default='')
    is_emergency = models.BooleanField(default=False)
    doctor = models.ForeignKey(Doctor, on_delete=models.PROTECT, related_name='appointments')
    service = models.ForeignKey(Service, on_delete=models.PROTECT, related_name='appointments')
    booking_request = models.ForeignKey(BookingRequest, on_delete=models.SET_NULL, null=True, blank=True, related_name='appointments')
    start_datetime = models.DateTimeField(db_index=True)
    end_datetime = models.DateTimeField(db_index=True)
    status = models.CharField(max_length=32, choices=STATUS_CHOICES, default='held', db_index=True)
    hold_expires_at = models.DateTimeField(null=True, blank=True, db_index=True)
    confirmed_at = models.DateTimeField(null=True, blank=True)
    arrival_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancellation_reason = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'appointments'
        verbose_name = 'Appointment'
        verbose_name_plural = 'Appointments'
        indexes = [
            models.Index(fields=['doctor', 'start_datetime', 'end_datetime'], name='idx_appt_doc_time'),
            models.Index(fields=['status', 'hold_expires_at'], name='idx_appt_status_hold'),
            models.Index(fields=['patient_phone', 'created_at'], name='idx_appt_phone_created'),
        ]

    def __str__(self):
        return f"{self.appointment_code} - {self.patient_name} with {self.doctor.name} ({self.get_status_display()})"

    def save(self, *args, **kwargs):
        if not self.appointment_code:
            from django.db import IntegrityError, transaction
            count = Appointment.objects.count() + 1
            for attempt in range(10):
                candidate = f"AP-{count:04d}"
                while Appointment.objects.filter(appointment_code=candidate).exists():
                    count += 1
                    candidate = f"AP-{count:04d}"
                self.appointment_code = candidate
                try:
                    with transaction.atomic():
                        return super().save(*args, **kwargs)
                except IntegrityError:
                    self.appointment_code = ''
                    count += 1
                    if attempt == 9:
                        raise
        return super().save(*args, **kwargs)


class FollowUpTask(models.Model):
    """
    Doctor-directed clinical recall tasks generated during visit completion
    (e.g., 1-week suture check, 6-month dental cleaning).
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    appointment = models.ForeignKey(Appointment, on_delete=models.CASCADE, related_name='follow_up_tasks')
    doctor = models.ForeignKey(Doctor, on_delete=models.SET_NULL, null=True, blank=True, related_name='follow_up_tasks')
    follow_up_date = models.DateField(db_index=True)
    notes = models.TextField(blank=True, default='')
    # Follow-up upgrade / rule B (owner decision): the message box starts empty,
    # and an EMPTY message means nothing is sent — the recall is a private
    # clinic note. Only words typed here reach the patient.
    patient_message = models.TextField(blank=True, default='')
    # The sweep only sends once this time has passed on the due date (clinic clock).
    send_at = models.TimeField(default=datetime.time(9, 0))
    reminder_sent = models.BooleanField(default=False)
    is_completed = models.BooleanField(default=False)
    reminder_sent_at = models.DateTimeField(null=True, blank=True)
    # Recalls list: a cancelled recall stays on record but is never sent.
    cancelled_at = models.DateTimeField(null=True, blank=True, db_index=True)
    cancelled_by = models.CharField(max_length=255, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'follow_up_tasks'
        verbose_name = 'Follow-Up Task'
        verbose_name_plural = 'Follow-Up Tasks'

    def __str__(self):
        return f"Follow-up for {self.appointment.patient_name} on {self.follow_up_date}"


class AuditLog(models.Model):
    """
    Immutable audit trail recording every state change, front-desk override,
    and administrative action for regulatory compliance.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    entity_name = models.CharField(max_length=64, db_index=True)
    entity_id = models.UUIDField(db_index=True)
    action = models.CharField(max_length=64)
    performed_by = models.CharField(max_length=255, default='system')
    changes = models.JSONField(default=dict, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = 'audit_logs'
        verbose_name = 'Audit Log'
        verbose_name_plural = 'Audit Logs'
        ordering = ['-created_at']

    def __str__(self):
        return f"[{self.created_at.strftime('%Y-%m-%d %H:%M')}] {self.entity_name} {self.action} by {self.performed_by}"


class IdempotencyKey(models.Model):
    """
    Prevents duplicate webhook processing from external messaging gateways (Telegram / WhatsApp).
    """
    SOURCE_CHOICES = (
        ('telegram', 'Telegram'),
        ('whatsapp', 'WhatsApp'),
        ('web', 'Web'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    key = models.CharField(max_length=255, unique=True, db_index=True)
    source = models.CharField(max_length=32, choices=SOURCE_CHOICES)
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'idempotency_keys'
        verbose_name = 'Idempotency Key'
        verbose_name_plural = 'Idempotency Keys'

    def __str__(self):
        return f"{self.source}:{self.key}"


class InteractionLog(models.Model):
    """
    Phase 2 / Task 2.1 — Authoritative record of every patient-facing
    communication (VoiceBip call, WhatsApp, SMS, Telegram) sent by the n8n
    Dispatcher or reception staff (Hybrid AI OS spec §6 "Interactions" data area).

    Idempotency: `external_ref` stores the provider's unique message/call ID;
    re-delivered webhooks upsert onto the same row instead of duplicating.
    """
    PROVIDER_CHOICES = (
        ('voicebip', 'VoiceBip (Voice/SMS)'),
        ('meta_whatsapp', 'Meta WhatsApp Cloud'),
        ('telegram', 'Telegram Bot'),
        ('system', 'System / Internal'),
    )

    CHANNEL_CHOICES = (
        ('voice', 'Voice Call'),
        ('whatsapp', 'WhatsApp'),
        ('sms', 'SMS'),
        ('telegram', 'Telegram'),
    )

    DIRECTION_CHOICES = (
        ('outbound', 'Outbound (clinic to patient)'),
        ('inbound', 'Inbound (patient to clinic)'),
    )

    STATUS_CHOICES = (
        ('queued', 'Queued'),
        ('sent', 'Sent'),
        ('delivered', 'Delivered'),
        ('failed', 'Failed'),
        ('answered', 'Answered'),
        ('no_answer', 'No Answer'),
        ('expired', 'Expired'),
    )

    # Monotonic ordering for provider callbacks (Stage D-4).
    #
    # Delivery reports and call outcomes arrive out of order: a "delivered"
    # webhook can land after an "answered" one, or a retry can re-send an older
    # "sent" event. A late event must never walk a row backwards, so the write
    # path only accepts a status whose rank is >= the stored one. Terminal
    # outcomes (answered / no_answer / failed / expired) deliberately share the
    # top rank: they are peers, and the most recent terminal event wins.
    STATUS_RANK = {
        'queued': 0,
        'sent': 1,
        'delivered': 2,
        'answered': 3,
        'no_answer': 3,
        'failed': 3,
        'expired': 3,
    }

    def status_rank(self):
        return self.STATUS_RANK.get(self.status, 0)

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    provider = models.CharField(max_length=32, choices=PROVIDER_CHOICES, db_index=True)
    channel = models.CharField(max_length=16, choices=CHANNEL_CHOICES, db_index=True)
    direction = models.CharField(max_length=16, choices=DIRECTION_CHOICES, default='outbound')
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default='sent', db_index=True)

    # Patient identification (E.164 normalized phone — spec §6 duplicate protection)
    patient_name = models.CharField(max_length=255, blank=True, default='')
    patient_phone = models.CharField(max_length=32, db_index=True)

    # Optional links to the booking domain (nullable — provider-only interactions allowed)
    booking_request = models.ForeignKey(
        BookingRequest, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='interactions'
    )
    appointment = models.ForeignKey(
        Appointment, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='interactions'
    )

    # Delivery evidence
    external_ref = models.CharField(
        max_length=255, unique=True, null=True, blank=True, db_index=True,
        help_text="Provider's unique message/call ID — idempotency key for webhook re-delivery."
    )
    call_duration_seconds = models.PositiveIntegerField(null=True, blank=True)
    recording_url = models.URLField(null=True, blank=True)
    summary = models.TextField(blank=True, default='')
    transcript = models.TextField(blank=True, default='')
    error_detail = models.TextField(blank=True, default='')

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'interaction_logs'
        verbose_name = 'Interaction Log'
        verbose_name_plural = 'Interaction Logs'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.get_channel_display()} ({self.get_status_display()}) → {self.patient_name or self.patient_phone}"
