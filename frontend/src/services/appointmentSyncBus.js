/**
 * appointmentSyncBus — Headless Cross-Store Event Bus for Appointment Synchronization.
 * Solves Structural Hole 1: eliminates state silos between Queue, Calendar, and Live Visits.
 * Zero circular dependency by decoupling stores through dynamic pub/sub.
 * LOGIC LAYER ONLY.
 */

const listeners = {
  appointmentBooked: new Set(),
  walkInAdmitted: new Set(),
  appointmentRescheduled: new Set(),
  visitStatusChanged: new Set(),
  doctorEnrolled: new Set(),
  doctorUpdated: new Set(),
};

// Unique identifier for this browser tab instance to prevent echo loops
const tabId = typeof crypto !== 'undefined' && crypto.randomUUID
  ? crypto.randomUUID()
  : Math.random().toString(36).slice(2);

// Native Cross-Tab Synchronization via BroadcastChannel
let crossTabChannel = null;
if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
  try {
    crossTabChannel = new BroadcastChannel('cbs_cross_tab_sync');
    crossTabChannel.onmessage = (messageEvent) => {
      const { event, payload, sourceTabId } = messageEvent.data || {};
      if (event && listeners[event] && sourceTabId !== tabId) {
        listeners[event].forEach((cb) => {
          try {
            cb(payload);
          } catch (err) {
            console.error(`[appointmentSyncBus:crossTab] Error in ${event} listener:`, err);
          }
        });
      }
    };
  } catch (err) {
    console.warn('[appointmentSyncBus] BroadcastChannel unavailable:', err);
  }
}

export const appointmentSyncBus = {
  subscribe(event, callback) {
    if (!listeners[event]) listeners[event] = new Set();
    listeners[event].add(callback);
    return () => listeners[event].delete(callback);
  },

  emit(event, payload, broadcastCrossTab = true) {
    if (!listeners[event]) return;
    listeners[event].forEach((cb) => {
      try {
        cb(payload);
      } catch (err) {
        console.error(`[appointmentSyncBus] Error in ${event} listener:`, err);
      }
    });

    if (broadcastCrossTab && crossTabChannel) {
      try {
        crossTabChannel.postMessage({ event, payload, sourceTabId: tabId });
      } catch (err) {
        console.error(`[appointmentSyncBus] Failed to postMessage to crossTabChannel:`, err);
      }
    }
  },

  /**
   * Broadcast when a booking is confirmed in Queue, review modal, or pitch simulator
   */
  publishAppointmentBooked(appt) {
    this.emit('appointmentBooked', appt);
  },

  /**
   * Broadcast when a walk-in patient is admitted at reception in Live Visits
   */
  publishWalkInAdmitted(visit) {
    this.emit('walkInAdmitted', visit);
  },

  /**
   * Broadcast when an appointment block is rescheduled or moved on Calendar
   */
  publishAppointmentRescheduled(payload) {
    this.emit('appointmentRescheduled', payload);
  },

  /**
   * Broadcast when a visit transitions status (waiting -> in_consultation -> completed)
   */
  publishVisitStatusChanged(payload) {
    this.emit('visitStatusChanged', payload);
  },

  /**
   * Broadcast when a new doctor is enrolled in Staff Directory
   */
  publishDoctorEnrolled(doctor) {
    this.emit('doctorEnrolled', doctor);
  },

  /**
   * Broadcast when doctor details or duty status are updated
   */
  publishDoctorUpdated(doctor) {
    this.emit('doctorUpdated', doctor);
  },
};

