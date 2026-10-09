import React, { useState } from 'react';
import {
  UsersIcon,
  UserIcon,
  PhoneIcon,
  CheckCircleIcon,
  PlusIcon,
  LockIcon,
  XIcon
} from '../common/Icons';

export const StaffDirectoryModule = ({ controller }) => {
  const {
    filterRole,
    setFilterRole,
    filteredStaff,
    showAddModal,
    setShowAddModal,
    updateDutyStatus,
    addStaff,
    resetPin,
    deactivateStaff
  } = controller;

  // Local form inputs solely for the add modal
  const [newFullName, setNewFullName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState('receptionist');
  const [newPhone, setNewPhone] = useState('+234 80');
  const [newDesk, setNewDesk] = useState('Front Desk #3');

  const handleAddSubmit = (e) => {
    e.preventDefault();
    if (!newFullName || !newEmail) return;

    addStaff({
      id: `staff-uuid-${Date.now()}`,
      full_name: newFullName,
      email: newEmail,
      role: newRole,
      desk: newDesk,
      phone: newPhone,
      is_active: true,
      duty_status: 'on_duty',
      shift: 'Morning',
      last_login: 'Just now'
    });

    setNewFullName('');
    setNewEmail('');
  };

  return (
    <div>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '20px',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', marginBottom: '4px' }}>Staff Roster & Live Attendance</h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
            Monitor doctor and front-desk duty status, shift assignments, and credentials.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Role Filter */}
          <select
            className="form-control"
            style={{ width: 'auto', padding: '6px 12px', fontSize: '0.8125rem' }}
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
          >
            <option value="all">All Roles</option>
            <option value="receptionist">Receptionists</option>
            <option value="doctor">Doctors</option>
            <option value="clinic_admin">Administrators</option>
          </select>

          <button
            onClick={() => setShowAddModal(true)}
            className="btn btn-primary btn-sm"
          >
            <PlusIcon size={16} color="white" />
            + Add Staff Member
          </button>
        </div>
      </div>

      {/* Staff Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
        gap: '18px'
      }}>
        {filteredStaff.map((staff) => (
          <div
            key={staff.id}
            className="card"
            style={{
              padding: '22px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              borderTop: staff.role === 'clinic_admin'
                ? '4px solid var(--color-purple)'
                : staff.role === 'doctor'
                ? '4px solid var(--color-primary)'
                : '4px solid var(--color-primary-accent)',
              opacity: staff.is_active ? 1 : 0.6
            }}
          >
            <div>
              {/* Profile Top */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '46px',
                    height: '46px',
                    borderRadius: '50%',
                    backgroundColor: staff.role === 'clinic_admin'
                      ? 'var(--color-purple-bg)'
                      : staff.role === 'doctor'
                      ? 'var(--color-primary-light)'
                      : 'var(--color-surface-subtle)',
                    color: staff.role === 'clinic_admin'
                      ? 'var(--color-purple)'
                      : 'var(--color-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: '700',
                    fontSize: '1.125rem'
                  }}>
                    {staff.full_name[0]}
                  </div>

                  <div>
                    <div style={{ fontWeight: '700', fontSize: '1rem', color: 'var(--color-text-main)' }}>
                      {staff.full_name}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                      {staff.email}
                    </div>
                  </div>
                </div>

                <span className={`badge badge-${staff.role === 'clinic_admin' ? 'purple' : staff.role === 'doctor' ? 'primary' : 'info'}`}>
                  {staff.role}
                </span>
              </div>

              {/* Shift & Desk Info */}
              <div style={{
                backgroundColor: 'var(--color-bg-app)',
                borderRadius: '10px',
                padding: '10px 14px',
                fontSize: '0.8125rem',
                marginBottom: '16px',
                border: '1px solid var(--color-border)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>Station:</span>
                  <span style={{ fontWeight: '600' }}>{staff.desk || 'Clinic Desk'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>Phone:</span>
                  <span>{staff.phone}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>Last Check-in:</span>
                  <span>{staff.last_login}</span>
                </div>
              </div>

              {/* Live Duty Status Selector */}
              <div style={{ marginBottom: '16px' }}>
                <label className="form-label" style={{ fontSize: '0.75rem' }}>Live Duty Status:</label>
                <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                  {[
                    { id: 'on_duty', label: '🟢 On Duty', bg: 'var(--color-success-bg)', border: 'var(--color-success-border)' },
                    { id: 'on_break', label: '🟡 On Break', bg: 'var(--color-warning-bg)', border: 'var(--color-warning-border)' },
                    { id: 'on_leave', label: '🔴 On Leave', bg: 'var(--color-danger-bg)', border: 'var(--color-danger-border)' }
                  ].map(statusOpt => (
                    <button
                      key={statusOpt.id}
                      onClick={() => updateDutyStatus(staff.id, statusOpt.id)}
                      style={{
                        flex: 1,
                        padding: '6px 4px',
                        fontSize: '0.75rem',
                        fontWeight: staff.duty_status === statusOpt.id ? '700' : '500',
                        borderRadius: '8px',
                        border: staff.duty_status === statusOpt.id ? `2px solid ${statusOpt.border}` : '1px solid var(--color-border)',
                        backgroundColor: staff.duty_status === statusOpt.id ? statusOpt.bg : 'var(--color-surface)',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {statusOpt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Admin Controls */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingTop: '14px',
              borderTop: '1px solid var(--color-border)'
            }}>
              <button
                onClick={() => resetPin(staff.id)}
                className="btn btn-secondary btn-sm"
                title="Resets Quick PIN to 1234"
              >
                <LockIcon size={12} color="var(--color-text-muted)" />
                Reset PIN
              </button>

              <button
                onClick={() => {
                  if (window.confirm(`Are you sure you want to deactivate ${staff.full_name}? Access will be revoked immediately.`)) {
                    deactivateStaff(staff.id);
                  }
                }}
                className="btn btn-ghost btn-sm"
                style={{ color: 'var(--color-danger)', fontSize: '0.75rem' }}
                title="Immediately revokes access"
              >
                Deactivate
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add Staff Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div style={{
              padding: '18px 24px',
              borderBottom: '1px solid var(--color-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <h2 style={{ fontSize: '1.125rem', margin: 0 }}>Add Staff Member</h2>
              <button onClick={() => setShowAddModal(false)} className="btn btn-ghost" style={{ padding: '4px' }}>
                <XIcon size={18} color="var(--color-text-muted)" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} style={{ padding: '24px' }}>
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. Mary Okeke"
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Email Address</label>
                <input
                  type="email"
                  className="form-control"
                  placeholder="mary.o@medpulse.clinic"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">Clinic Role</label>
                  <select
                    className="form-control"
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                  >
                    <option value="receptionist">Receptionist</option>
                    <option value="doctor">Doctor</option>
                    <option value="clinic_admin">Clinic Admin</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Desk / Station</label>
                  <input
                    type="text"
                    className="form-control"
                    value={newDesk}
                    onChange={(e) => setNewDesk(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Phone Number</label>
                <input
                  type="tel"
                  className="form-control"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                />
              </div>

              <div style={{
                backgroundColor: 'var(--color-info-bg)',
                color: 'var(--color-info-text)',
                padding: '10px 12px',
                borderRadius: '8px',
                fontSize: '0.75rem',
                marginBottom: '20px'
              }}>
                Default Quick PIN will be set to: <strong>1234</strong>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" onClick={() => setShowAddModal(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
