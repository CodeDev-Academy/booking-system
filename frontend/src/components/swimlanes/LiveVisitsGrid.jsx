import React, { useState } from 'react';
import {
  Clock,
  Activity,
  CheckCircle2,
  UserX,
  Plus,
  Filter,
  Users,
  Search,
  UserCheck,
  CalendarCheck,
  Stethoscope,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { VisitCard } from './VisitCard';
import { FollowUpRecallModal } from './FollowUpRecallModal';
import { WelfareRecoveryModal } from './WelfareRecoveryModal';
import { AppointmentDetailsModal } from '../calendar/AppointmentDetailsModal';
import { WalkInCheckInModal } from './WalkInCheckInModal';

export const LiveVisitsGrid = ({ visitsData }) => {
  const {
    doctors,
    selectedDoctorFilter,
    doctorCounts,
    searchQuery,
    selectedPatientVisit,
    expectedToday,
    waitingList,
    inConsultationList,
    completedList,
    noShowList,
    kpis,
    followUpModal,
    activeFollowUpVisit,
    welfareModal,
    activeWelfareVisit,
    toast,
    actions,
  } = visitsData;

  const [showNoShowSection, setShowNoShowSection] = useState(false);
  const [walkInModalOpen, setWalkInModalOpen] = useState(false);

  const handleMarkNoShow = (id) => {
    actions.markAsNoShow(id);
    setShowNoShowSection(true);
  };

  return (
    <div className="live-visits-wrapper">
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

      {/* KPI Overview Row */}
      <div className="kpi-row">
        <div className="kpi-card">
          <div className="kpi-label">
            <span>In Waiting Room</span>
            <Clock size={12} color="var(--amber)" />
          </div>
          <div className="kpi-value tabular-nums">{kpis.waitingCount}</div>
          <div className="kpi-subtext">Avg wait time: {kpis.avgWaitMinutes} mins</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label">
            <span>In Consultation</span>
            <span className="badge-pill badge-info mono-tag">ACTIVE ROOMS</span>
          </div>
          <div className="kpi-value tabular-nums">{kpis.inConsultationCount}</div>
          <div className="kpi-subtext">Dr. Bello &bull; Dr. Okafor</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label">
            <span>Completed Today</span>
            <CheckCircle2 size={12} color="var(--success-text)" />
          </div>
          <div className="kpi-value tabular-nums">{kpis.completedCount}</div>
          <div className="kpi-subtext" style={{ color: 'var(--success-text)' }}>
            100% on schedule
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label">
            <span>No-Show / Cancelled</span>
            <UserX size={12} color="var(--danger-text)" />
          </div>
          <div className="kpi-value tabular-nums">{kpis.noShowCount}</div>
          <div className="kpi-subtext">
            {kpis.noShowCount === 0 ? 'Zero no-shows today' : `${kpis.noShowCount} welfare recovery pending`}
          </div>
        </div>
      </div>

      {/* Today's Expected Pre-Booked Appointments (Attendance Roster) */}
      {expectedToday && expectedToday.length > 0 && (
        <div className="expected-roster-container">
          <div className="expected-roster-header">
            <div className="expected-header-left">
              <CalendarCheck size={16} color="var(--amber)" />
              <span className="expected-header-title">
                Today's Pre-Booked Appointments — Awaiting Front Desk Arrival ({expectedToday.length})
              </span>
            </div>
            <span className="expected-header-desc">
              When patient physically arrives, click <strong>[✓ Mark Present]</strong> to admit them to the Waiting Room.
            </span>
          </div>

          <div className="expected-cards-grid">
            {expectedToday.map((exp) => (
              <div
                key={exp.id}
                className="expected-card"
                onClick={() => actions.openPatientDetails({
                  ...exp,
                  start: exp.scheduledTime,
                  end: exp.scheduledTime + 30 * 60000,
                  status: 'confirmed',
                })}
                title={`Click to preview clinical history for ${exp.patientName}`}
              >
                <div className="expected-card-body">
                  <div className="expected-card-top">
                    <span className="expected-time tabular-nums">{exp.scheduledTimeStr}</span>
                    <span className={`event-type-pill ${exp.patientType === 'returning' ? 'returning' : 'new'}`}>
                      {exp.patientType === 'returning' ? 'RETURNING' : 'NEW'}
                    </span>
                  </div>
                  <strong className="expected-patient-name">{exp.patientName}</strong>
                  <span className="expected-meta-details">
                    {exp.service?.name} &bull; {exp.doctor?.name}
                  </span>
                  <span className="expected-phone tabular-nums">{exp.patientPhone}</span>
                </div>

                <button
                  type="button"
                  className="expected-admit-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    actions.markPatientPresent(exp.id);
                  }}
                  title="Patient has arrived in lobby - admit to Waiting Room"
                >
                  <CheckCircle2 size={13} color="#38bdf8" />
                  <span>Mark Present</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Swimlanes Control Toolbar */}
      <div className="swimlane-control-toolbar">
        {/* Left: Clinician Dropdown Selector + Search */}
        <div className="toolbar-left-group" style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <div className="clinician-dropdown-wrapper">
            <Filter size={13} color="var(--text-3)" />
            <select
              className="clinician-select"
              value={selectedDoctorFilter}
              onChange={(e) => actions.setDoctorFilter(e.target.value)}
              aria-label="Filter by doctor"
            >
              <option value="all">All Clinicians ({doctorCounts?.all || 0} visits)</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} — {d.specialty} ({doctorCounts?.[d.id] || 0} visits)
                </option>
              ))}
            </select>
          </div>

          {/* Patient Search Box */}
          <div className="swimlane-search-box">
            <Search size={13} color="var(--text-3)" />
            <input
              type="text"
              className="swimlane-search-input"
              placeholder="Search patient or phone..."
              value={searchQuery || ''}
              onChange={(e) => actions.setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => actions.setSearchQuery('')}
                title="Clear Search"
              >
                &times;
              </button>
            )}
          </div>
        </div>

        {/* Right: + Walk-In Patient (Check-In) */}
        <div className="toolbar-right-group">
          <button
            type="button"
            onClick={() => setWalkInModalOpen(true)}
            title="Admit an unscheduled walk-in patient at reception"
            style={{
              padding: '8px 16px',
              fontSize: '12px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: '#0c1a30',
              color: '#ffffff',
              border: 'none',
              borderRadius: 'var(--radius-full)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <Plus size={14} color="#38bdf8" />
            <span>+ Walk-In Patient (Check-In)</span>
          </button>
        </div>
      </div>

      {/* 3 Kanban Swimlanes Grid */}
      <div className="swimlanes-grid-container">
        {/* Swimlane 1: Waiting Room */}
        <div className="swimlane-column swimlane-waiting">
          <div className="swimlane-header">
            <div className="swimlane-title-group">
              <span className="swimlane-dot dot-waiting" />
              <h3 className="swimlane-title">Waiting Room</h3>
              <span className="swimlane-count tabular-nums">{waitingList.length}</span>
            </div>
            <span className="swimlane-subtext">Lobby Check-In Queue</span>
          </div>

          <div className="swimlane-body">
            {waitingList.length === 0 ? (
              <div className="swimlane-empty-state">
                <Users size={22} color="var(--text-3)" />
                <span className="empty-title">Lobby is clear</span>
                <span className="empty-desc">All checked-in patients have been called into consultation.</span>
              </div>
            ) : (
              waitingList.map((visit) => (
                <VisitCard
                  key={visit.id}
                  visit={visit}
                  onSelectPatient={actions.openPatientDetails}
                  onSendToConsultation={actions.sendToConsultation}
                  onOpenFollowUp={actions.openFollowUpModal}
                  onMarkNoShow={handleMarkNoShow}
                  onOpenWelfare={actions.openWelfareModal}
                  onReinstateVisit={actions.reinstateVisit}
                />
              ))
            )}
          </div>
        </div>

        {/* Swimlane 2: In Consultation */}
        <div className="swimlane-column swimlane-consultation">
          <div className="swimlane-header">
            <div className="swimlane-title-group">
              <span className="swimlane-dot dot-consultation" />
              <h3 className="swimlane-title">In Consultation</h3>
              <span className="swimlane-count tabular-nums">{inConsultationList.length}</span>
            </div>
            <span className="swimlane-subtext">Active Doctor Rooms</span>
          </div>

          <div className="swimlane-body">
            {inConsultationList.length === 0 ? (
              <div className="swimlane-empty-state">
                <Activity size={22} color="var(--text-3)" />
                <span className="empty-title">No Active Consultations</span>
                <span className="empty-desc">Consultation suites are currently sanitizing or awaiting patients.</span>
              </div>
            ) : (
              inConsultationList.map((visit) => (
                <VisitCard
                  key={visit.id}
                  visit={visit}
                  onSelectPatient={actions.openPatientDetails}
                  onSendToConsultation={actions.sendToConsultation}
                  onOpenFollowUp={actions.openFollowUpModal}
                  onMarkNoShow={handleMarkNoShow}
                  onOpenWelfare={actions.openWelfareModal}
                  onReinstateVisit={actions.reinstateVisit}
                />
              ))
            )}
          </div>
        </div>

        {/* Swimlane 3: Completed Today */}
        <div className="swimlane-column swimlane-completed">
          <div className="swimlane-header">
            <div className="swimlane-title-group">
              <span className="swimlane-dot dot-completed" />
              <h3 className="swimlane-title">Completed Today</h3>
              <span className="swimlane-count tabular-nums">{completedList.length}</span>
            </div>
            <span className="swimlane-subtext">Checkout & Follow-Ups</span>
          </div>

          <div className="swimlane-body">
            {completedList.length === 0 ? (
              <div className="swimlane-empty-state">
                <CheckCircle2 size={22} color="var(--text-3)" />
                <span className="empty-title">No completed visits yet</span>
                <span className="empty-desc">Completed patient discharges will appear here.</span>
              </div>
            ) : (
              completedList.map((visit) => (
                <VisitCard
                  key={visit.id}
                  visit={visit}
                  onSelectPatient={actions.openPatientDetails}
                  onSendToConsultation={actions.sendToConsultation}
                  onOpenFollowUp={actions.openFollowUpModal}
                  onMarkNoShow={handleMarkNoShow}
                  onOpenWelfare={actions.openWelfareModal}
                  onReinstateVisit={actions.reinstateVisit}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Collapsible No-Show Section */}
      {noShowList.length > 0 && (
        <div className="noshow-drawer-container">
          <button
            type="button"
            className="noshow-drawer-toggle"
            onClick={() => setShowNoShowSection(!showNoShowSection)}
          >
            <div className="drawer-title-group">
              <UserX size={15} color="var(--danger-text)" />
              <span>Missed Appointments & No-Shows Today ({noShowList.length})</span>
            </div>
            {showNoShowSection ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {showNoShowSection && (
            <div className="noshow-cards-grid">
              {noShowList.map((visit) => (
                <VisitCard
                  key={visit.id}
                  visit={visit}
                  onSelectPatient={actions.openPatientDetails}
                  onSendToConsultation={actions.sendToConsultation}
                  onOpenFollowUp={actions.openFollowUpModal}
                  onMarkNoShow={handleMarkNoShow}
                  onOpenWelfare={actions.openWelfareModal}
                  onReinstateVisit={actions.reinstateVisit}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Patient Dossier & Clinical Records Modal */}
      <AppointmentDetailsModal
        isOpen={!!selectedPatientVisit}
        appointment={selectedPatientVisit}
        onClose={actions.closePatientDetails}
      />

      {/* Follow-Up Recall Modal */}
      <FollowUpRecallModal
        isOpen={followUpModal.isOpen}
        visit={activeFollowUpVisit}
        onClose={actions.closeFollowUpModal}
        onComplete={actions.completeVisit}
      />

      {/* Welfare Recovery Modal */}
      <WelfareRecoveryModal
        isOpen={welfareModal.isOpen}
        visit={activeWelfareVisit}
        onClose={actions.closeWelfareModal}
        onSend={actions.sendWelfareMessage}
      />

      {/* Walk-In Patient Front-Desk Check-In Modal */}
      <WalkInCheckInModal
        isOpen={walkInModalOpen}
        onClose={() => setWalkInModalOpen(false)}
        onCheckIn={actions.checkInVisit}
      />
    </div>
  );
};
