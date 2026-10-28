import React from 'react';
import {
  Clock,
  UserCheck,
  Stethoscope,
  Sparkles,
  Lock,
  ArrowRight,
  Shield,
  Mail,
  User,
} from 'lucide-react';
import { useAuthStore } from '../../stores/useAuthStore';

/**
 * StaffRosterTable — Uniform Bento Card Design Pattern
 * Aligned with PastPatientsHistory / Doctor Bento Cards:
 * - 48px Circular avatar with initials & soft role background
 * - Bold staff name, role tag & duty pill
 * - Clean #f8fafc meta strip with shift hours & workstation
 * - Full-width midnight navy pill action button (#0c1a30)
 */
export const StaffRosterTable = ({
  staffList,
  onOpenEditStaff,
}) => {
  const currentStaff = useAuthStore((state) => state.currentStaff);

  const getStatusBadge = (status) => {
    switch (status) {
      case 'on_duty':
        return { label: 'ON DUTY', color: '#15803d', bg: '#dcfce7' };
      case 'on_break':
        return { label: 'ON BREAK', color: '#b45309', bg: '#fef3c7' };
      case 'on_leave':
        return { label: 'ON LEAVE', color: '#b91c1c', bg: '#fee2e2' };
      default:
        return { label: 'ACTIVE', color: '#15803d', bg: '#dcfce7' };
    }
  };

  return (
    <div className="bento-staff-section" style={{ marginTop: '12px' }}>
      <div className="bento-staff-cards-grid">
        {staffList.map((staff) => {
          const isDoctor = staff.role === 'doctor';
          const isCurrentSession =
            currentStaff &&
            (currentStaff.id === staff.id ||
              currentStaff.email?.toLowerCase() === staff.email?.toLowerCase());
          const statusInfo = getStatusBadge(staff.status);

          const initials = (staff.name || 'Staff')
            .split(' ')
            .map((w) => w[0])
            .filter(Boolean)
            .slice(0, 2)
            .join('')
            .toUpperCase();

          return (
            <div
              key={staff.id}
              className={`bento-staff-card ${isCurrentSession ? 'current-session' : ''} ${
                !staff.isActive ? 'deactivated' : ''
              }`}
              onClick={() => onOpenEditStaff && onOpenEditStaff(staff)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onOpenEditStaff && onOpenEditStaff(staff);
                }
              }}
              title={`Click to manage credentials and shift schedule for ${staff.name}`}
            >
              {/* 1. Top Info Row: Avatar + Name + Tags */}
              <div className="bento-staff-info-row">
                <div
                  className="bento-staff-avatar"
                  style={{
                    background: isDoctor ? '#e0f2fe' : '#fef3c7',
                    color: isDoctor ? '#0369a1' : '#b45309',
                  }}
                >
                  {initials}
                </div>

                <div className="bento-staff-text">
                  <div className="bento-staff-header-line">
                    <span className="bento-staff-name">{staff.name}</span>
                    <span
                      style={{
                        fontSize: '9px',
                        fontWeight: 700,
                        padding: '2px 7px',
                        borderRadius: 'var(--radius-full)',
                        background: statusInfo.bg,
                        color: statusInfo.color,
                        letterSpacing: '0.04em',
                      }}
                    >
                      {statusInfo.label}
                    </span>
                  </div>

                  <span className="bento-staff-email">{staff.email}</span>

                  <span className="bento-staff-role-tag">
                    {staff.specialty || (isDoctor ? 'Doctor / Surgeon' : 'Reception Operations')}
                  </span>
                </div>
              </div>

              {/* 2. Middle Meta Strip: Shift Hours & Workstation */}
              <div className="bento-staff-meta-strip">
                <div className="bento-meta-item">
                  <span className="bento-meta-label">Shift Hours:</span>
                  <span className="bento-meta-val">
                    {staff.shiftStart || '08:00'} – {staff.shiftEnd || '16:00'} WAT
                  </span>
                </div>

                <div className="bento-meta-item">
                  <span className="bento-meta-label">Workstation:</span>
                  <span className="bento-meta-val">
                    {isDoctor ? 'Clinical Consulting Suite' : 'Front Desk Counter'}
                  </span>
                </div>

                {isCurrentSession && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      paddingTop: '4px',
                      borderTop: '1px solid #f1f5f9',
                      fontSize: '10px',
                      color: '#0369a1',
                      fontWeight: 600,
                    }}
                  >
                    <span className="duty-dot" style={{ background: '#32c850' }} />
                    Active Front Desk Session (Logged In)
                  </div>
                )}
              </div>

              {/* 3. Bottom Action Footer: Full Width Midnight Navy Button */}
              <button
                type="button"
                className="bento-staff-action-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenEditStaff && onOpenEditStaff(staff);
                }}
              >
                <span>Manage Profile &amp; PIN</span>
                <ArrowRight size={13} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
