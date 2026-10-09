import React from 'react';
import {
  CalendarIcon,
  UsersIcon,
  ActivityIcon,
  SettingsIcon,
  SmartphoneIcon,
  MessageSquareIcon
} from './Icons';

export const Navigation = ({
  activeModule,
  setActiveModule,
  pendingRequestsCount,
  waitingVisitsCount,
  onDutyStaffCount
}) => {
  const navItems = [
    {
      id: 'requests',
      label: 'Requests Queue',
      icon: MessageSquareIcon,
      badge: pendingRequestsCount,
      badgeType: 'warning'
    },
    {
      id: 'visits',
      label: 'Live Visits',
      icon: CalendarIcon,
      badge: waitingVisitsCount,
      badgeType: 'success'
    },
    {
      id: 'staff',
      label: 'Staff & Attendance',
      icon: UsersIcon,
      badge: onDutyStaffCount,
      badgeType: 'primary'
    },
    {
      id: 'analytics',
      label: 'Analytics',
      icon: ActivityIcon
    },
    {
      id: 'settings',
      label: 'Clinic Settings',
      icon: SettingsIcon
    }
  ];

  return (
    <nav style={{
      backgroundColor: '#ffffff',
      borderBottom: '1px solid var(--color-border)',
      paddingTop: '4px'
    }}>
      <div className="container" style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        overflowX: 'auto',
        gap: '8px'
      }}>
        {/* Core 5 Modules */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeModule === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveModule(item.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '12px 18px',
                  fontSize: '0.875rem',
                  fontWeight: isActive ? '700' : '500',
                  color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
                  borderBottom: isActive ? '3px solid var(--color-primary)' : '3px solid transparent',
                  borderRadius: '4px 4px 0 0',
                  transition: 'all var(--transition-fast)',
                  backgroundColor: isActive ? 'rgba(14, 116, 144, 0.04)' : 'transparent',
                  whiteSpace: 'nowrap'
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.color = 'var(--color-text-main)';
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.color = 'var(--color-text-muted)';
                }}
              >
                <Icon size={18} color={isActive ? 'var(--color-primary)' : 'var(--color-text-muted)'} />
                <span>{item.label}</span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span
                    className={`badge badge-${item.badgeType}`}
                    style={{ fontSize: '0.6875rem', padding: '1px 6px', fontWeight: '700' }}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Agency Client Pitch Simulator Button */}
        <div>
          <button
            onClick={() => setActiveModule('simulator')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 14px',
              borderRadius: 'var(--radius-full)',
              fontSize: '0.8125rem',
              fontWeight: '600',
              backgroundColor: activeModule === 'simulator' ? 'var(--color-purple)' : 'var(--color-purple-bg)',
              color: activeModule === 'simulator' ? '#ffffff' : 'var(--color-purple-text)',
              border: '1px solid var(--color-purple-border)',
              transition: 'all var(--transition-fast)',
              boxShadow: activeModule === 'simulator' ? '0 2px 8px rgba(139, 92, 246, 0.3)' : 'none'
            }}
          >
            <SmartphoneIcon size={16} color={activeModule === 'simulator' ? '#ffffff' : 'var(--color-purple)'} />
            <span>Client Pitch Simulator</span>
            <span style={{
              fontSize: '0.625rem',
              textTransform: 'uppercase',
              backgroundColor: activeModule === 'simulator' ? 'rgba(255,255,255,0.2)' : 'rgba(139, 92, 246, 0.15)',
              padding: '2px 5px',
              borderRadius: '4px'
            }}>
              Live Demo
            </span>
          </button>
        </div>
      </div>
    </nav>
  );
};
