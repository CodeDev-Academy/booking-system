/**
 * apiService — Headless Client for Django REST Framework API Endpoints
 * Solves Structural Hole 2: connects frontend stores to live Django backend.
 * LOGIC LAYER ONLY: pure async functions, zero JSX.
 * All endpoints adhere to /api/v1/ prefix and handle snake_case / camelCase translation.
 */

// Wave 3 / Step 3.1: the health endpoint's clock feeds the site's one clock.
import { configureClinicClock } from './clinicTimeService';

// Wave 3 / Step 3.8: an agency template must FAIL LOUDLY, not guess. The old
// fallback silently sent real patient bookings to whichever origin served the
// page (and kept a dead constant pointing at someone else's demo server).
// A production build therefore requires VITE_API_URL / VITE_API_BASE_URL and
// refuses to start without it; local and LAN development keeps the
// convenient localhost default.
const configuredBase =
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  '';

const isLocalOrLan =
  typeof window !== 'undefined' &&
  (
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    /^192\.168\.\d+\.\d+$/.test(window.location.hostname) ||
    /^10\.\d+\.\d+\.\d+$/.test(window.location.hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(window.location.hostname) ||
    window.location.hostname.endsWith('.local')
  );

if (import.meta.env.PROD && !configuredBase && !isLocalOrLan) {
  throw new Error(
    'VITE_API_URL is not configured. Refusing to guess where patient data ' +
    'should be sent. Set VITE_API_URL (e.g. https://api.your-clinic.com/api/v1) ' +
    'at build time, or run the app on localhost for development.'
  );
}

const API_BASE_URL =
  configuredBase ||
  (isLocalOrLan
    ? `http://${typeof window !== 'undefined' ? window.location.hostname : 'localhost'}:8000/api/v1`
    : `${typeof window !== 'undefined' ? window.location.origin : ''}/api/v1`);

/**
 * Standard fetch wrapper with JSON headers, error unwrapping, credentials,
 * support for binary/blob downloads (CSV), and automatic 401 session ejection.
 */
async function request(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/csv, */*',
    ...(options.headers || {}),
  };

  // Attach auth token if present
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('cbs_auth_token') : null;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const res = await fetch(url, {
      ...options,
      headers,
    });

    if (!res.ok) {
      // Wave 4 / Step 4.1 — the 30-day session: an expired access token is
      // RENEWED, not punished. One silent refresh-and-retry per call; only
      // when renewal fails (the 30 days are over, or the account was
      // deactivated — the backend's kill-switch) does the old ejection fire.
      if (res.status === 401) {
        const isAuthAttempt =
          endpoint.includes('/auth/login') ||
          endpoint.includes('/auth/pin-unlock') ||
          endpoint.includes('/auth/verify-pin') ||
          endpoint.includes('/auth/refresh');
        if (!isAuthAttempt && !options._isRenewalRetry) {
          const renewed = await refreshSession();
          if (renewed) {
            return request(endpoint, { ...options, _isRenewalRetry: true });
          }
        }
        if (!isAuthAttempt && typeof window !== 'undefined') {
          localStorage.removeItem('cbs_auth_token');
          localStorage.removeItem('cbs_refresh_token');
          window.dispatchEvent(
            new CustomEvent('cbs_auth_unauthorized', {
              detail: { endpoint, status: res.status },
            })
          );
        }
      }

      const errorBody = await res.json().catch(() => ({}));
      const error = new Error(
        errorBody.error || errorBody.detail || errorBody.message || `API Error ${res.status}: ${res.statusText}`
      );
      error.status = res.status;
      error.details = errorBody;
      throw error;
    }

    if (res.status === 204) return null;

    // Handle Blob or Text downloads (CSV / JSON exports)
    if (options.responseType === 'blob') {
      return await res.blob();
    }
    if (options.responseType === 'text') {
      return await res.text();
    }
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('text/csv')) {
      return await res.blob();
    }

    return await res.json();
  } catch (err) {
    // If network error, annotate cleanly
    if (!err.status) {
      err.isNetworkError = true;
    }
    throw err;
  }
}

/**
 * Wave 4 / Step 4.1 — redeem the 30-day refresh token for a fresh access
 * token. Returns true when the session was renewed. A failure returns false
 * (the caller decides whether to eject); the refresh call itself never
 * triggers a renewal loop — /auth/refresh is an auth attempt.
 */
async function refreshSession() {
  const refreshToken =
    typeof localStorage !== 'undefined' ? localStorage.getItem('cbs_refresh_token') : null;
  if (!refreshToken) return false;
  try {
    const data = await request('/auth/refresh/', {
      method: 'POST',
      body: JSON.stringify({ refresh: refreshToken }),
    });
    if (data && data.access) {
      localStorage.setItem('cbs_auth_token', data.access);
      return true;
    }
    return false;
  } catch (err) {
    return false;
  }
}

/**
 * Helper to trigger a file download from a Blob in the browser
 */
function triggerBrowserDownload(blob, filename) {
  if (typeof window === 'undefined' || !window.document) return;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Wave 1 / Step 1.1: the ONE place camelCase store data becomes the snake_case
// body Django's SlotHoldRequestSerializer actually reads. Django requires
// `patient_name` / `patient_phone` / `request_id`; forwarding raw `name`/`phone`
// made every dashboard confirm and walk-in answer 400 while the UI toasted
// success. Keys the backend does not declare are dropped before they are sent.
function toWireBookingPayload(input = {}, { isWalkIn = false } = {}) {
  const pick = (...keys) => {
    for (const key of keys) {
      const value = input[key];
      if (value !== undefined && value !== null && value !== '') return value;
    }
    return undefined;
  };
  const body = {
    doctor_id: pick('doctorId', 'doctor_id'),
    service_id: pick('serviceId', 'service_id'),
    patient_name: pick('patientName', 'patient_name', 'name'),
    patient_phone: pick('patientPhone', 'patient_phone', 'phone'),
    start_datetime:
      pick('startDatetime', 'start_datetime') ||
      (input.startTs ? new Date(input.startTs).toISOString() : undefined),
    end_datetime:
      pick('endDatetime', 'end_datetime') ||
      (input.endTs ? new Date(input.endTs).toISOString() : undefined),
    request_id: pick('requestId', 'request_id', 'bookingRequestId', 'booking_request_id'),
    date_of_birth: pick('dateOfBirth', 'date_of_birth'),
    gender: pick('gender'),
    is_emergency: Boolean(pick('isEmergency', 'is_emergency')),
    notes: pick('notes'),
  };
  if (isWalkIn) body.is_walk_in = true;
  else body.is_instant_confirm = Boolean(pick('isInstantConfirm', 'is_instant_confirm'));
  // Never send `undefined` - JSON.stringify would keep the key out anyway, but
  // being explicit keeps the payload readable in the network tab.
  return Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
}

export const apiService = {
  baseUrl: API_BASE_URL,

  // ==========================================
  // 1. Health & Connection Probe
  // ==========================================
  async checkHealth() {
    try {
      const data = await request('/health/');
      return { ok: true, data };
    } catch (err) {
      return { ok: false, error: err.message, isNetworkError: err.isNetworkError };
    }
  },

  // Wave 4 / Step 4.1 — exposed for boot: a returning staff member within
  // the 30-day window gets a silently re-armed access token before the first
  // data call fires.
  refreshSession,

  // Wave 3 / Step 3.1 — the clinic's clock is the site's only clock. The
  // health endpoint publishes the server's own time and the clinic timezone;
  // syncing here means a wrong device clock or a foreign timezone can never
  // shift the schedule. Call on boot, then periodically (main.jsx owns the
  // schedule). Offline is not an error: the device clock remains the
  // fallback for display only, and the next successful sync corrects it.
  async syncClinicClock() {
    try {
      const data = await request('/health/');
      if (data && data.server_time) {
        configureClinicClock({ serverTime: data.server_time, timezone: data.timezone });
        return true;
      }
      return false;
    } catch (err) {
      return false;
    }
  },

  // ==========================================
  // 2. Staff Authentication & Governance
  // ==========================================
  async login(email, password, website_url = '') {
    return request('/auth/login/', {
      method: 'POST',
      body: JSON.stringify({ email, password, website_url }),
    });
  },

  async logout() {
    return request('/auth/logout/', {
      method: 'POST',
    }).catch(() => null);
  },

  async fetchMe() {
    return request('/auth/me/');
  },

  // Wave 5 / Step 5.7: the PIN unlocks the SESSION's own staff account — the
  // view reads request.user, so sending an email was dead weight (and a
  // subtle hint that the body picks the account; it never did).
  async unlockPin(pin) {
    return request('/auth/pin-unlock/', {
      method: 'POST',
      body: JSON.stringify({ pin }),
    });
  },

  // Admin Staff Roster Management
  async fetchStaff() {
    return request('/staff/');
  },

  // NOTE (Phase 2.5, system review finding #7): the five staff-management
  // methods below were previously defined TWICE in this object literal (the
  // duplicate block that used to sit here was dead code — JS object literals
  // silently keep the last definition). The canonical versions live with the
  // rest of the staff directory API further down.

  // ==========================================
  // 3. Inbound Booking Requests & Triage Queue
  // ==========================================
  async fetchBookingRequests(params = {}) {
    const query = new URLSearchParams(params).toString();
    return request(`/booking-requests/${query ? `?${query}` : ''}`);
  },

  async createBookingRequest(payload) {
    return request('/booking-requests/', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async checkSlots(requestId, excludeStartDatetimes = null) {
    // Task 3.3: "Re-calculate Times" passes the starts already on screen so the
    // engine returns the NEXT best options instead of the identical top-3 again.
    const body = Array.isArray(excludeStartDatetimes) && excludeStartDatetimes.length > 0
      ? { exclude_start_datetimes: excludeStartDatetimes }
      : {};
    return request(`/booking-requests/${requestId}/check-slots/`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async dispatchOffers(requestId, slots = [], dispatchChannels = null) {
    const formattedSlots = Array.isArray(slots)
      ? slots.map((s) => {
          if (typeof s === 'object' && s !== null) {
            const startTs =
              s.startDatetime ||
              s.start_datetime ||
              (s.start ? (typeof s.start === 'number' ? s.start : new Date(s.start).getTime()) : (s.startTs ? (typeof s.startTs === 'number' ? s.startTs : new Date(s.startTs).getTime()) : null));
            const startIso = startTs ? new Date(startTs).toISOString() : undefined;
            const durationMin = s.durationMin || s.duration_minutes || 30;
            const endTs =
              s.endDatetime ||
              s.end_datetime ||
              (s.end ? (typeof s.end === 'number' ? s.end : new Date(s.end).getTime()) : (s.endTs ? (typeof s.endTs === 'number' ? s.endTs : new Date(s.endTs).getTime()) : (startTs ? startTs + durationMin * 60000 : null)));
            const endIso = endTs ? new Date(endTs).toISOString() : undefined;

            return {
              doctor_id: s.doctorId || s.doctor_id,
              start_datetime: startIso,
              end_datetime: endIso,
              is_alternative_date: s.isAlternativeDate || s.is_alternative_date || false,
            };
          }
          return s;
        })
      : [];

    // Task 3.1: receptionist channel checkboxes — HOW reception reaches the patient
    // (distinct from `channel`, which records where the patient came FROM).
    const body = { slots: formattedSlots };
    if (Array.isArray(dispatchChannels) && dispatchChannels.length > 0) {
      body.dispatch_channels = dispatchChannels;
    }

    return request(`/booking-requests/${requestId}/dispatch-offers/`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  // Option B: read-only channel availability for the ReviewModal.
  // Tells reception which ticked channels can actually reach this patient.
  async getChannelAvailability(requestId) {
    return request(`/booking-requests/${requestId}/channel-availability/`);
  },

  // Task 3.2: patient communication history (dossier timeline).
  // Backend GET /api/v1/interactions/ is staff-auth; phones are E.164.
  async getInteractions(patientPhone, limit = 50) {
    const query = `patient_phone=${encodeURIComponent(patientPhone)}&limit=${limit}`;
    return request(`/interactions/?${query}`);
  },

  async askInfo(requestId, message, promptCode = 'custom') {
    return request(`/booking-requests/${requestId}/ask-info/`, {
      method: 'POST',
      body: JSON.stringify({ message, prompt_code: promptCode }),
    });
  },

  // ==========================================
  // 4. Appointments & Live Visits
  // ==========================================
  async fetchTodayAppointments(params = {}) {
    const query = new URLSearchParams(params).toString();
    return request(`/appointments/today/${query ? `?${query}` : ''}`);
  },

  async fetchAppointments(params = {}) {
    const query = new URLSearchParams(params).toString();
    return request(`/appointments/${query ? `?${query}` : ''}`);
  },

  async holdSlot(payload) {
    return request('/slots/hold/', {
      method: 'POST',
      body: JSON.stringify(toWireBookingPayload(payload)),
    });
  },

  async registerWalkIn(walkInData) {
    return request('/appointments/walk-in/', {
      method: 'POST',
      body: JSON.stringify(toWireBookingPayload(walkInData, { isWalkIn: true })),
    });
  },

  async updateAppointmentStatus(appointmentId, status, notes = '', cancellationReason = '') {
    return request(`/appointments/${appointmentId}/status/`, {
      method: 'POST',
      body: JSON.stringify({
        status,
        notes,
        cancellation_reason: cancellationReason || undefined,
      }),
    });
  },

  async rescheduleAppointment(appointmentId, rescheduleData) {
    const payload = {
      doctor_id: rescheduleData.doctorId || rescheduleData.doctor_id || rescheduleData.doctor,
      start_datetime:
        rescheduleData.startDatetime ||
        rescheduleData.start_datetime ||
        (rescheduleData.start ? new Date(rescheduleData.start).toISOString() : undefined),
      end_datetime:
        rescheduleData.endDatetime ||
        rescheduleData.end_datetime ||
        (rescheduleData.end ? new Date(rescheduleData.end).toISOString() : undefined),
    };
    return request(`/appointments/${appointmentId}/reschedule/`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async appointmentAction(appointmentId, action, extraData = {}) {
    return request(`/appointments/${appointmentId}/${action}/`, {
      method: 'POST',
      body: JSON.stringify(extraData),
    });
  },

  async createFollowUp(appointmentId, followUpData) {
    return request(`/appointments/${appointmentId}/follow-up/`, {
      method: 'POST',
      body: JSON.stringify(followUpData),
    });
  },

  async reassignDoctorLeave(appointmentId, targetDoctorId, reason = '') {
    return request(`/appointments/${appointmentId}/reassign-leave/`, {
      method: 'POST',
      body: JSON.stringify({
        new_doctor_id: targetDoctorId,
        target_doctor_id: targetDoctorId,
        reason,
      }),
    });
  },

  // One-click emergency leave resolution: the backend decides everything
  // (placements, notice words); the frontend only sends the window + reason.
  async autoResolveDisruption(doctorId, payload) {
    return request(`/disruptions/${doctorId}/auto-resolve/`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  // Dry run of that same resolver. The backend plans inside a transaction it
  // always rolls back, so the response is exactly what Approve would do while
  // saving nothing and sending nothing.
  async previewDisruption(doctorId, payload) {
    return request(`/disruptions/${doctorId}/preview/`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  // Step 3 — patients still booked under a doctor who is on leave. Django
  // decides who is stranded and gives the plain reason for anyone a plan
  // could not place.
  async fetchStranded() {
    return request('/disruptions/stranded/');
  },

  // Undo the last approved distribution. The backend refuses (409) once a
  // notice has reached a patient or a later plan covers the same days.
  async undoDisruptionBatch(batchId) {
    return request(`/disruptions/batches/${batchId}/undo/`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  // Fix 1 — the plan behind the undo strip. The batch is durable; this is how
  // a refreshed tab (or a second receptionist) gets the safety net back.
  async fetchLastDisruptionBatch() {
    return request('/disruptions/batches/last/');
  },

  // Read-only double-booking feed for the red dashboard alert. The backend
  // decides what counts as a clash; this method only fetches the list.
  async fetchDoubleBookings() {
    return request('/conflicts/double-bookings/');
  },

  async fetchUpcomingReminders(windowDays = 14) {
    return request(`/appointments/upcoming-reminders/?window_days=${windowDays}`);
  },

  // ==========================================
  // 5. Clinic Settings, Services & Staff Directory
  // ==========================================
  async fetchSettings() {
    return request('/clinic/settings/');
  },

  async updateSettings(settingsData) {
    return request('/clinic/settings/', {
      method: 'PATCH',
      body: JSON.stringify(settingsData),
    });
  },

  async exportSettings() {
    const blob = await request('/clinic/settings/export/', { responseType: 'blob' });
    triggerBrowserDownload(blob, 'client-config-export.json');
    return blob;
  },

  async importSettings(configPayload) {
    return request('/clinic/settings/import/', {
      method: 'POST',
      body: JSON.stringify(configPayload),
    });
  },

  async fetchServices(params = {}) {
    const query = new URLSearchParams(params).toString();
    return request(`/clinic/services/${query ? `?${query}` : ''}`);
  },

  async createService(serviceData) {
    const payload = {
      name: serviceData.name,
      category: serviceData.category || 'General Practice',
      description: serviceData.description || '',
      duration_minutes: serviceData.duration_minutes || serviceData.durationMin || 30,
      buffer_minutes: serviceData.buffer_minutes || serviceData.bufferMin || 10,
      price: serviceData.price || 0,
      deposit_required: serviceData.deposit_required || false,
      is_active: serviceData.is_active !== undefined ? serviceData.is_active : (serviceData.isActive !== undefined ? serviceData.isActive : true),
    };
    return request('/clinic/services/', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async updateService(serviceId, serviceData) {
    return request(`/clinic/services/${serviceId}/`, {
      method: 'PATCH',
      body: JSON.stringify(serviceData),
    });
  },

  async deleteService(serviceId, permanent = false) {
    const query = permanent ? '?permanent=true' : '';
    return request(`/clinic/services/${serviceId}/${query}`, {
      method: 'DELETE',
    });
  },

  async fetchStaffDirectory() {
    return request('/clinic/staff-directory/');
  },

  async createStaff(staffData) {
    // Wave 3 / Step 3.6: only what the backend actually reads. The old
    // payload sent shift_start/shift_end the endpoint never consumed —
    // a silent lie about what a "shift" edit does.
    const payload = {
      full_name: staffData.name || staffData.full_name,
      email: staffData.email,
      role: staffData.role || 'receptionist',
      password: staffData.password,
      pin: staffData.pin,
      specialty: staffData.specialty,
      shift: staffData.shift,
    };
    return request('/staff/', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async updateStaff(staffId, staffData) {
    const payload = {
      name: staffData.name,
      email: staffData.email,
      role: staffData.role,
      specialty: staffData.specialty,
      shift: staffData.shift,
      status: staffData.status,
      is_active: staffData.isActive !== undefined ? staffData.isActive : staffData.is_active,
    };
    return request(`/staff/${staffId}/`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  async resetStaffPassword(staffId, newPassword) {
    return request(`/staff/${staffId}/reset-password/`, {
      method: 'POST',
      body: JSON.stringify({ new_password: newPassword, password: newPassword }),
    });
  },

  async resetStaffPin(staffId, newPin) {
    return request(`/staff/${staffId}/reset-pin/`, {
      method: 'POST',
      // 'new_pin' is the PinResetSerializer contract (Phase 2.5: the old
      // duplicate sent 'pin'; the view tolerates both, the serializer does not).
      body: JSON.stringify({ new_pin: newPin }),
    });
  },

  async toggleStaffActive(staffId, isActive) {
    return request(`/staff/${staffId}/toggle-active/`, {
      method: 'POST',
      body: JSON.stringify({ is_active: isActive }),
    });
  },

  async updateDoctorDutyStatus(doctorId, statusData) {
    const payload = typeof statusData === 'string'
      ? { status: statusData }
      : statusData;
    return request(`/clinic/doctors/${doctorId}/duty-status/`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  async fetchDoctorWorkload() {
    return request('/doctors/workload/');
  },

  async fetchCalendarSchedule(date = '', doctorId = '', endDate = '') {
    const params = new URLSearchParams();
    if (date) {
      params.append('date', date);
      params.append('start_date', date);
    }
    if (endDate) {
      params.append('end_date', endDate);
    }
    if (doctorId) params.append('doctor_id', doctorId);
    const query = params.toString();
    return request(`/calendar/schedule/${query ? `?${query}` : ''}`);
  },

  // ==========================================
  // 6. Real-Time SSE, Presence & Webhooks
  // ==========================================
  connectEventStream(onEvent, onError) {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('cbs_auth_token') : null;
    const queryParam = token ? `?token=${encodeURIComponent(token)}` : '';
    const sseUrl = `${API_BASE_URL}/realtime/stream/${queryParam}`;
    let eventSource = null;
    let isClosed = false;

    const handleIncomingEvent = (eventType, rawData) => {
      if (isClosed) return;
      try {
        const parsed = JSON.parse(rawData);
        if (onEvent) onEvent({ type: eventType || parsed.type || 'message', data: parsed, ...parsed });
      } catch {
        if (onEvent) onEvent({ type: eventType || 'heartbeat', raw: rawData });
      }
    };

    try {
      eventSource = new EventSource(sseUrl, { withCredentials: true });

      eventSource.onmessage = (event) => handleIncomingEvent('message', event.data);

      // Canonical SSE event names — the backend owns this contract (Phase 2.5,
      // system review finding #5): request.reviewing, appointment.status_changed
      // and request.re_requested are broadcast by Django and were previously
      // registered under different names, so those live events never fired.
      // 'calendar.slot_updated' was removed: no backend broadcaster exists.
      const namedEvents = [
        'connected',
        'request.created',
        'offer.dispatched',
        'slot.held',
        'request.reviewing',
        'appointment.status_changed',
        'request.re_requested',
        'interaction_logged',
      ];
      namedEvents.forEach((evtName) => {
        eventSource.addEventListener(evtName, (event) => {
          handleIncomingEvent(evtName, event.data);
        });
      });

      eventSource.onerror = (err) => {
        if (isClosed) return;
        if (onError) onError(err);
      };
    } catch (err) {
      if (onError) onError(err);
    }

    return () => {
      isClosed = true;
      if (eventSource) {
        eventSource.close();
      }
    };
  },

  async broadcastPresence(requestId, action = 'start_review') {
    return request('/realtime/presence/', {
      method: 'POST',
      body: JSON.stringify({
        request_id: requestId,
        action,
      }),
    });
  },

  async sendInboundWebhook(webhookPayload) {
    return request('/webhooks/messaging/inbound/', {
      method: 'POST',
      body: JSON.stringify(webhookPayload),
    });
  },

  // ==========================================
  // 7. Analytics & CSV Exports
  // ==========================================
  async fetchAnalyticsSummary(params = {}) {
    const query = new URLSearchParams(params).toString();
    return request(`/analytics/summary/${query ? `?${query}` : ''}`);
  },

  async downloadAppointmentsCSV() {
    const blob = await request('/admin/export/appointments/', { responseType: 'blob' });
    const todayStr = new Date().toISOString().split('T')[0];
    const filename = `cedarcare-appointments-${todayStr}.csv`;
    triggerBrowserDownload(blob, filename);
    return { ok: true, filename };
  },

  async downloadAttendanceCSV() {
    const blob = await request('/admin/export/attendance/', { responseType: 'blob' });
    const todayStr = new Date().toISOString().split('T')[0];
    const filename = `cedarcare-attendance-${todayStr}.csv`;
    triggerBrowserDownload(blob, filename);
    return { ok: true, filename };
  },
};
