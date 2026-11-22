import React from 'react';
import { useLocation } from 'react-router-dom';
import { Lock, Clock, PanelLeft } from 'lucide-react';
import { useAppModeStore } from '../../stores/appModeStore';
import { useAuthStore } from '../../stores/useAuthStore';
import { useClinicClock } from '../../hooks/useClinicClock';
import '../../styles/components/header.css';

/**
 * Header — Compact Top Bar for Clinic Status, Clock & Mobile Navigation Trigger.
 * Staff identity and Sign Out live once in LeftRail footer so they are not duplicated here.
 */
export const Header = () => {
  const location = useLocation();
  const { clinicInfo, toggleSidebar } = useAppModeStore();
  const { lockWorkstation } = useAuthStore();
  const { timeStr } = useClinicClock();

  const getSectionLabel = (path) => {
    switch (path) {
      case '/queue':
        return 'Requests Queue';
      case '/calendar':
        return 'Schedule Grid';
      case '/live-visits':
      case '/recalls':
        return 'Visits & Recalls';
      case '/admin/staff':
        return 'Staff & Reports';
      case '/admin/settings':
        return 'Clinic Settings';
      case '/simulator':
        return 'Pitch Simulator';
      default:
        return 'Front Desk';
    }
  };

  return (
    <header className="top-header" aria-label="Top Clinic Bar">
      <div className="header-left-col">
        <button
          type="button"
          onClick={toggleSidebar}
          className="header-sidebar-toggle-btn"
          title="Toggle Navigation Menu"
          aria-label="Toggle Navigation Menu"
        >
          <PanelLeft size={16} />
        </button>

        <span className="header-page-title">
          {getSectionLabel(location.pathname)}
        </span>

        <div className="header-clinic-pill" title="Clinic Online Status">
          <span className="duty-dot" />
          <span>Desk Online</span>
          <span style={{ color: 'var(--text-3)' }}>·</span>
          <span style={{ color: 'var(--text-3)' }}>{clinicInfo.branch}</span>
        </div>
      </div>

      <div className="header-right-col">
        <div className="header-clock tabular-nums" title="Local Clinic Time">
          <Clock size={12} style={{ display: 'inline', marginRight: '6px' }} />
          <span>{timeStr || '09:00:00 AM'}</span>
        </div>

        <button
          type="button"
          onClick={lockWorkstation}
          className="header-action-btn header-lock-btn"
          title="Quick Lock Workstation (PIN)"
          aria-label="Lock Workstation"
        >
          <Lock size={13} />
          <span className="btn-label-text">Lock</span>
        </button>
      </div>
    </header>
  );
};
