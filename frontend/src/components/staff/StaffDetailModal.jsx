import React from 'react';
import { XIcon, Edit3Icon, KeyIcon, PhoneIcon, UserIcon, ClockIcon } from '../common/Icons';

export const StaffDetailModal = ({
  staff,
  isOpen,
  onClose,
  onEdit,
  onCredentials,
  isDashboardUser
}) => {
  if (!isOpen || !staff) return null;

  const isDoctor = staff.role === 'doctor';
  const hasDashboardAccess = isDashboardUser(staff);

  const getDutyColor = (status) => {
    switch (status) {
      case 'on_duty': return 'var(--color-accent-green)';
      case 'on_break': return 'var(--color-accent-orange)';
      case 'on_leave': return 'var(--color-accent-coral)';
      default: return '#8e8e93';
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-glass-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '540px' }}>
        {/* Header */}
        <div style={{
          padding: '22px 26px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div>
            <span style={{
              fontSize: '0.6875rem',
              fontWeight: '700',
              textTransform: 'uppercase',
              color: 'var(--color-accent-orange)',
              letterSpacing: '0.04em'
            }}>
              {isDoctor ? 'Clinical Specialist File' : hasDashboardAccess ? 'Dashboard System Account' : 'Clinic Roster File'}
            </span>
            <h2 style={{ fontSize: '1.25rem', color: '#ffffff', margin: '2px 0 0' }}>
              {staff.full_name}
            </h2>
          </div>
          <button onClick={onClose} style={{ color: '#8e8e93', padding: '4px' }}>
            <XIcon size={18} color="currentColor" />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '24px 26px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Top Profile Summary */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            padding: '16px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid rgba(255, 255, 255, 0.06)'
          }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              backgroundColor: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.5rem',
              fontWeight: '700',
              color: '#ffffff',
              flexShrink: 0
            }}>
              {staff.full_name[0]}
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '1.0625rem', fontWeight: '700', color: '#ffffff' }}>
                  {staff.full_name}
                </span>
                <span className="glass-badge" style={{ fontSize: '0.6875rem', textTransform: 'capitalize' }}>
                  {staff.role?.replace('_', ' ')}
                </span>
              </div>
              <div style={{ fontSize: '0.8125rem', color: '#8e8e93', marginTop: '2px' }}>
                {staff.email}
              </div>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                marginTop: '6px',
                fontSize: '0.75rem',
                color: getDutyColor(staff.duty_status)
              }}>
                <span style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: getDutyColor(staff.duty_status)
                }} />
                <span style={{ fontWeight: '600', textTransform: 'capitalize' }}>
                  {staff.duty_status?.replace('_', ' ')}
                </span>
              </div>
            </div>
          </div>

          {/* Details Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '12px'
          }}>
            <div style={{
              padding: '12px 14px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid rgba(255, 255, 255, 0.05)'
            }}>
              <div style={{ fontSize: '0.6875rem', color: '#8e8e93', textTransform: 'uppercase' }}>Station / Room</div>
              <div style={{ fontSize: '0.875rem', color: '#ffffff', fontWeight: '600', marginTop: '2px' }}>
                {staff.desk || 'Not Assigned'}
              </div>
            </div>

            <div style={{
              padding: '12px 14px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid rgba(255, 255, 255, 0.05)'
            }}>
              <div style={{ fontSize: '0.6875rem', color: '#8e8e93', textTransform: 'uppercase' }}>Phone Contact</div>
              <div style={{ fontSize: '0.875rem', color: '#ffffff', fontWeight: '600', marginTop: '2px' }}>
                {staff.phone || 'None'}
              </div>
            </div>

            {isDoctor && (
              <div style={{
                padding: '12px 14px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                gridColumn: '1 / -1'
              }}>
                <div style={{ fontSize: '0.6875rem', color: '#8e8e93', textTransform: 'uppercase' }}>Clinical Specialty</div>
                <div style={{ fontSize: '0.875rem', color: 'var(--color-accent-green)', fontWeight: '600', marginTop: '2px' }}>
                  {staff.specialty || 'General Practitioner'}
                </div>
              </div>
            )}

            <div style={{
              padding: '12px 14px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid rgba(255, 255, 255, 0.05)',
              gridColumn: '1 / -1'
            }}>
              <div style={{ fontSize: '0.6875rem', color: '#8e8e93', textTransform: 'uppercase' }}>Assigned Shift</div>
              <div style={{ fontSize: '0.875rem', color: '#ffffff', fontWeight: '500', marginTop: '2px' }}>
                {staff.shift || 'Regular Operating Hours'}
              </div>
            </div>
          </div>

          {/* Access Note */}
          <div style={{
            padding: '12px 14px',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.75rem',
            backgroundColor: hasDashboardAccess ? 'rgba(255, 107, 0, 0.06)' : 'rgba(255, 255, 255, 0.03)',
            border: hasDashboardAccess ? '1px solid rgba(255, 107, 0, 0.15)' : '1px solid rgba(255, 255, 255, 0.06)',
            color: hasDashboardAccess ? 'var(--color-accent-orange)' : '#8e8e93',
            lineHeight: '1.4'
          }}>
            {hasDashboardAccess ? (
              <span>🔑 <strong>Dashboard Access Active:</strong> This user has receptionist & clinic management login credentials.</span>
            ) : (
              <span>📋 <strong>Clinical Roster Record:</strong> Available for doctor slot calculation and visit check-in. Does not require portal sign-in credentials.</span>
            )}
          </div>

          {/* Action Toolbar */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', paddingTop: '8px', borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
            <button
              onClick={() => {
                onClose();
                onEdit(staff);
              }}
              className="btn-pill btn-pill-glass"
              style={{ padding: '8px 18px', fontSize: '0.8125rem' }}
            >
              <Edit3Icon size={13} color="#ffffff" />
              <span>Edit Record</span>
            </button>

            {hasDashboardAccess && (
              <button
                onClick={() => {
                  onClose();
                  onCredentials(staff);
                }}
                className="btn-pill btn-pill-orange"
                style={{ padding: '8px 18px', fontSize: '0.8125rem' }}
              >
                <KeyIcon size={13} color="#ffffff" />
                <span>Reset PIN / Password</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
