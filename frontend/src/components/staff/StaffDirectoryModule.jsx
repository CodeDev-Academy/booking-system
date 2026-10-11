import React, { useState } from 'react';
import {
  PlusIcon,
  SearchIcon,
  XIcon,
  Edit3Icon,
  KeyIcon,
  UserIcon
} from '../common/Icons';
import { EditStaffModal } from './EditStaffModal';
import { ResetCredentialsModal } from './ResetCredentialsModal';
import { StaffDetailModal } from './StaffDetailModal';

export const StaffDirectoryModule = ({ controller }) => {
  const {
    staffList,
    filterCategory,
    setFilterCategory,
    searchQuery,
    setSearchQuery,
    filteredStaff,
    selectedStaffDetail,
    setSelectedStaffDetail,
    isDashboardUser,
    showAddModal,
    setShowAddModal,
    editingStaff,
    setEditingStaff,
    credentialsStaff,
    setCredentialsStaff,
    updateDutyStatus,
    addStaff,
    updateStaff,
    updateCredentials,
    resetPin,
    deactivateStaff
  } = controller;

  // New Staff Modal Form State
  const [newFullName, setNewFullName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRoleSelect, setNewRoleSelect] = useState('doctor');
  const [newCustomRole, setNewCustomRole] = useState('');
  const [newPhone, setNewPhone] = useState('+234 80');
  const [newDesk, setNewDesk] = useState('Consultation Suite 1');
  const [newSpecialty, setNewSpecialty] = useState('');
  const [newShift, setNewShift] = useState('Full Day (08:30 - 16:30)');

  const counts = {
    all: staffList.length,
    doctors: staffList.filter(s => s.role === 'doctor').length,
    dashboard: staffList.filter(s => ['receptionist', 'clinic_admin'].includes(s.role)).length,
    support: staffList.filter(s => !['doctor', 'receptionist', 'clinic_admin'].includes(s.role)).length
  };

  const handleAddSubmit = (e) => {
    e.preventDefault();
    if (!newFullName || !newEmail) return;

    const finalRole = newRoleSelect === 'custom'
      ? (newCustomRole.trim().toLowerCase() || 'staff')
      : newRoleSelect;

    addStaff({
      id: finalRole === 'doctor' ? `doc-uuid-${Date.now()}` : `staff-uuid-${Date.now()}`,
      full_name: newFullName,
      email: newEmail,
      role: finalRole,
      desk: newDesk,
      specialty: finalRole === 'doctor' ? newSpecialty || 'General Practitioner' : undefined,
      phone: newPhone,
      is_active: true,
      duty_status: 'on_duty',
      shift: newShift,
      last_login: 'Just now'
    });

    setNewFullName('');
    setNewEmail('');
    setNewCustomRole('');
    setNewSpecialty('');
  };

  const getDutyDotColor = (status, isActive) => {
    if (!isActive) return '#555555';
    switch (status) {
      case 'on_duty': return 'var(--color-accent-green)';
      case 'on_break': return 'var(--color-accent-orange)';
      case 'on_leave': return 'var(--color-accent-coral)';
      case 'off_duty': return '#8e8e93';
      default: return '#8e8e93';
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {/* Top Search & Filter Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '14px'
      }}>
        {/* Search Input Box */}
        <div style={{
          position: 'relative',
          flex: '1 1 300px',
          maxWidth: '440px'
        }}>
          <span style={{
            position: 'absolute',
            left: '14px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: '#8e8e93',
            pointerEvents: 'none'
          }}>
            <SearchIcon size={15} color="#8e8e93" />
          </span>
          <input
            type="text"
            className="form-control-glass"
            style={{
              paddingLeft: '38px',
              paddingRight: searchQuery ? '36px' : '14px',
              fontSize: '0.8125rem',
              borderRadius: 'var(--radius-pill)',
              backgroundColor: 'rgba(255, 255, 255, 0.03)'
            }}
            placeholder="Search by name, role, station, phone, or specialty..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{
                position: 'absolute',
                right: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#8e8e93',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '2px'
              }}
            >
              <XIcon size={14} color="#8e8e93" />
            </button>
          )}
        </div>

        {/* Add Person Action */}
        <button
          onClick={() => setShowAddModal(true)}
          className="btn-pill btn-pill-orange"
        >
          <PlusIcon size={14} color="#ffffff" />
          <span>+ Add Staff or Doctor</span>
        </button>
      </div>

      {/* Category Tabs */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        flexWrap: 'wrap',
        background: 'rgba(255, 255, 255, 0.02)',
        padding: '4px',
        borderRadius: 'var(--radius-pill)',
        border: '1px solid var(--color-border-glass)',
        width: 'fit-content'
      }}>
        {[
          { id: 'all', label: 'All Personnel', count: counts.all },
          { id: 'doctors', label: 'Doctors & Specialists', count: counts.doctors },
          { id: 'dashboard', label: 'Reception & Admin (Login)', count: counts.dashboard },
          { id: 'support', label: 'Support & Facility', count: counts.support }
        ].map(cat => {
          const isActive = filterCategory === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => setFilterCategory(cat.id)}
              className="btn-pill"
              style={{
                padding: '7px 16px',
                fontSize: '0.8125rem',
                fontWeight: isActive ? '700' : '500',
                backgroundColor: isActive ? '#ffffff' : 'transparent',
                color: isActive ? '#0c0d0e' : '#8e8e93',
                boxShadow: isActive ? '0 0 20px rgba(255, 255, 255, 0.2)' : 'none'
              }}
            >
              <span>{cat.label}</span>
              <span style={{
                fontSize: '0.6875rem',
                fontWeight: '800',
                padding: '2px 6px',
                borderRadius: '10px',
                backgroundColor: isActive ? '#0c0d0e' : 'rgba(255, 255, 255, 0.08)',
                color: isActive ? '#ffffff' : '#8e8e93'
              }}>
                {cat.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Personnel Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
        gap: '14px'
      }}>
        {filteredStaff.map((staff) => {
          const isDoctor = staff.role === 'doctor';
          const hasDashboardAccess = isDashboardUser(staff);

          return (
            <div
              key={staff.id}
              className="glass-card"
              style={{
                padding: '20px 22px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '14px',
                opacity: staff.is_active ? 1 : 0.45,
                transition: 'border-color 0.2s ease',
                borderColor: 'rgba(255, 255, 255, 0.08)'
              }}
            >
              <div>
                {/* Header Row */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {/* Avatar with Status Dot */}
                    <div style={{ position: 'relative' }}>
                      <div style={{
                        width: '44px',
                        height: '44px',
                        borderRadius: '50%',
                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        color: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: '700',
                        fontSize: '1.0625rem'
                      }}>
                        {staff.full_name[0]}
                      </div>

                      <span style={{
                        position: 'absolute',
                        bottom: '0px',
                        right: '0px',
                        width: '10px',
                        height: '10px',
                        borderRadius: '50%',
                        backgroundColor: getDutyDotColor(staff.duty_status, staff.is_active),
                        border: '2px solid #0c0d0e'
                      }} />
                    </div>

                    <div>
                      <div style={{ fontWeight: '700', fontSize: '0.9375rem', color: '#ffffff' }}>
                        {staff.full_name}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#8e8e93', marginTop: '1px' }}>
                        {staff.email}
                      </div>
                    </div>
                  </div>

                  {/* Clean Role Badge */}
                  <span className="glass-badge" style={{ fontSize: '0.6875rem', textTransform: 'capitalize' }}>
                    {staff.role?.replace('_', ' ')}
                  </span>
                </div>

                {/* Details Card */}
                <div style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.02)',
                  borderRadius: 'var(--radius-md)',
                  padding: '12px 14px',
                  fontSize: '0.8125rem',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#8e8e93' }}>Station / Room:</span>
                    <span style={{ color: '#ffffff', fontWeight: '500' }}>{staff.desk || 'Not Assigned'}</span>
                  </div>

                  {isDoctor && staff.specialty && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#8e8e93' }}>Specialty:</span>
                      <span style={{ color: '#ffffff', fontWeight: '500' }}>{staff.specialty}</span>
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#8e8e93' }}>Phone:</span>
                    <span style={{ color: '#ffffff' }}>{staff.phone}</span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#8e8e93' }}>Shift:</span>
                    <span style={{ color: '#8e8e93' }}>{staff.shift?.split('(')[0] || staff.shift}</span>
                  </div>
                </div>

                {/* Quick Duty Status Switcher */}
                <div style={{ marginTop: '12px' }}>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {[
                      { id: 'on_duty', label: '🟢 On Duty' },
                      { id: 'on_break', label: '🟡 On Break' },
                      { id: 'on_leave', label: '🔴 On Leave' },
                      { id: 'off_duty', label: '⚪ Off Duty' }
                    ].map(opt => {
                      const isSelected = staff.duty_status === opt.id;
                      return (
                        <button
                          key={opt.id}
                          onClick={() => updateDutyStatus(staff.id, opt.id)}
                          className="btn-pill"
                          style={{
                            flex: 1,
                            padding: '4px 6px',
                            fontSize: '0.6875rem',
                            fontWeight: isSelected ? '700' : '500',
                            backgroundColor: isSelected ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.02)',
                            border: isSelected ? '1px solid rgba(255, 255, 255, 0.25)' : '1px solid rgba(255, 255, 255, 0.05)',
                            color: isSelected ? '#ffffff' : '#8e8e93'
                          }}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Action Toolbar */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: '10px',
                borderTop: '1px solid rgba(255, 255, 255, 0.05)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {/* Dedicated View File Modal */}
                  <button
                    onClick={() => setSelectedStaffDetail(staff)}
                    className="btn-pill btn-pill-glass"
                    style={{ fontSize: '0.75rem', padding: '5px 12px' }}
                    title="View complete record details"
                  >
                    <span>View File ➔</span>
                  </button>

                  {/* Edit Button */}
                  <button
                    onClick={() => setEditingStaff(staff)}
                    className="btn-pill btn-pill-glass"
                    style={{ fontSize: '0.75rem', padding: '5px 10px' }}
                    title="Edit profile & station"
                  >
                    <Edit3Icon size={12} color="#8e8e93" />
                    <span>Edit</span>
                  </button>

                  {/* PIN & Password Credentials Button: ONLY shown for Dashboard Users (Receptionist & Admin) */}
                  {hasDashboardAccess && (
                    <button
                      onClick={() => setCredentialsStaff(staff)}
                      className="btn-pill btn-pill-glass"
                      style={{ fontSize: '0.75rem', padding: '5px 10px' }}
                      title="Reset Login Quick PIN & Password"
                    >
                      <KeyIcon size={12} color="var(--color-accent-orange)" />
                      <span>PIN</span>
                    </button>
                  )}
                </div>

                {/* Deactivate Button: only for dashboard accounts */}
                {hasDashboardAccess && (
                  <button
                    onClick={() => {
                      if (window.confirm(`Deactivate dashboard login access for ${staff.full_name}?`)) {
                        deactivateStaff(staff.id);
                      }
                    }}
                    style={{ color: 'var(--color-accent-coral)', fontSize: '0.75rem', padding: '4px 6px', background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    Deactivate
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {filteredStaff.length === 0 && (
        <div className="glass-card" style={{
          padding: '48px 20px',
          textAlign: 'center',
          color: '#8e8e93'
        }}>
          <h3 style={{ fontSize: '1rem', color: '#ffffff', marginBottom: '4px' }}>
            No Personnel Found
          </h3>
          <p style={{ fontSize: '0.8125rem' }}>
            No records matched your search query "{searchQuery}".
          </p>
        </div>
      )}

      {/* Modal 1: Dedicated Staff File View */}
      <StaffDetailModal
        staff={selectedStaffDetail}
        isOpen={Boolean(selectedStaffDetail)}
        onClose={() => setSelectedStaffDetail(null)}
        onEdit={setEditingStaff}
        onCredentials={setCredentialsStaff}
        isDashboardUser={isDashboardUser}
      />

      {/* Modal 2: Edit Staff Record */}
      <EditStaffModal
        staff={editingStaff}
        isOpen={Boolean(editingStaff)}
        onClose={() => setEditingStaff(null)}
        onSave={updateStaff}
      />

      {/* Modal 3: Reset PIN & Password (Only for Dashboard Users) */}
      <ResetCredentialsModal
        staff={credentialsStaff}
        isOpen={Boolean(credentialsStaff)}
        onClose={() => setCredentialsStaff(null)}
        onSaveCredentials={updateCredentials}
      />

      {/* Modal 4: Add New Staff Member or Doctor */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-glass-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div style={{
              padding: '20px 24px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div>
                <h2 style={{ fontSize: '1.125rem', color: '#ffffff', margin: 0 }}>Add Clinic Staff or Doctor</h2>
                <p style={{ fontSize: '0.75rem', color: '#8e8e93', margin: '2px 0 0' }}>
                  Register a clinical doctor, dashboard user, or facility staff member.
                </p>
              </div>
              <button onClick={() => setShowAddModal(false)} style={{ color: '#8e8e93', padding: '4px' }}>
                <XIcon size={18} color="currentColor" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Full Name</label>
                <input
                  type="text"
                  className="form-control-glass"
                  placeholder="e.g. Dr. Amina Bello or Musa Garba"
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Email Address</label>
                <input
                  type="email"
                  className="form-control-glass"
                  placeholder="amina.b@medpulse.clinic"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  required
                />
              </div>

              {/* Role Selection with Custom Option */}
              <div style={{ display: 'grid', gridTemplateColumns: newRoleSelect === 'custom' ? '1fr 1fr' : '1fr 1fr', gap: '12px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Role</label>
                  <select
                    className="form-control-glass"
                    value={newRoleSelect}
                    onChange={(e) => setNewRoleSelect(e.target.value)}
                  >
                    <option value="doctor">Doctor / Specialist</option>
                    <option value="receptionist">Receptionist (Dashboard)</option>
                    <option value="clinic_admin">Administrator (Dashboard)</option>
                    <option value="nurse">Nurse / Assistant</option>
                    <option value="cleaner">Cleaner / Hygiene</option>
                    <option value="custom">+ Create Custom Role...</option>
                  </select>
                </div>

                {newRoleSelect === 'custom' ? (
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Custom Role Name</label>
                    <input
                      type="text"
                      className="form-control-glass"
                      placeholder="e.g. Dental Hygienist"
                      value={newCustomRole}
                      onChange={(e) => setNewCustomRole(e.target.value)}
                      required
                    />
                  </div>
                ) : (
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Station / Room</label>
                    <input
                      type="text"
                      className="form-control-glass"
                      placeholder="e.g. Suite 1, Front Desk"
                      value={newDesk}
                      onChange={(e) => setNewDesk(e.target.value)}
                    />
                  </div>
                )}
              </div>

              {newRoleSelect === 'custom' && (
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Station / Room / Department</label>
                  <input
                    type="text"
                    className="form-control-glass"
                    placeholder="e.g. Clinic Floor 1"
                    value={newDesk}
                    onChange={(e) => setNewDesk(e.target.value)}
                  />
                </div>
              )}

              {newRoleSelect === 'doctor' && (
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Medical Specialty</label>
                  <input
                    type="text"
                    className="form-control-glass"
                    placeholder="e.g. Endodontics Specialist"
                    value={newSpecialty}
                    onChange={(e) => setNewSpecialty(e.target.value)}
                  />
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Phone Number</label>
                  <input
                    type="tel"
                    className="form-control-glass"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Shift</label>
                  <input
                    type="text"
                    className="form-control-glass"
                    value={newShift}
                    onChange={(e) => setNewShift(e.target.value)}
                  />
                </div>
              </div>

              {['receptionist', 'clinic_admin'].includes(newRoleSelect) && (
                <div style={{
                  backgroundColor: 'rgba(255, 107, 0, 0.08)',
                  color: 'var(--color-accent-orange)',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.75rem',
                  border: '1px solid rgba(255, 107, 0, 0.15)'
                }}>
                  Dashboard login will be enabled. Default Quick PIN: <strong>1234</strong>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
                <button type="button" onClick={() => setShowAddModal(false)} className="btn-pill btn-pill-glass">
                  Cancel
                </button>
                <button type="submit" className="btn-pill btn-pill-orange">
                  Add Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
