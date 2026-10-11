import React from 'react';
import {
  MessageSquareIcon,
  CalendarIcon,
  UsersIcon,
  ActivityIcon,
  SettingsIcon,
  LockIcon,
  ShieldIcon
} from './Icons';

export const Sidebar = ({
  activeModule,
  setActiveModule,
  pendingRequestsCount,
  onLockScreen
}) => {
  const navItems = [
    {
      id: 'requests',
      label: 'Requests Queue',
      icon: MessageSquareIcon,
      badge: pendingRequestsCount
    },
    {
      id: 'visits',
      label: 'Live Visits',
      icon: CalendarIcon
    },
    {
      id: 'staff',
      label: 'Staff Directory',
      icon: UsersIcon
    },
    {
      id: 'analytics',
      label: 'Reports & Analytics',
      icon: ActivityIcon
    },
    {
      id: 'settings',
      label: 'Clinic Settings',
      icon: SettingsIcon
    }
  ];

  return (
    <aside className="dashboard-sidebar-column">
      {/* Sleek Floating Glass Capsule */}
      <div style={{
        background: 'rgba(22, 23, 27, 0.65)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '36px',
        padding: '16px 10px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 'calc(100vh - 48px)',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)'
      }}>
        {/* Brand Circle Mark (Top) */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '14px'
        }}>
          <div
            title="MedPulse Reception Hub"
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '50%',
              backgroundColor: 'var(--color-accent-orange)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              boxShadow: '0 0 20px rgba(255, 107, 0, 0.45)',
              cursor: 'pointer'
            }}
          >
            <ShieldIcon size={22} color="#ffffff" />
          </div>

          <div style={{
            width: '24px',
            height: '1px',
            backgroundColor: 'rgba(255, 255, 255, 0.1)'
          }} />
        </div>

        {/* Navigation Circular Icons (Middle) */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          alignItems: 'center'
        }}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeModule === item.id;
            return (
              <div key={item.id} style={{ position: 'relative' }}>
                <button
                  onClick={() => setActiveModule(item.id)}
                  title={item.label}
                  style={{
                    width: '46px',
                    height: '46px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: isActive ? '#ffffff' : 'transparent',
                    color: isActive ? '#0c0d0e' : '#8e8e93',
                    transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                    boxShadow: isActive ? '0 0 25px rgba(255, 255, 255, 0.35)' : 'none'
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
                      e.currentTarget.style.color = '#ffffff';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.color = '#8e8e93';
                    }
                  }}
                >
                  <Icon size={20} color="currentColor" />
                </button>

                {/* Badge Notification Dot / Pill */}
                {item.badge !== undefined && item.badge > 0 && (
                  <span
                    style={{
                      position: 'absolute',
                      top: '-2px',
                      right: '-2px',
                      backgroundColor: 'var(--color-accent-orange)',
                      color: '#ffffff',
                      fontSize: '0.625rem',
                      fontWeight: '800',
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '2px solid #121316',
                      boxShadow: '0 0 10px rgba(255, 107, 0, 0.5)'
                    }}
                  >
                    {item.badge}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Bottom Lock Desk Button */}
        <div>
          <button
            onClick={onLockScreen}
            title="Lock Desk Screen (Quick PIN)"
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(255, 255, 255, 0.04)',
              color: '#8e8e93',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#ffffff';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = '#8e8e93';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
            }}
          >
            <LockIcon size={18} color="currentColor" />
          </button>
        </div>
      </div>
    </aside>
  );
};
