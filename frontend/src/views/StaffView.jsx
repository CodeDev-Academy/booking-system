import React from 'react';
import {
  Users,
  UserCheck,
  ShieldAlert,
  KeyRound,
  UserPlus,
  Stethoscope,
  Filter,
  Search,
} from 'lucide-react';
import { useAppModeStore } from '../stores/appModeStore';
import { useStaffDirectory } from '../hooks/useStaffDirectory';
import { StaffRosterTable } from '../components/admin/StaffRosterTable';
import { StaffEditModal } from '../components/admin/StaffEditModal';
import { ClinicAnalyticsBento } from '../components/admin/ClinicAnalyticsBento';
import { AddStaffModal } from '../components/admin/AddStaffModal';
import { ResetPinModal } from '../components/admin/ResetPinModal';
import '../styles/components/views.css';
import '../styles/components/admin.css';
import '../styles/components/calendar.css';

/**
 * StaffView — Route shell for Task 4.6: Staff Roster, Attendance & Clinic Analytics Bento.
 * Pure presentational wiring connecting useStaffDirectory() hook to admin components.
 */
export const StaffView = () => {
  const { isDemoMode } = useAppModeStore();
  const {
    staffList,
    rawStaffCount,
    selectedTab,
    searchQuery,
    metrics,
    addStaffModalOpen,
    editStaffModal,
    resetPinModal,
    toast,
    actions,
  } = useStaffDirectory();

  return (
    <div className="view-container">
      {/* Toast Notification Banner */}
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

      {/* View Header */}
      <div className="view-header">
        <div className="view-title-group">
          <div className="view-heading">
            <Users size={22} color="var(--info)" />
            <span>Staff &amp; Doctors</span>
          </div>
        </div>

        <div className="view-actions">
          <button
            type="button"
            onClick={actions.openAddStaffModal}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              background: '#0c1a30',
              color: '#ffffff',
              border: 'none',
              borderRadius: 'var(--radius-full)',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <UserPlus size={14} color="#38bdf8" />
            <span>+ Add Staff Member</span>
          </button>
        </div>
      </div>

      {/* KPI Overview Row */}
      <div className="kpi-row">
        <div className="kpi-card">
          <div className="kpi-label">
            <span>Total Staff Enrolled</span>
            <UserCheck size={12} color="var(--text-3)" />
          </div>
          <div className="kpi-value tabular-nums">{metrics.totalStaff}</div>
          <div className="kpi-subtext">{metrics.activeOnDuty} On Active Duty Today</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label">
            <span>Doctors Active</span>
            <span className="badge-pill badge-success mono-tag">ONLINE</span>
          </div>
          <div className="kpi-value tabular-nums">{metrics.doctorsActive}</div>
          <div className="kpi-subtext">{metrics.doctorsCount} Clinicians Registered</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label">
            <span>Security Governance</span>
            <KeyRound size={12} color="var(--amber)" />
          </div>
          <div className="kpi-value tabular-nums">100%</div>
          <div className="kpi-subtext">4-Digit Quick-PINs Configured</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label">
            <span>Instant Access Revocation</span>
            <ShieldAlert size={12} color="var(--danger-text)" />
          </div>
          <div className="kpi-value tabular-nums">Active</div>
          <div className="kpi-subtext">Immediate Token Revocation</div>
        </div>
      </div>

      <div className="staff-view-wrapper">
        {/* Table Filter Toolbar */}
        <div className="staff-table-toolbar">
          <div className="staff-search-box">
            <Search size={14} color="var(--text-3)" />
            <input
              type="text"
              className="staff-search-input"
              placeholder="Search staff by name, email, specialty, or shift..."
              value={searchQuery || ''}
              onChange={(e) => actions.setSearchQuery(e.target.value)}
              aria-label="Search staff members"
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

          <div className="staff-filter-group">
            <div className="clinician-dropdown-wrapper">
              <Filter size={13} color="var(--text-3)" />
              <select
                className="clinician-select"
                value={selectedTab}
                onChange={(e) => actions.setSelectedTab(e.target.value)}
                aria-label="Filter staff by role"
              >
                <option value="all">All Roles ({rawStaffCount})</option>
                <option value="doctor">Doctors Only ({metrics.doctorsCount})</option>
                <option value="receptionist">Receptionists Only ({metrics.receptionistsCount})</option>
              </select>
            </div>
          </div>
        </div>

        {/* Staff Roster Table */}
        <StaffRosterTable
          staffList={staffList}
          onOpenEditStaff={actions.openEditStaffModal}
        />

        {/* Clinic Analytics & CSV Export Bento */}
        <div className="analytics-section" style={{ marginTop: '12px' }}>
          <div className="section-title-row" style={{ marginBottom: '12px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text)' }}>
              Operational Analytics & Compliance Reporting
            </h2>
          </div>

          <ClinicAnalyticsBento
            metrics={metrics}
            onExportAppointments={actions.exportAppointmentsCSV}
            onExportAttendance={actions.exportAttendanceCSV}
          />
        </div>
      </div>

      {/* Staff Edit & Profile Modal */}
      <StaffEditModal
        isOpen={editStaffModal.isOpen}
        staff={editStaffModal.staff}
        onClose={actions.closeEditStaffModal}
        onUpdateStaff={actions.updateStaffMember}
        onToggleActive={actions.toggleStaffActive}
      />

      {/* Add Staff Modal */}
      <AddStaffModal
        isOpen={addStaffModalOpen}
        onClose={actions.closeAddStaffModal}
        onAddStaff={actions.addStaffMember}
      />

      {/* Reset PIN Modal */}
      <ResetPinModal
        isOpen={resetPinModal.isOpen}
        modalData={resetPinModal}
        onClose={actions.closeResetPinModal}
        onConfirm={actions.confirmResetPin}
      />
    </div>
  );
};
