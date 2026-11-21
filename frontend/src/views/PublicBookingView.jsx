import React, { useMemo } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Loader2,
  Send,
  ShieldCheck,
  Stethoscope,
  TriangleAlert,
  UserRound,
} from 'lucide-react';
import { PUBLIC_BOOKING_STEPS, usePublicBooking } from '../hooks/usePublicBooking';
import '../styles/components/public-booking.css';

const WINDOWS = [
  { id: 'morning', label: 'Morning', hint: '08:00 – 12:00' },
  { id: 'afternoon', label: 'Afternoon', hint: '12:00 – 16:00' },
  { id: 'evening', label: 'Evening', hint: '16:00 – 18:00' },
];

const GENDERS = [
  { id: '', label: 'Prefer not to say' },
  { id: 'female', label: 'Female' },
  { id: 'male', label: 'Male' },
  { id: 'other', label: 'Other' },
];

const DAY_NAMES = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun' };

function formatWorkingDays(days) {
  if (!Array.isArray(days) || days.length === 0) return 'By appointment';
  return days.map((d) => DAY_NAMES[d] || '').filter(Boolean).join(' · ');
}

function StepRail({ step }) {
  const activeIndex = PUBLIC_BOOKING_STEPS.indexOf(step);
  const labels = ['Service', 'Your details', 'Preferred times'];
  return (
    <ol className="pb-steps" aria-label="Booking progress">
      {labels.map((label, index) => (
        <li
          key={label}
          className={
            'pb-step'
            + (index === activeIndex ? ' is-active' : '')
            + (index < activeIndex ? ' is-done' : '')
          }
          aria-current={index === activeIndex ? 'step' : undefined}
        >
          <span className="pb-step-index">{index + 1}</span>
          <span className="pb-step-label">{label}</span>
        </li>
      ))}
    </ol>
  );
}

/**
 * PublicBookingView — the patient's front door.
 *
 * DESIGN ONLY: every value comes from `usePublicBooking`, every sentence that
 * describes clinic policy comes from the API (Django owns the wording).
 */
