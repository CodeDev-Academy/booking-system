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
import { useAppModeStore } from '../stores/appModeStore';
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
    actions,
  } = calendarData;

  return (
    <div className="view-container">
      {/* View Header with 2-Tab Switcher - Centered Layout */}
      <div
        className="view-header calendar-view-header"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          gap: '14px',
          marginBottom: '18px',
          width: '100%',
        }}
      >
        <div className="view-title-group" style={{ textAlign: 'center', margin: '0 auto' }}>
          <div
            className="view-heading"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              width: '100%',
            }}
          >
            <CalendarIcon size={22} color="var(--success-text)" />
            <span>Doctor Schedule &amp; Clinical Records</span>
          </div>
        </div>

        {/* View Switcher Tabs - Centered */}
        <div
          className="calendar-view-tabs"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--surface-2)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--radius-full)',
            padding: '3px',
            gap: '4px',
            margin: '0 auto',
            flexWrap: 'wrap',
          }}
        >
          {/* Tab 1: Doctor Schedule & Timetable (Bento Layout) */}
          <button
            type="button"
            className={`calendar-view-tab-btn ${activeTab === 'schedule' ? 'active' : ''}`}
            onClick={() => setActiveTab('schedule')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 16px',
              borderRadius: 'var(--radius-full)',
              border: 'none',
              background: activeTab === 'schedule' ? '#0c1a30' : 'transparent',
              color: activeTab === 'schedule' ? '#ffffff' : 'var(--text-3)',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <CalendarDays size={13} color={activeTab === 'schedule' ? '#38bdf8' : 'currentColor'} />
            <span>Doctor Schedule &amp; Timetable</span>
          </button>

          {/* Tab 2: Past Patient Records Archive */}
          <button
            type="button"
            className={`calendar-view-tab-btn ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 16px',
              borderRadius: 'var(--radius-full)',
              border: 'none',
              background: activeTab === 'history' ? '#0c1a30' : 'transparent',
              color: activeTab === 'history' ? '#ffffff' : 'var(--text-3)',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <History size={13} />
            <span>Past Patient Records Archive</span>
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
              const isDemo = useAppModeStore.getState().isDemoMode;
              const currentYear = isDemo ? 2026 : new Date().getFullYear();
              const currentMonth = isDemo ? 9 : new Date().getMonth();
              const baseDate = new Date(currentYear, currentMonth, dateOrDayNum);
              startTs = parseTimeSlotToTimestamp(baseDate, timeSlot);
            } else {
              startTs = parseTimeSlotToTimestamp(new Date(), timeSlot);
            }
            actions.openWalkInModal(doctorId, startTs);
          }}
          onSelectAppointment={(apt) => {
            setSelectedAppointment({
              id: apt.id,
              patientName: apt.patientName,
              phone: apt.phone,
              patientPhone: apt.phone,
              patientType: apt.type,
              serviceId: apt.service?.includes('Extraction') ? 'svc-extract' : 'svc-dental',
              doctorId: apt.doctorId || 'doc-bello',
              status: apt.status || 'confirmed',
              start: Date.now(),
              end: Date.now() + 30 * 60000,
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
