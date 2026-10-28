import React, { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
} from 'lucide-react';
import { CalendarDayView } from './CalendarDayView';
import { QuickWalkInModal } from './QuickWalkInModal';
import { EmergencyDisruptionModal } from './EmergencyDisruptionModal';
import { AppointmentDetailsModal } from './AppointmentDetailsModal';

export const MasterCalendarGrid = ({ calendarData }) => {
  const {
    currentDateOffset,
    dayLabel,
    viewMode,
    selectedServiceId,
    services,
    doctors,
    timeGutter,
    doctorColumns,
    kpis,
    liveSyncConnected,
    walkInModal,
    disruptionModal,
    availableColleagues,
    toast,
    formatHoldCountdown,
    actions,
  } = calendarData;

  const [selectedAppointment, setSelectedAppointment] = useState(null);

  return (
    <div className="master-calendar-wrapper">
      {/* Toast Notification Banner */}
      {toast && (
        <div className={`calendar-toast-banner toast-${toast.tone}`}>
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

      {/* Calm Status Summary Bar */}
      <div className="calendar-status-bar">
        <div className="status-summary-items">
          <span className="summary-item">
            <span className="summary-dot dot-success" />
            <strong className="tabular-nums">{kpis.confirmedCount}</strong> confirmed visits
          </span>
          <span className="summary-divider">·</span>
          <span className="summary-item">
            <span className="summary-dot dot-amber" />
            <strong className="tabular-nums">{kpis.holdCount}</strong> held online
          </span>
          <span className="summary-divider">·</span>
          <span className="summary-item">
            <span className="summary-dot dot-purple" />
            <strong className="tabular-nums">{kpis.reserveCount}</strong> emergency reserve
          </span>
          <span className="summary-divider">·</span>
          <span className="summary-item">
            <strong className="tabular-nums">{kpis.totalFreeSlots}</strong> open slots available
          </span>
        </div>
      </div>

      {/* Main Interactive Control Bar */}
      <div className="calendar-control-toolbar">
        {/* Left: Date Navigation & Today */}
        <div className="toolbar-left-group">
          <div className="date-nav-pill">
            <button
              type="button"
              className="date-nav-btn"
              onClick={actions.prevDay}
              title="Previous Day"
              aria-label="Previous Day"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="date-nav-label tabular-nums">{dayLabel}</span>
            <button
              type="button"
              className="date-nav-btn"
              onClick={actions.nextDay}
              title="Next Day"
              aria-label="Next Day"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <button
            type="button"
            className="btn-base btn-secondary"
            onClick={actions.goToToday}
            style={{ padding: '6px 12px', fontSize: '13px' }}
          >
            Today
          </button>
        </div>

        {/* Right: Quick Walk-In Button */}
        <div className="toolbar-right-group">
          <button
            type="button"
            className="btn-base btn-primary"
            onClick={() => actions.openWalkInModal(null, null)}
            style={{ padding: '7px 16px', fontSize: '13px' }}
          >
            <Plus size={15} />
            <span>+ Book Walk-In</span>
          </button>
        </div>
      </div>

      {/* Grid Content: Daily Timetable */}
      <CalendarDayView
        doctorColumns={doctorColumns}
        timeGutter={timeGutter}
        formatHoldCountdown={formatHoldCountdown}
        onOpenWalkIn={actions.openWalkInModal}
        onTriggerDisruption={actions.openDisruptionModal}
        onSelectAppointment={setSelectedAppointment}
        onReleaseHold={actions.releaseHold}
      />

      {/* Appointment Details Modal */}
      <AppointmentDetailsModal
        isOpen={!!selectedAppointment}
        appointment={selectedAppointment}
        doctors={doctors}
        onClose={() => setSelectedAppointment(null)}
        onCheckIn={(apt) => {
          if (actions.admitAppointment) actions.admitAppointment(apt);
          setSelectedAppointment(null);
        }}
        onReschedule={(aptId, newStart, targetDocId) => {
          return actions.rescheduleAppointment(aptId, newStart, targetDocId);
        }}
      />

      {/* Walk-In Booking Modal */}
      <QuickWalkInModal
        isOpen={walkInModal.isOpen}
        modalData={walkInModal}
        doctors={doctors}
        services={services}
        busyBlocks={calendarData.blocks || []}
        onClose={actions.closeWalkInModal}
        onConfirm={actions.confirmWalkIn}
        onChangeField={actions.updateWalkInField}
      />

      {/* Emergency Leave Disruption Modal (Risk R-15) */}
      {disruptionModal.isOpen && (
        <EmergencyDisruptionModal
          isOpen={disruptionModal.isOpen}
          disruptionData={disruptionModal}
          doctors={doctors}
          availableColleagues={availableColleagues}
          onClose={actions.closeDisruptionModal}
          onReassign={actions.reassignToColleague}
          onNotifyReschedule={actions.notifyAndReschedule}
          onRestoreDuty={actions.restoreDoctorDuty}
        />
      )}
    </div>
  );
};


