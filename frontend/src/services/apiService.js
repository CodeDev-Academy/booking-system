/**
 * apiService — Headless Client for Django REST Framework API Endpoints
 * Solves Structural Hole 2: connects frontend stores to live Django backend.
 * LOGIC LAYER ONLY: pure async functions, zero JSX.
 * All endpoints adhere to /api/v1/ prefix and handle snake_case / camelCase translation.
 */

const DEFAULT_PROD_API_URL = 'https://booking-system-3-iojp.onrender.com/api/v1';
const isLocalhost =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  (isLocalhost ? 'http://localhost:8000/api/v1' : DEFAULT_PROD_API_URL);

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
      // 401 Session Ejection Broadcast (except for login or PIN unlock attempts)
      if (res.status === 401) {
        const isAuthAttempt =
          endpoint.includes('/auth/login') ||
          endpoint.includes('/auth/pin-unlock') ||
          endpoint.includes('/auth/verify-pin');
        if (!isAuthAttempt && typeof window !== 'undefined') {
          localStorage.removeItem('cbs_auth_token');
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

  async unlockPin(pin, email = '') {
    return request('/auth/pin-unlock/', {
      method: 'POST',
      body: JSON.stringify({ pin, email: email || undefined }),
    });
  },

  // Admin Staff Roster Management
  async fetchStaff() {
    return request('/staff/');
  },

  async createStaff(staffData) {
    const payload = {
      full_name: staffData.fullName || staffData.full_name || staffData.name,
      email: staffData.email,
      role: staffData.role || 'receptionist',
      shift: staffData.shift || '',
      specialty: staffData.specialty || '',
      password: staffData.password || 'password123',
      pin: staffData.pin || '1234',
    };
    return request('/staff/', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async updateStaff(staffId, staffData) {
    const payload = {
      name: staffData.name || staffData.fullName || staffData.full_name,
      email: staffData.email,
      specialty: staffData.specialty,
      shift: staffData.shift,
      is_active:
        staffData.isActive !== undefined
          ? staffData.isActive
          : staffData.is_active !== undefined
          ? staffData.is_active
          : staffData.status ? staffData.status !== 'deactivated' : undefined,
    };
    return request(`/staff/${staffId}/`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  async resetStaffPassword(staffId, newPassword) {
    return request(`/staff/${staffId}/reset-password/`, {
      method: 'POST',
      body: JSON.stringify({ new_password: newPassword }),
    });
  },

  async resetStaffPin(staffId, newPin) {
    return request(`/staff/${staffId}/reset-pin/`, {
      method: 'POST',
      body: JSON.stringify({ new_pin: newPin }),
    });
  },

  async toggleStaffActive(staffId, isActive = null) {
    const body = isActive !== null ? JSON.stringify({ is_active: isActive }) : JSON.stringify({});
    return request(`/staff/${staffId}/toggle-active/`, {
      method: 'POST',
      body,
    });
  },

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

  async checkSlots(requestId) {
    return request(`/booking-requests/${requestId}/check-slots/`, {
      method: 'POST',
    });
  },

  async dispatchOffers(requestId, slots = []) {
    const formattedSlots = Array.isArray(slots)
      ? slots.map((s) => {
          if (typeof s === 'object' && s !== null) {
            return {
              doctor_id: s.doctorId || s.doctor_id,
              start_datetime:
                s.startDatetime ||
                s.start_datetime ||
                (s.start ? new Date(s.start).toISOString() : (s.startTs ? new Date(s.startTs).toISOString() : undefined)),
              end_datetime:
                s.endDatetime ||
                s.end_datetime ||
                (s.end ? new Date(s.end).toISOString() : (s.endTs ? new Date(s.endTs).toISOString() : undefined)),
              is_alternative_date: s.isAlternativeDate || s.is_alternative_date || false,
            };
          }
          return s;
        })
      : [];

    return request(`/booking-requests/${requestId}/dispatch-offers/`, {
      method: 'POST',
      body: JSON.stringify({ slots: formattedSlots }),
    });
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
      body: JSON.stringify(payload),
    });
  },

  async registerWalkIn(walkInData) {
    const payload = {
      doctor_id: walkInData.doctorId || walkInData.doctor_id,
      service_id: walkInData.serviceId || walkInData.service_id,
      name: walkInData.patientName || walkInData.name,
      phone: walkInData.patientPhone || walkInData.phone,
      start_datetime:
        walkInData.startDatetime ||
        walkInData.start_datetime ||
        (walkInData.startTs ? new Date(walkInData.startTs).toISOString() : new Date().toISOString()),
      end_datetime:
        walkInData.endDatetime ||
        walkInData.end_datetime ||
        (walkInData.endTs ? new Date(walkInData.endTs).toISOString() : undefined),
      notes: walkInData.notes || '',
      date_of_birth: walkInData.dateOfBirth || walkInData.date_of_birth || null,
      gender: walkInData.gender || '',
      is_emergency: Boolean(walkInData.isEmergency || walkInData.is_emergency),
    };
    return request('/appointments/walk-in/', {
      method: 'POST',
      body: JSON.stringify(payload),
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
    const sseUrl = `${API_BASE_URL}/realtime/stream/`;
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
      eventSource = new EventSource(sseUrl);

      eventSource.onmessage = (event) => handleIncomingEvent('message', event.data);

      const namedEvents = [
        'connected',
        'request.created',
        'offer.dispatched',
        'slot.held',
        'presence.reviewing',
        'appointment.updated',
        'calendar.slot_updated',
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
