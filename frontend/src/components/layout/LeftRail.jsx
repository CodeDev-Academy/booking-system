import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  Inbox,
  Calendar as CalendarIcon,
  Activity,
  Users,
  Settings,
  Smartphone,
  ChevronLeft,
  Lock,
  Sparkles,
  LogOut,
} from 'lucide-react';
import { useAppModeStore } from '../../stores/appModeStore';
import { useAuthStore } from '../../stores/useAuthStore';
import { useSettingsStore } from '../../stores/useSettingsStore';
import '../../styles/components/leftRail.css';

/**
 * LeftRail — Primary Receptionist & Admin Navigation Bar
 * Pure presentational component governed by Impeccable Operate aesthetics.
 */
export const LeftRail = ({ strandedCount = 0 }) => {
  const { currentStaff: authStaff, lockWorkstation, logout } = useAuthStore();
  const {
    isSidebarCollapsed,
    isMobileDrawerOpen,
    toggleSidebar,
    closeMobileDrawer,
    hidePitchSimulator,
    queueCounts,
    clinicInfo,
  } = useAppModeStore();

  // Wave 3 / Step 3.7-B: the brand shows the REAL clinic name and address
  // from the settings store's API sync — not a hardcoded demo identity.
  const clinicProfile = useSettingsStore((s) => s.clinicProfile);
  const brandName = clinicProfile?.clinicName || clinicInfo.name;
  const brandBranch = clinicProfile?.address || clinicInfo.branch;

  const sessionName = authStaff?.name || authStaff?.full_name || 'Not signed in';
  const sessionRole = authStaff?.role === 'clinic_admin' ? 'Admin' : 'Front Desk';
  const sessionAvatar = authStaff?.avatar || sessionName.slice(0, 2).toUpperCase();

  const handleNavClick = () => {
    closeMobileDrawer();
  };

  return (
    <aside
      className={`left-rail ${isSidebarCollapsed ? 'collapsed' : ''} ${isMobileDrawerOpen ? 'mobile-open' : ''}`}
      aria-label="Sidebar Navigation"
    >
      {/* Brand & Clinic Title */}
      <div className="rail-header">
        <NavLink to="/queue" className="brand-wrapper" title={brandName} onClick={handleNavClick}>
          <div className="brand-logo-spark">
            <Sparkles size={16} strokeWidth={2.5} />
          </div>
          <div className="brand-text">
            <span className="brand-title">{brandName}</span>
            <span className="brand-subtitle">{brandBranch}</span>
          </div>
        </NavLink>

        <button
          type="button"
          onClick={toggleSidebar}
          className="rail-toggle-btn"
          title="Collapse Navigation"
          aria-label="Collapse Navigation"
        >
          <ChevronLeft size={15} />
        </button>
      </div>

      {/* Navigation Sections */}
      <div className="rail-nav-content">
        {/* Section 1: Front Desk */}
        <div className="nav-section">
          <span className="nav-section-label">Front Desk</span>

          <NavLink
            to="/queue"
            onClick={handleNavClick}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            title="Patient Booking Requests"
          >
            <Inbox size={17} className="nav-icon" />
            <span className="nav-label">Requests Queue</span>
            {queueCounts.newRequests > 0 && (
              <span className="nav-count-badge tabular-nums">
                {queueCounts.newRequests}
              </span>
            )}
            {queueCounts.needsAttention > 0 && (
              <span
                className="nav-count-badge nav-count-badge-danger tabular-nums"
                title="Requests with failed deliveries — open the Needs Attention tab"
              >
                {queueCounts.needsAttention}
              </span>
            )}
          </NavLink>

          <NavLink
            to="/calendar"
            onClick={handleNavClick}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            title="Master Clinical Schedule Grid"
          >
            <CalendarIcon size={17} className="nav-icon" />
            <span className="nav-label">Schedule Grid</span>
            {strandedCount > 0 && (
              <span
                className="nav-count-badge nav-count-badge-danger tabular-nums"
                title={`${strandedCount} patient${strandedCount === 1 ? ' is' : 's are'} still booked under a doctor on leave — open the Schedule Grid`}
              >
                {strandedCount}
              </span>
            )}
          </NavLink>

          <NavLink
            to="/live-visits"
            onClick={handleNavClick}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            title="Live Clinic Visits & Follow-Up Recalls"
          >
            <Activity size={17} className="nav-icon" />
            <span className="nav-label">Visits &amp; Recalls</span>
            {queueCounts.todaySchedule > 0 && (
              <span className="nav-count-badge tabular-nums">
                {queueCounts.todaySchedule}
              </span>
            )}
          </NavLink>
        </div>

        {/* Section 2: Administration */}
        <div className="nav-section">
          <span className="nav-section-label">Administration</span>

          <NavLink
            to="/admin/staff"
            onClick={handleNavClick}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            title="Staff Roster & Reports"
          >
            <Users size={17} className="nav-icon" />
            <span className="nav-label">Staff &amp; Reports</span>
          </NavLink>

          <NavLink
            to="/admin/settings"
            onClick={handleNavClick}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            title="Clinic Hours & Rules"
          >
            <Settings size={17} className="nav-icon" />
            <span className="nav-label">Clinic Settings</span>
          </NavLink>
        </div>

        {/* Section 3: Pitch & Simulator (Hidden in Client Handover Mode) */}
        {!hidePitchSimulator && (
          <div className="nav-section">
            <span className="nav-section-label">Demo</span>

            <NavLink
              to="/simulator"
              onClick={handleNavClick}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              title="Interactive Split Simulator"
            >
              <Smartphone size={17} className="nav-icon" />
              <span className="nav-label">Pitch Simulator</span>
            </NavLink>
          </div>
        )}
      </div>

      {/* Single Staff Identity & Workstation Controls Footer */}
      <div className="rail-footer">
        <div
          style={{
            padding: '8px 10px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--surface-2)',
            border: '1px solid var(--line)',
            marginBottom: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            minWidth: 0,
          }}
          title={`${sessionName} · ${sessionRole}`}
        >
          <div className="staff-avatar-circle">{sessionAvatar}</div>
          <div style={{ minWidth: 0, overflow: 'hidden' }}>
            <div
              style={{
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--text)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {sessionName}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-3)' }}>
              {sessionRole}
            </div>
          </div>
        </div>

        <div className="rail-footer-actions">
          <button
            type="button"
            onClick={lockWorkstation}
            className="footer-icon-btn"
            title="Privacy Lock Screen (PIN)"
            aria-label="Lock Screen"
          >
            <Lock size={13} />
            <span className="footer-btn-label">Lock</span>
          </button>

          <button
            type="button"
            onClick={logout}
            className="footer-icon-btn"
            style={{ color: 'var(--danger-text)' }}
            title="Log Out of Workstation"
            aria-label="Log Out"
          >
            <LogOut size={13} />
            <span className="footer-btn-label">Sign Out</span>
          </button>
        </div>
      </div>
    </aside>
  );
};
