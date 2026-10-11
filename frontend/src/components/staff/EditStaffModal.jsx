import React, { useState, useEffect } from 'react';
import { XIcon } from '../common/Icons';

export const EditStaffModal = ({
  staff,
  isOpen,
  onClose,
  onSave
}) => {
  if (!isOpen || !staff) return null;

  const STANDARD_ROLES = ['receptionist', 'doctor', 'clinic_admin', 'nurse', 'cleaner'];

  const [fullName, setFullName] = useState(staff.full_name || '');
  const [email, setEmail] = useState(staff.email || '');
  const [roleSelect, setRoleSelect] = useState(() => {
    return STANDARD_ROLES.includes(staff.role) ? staff.role : 'custom';
  });
  const [customRoleName, setCustomRoleName] = useState(() => {
    return STANDARD_ROLES.includes(staff.role) ? '' : staff.role || '';
  });
  const [desk, setDesk] = useState(staff.desk || '');
  const [specialty, setSpecialty] = useState(staff.specialty || '');
  const [phone, setPhone] = useState(staff.phone || '');
  const [shift, setShift] = useState(staff.shift || 'Morning');
  const [dutyStatus, setDutyStatus] = useState(staff.duty_status || 'on_duty');

  useEffect(() => {
    if (staff) {
      setFullName(staff.full_name || '');
      setEmail(staff.email || '');
      if (STANDARD_ROLES.includes(staff.role)) {
        setRoleSelect(staff.role);
        setCustomRoleName('');
      } else {
        setRoleSelect('custom');
        setCustomRoleName(staff.role || '');
      }
      setDesk(staff.desk || '');
      setSpecialty(staff.specialty || '');
      setPhone(staff.phone || '');
      setShift(staff.shift || 'Morning');
      setDutyStatus(staff.duty_status || 'on_duty');
    }
  }, [staff]);

  const effectiveRole = roleSelect === 'custom' ? (customRoleName.trim().toLowerCase() || 'staff') : roleSelect;
  const isDashboardRole = ['receptionist', 'clinic_admin'].includes(effectiveRole);
  const isDoctorRole = effectiveRole === 'doctor';

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!fullName || !email) return;

    onSave(staff.id, {
      full_name: fullName,
      email: email,
      role: effectiveRole,
      desk: desk,
      specialty: isDoctorRole ? specialty : undefined,
      phone: phone,
      shift: shift,
      duty_status: dutyStatus
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-glass-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px' }}>
        {/* Modal Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div>
            <h2 style={{ fontSize: '1.125rem', color: '#ffffff', margin: 0 }}>Edit Staff Record</h2>
            <p style={{ fontSize: '0.75rem', color: '#8e8e93', margin: '2px 0 0' }}>
              Update profile details, role, and station for {staff.full_name}.
            </p>
          </div>
          <button onClick={onClose} style={{ color: '#8e8e93', padding: '4px' }}>
            <XIcon size={18} color="currentColor" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Role Access Scope Info Pill */}
          <div style={{
            padding: '10px 14px',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.75rem',
            backgroundColor: isDashboardRole ? 'rgba(255, 107, 0, 0.08)' : 'rgba(255, 255, 255, 0.03)',
            border: isDashboardRole ? '1px solid rgba(255, 107, 0, 0.2)' : '1px solid rgba(255, 255, 255, 0.08)',
            color: isDashboardRole ? 'var(--color-accent-orange)' : '#8e8e93'
          }}>
            {isDashboardRole ? (
              <span>🔑 <strong>Dashboard User:</strong> This role logs into the receptionist portal.</span>
            ) : (
              <span>📋 <strong>Clinic Roster Record:</strong> Roster file for bookings & clinic operations (no portal login required).</span>
            )}
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Full Name</label>
            <input
              type="text"
              className="form-control-glass"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">
              {isDashboardRole ? 'Email (System Login Username)' : 'Email Address'}
            </label>
            <input
              type="email"
              className="form-control-glass"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          {/* Role Selector with Custom Role Creation */}
          <div style={{ display: 'grid', gridTemplateColumns: roleSelect === 'custom' ? '1fr 1fr' : '1fr 1fr', gap: '12px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Role</label>
              <select
                className="form-control-glass"
                value={roleSelect}
                onChange={(e) => setRoleSelect(e.target.value)}
              >
                <option value="doctor">Doctor / Specialist</option>
                <option value="receptionist">Receptionist</option>
                <option value="clinic_admin">Administrator</option>
                <option value="nurse">Nurse / Assistant</option>
                <option value="cleaner">Cleaner / Hygiene</option>
                <option value="custom">+ Create Custom Role...</option>
              </select>
            </div>

            {roleSelect === 'custom' ? (
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Custom Role Name</label>
                <input
                  type="text"
                  className="form-control-glass"
                  placeholder="e.g. Dental Hygienist"
                  value={customRoleName}
                  onChange={(e) => setCustomRoleName(e.target.value)}
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
                  value={desk}
                  onChange={(e) => setDesk(e.target.value)}
                />
              </div>
            )}
          </div>

          {/* If custom role was selected, show station below */}
          {roleSelect === 'custom' && (
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Station / Room / Department</label>
              <input
                type="text"
                className="form-control-glass"
                placeholder="e.g. Clinic Bay, Floor 1"
                value={desk}
                onChange={(e) => setDesk(e.target.value)}
              />
            </div>
          )}

          {/* Specialty field for doctors */}
          {isDoctorRole && (
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Medical Specialty</label>
              <input
                type="text"
                className="form-control-glass"
                placeholder="e.g. Orthodontics Specialist, Oral Surgeon"
                value={specialty}
                onChange={(e) => setSpecialty(e.target.value)}
              />
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Phone Number</label>
              <input
                type="tel"
                className="form-control-glass"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Shift Schedule</label>
              <input
                type="text"
                className="form-control-glass"
                placeholder="e.g. Morning (08:00 - 14:00)"
                value={shift}
                onChange={(e) => setShift(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Live Duty Status</label>
            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              {[
                { id: 'on_duty', label: '🟢 On Duty' },
                { id: 'on_break', label: '🟡 On Break' },
                { id: 'on_leave', label: '🔴 On Leave' }
              ].map(opt => (
                <button
                  type="button"
                  key={opt.id}
                  onClick={() => setDutyStatus(opt.id)}
                  className="btn-pill"
                  style={{
                    flex: 1,
                    padding: '6px 8px',
                    fontSize: '0.75rem',
                    fontWeight: dutyStatus === opt.id ? '700' : '500',
                    backgroundColor: dutyStatus === opt.id ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                    border: dutyStatus === opt.id ? '1px solid rgba(255, 255, 255, 0.3)' : '1px solid rgba(255, 255, 255, 0.06)',
                    color: dutyStatus === opt.id ? '#ffffff' : '#8e8e93'
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
            <button type="button" onClick={onClose} className="btn-pill btn-pill-glass">
              Cancel
            </button>
            <button type="submit" className="btn-pill btn-pill-orange">
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
