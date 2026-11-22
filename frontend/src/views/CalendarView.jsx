import React, { useState } from 'react';
import {
  Calendar as CalendarIcon,
  History,
  CalendarDays,
  Sparkles,
} from 'lucide-react';
import { useCalendar } from '../hooks/useCalendar';
import { DoctorGridBookingCalendar } from '../components/calendar/DoctorGridBookingCalendar';
import { PastPatientsHistory } from '../components/calendar/PastPatientsHistory';
import { AppointmentDetailsModal } from '../components/calendar/AppointmentDetailsModal';
import { QuickWalkInModal } from '../components/calendar/QuickWalkInModal';
import { parseTimeSlotToTimestamp } from '../services/timeUtils';
import { clinicDayStartOfParts, clinicParts, clinicNow } from '../services/clinicTimeService';
import '../styles/components/views.css';
import '../styles/components/calendar.css';
import '../styles/components/grid-booking-calendar.css';

/**
 * CalendarView — Doctor Schedule & Clinical Records Route View
 * Unified Hub per user instruction:
 * 1. Doctor Schedule & Timetable (Bento Grid layout replacing scattered timetable)
 * 2. Past Patient Records Archive (Refactored to mirror doctor card box pattern)
 */
export const CalendarView = () => {
  const calendarData = useCalendar();
  const [activeTab, setActiveTab] = useState('schedule'); // 'schedule' | 'history'
  const [selectedAppointment, setSelectedAppointment] = useState(null);

  const {
    walkInModal,
    doctors,
    services,
    blocks,
    toast,
    actions,
  } = calendarData;

  return (
    <div className="view-container">
      {/* Toast Notification Banner — the one-click disruption cockpit reports
          its outcome here (placed counts + truthful delivery claim). */}
      {toast && (
        <div className={`calendar-toast-banner toast-${toast.tone}`} style={{ marginBottom: '12px' }}>
          <div className="toast-content">
            <span className="duty-dot" />
            <span>{toast.text}</span>
          </div>
          <button
            type="button"
            className="toast-close-btn"
            onClick={actions.dismissToast}
          >
            &times;
          </button>
        </div>
      )}
      {/* Compact Header with Unified Segmented Switcher */}
      <div className="view-header">
        <div className="view-title-group">
          <div className="view-heading">
            <CalendarIcon size={18} color="var(--amber)" />
            <span>Doctor Schedule &amp; Records</span>
          </div>
        </div>

        <div className="segmented-tabs" role="tablist" aria-label="Schedule and records switcher">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'schedule'}
            className={`segmented-tab-btn ${activeTab === 'schedule' ? 'active' : ''}`}
            onClick={() => setActiveTab('schedule')}
          >
            <CalendarDays size={13} />
            <span>Schedule Grid</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'history'}
            className={`segmented-tab-btn ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            <History size={13} />
            <span>Past Patient Records</span>
          </button>
        </div>
      </div>

      {/* Main View Display */}
      {activeTab === 'schedule' ? (
        <DoctorGridBookingCalendar
          calendarData={calendarData}
          onOpenWalkInBooking={(doctorId, dateOrDayNum, timeSlot) => {
            let startTs = null;
            if (dateOrDayNum instanceof Date) {
              startTs = parseTimeSlotToTimestamp(dateOrDayNum, timeSlot);
            } else if (typeof dateOrDayNum === 'number') {
              // Wave 3 / Step 3.1: the anchor is the CLINIC's current date,
              // not the visitor's calendar.
              const today = clinicParts(clinicNow());
              const baseDate = new Date(clinicDayStartOfParts(today.year, today.monthIdx, dateOrDayNum));
              startTs = parseTimeSlotToTimestamp(baseDate, timeSlot);
            } else {
              const today = clinicParts(clinicNow());
              const baseDate = new Date(clinicDayStartOfParts(today.year, today.monthIdx, today.day));
              startTs = parseTimeSlotToTimestamp(baseDate, timeSlot);
            }
            actions.openWalkInModal(doctorId, startTs);
          }}
          onSelectAppointment={(apt) => {
            // Wave 3 / Step 3.4: the modal receives the appointment's OWN
            // data. It used to invent start (Date.now()), end (+30m), guess
            // the service from the label text, read a phone key the grid
            // never filled, and default the doctor to 'doc-bello'.
            setSelectedAppointment({
              id: apt.id,
              appointmentId: apt.appointmentId || apt.id,
              patientName: apt.patientName,
              phone: apt.phone,
              patientPhone: apt.patientPhone || apt.phone,
              patientType: apt.type,
              serviceId: apt.serviceId,
              serviceName: apt.serviceName || apt.service || null,
              doctorId: apt.doctorId,
              doctorName: apt.doctorName || null,
              status: apt.status || 'confirmed',
              start: apt.start ?? null,
              end: apt.end ?? null,
              bufferMin: apt.bufferMin || 10,
            });
          }}
          onReleaseHold={(id) => {
            if (actions.releaseHold) actions.releaseHold(id);
          }}
          onAdmitAppointment={(apt) => {
            if (actions.admitAppointment) actions.admitAppointment(apt);
          }}
        />
      ) : (
        <PastPatientsHistory
          onSelectPatient={(rec) => {
            setSelectedAppointment({
              ...rec,
              id: rec.appointmentId || rec.id,
              patientPhone: rec.patientPhone,
              phone: rec.patientPhone,
              start: rec.timestamp,
              end: rec.timestamp + 30 * 60000,
              status: 'completed',
              serviceId: 'svc-dental',
              doctorId: rec.doctorId || 'doc-bello',
            });
          }}
        />
      )}

      {/* Appointment Details & Clinical Dossier Modal */}
      {selectedAppointment && (
        <AppointmentDetailsModal
          isOpen={Boolean(selectedAppointment)}
          appointment={selectedAppointment}
          doctors={doctors}
          onClose={() => setSelectedAppointment(null)}
          onCheckIn={(apt) => {
            if (actions.admitAppointment) actions.admitAppointment(apt);
            setSelectedAppointment(null);
          }}
          onReschedule={(aptId, newStart, targetDocId) => {
            if (actions.rescheduleAppointment) {
              return actions.rescheduleAppointment(aptId, newStart, targetDocId);
            }
          }}
        />
      )}

      {/* Quick Walk-In Booking Modal */}
      {walkInModal.isOpen && (
        <QuickWalkInModal
          isOpen={walkInModal.isOpen}
          modalData={walkInModal}
          doctors={doctors}
          services={services}
          busyBlocks={blocks || []}
          onClose={actions.closeWalkInModal}
          onConfirm={actions.confirmWalkIn}
          onChangeField={actions.updateWalkInField}
        />
      )}
    </div>
  );
};