export function PublicBookingView() {
  const booking = usePublicBooking();
  const { info, form, errors } = booking;

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  if (booking.loading) {
    return (
      <main className="pb-page">
        <div className="pb-card pb-center">
          <Loader2 className="pb-spin" size={22} />
          <p>Opening the booking desk…</p>
        </div>
      </main>
    );
  }

  if (booking.loadError || !info) {
    return (
      <main className="pb-page">
        <div className="pb-card pb-center">
          <TriangleAlert size={22} className="pb-warn" />
          <h1 className="pb-title">The booking desk is unavailable</h1>
          <p className="pb-muted">{booking.loadError || 'No clinic information was returned.'}</p>
          <button type="button" className="pb-btn pb-btn-primary" onClick={booking.reload}>
            Try again
          </button>
        </div>
      </main>
    );
  }

  const requestCode = booking.result?.request_code || booking.result?.request_id || '';

  return (
    <main className="pb-page">
      <header className="pb-hero">
        <div className="pb-hero-inner">
          <span className="pb-badge">
            <ShieldCheck size={12} /> {info.clinic_name}
          </span>
          <h1 className="pb-title">Book an appointment</h1>
          <p className="pb-subtitle">
            Tell us what you need and when. Our front desk reviews every request and sends
            you real available times — no waiting on hold.
          </p>
          <p className="pb-hours">
            <Clock3 size={13} />
            {formatWorkingDays(info.hours?.working_days)} · {info.hours?.open_time}–{info.hours?.close_time}
          </p>
        </div>
      </header>

      <section className="pb-card" aria-live="polite">
        {booking.step !== 'done' && <StepRail step={booking.step} />}

        {booking.step === 'service' && (
          <div className="pb-body">
            <h2 className="pb-section-title">What do you need?</h2>

            <div className="pb-options" role="radiogroup" aria-label="Service">
              {(info.services || []).map((service) => (
                <button
                  key={service.id}
                  type="button"
                  role="radio"
                  aria-checked={form.serviceId === service.id}
                  className={'pb-option' + (form.serviceId === service.id ? ' is-selected' : '')}
                  onClick={() => booking.setField('serviceId', service.id)}
                >
                  <Stethoscope size={16} />
                  <span className="pb-option-text">
                    <strong>{service.name}</strong>
                    <small>
                      {service.category ? `${service.category} · ` : ''}
                      {service.duration_minutes} minutes
                    </small>
                  </span>
                </button>
              ))}
            </div>
            {errors.serviceId && <p className="pb-error">{errors.serviceId}</p>}

            {(info.doctors || []).length > 0 && (
              <label className="pb-field">
                <span className="pb-label">Preferred doctor (optional)</span>
                <select
                  className="pb-input"
                  value={form.preferredDoctorId}
                  onChange={(event) => booking.setField('preferredDoctorId', event.target.value)}
                >
                  <option value="">Any available doctor</option>
                  {info.doctors.map((doctor) => (
                    <option key={doctor.id} value={doctor.id}>
                      {doctor.name}{doctor.specialty ? ` — ${doctor.specialty}` : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="pb-actions">
              <button type="button" className="pb-btn pb-btn-primary" onClick={booking.next}>
                Continue <ArrowRight size={15} />
              </button>
            </div>
          </div>
        )}

        {booking.step === 'details' && (
          <div className="pb-body">
            <h2 className="pb-section-title">About you</h2>
            <p className="pb-muted">We only use these details to arrange and confirm your visit.</p>

            <label className="pb-field">
              <span className="pb-label">Full name</span>
              <input
                className="pb-input"
                type="text"
                autoComplete="name"
                placeholder="Amina Bello"
                value={form.patientName}
                required
                onChange={(event) => booking.setField('patientName', event.target.value)}
              />
              {errors.patientName && <span className="pb-error">{errors.patientName}</span>}
            </label>

            <label className="pb-field">
              <span className="pb-label">Phone number</span>
              <input
                className="pb-input"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="0803 000 0000"
                value={form.patientPhone}
                required
                onChange={(event) => booking.setField('patientPhone', event.target.value)}
              />
              {errors.patientPhone && <span className="pb-error">{errors.patientPhone}</span>}
            </label>

            <div className="pb-grid-2">
              <label className="pb-field">
                <span className="pb-label">Date of birth (optional)</span>
                <input
                  id="dob"
                  className="pb-input"
                  type="date"
                  aria-label="Date of birth (optional)"
                  max={today}
                  value={form.dateOfBirth}
                  onChange={(event) => booking.setField('dateOfBirth', event.target.value)}
                />
                {errors.dateOfBirth && <span className="pb-error">{errors.dateOfBirth}</span>}
              </label>

              <label className="pb-field">
                <span className="pb-label">Gender (optional)</span>
                <select
                  className="pb-input"
                  aria-label="Gender (optional)"
                  value={form.gender}
                  onChange={(event) => booking.setField('gender', event.target.value)}
                >
                  {GENDERS.map((option) => (
                    <option key={option.id || 'unset'} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="pb-check">
              <input
                type="checkbox"
                checked={form.isEmergency}
                onChange={(event) => booking.setField('isEmergency', event.target.checked)}
              />
              <span>
                <strong>This is urgent.</strong> Mark the request so the front desk
                sees it first.
              </span>
            </label>

            <p className="pb-warning">
              <TriangleAlert size={14} />
              For a life-threatening emergency, call the clinic or 112 directly. This form is
              not monitored around the clock.
            </p>

            <div className="pb-actions">
              <button type="button" className="pb-btn pb-btn-ghost" onClick={booking.back}>
                <ArrowLeft size={15} /> Back
              </button>
              <button type="button" className="pb-btn pb-btn-primary" onClick={booking.next}>
                Continue <ArrowRight size={15} />
              </button>
            </div>
          </div>
        )}

        {booking.step === 'when' && (
          <div className="pb-body">
            <h2 className="pb-section-title">When suits you?</h2>
            <p className="pb-muted">
              Leave the dates blank and we will find the earliest available times.
            </p>

            <div className="pb-grid-2">
              <label className="pb-field">
                <span className="pb-label">Earliest date (optional)</span>
                <input
                  className="pb-input"
                  type="date"
                  aria-label="Earliest date (optional)"
                  min={today}
                  value={form.fromDate}
                  onChange={(event) => booking.setField('fromDate', event.target.value)}
                />
              </label>
              <label className="pb-field">
                <span className="pb-label">Latest date (optional)</span>
                <input
                  className="pb-input"
                  type="date"
                  aria-label="Latest date (optional)"
                  min={form.fromDate || today}
                  value={form.toDate}
                  onChange={(event) => booking.setField('toDate', event.target.value)}
                />
                {errors.toDate && <span className="pb-error">{errors.toDate}</span>}
              </label>
            </div>

            <fieldset className="pb-field pb-fieldset">
              <legend className="pb-label">Preferred time of day</legend>
              <div className="pb-chips">
                {WINDOWS.map((window) => (
                  <button
                    key={window.id}
                    type="button"
                    aria-pressed={form.timeWindow === window.id}
                    className={'pb-chip' + (form.timeWindow === window.id ? ' is-selected' : '')}
                    onClick={() => booking.setField('timeWindow', window.id)}
                  >
                    <strong>{window.label}</strong>
                    <small>{window.hint}</small>
                  </button>
                ))}
              </div>
            </fieldset>

            <label className="pb-field">
              <span className="pb-label">
                Reason for your visit (optional)
                <span className="pb-counter">{form.notes.length}/500</span>
              </span>
              <textarea
                className="pb-input pb-textarea"
                rows={3}
                maxLength={500}
                placeholder="For example: tooth pain on the left side for three days."
                value={form.notes}
                onChange={(event) => booking.setField('notes', event.target.value)}
              />
            </label>

            <div className="pb-summary-strip">
              <CalendarDays size={15} />
              <span>
                {booking.selectedService?.name || 'Service'}
                {booking.selectedDoctor ? ` with ${booking.selectedDoctor.name}` : ''}
              </span>
            </div>

            <p className="pb-notice">
              <Clock3 size={14} />
              {info.notice}
            </p>

            {booking.submitError && (
              <p className="pb-error pb-error-block" role="alert">{booking.submitError}</p>
            )}

            <div className="pb-actions">
              <button type="button" className="pb-btn pb-btn-ghost" onClick={booking.back}>
                <ArrowLeft size={15} /> Back
              </button>
              <button
                type="button"
                className="pb-btn pb-btn-primary"
                onClick={booking.submit}
                disabled={booking.submitting}
              >
                {booking.submitting ? (
                  <><Loader2 className="pb-spin" size={15} /> Sending…</>
                ) : (
                  <><Send size={15} /> Request times</>
                )}
              </button>
            </div>
          </div>
        )}

        {booking.step === 'done' && (
          <div className="pb-body pb-done">
            <CheckCircle2 size={30} className="pb-success-icon" />
            <h2 className="pb-section-title">Request received</h2>
            <p className="pb-muted">
              Keep this reference. Our front desk is preparing your available times now.
            </p>

            <div className="pb-code" aria-label="Request reference">
              {requestCode}
            </div>

            <dl className="pb-recap">
              <div>
                <dt>Service</dt>
                <dd>{booking.selectedService?.name || '—'}</dd>
              </div>
              <div>
                <dt>Doctor</dt>
                <dd>{booking.selectedDoctor?.name || 'Any available'}</dd>
              </div>
              <div>
                <dt>Preferred times</dt>
                <dd>
                  {booking.form.fromDate
                    ? `${booking.form.fromDate} → ${booking.form.toDate || booking.form.fromDate}`
                    : 'Earliest available'}
                  {' · '}
                  {booking.form.timeWindow}
                </dd>
              </div>
              <div>
                <dt>Phone</dt>
                <dd>{booking.form.patientPhone}</dd>
              </div>
            </dl>

            {booking.result?.telegram_link ? (
              <a
                className="pb-btn pb-btn-primary pb-btn-wide"
                href={booking.result.telegram_link}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Send size={15} /> Get your times on Telegram
              </a>
            ) : null}

            <p className="pb-muted pb-small">
              {booking.result?.telegram_link
                ? 'No Telegram? No problem — our front desk will call you on the number above.'
                : 'Our front desk will call you on the number above with the available times.'}
            </p>

            <p className="pb-notice">
              <Clock3 size={14} />
              {info.notice}
            </p>

            <div className="pb-actions pb-actions-center">
              <button type="button" className="pb-btn pb-btn-ghost" onClick={booking.restart}>
                Book another appointment
              </button>
            </div>

            <p className="pb-footnote">
              <UserRound size={12} /> Your details are used only to arrange this appointment.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}

export default PublicBookingView;
