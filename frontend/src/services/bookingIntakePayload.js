/**
 * Zero-partner route / Step 4 — the ONE place the public form's camelCase
 * state becomes the snake_case body `BookingRequestCreateSerializer` reads.
 *
 * Pure by design: no fetch, no React, no `import.meta.env`. The Node harness
 * imports and executes this file directly, so the contract is tested rather
 * than grepped.
 *
 * Two rules that came from real 400s:
 *   - an empty date of birth must be `null`, never `''`;
 *   - an empty doctor or date range must be OMITTED, not sent blank.
 */

const text = (value) => (value === undefined || value === null ? '' : String(value).trim());

export function buildBookingIntakePayload(form = {}) {
  const body = {
    patient_name: text(form.patientName),
    patient_phone: text(form.patientPhone),
    service_id: text(form.serviceId),
    preferred_time_window: text(form.timeWindow) || 'morning',
    channel: 'web',
    patient_notes: text(form.notes),
    date_of_birth: text(form.dateOfBirth) || null,
    gender: text(form.gender),
    is_emergency: form.isEmergency === true,
    // Anti-bot honeypot: always present, invisible to humans, empty for humans.
    clinic_web_trap: text(form.trap),
  };

  const doctorId = text(form.preferredDoctorId);
  if (doctorId) body.preferred_doctor_id = doctorId;

  const from = text(form.fromDate);
  if (from) body.preferred_dates = [from, text(form.toDate) || from];

  return body;
}
