import React, { useState } from 'react';
import {
  Users,
  UserPlus,
  Filter,
  Search,
  BarChart3,
} from 'lucide-react';
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
 * StaffView — Staff Roster & Operational Reports View.
 * Pure presentational wiring connecting useStaffDirectory() hook to admin components.
 */
export const StaffView = () => {
  const [activeSection, setActiveSection] = useState('roster'); // 'roster' | 'analytics'

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
        <div className={`calendar-toast-banner toast-${toast.tone}`} style={{ marginBottom: '8px' }}>
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

      {/* Compact View Header with 2-Tab Switcher & Add Button */}
      <div className="view-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <div className="view-heading">
            <Users size={18} color="var(--amber)" />
            <span>Staff &amp; Reports</span>
          </div>

          <div className="segmented-tabs" role="tablist" aria-label="Staff and reports switcher">
            <button
              type="button"
              role="tab"
              aria-selected={activeSection === 'roster'}
              className={`segmented-tab-btn ${activeSection === 'roster' ? 'active' : ''}`}
              onClick={() => setActiveSection('roster')}
            >
              <Users size={13} />
              <span>Team Roster</span>
              <span className="segmented-tab-count">{rawStaffCount}</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeSection === 'analytics'}
              className={`segmented-tab-btn ${activeSection === 'analytics' ? 'active' : ''}`}
              onClick={() => setActiveSection('analytics')}
            >
              <BarChart3 size={13} />
              <span>Reports &amp; CSV</span>
            </button>
          </div>
        </div>

        <div className="view-actions">
          <span style={{ fontSize: '12px', color: 'var(--text-3)' }}>
            <strong style={{ color: 'var(--text)' }}>{metrics.doctorsActive}</strong> of {metrics.doctorsCount} doctors on duty
          </span>
          <button
            type="button"
            onClick={actions.openAddStaffModal}
            className="btn-obsidian"
          >
            <UserPlus size={13} />
            <span>Add Staff Member</span>
          </button>
        </div>
      </div>

      {activeSection === 'roster' ? (
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
        </div>
      ) : (
        <div className="analytics-section">
          <ClinicAnalyticsBento
            metrics={metrics}
            onExportAppointments={actions.exportAppointmentsCSV}
            onExportAttendance={actions.exportAttendanceCSV}
          />
        </div>
      )}

      {/* Staff Edit & Profile Modal */}
      <StaffEditModal
        isOpen={editStaffModal.isOpen}
        staff={editStaffModal.staff}
        onClose={actions.closeEditStaffModal}
        onSave={actions.updateStaffMember}
        onResetPassword={actions.confirmResetPassword}
        onResetPin={actions.confirmResetPin}
        onToggleActive={actions.toggleStaffActive}
      />

      {/* Add New Staff Member Modal */}
      <AddStaffModal
        isOpen={addStaffModalOpen}
        onClose={actions.closeAddStaffModal}
        onAdd={actions.addStaffMember}
      />

      {/* Quick-PIN Reset Modal */}
      <ResetPinModal
        isOpen={resetPinModal.isOpen}
        staff={resetPinModal.staff}
        onClose={actions.closeResetPinModal}
        onConfirm={actions.confirmResetPin}
      />
    </div>
  );
};
