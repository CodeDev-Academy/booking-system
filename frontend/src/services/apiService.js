/**
 * API Service Layer — Conforms strictly to API_REFERENCE.md
 * Prefixed with /api/v1/ endpoints.
 * Provides abstracted async operations for booking requests, slot generation,
 * appointment progression, and staff governance.
 */

import {
  INITIAL_BOOKING_REQUESTS,
  INITIAL_LIVE_APPOINTMENTS,
  INITIAL_STAFF,
  INITIAL_DOCTORS,
  INITIAL_CLINIC_SETTINGS
} from '../utils/mockData';

export const apiService = {
  // --- Section 1: Booking Requests ---
  bookingRequests: {
    /**
     * POST /api/v1/booking-requests/
     */
    async create(payload) {
      // Simulate network latency
      await new Promise(res => setTimeout(res, 250));
      const requestId = `REQ-2026-${Math.floor(1000 + Math.random() * 9000)}`;
      return {
        request_id: requestId,
        status: 'awaiting_review',
        created_at: new Date().toISOString(),
        ...payload
      };
    },

    /**
     * GET /api/v1/booking-requests/
     */
    async list() {
      await new Promise(res => setTimeout(res, 150));
      return INITIAL_BOOKING_REQUESTS;
    },

    /**
     * POST /api/v1/booking-requests/{request_id}/check-slots/
     * Calculates valid candidate slots according to clinic scheduling rules
     */
    async checkSlots(requestId, serviceName = "Dental Consultation") {
      await new Promise(res => setTimeout(res, 350));
      return {
        request_id: requestId,
        service: serviceName,
        duration_minutes: 30,
        suggested_slots: [
          {
            id: `slot-cand-${Date.now()}-1`,
            doctor_id: "doc-uuid-1",
            doctor_name: "Dr. Ibrahim Bello",
            start_datetime: "2026-10-12T10:00:00Z",
            end_datetime: "2026-10-12T10:30:00Z",
            display_label: "Mon Oct 12, 10:00 AM - 10:30 AM"
          },
          {
            id: `slot-cand-${Date.now()}-2`,
            doctor_id: "doc-uuid-1",
            doctor_name: "Dr. Ibrahim Bello",
            start_datetime: "2026-10-12T11:30:00Z",
            end_datetime: "2026-10-12T12:00:00Z",
            display_label: "Mon Oct 12, 11:30 AM - 12:00 PM"
          },
          {
            id: `slot-cand-${Date.now()}-3`,
            doctor_id: "doc-uuid-2",
            doctor_name: "Dr. Chidinma Okafor",
            start_datetime: "2026-10-13T09:00:00Z",
            end_datetime: "2026-10-13T09:30:00Z",
            display_label: "Tue Oct 13, 09:00 AM - 09:30 AM"
          }
        ]
      };
    },

    /**
     * POST /api/v1/booking-requests/{request_id}/dispatch-offers/
     * Initiates 60-minute offer window & triggers n8n webhook
     */
    async dispatchOffers(requestId, slots) {
      await new Promise(res => setTimeout(res, 200));
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 60 * 60 * 1000);
      return {
        request_id: requestId,
        status: 'slots_offered',
        offered_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        slots
      };
    }
  },

  // --- Section 2: Slot Selection & Atomic Holds ---
  slots: {
    /**
     * POST /api/v1/slots/hold/
     */
    async hold(requestId, slotOfferId, patientData = {}) {
      await new Promise(res => setTimeout(res, 250));
      const appointmentId = `AP-${Math.floor(1000 + Math.random() * 9000)}`;
      const holdExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      return {
        appointment_id: appointmentId,
        status: 'held',
        hold_expires_at: holdExpiresAt,
        requires_deposit: false,
        patient_name: patientData.patient_name || 'Patient',
        patient_phone: patientData.patient_phone || '+234 800 000 0000'
      };
    }
  },

  // --- Section 3: Appointment Lifecycle ---
  appointments: {
    /**
     * PATCH /api/v1/appointments/{appointment_id}/status/
     */
    async updateStatus(appointmentId, status) {
      await new Promise(res => setTimeout(res, 180));
      return {
        appointment_id: appointmentId,
        status,
        updated_at: new Date().toISOString()
      };
    }
  },

  // --- Section 4: Staff Authentication & Admin Governance ---
  admin: {
    /**
     * POST /api/v1/admin/staff/{staff_id}/deactivate/
     */
    async deactivateStaff(staffId) {
      await new Promise(res => setTimeout(res, 200));
      return { staff_id: staffId, is_active: false, revoked: true };
    },

    /**
     * POST /api/v1/admin/staff/{staff_id}/reset-pin/
     */
    async resetPin(staffId) {
      await new Promise(res => setTimeout(res, 200));
      return { staff_id: staffId, default_pin: '1234' };
    }
  }
};
