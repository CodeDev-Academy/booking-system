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
  Bell,
  BellOff,
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
 * Pure presentational component governed by tasteskill.dev aesthetics.
 * Features desktop collapse, mobile overlay drawer, live status counts, and offline demo toggle.
 */
export const LeftRail = ({ strandedCount = 0 }) => {
  const { currentStaff: authStaff, lockWorkstation, logout } = useAuthStore();
  const {
    isSidebarCollapsed,
    isMobileDrawerOpen,
    toggleSidebar,
    closeMobileDrawer,
    hidePitchSimulator,
    audioEnabled,
    toggleAudio,
    queueCounts,
    clinicInfo,
  } = useAppModeStore();

  // Wave 3 / Step 3.7-B: the brand shows the REAL clinic name and address
  // from the settings store's API sync — not a hardcoded demo identity.
  const clinicProfile = useSettingsStore((s) => s.clinicProfile);
  const brandName = clinicProfile?.clinicName || clinicInfo.name;
  const brandBranch = clinicProfile?.address || clinicInfo.branch;

  // Wave 3 / Step 3.7-B: the identity card shows the REAL signed-in session
  // (useAuthStore, set at login). The fake 'Sarah Aliyu' default is gone, so
  // this must survive a null session instead of crashing on .name.
  const sessionName = authStaff?.name || authStaff?.full_name || 'Not signed in';
  const sessionRole = authStaff?.role || 'front desk';
  const sessionAvatar = authStaff?.avatar || sessionName.slice(0, 2).toUpperCase();
  const sessionShift = authStaff?.shift || 'Session active';

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
            <Sparkles size={18} strokeWidth={2.5} />
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
          title="Close Navigation"
          aria-label="Close Navigation"
        >
          <ChevronLeft size={16} />
        </button>
      </div>

      {/* Staff Identity Card */}
      <div className="rail-staff-badge" title={`${sessionName} · ${sessionRole}`}>
        <div className="staff-avatar-circle">{sessionAvatar}</div>
        <div className="staff-info-col">
          <span className="staff-name">{sessionName}</span>
          <span className="staff-shift">{sessionShift}</span>
        </div>
      </div>

      {/* Navigation Sections */}
      <div className="rail-nav-content">
        {/* Section 1: Front Desk */}
        <div className="nav-section">
          <span className="nav-section-label">Reception Desk</span>

          <NavLink
            to="/queue"
            onClick={handleNavClick}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            title="Patient Booking Requests"
          >
            <Inbox size={18} className="nav-icon" />
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
                ⚠ {queueCounts.needsAttention}
              </span>
            )}
          </NavLink>

          <NavLink
            to="/calendar"
            onClick={handleNavClick}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            title="Master Clinical Schedule Grid"
          >
            <CalendarIcon size={18} className="nav-icon" />
            <span className="nav-label">Schedule Grid</span>
            {strandedCount > 0 ? (
              <span
                className="nav-count-badge nav-count-badge-danger tabular-nums"
                title={`${strandedCount} patient${strandedCount === 1 ? ' is' : 's are'} still booked under a doctor on leave — open the Schedule Grid`}
              >
                ⚠ {strandedCount}
              </span>
            ) : (
              <span className="badge-pill badge-neutral mono-tag" style={{ fontSize: '9px' }}>
                GRID
              </span>
            )}
          </NavLink>

          <NavLink
            to="/live-visits"
            onClick={handleNavClick}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            title="Live Clinic Visits"
          >
            <Activity size={18} className="nav-icon" />
            <span className="nav-label">Live Visits</span>
            <span className="nav-count-badge tabular-nums">
              {queueCounts.todaySchedule}
            </span>
          </NavLink>
        </div>

        {/* Section 2: Administration */}
        <div className="nav-section">
          <span className="nav-section-label">Management</span>

          <NavLink
            to="/admin/staff"
            onClick={handleNavClick}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            title="Staff Roster & Attendance"
          >
            <Users size={18} className="nav-icon" />
            <span className="nav-label">Staff & Doctors</span>
          </NavLink>

          <NavLink
            to="/admin/settings"
            onClick={handleNavClick}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            title="Clinic Hours & Rules"
          >
            <Settings size={18} className="nav-icon" />
            <span className="nav-label">Clinic Settings</span>
          </NavLink>
        </div>

        {/* Section 3: Pitch & Simulator (Hidden in Client Handover Mode) */}
        {!hidePitchSimulator && (
          <div className="nav-section">
            <span className="nav-section-label">Client Pitch</span>

            <NavLink
              to="/simulator"
              onClick={handleNavClick}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              title="Interactive Split Simulator"
            >
              <Smartphone size={18} className="nav-icon" />
              <span className="nav-label">Pitch Simulator</span>
              <span className="badge-pill badge-ember mono-tag" style={{ fontSize: '9px' }}>
                SIM
              </span>
            </NavLink>
          </div>
        )}
      </div>

      {/* Footer Utility Controls */}
      <div className="rail-footer">
        {/* Active Authenticated Staff Card */}
        {authStaff && (
          <div
            style={{
              padding: '8px 10px',
              borderRadius: '8px',
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              marginBottom: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: 'rgba(255, 181, 71, 0.15)',
                  color: 'var(--amber)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '11px',
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {authStaff.avatar || 'SA'}
              </div>
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
                  {authStaff.name}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-3)' }}>
                  {authStaff.role === 'clinic_admin' ? (
                    <span style={{ color: 'var(--amber)' }}>👑 Admin</span>
                  ) : (
                    <span style={{ color: 'var(--success-text)' }}>Front Desk</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Secondary Utility Controls */}
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
            style={{ color: 'var(--rose-text, #ff4f79)' }}
            title="Log Out of Workstation"
            aria-label="Log Out"
          >
            <LogOut size={13} />
            <span className="footer-btn-label">Logout</span>
          </button>
        </div>
      </div>
    </aside>
  );
};
