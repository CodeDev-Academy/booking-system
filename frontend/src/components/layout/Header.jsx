import React from 'react';
import { useLocation } from 'react-router-dom';
import { Lock, Clock, PanelLeft, LogOut, User } from 'lucide-react';
import { useAppModeStore } from '../../stores/appModeStore';
import { useAuthStore } from '../../stores/useAuthStore';
import { useClinicClock } from '../../hooks/useClinicClock';
import '../../styles/components/header.css';

/**
 * Header — Top Bar for Clinic Presence & Navigation
 * Pure presentational component that reflects current route and clean workstation controls.
 */
export const Header = () => {
  const location = useLocation();
  const { clinicInfo, toggleSidebar } = useAppModeStore();
  const { lockWorkstation, logout, currentStaff } = useAuthStore();
  const { timeStr } = useClinicClock();

  // Map route path to human-readable title
  const getPageTitle = (path) => {
    switch (path) {
      case '/queue':
        return 'Patient Booking Requests';
      case '/calendar':
        return 'Doctor Schedule';
      case '/live-visits':
        return 'Live Clinic Visits';
      case '/admin/staff':
        return 'Staff Roster & Attendance';
      case '/admin/settings':
        return 'Clinic Hours & Rules';
      case '/simulator':
        return 'Client Pitch Simulator';
      default:
        return 'Reception Desk';
    }
  };

  return (
    <header className="top-header" aria-label="Top Clinic Bar">
      <div className="header-left-col">
        {/* Sidebar Toggle Button (Desktop collapse + Mobile Drawer) */}
        <button
          type="button"
          onClick={toggleSidebar}
          className="header-sidebar-toggle-btn"
          title="Toggle Navigation Menu"
          aria-label="Toggle Navigation Menu"
        >
          <PanelLeft size={18} />
        </button>

        <h1 className="header-page-title">
          <span>{getPageTitle(location.pathname)}</span>
        </h1>

        <div className="header-clinic-pill" title="Clinic Online Status">
          <span className="duty-dot" />
          <span>Reception Desk Online</span>
          <span style={{ color: 'var(--text-3)' }}>·</span>
          <span style={{ color: 'var(--text-3)' }}>{clinicInfo.branch}</span>
        </div>
      </div>

      <div className="header-right-col">
        {/* Live Digital Tabular Clock */}
        <div className="header-clock tabular-nums" title="Local Clinic Time">
          <Clock size={12} style={{ display: 'inline', marginRight: '6px' }} />
          <span>{timeStr || '09:00:00 AM'}</span>
        </div>

        {/* Active Staff Identity Badge — Responsive visibility */}
        {currentStaff && (
          <div
            className="header-staff-badge"
            title={`Active Session: ${currentStaff.name} is logged in and on active duty (${currentStaff.email})`}
          >
            <span className="duty-dot" style={{ background: '#32c850', width: '7px', height: '7px' }} />
            <span className="staff-name-text">{currentStaff.name}</span>
            <span className="staff-dot-sep">&bull;</span>
            <span className="staff-role-text">
              {currentStaff.role === 'clinic_admin' ? '👑 Admin' : '🟢 Front Desk'}
            </span>
          </div>
        )}

        {/* Workstation Lock Button */}
        <button
          type="button"
          onClick={lockWorkstation}
          className="header-action-btn header-lock-btn"
          title="Lock Workstation (20m Auto-PIN)"
          aria-label="Lock Workstation"
        >
          <Lock size={14} />
          <span className="btn-label-text">Lock Desk</span>
        </button>

        {/* Sign Out Button */}
        <button
          type="button"
          onClick={logout}
          className="header-action-btn"
          title="Sign Out of Workstation"
          aria-label="Sign Out"
          style={{ color: 'var(--rose-text, #ff4f79)' }}
        >
          <LogOut size={14} />
          <span className="btn-label-text">Sign Out</span>
        </button>
      </div>
    </header>
  );
};
