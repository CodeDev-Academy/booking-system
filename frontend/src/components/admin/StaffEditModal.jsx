import React, { useState, useEffect } from 'react';
import {
  X,
  User,
  Mail,
  ShieldCheck,
  Clock,
  KeyRound,
  Lock,
  Eye,
  EyeOff,
  Power,
  PowerOff,
  CheckCircle2,
  Stethoscope,
  Briefcase,
  Save,
  Check,
} from 'lucide-react';
import { soundService } from '../../services/soundService';
import {
  useSettingsStore,
  DEFAULT_STAFF_ROLES,
  DEFAULT_STAFF_SPECIALTIES,
} from '../../stores/useSettingsStore';

/**
 * StaffEditModal — Dedicated Staff Profile & Security Management Modal
 * Allows the Administrator to edit profile details, duty status, shift hours,
 * view/reveal and reset passwords (for receptionists), and manage Quick-PINs.
 */
export const StaffEditModal = ({
  isOpen,
  staff,
  onClose,
  onUpdateStaff,
  onToggleActive,
}) => {
  const {
    staffRoles = DEFAULT_STAFF_ROLES,
    staffSpecialties = DEFAULT_STAFF_SPECIALTIES,
    addStaffRole,
    removeStaffRole,
    addStaffSpecialty,
    removeStaffSpecialty,
  } = useSettingsStore();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('Receptionist');
  const [specialty, setSpecialty] = useState('');
  const [shift, setShift] = useState('');
  const [status, setStatus] = useState('on_duty');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pin, setPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newRoleInput, setNewRoleInput] = useState('');
  const [newSpecialtyInput, setNewSpecialtyInput] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [isEditingPassword, setIsEditingPassword] = useState(false);
  const [isEditingPin, setIsEditingPin] = useState(false);
  const [feedback, setFeedback] = useState({ tone: '', text: '' });

  useEffect(() => {
    if (staff) {
      setName(staff.name || '');
      setEmail(staff.email || '');
      setRole(staff.roleLabel || (staff.role === 'doctor' ? 'Doctor' : 'Receptionist'));
      setSpecialty(staff.specialty || '');
      setShift(staff.shift || '');
      setStatus(staff.status || 'on_duty');
      setPassword(staff.password || 'password123');
      setPin(staff.pin || '1234');
      setNewPassword('');
      setNewPin('');
      setNewRoleInput('');
      setNewSpecialtyInput('');
      setIsEditingPassword(false);
      setIsEditingPin(false);
      setShowPassword(false);
      setShowPin(false);
      setFeedback({ tone: '', text: '' });
    }
  }, [staff]);

  if (!isOpen || !staff) return null;

  const isDoctor = staff.role === 'doctor';

  // Direct 1-Click Password Reset
  const handleApplyNewPassword = () => {
    if (!newPassword.trim() || newPassword.trim().length < 6) {
      setFeedback({ tone: 'error', text: 'Password must be at least 6 characters.' });
      return;
    }
    const updatedPwd = newPassword.trim();
    setPassword(updatedPwd);
    onUpdateStaff({ ...staff, name, email, specialty, shift, status, password: updatedPwd });
    setIsEditingPassword(false);
    setNewPassword('');
    setFeedback({ tone: 'success', text: `Password for ${staff.name} has been updated successfully!` });
    soundService.playChime();
  };

  // Direct 1-Click PIN Reset
  const handleApplyNewPin = () => {
    if (!/^\d{4}$/.test(newPin.trim())) {
      setFeedback({ tone: 'error', text: 'Screen PIN must be exactly 4 digits.' });
      return;
    }
    const updatedPin = newPin.trim();
    setPin(updatedPin);
    onUpdateStaff({ ...staff, name, email, specialty, shift, status, pin: updatedPin });
    setIsEditingPin(false);
    setNewPin('');
    setFeedback({ tone: 'success', text: `4-Digit Quick-PIN for ${staff.name} updated to ${updatedPin}!` });
    soundService.playChime();
  };

  const handleSaveAll = (e) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      setFeedback({ tone: 'error', text: 'Name and email are required.' });
      return;
    }

    const updatedData = {
      ...staff,
      name: name.trim(),
      email: email.trim(),
      role: isDoctor ? 'doctor' : role.toLowerCase(),
      roleLabel: role,
      specialty: specialty.trim(),
      shift: shift.trim(),
      status,
      password,
      pin,
    };

    onUpdateStaff(updatedData);
    onClose();
  };

  return (
    <div className="calendar-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="calendar-modal-surface"
        onClick={(e) => e.stopPropagation()}
        style={{ width: '520px', maxWidth: '95vw', padding: '20px' }}
      >
        {/* Modal Header */}
        <div className="calendar-modal-header" style={{ marginBottom: '6px' }}>
          <div className="modal-title-row">
            <span className={`badge-pill ${isDoctor ? 'badge-primary' : 'badge-neutral'} mono-tag`}>
              {isDoctor ? 'CLINICAL PRACTITIONER' : 'RECEPTION STAFF'}
            </span>
            <h2 className="modal-title" style={{ fontSize: '16px', fontWeight: 600 }}>
              {staff.name} — Profile &amp; Access Controls
            </h2>
          </div>
          <button
            type="button"
            className="icon-btn-close"
            onClick={onClose}
            aria-label="Close Staff Edit Modal"
          >
            <X size={18} />
          </button>
        </div>

        <p className="modal-subtitle" style={{ fontSize: '12px', color: 'var(--text-3)', marginBottom: '14px' }}>
          Edit department, shift hours, duty availability, login password, and workstation screen PIN.
        </p>

        {/* Dynamic Feedback Banner */}
        {feedback.text && (
          <div
            style={{
              padding: '8px 12px',
              borderRadius: '6px',
              marginBottom: '12px',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: feedback.tone === 'success' ? 'rgba(50, 200, 80, 0.1)' : 'rgba(255, 79, 121, 0.1)',
              color: feedback.tone === 'success' ? '#32c850' : 'var(--rose)',
              border: feedback.tone === 'success' ? '1px solid rgba(50, 200, 80, 0.3)' : '1px solid rgba(255, 79, 121, 0.3)',
            }}
          >
            {feedback.tone === 'success' ? <CheckCircle2 size={14} /> : <X size={14} />}
            <span>{feedback.text}</span>
          </div>
        )}

        <form onSubmit={handleSaveAll} className="walk-in-form" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Identity Header Strip */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 12px',
              background: 'var(--surface-2)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--line)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  background: isDoctor ? 'rgba(8, 145, 178, 0.15)' : 'rgba(255, 181, 71, 0.15)',
                  color: isDoctor ? 'var(--color-primary-cyan, #0891b2)' : 'var(--amber)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '13px',
                }}
              >
                {staff.avatar || staff.name.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text)' }}>
                  {staff.name}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-3)' }}>
                  {isDoctor ? 'Clinical Doctor' : 'Front-Desk Receptionist'} &bull;{' '}
                  <span style={{ color: staff.isActive ? 'var(--success-text)' : 'var(--danger-text)' }}>
                    {staff.isActive ? 'Active Account' : 'Deactivated'}
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              className={`btn-base ${staff.isActive ? 'btn-danger' : 'btn-success'}`}
              style={{ padding: '4px 10px', fontSize: '11px' }}
              onClick={() => onToggleActive(staff.id)}
            >
              {staff.isActive ? <PowerOff size={11} /> : <Power size={11} />}
              <span>{staff.isActive ? 'Deactivate' : 'Reactivate'}</span>
            </button>
          </div>

          {/* Form Fields: Name & Email */}
          <div className="form-group-row" style={{ display: 'flex', gap: '10px' }}>
            <div className="form-field flex-1">
              <label className="field-label" style={{ fontSize: '11px' }}>Full Name *</label>
              <input
                type="text"
                className="input-base"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="form-field flex-1">
              <label className="field-label" style={{ fontSize: '11px' }}>Staff Email *</label>
              <input
                type="email"
                className="input-base"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Role Pill Selector */}
          {!isDoctor && (
            <div className="form-field">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                <label className="field-label" style={{ fontSize: '11px', marginBottom: 0 }}>
                  <Briefcase size={12} color="var(--text-3)" />
                  <span>Workstation Role / Duty Pill</span>
                </label>
                <span style={{ fontSize: '10px', color: 'var(--text-3)' }}>
                  Active: <strong style={{ color: 'var(--amber)' }}>{role}</strong>
                </span>
              </div>

              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '6px 8px',
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  minHeight: '38px',
                }}
              >
                {staffRoles.map((r) => {
                  const isSelected = role.toLowerCase() === r.toLowerCase();
                  return (
                    <span
                      key={r}
                      onClick={() => setRole(r)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: isSelected ? 600 : 500,
                        cursor: 'pointer',
                        border: isSelected ? '1px solid var(--amber)' : '1px solid var(--border)',
                        background: isSelected ? 'rgba(255, 181, 71, 0.15)' : 'var(--surface-1)',
                        color: isSelected ? 'var(--amber-text)' : 'var(--text)',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <span>{r}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeStaffRole(r);
                          if (role.toLowerCase() === r.toLowerCase()) {
                            setRole('Receptionist');
                          }
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--text-3)',
                          padding: '0 2px',
                          fontSize: '12px',
                          lineHeight: 1,
                        }}
                        title={`Remove ${r}`}
                      >
                        &times;
                      </button>
                    </span>
                  );
                })}

                <input
                  type="text"
                  placeholder="+ Add (Enter)"
                  value={newRoleInput}
                  onChange={(e) => setNewRoleInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (newRoleInput.trim()) {
                        addStaffRole(newRoleInput.trim());
                        setRole(newRoleInput.trim());
                        setNewRoleInput('');
                      }
                    }
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    color: 'var(--text)',
                    fontSize: '11px',
                    padding: '2px 4px',
                    minWidth: '80px',
                    flex: 1,
                  }}
                />
              </div>
            </div>
          )}

          {/* Specialty / Department Tag Pills */}
          <div className="form-field">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <label className="field-label" style={{ fontSize: '11px', marginBottom: 0 }}>
                <Stethoscope size={12} color="var(--text-3)" />
                <span>Specialty / Department</span>
              </label>
              <span style={{ fontSize: '10px', color: 'var(--text-3)' }}>
                Active: <strong style={{ color: 'var(--color-primary-cyan, #0891b2)' }}>{specialty || 'General Practice'}</strong>
              </span>
            </div>

            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 8px',
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                minHeight: '38px',
                marginBottom: '6px',
              }}
            >
              {staffSpecialties.map((s) => {
                const isSelected = specialty.toLowerCase() === s.toLowerCase();
                return (
                  <span
                    key={s}
                    onClick={() => setSpecialty(s)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '3px 8px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: isSelected ? 600 : 500,
                      cursor: 'pointer',
                      border: isSelected ? '1px solid var(--color-primary-cyan, #0891b2)' : '1px solid var(--border)',
                      background: isSelected ? 'rgba(8, 145, 178, 0.15)' : 'var(--surface-1)',
                      color: isSelected ? 'var(--color-primary-cyan, #0891b2)' : 'var(--text)',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <span>{s}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeStaffSpecialty(s);
                        if (specialty.toLowerCase() === s.toLowerCase()) {
                          setSpecialty('');
                        }
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--text-3)',
                        padding: '0 2px',
                        fontSize: '12px',
                        lineHeight: 1,
                      }}
                      title={`Remove ${s}`}
                    >
                      &times;
                    </button>
                  </span>
                );
              })}

              <input
                type="text"
                placeholder="+ Add (Enter)"
                value={newSpecialtyInput}
                onChange={(e) => setNewSpecialtyInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (newSpecialtyInput.trim()) {
                      addStaffSpecialty(newSpecialtyInput.trim());
                      setSpecialty(newSpecialtyInput.trim());
                      setNewSpecialtyInput('');
                    }
                  }
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--text)',
                  fontSize: '11px',
                  padding: '2px 4px',
                  minWidth: '90px',
                  flex: 1,
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <input
                type="text"
                className="input-base"
                placeholder="Or type custom department..."
                value={specialty}
                onChange={(e) => setSpecialty(e.target.value)}
                style={{ fontSize: '12px', padding: '6px 10px', flex: 1 }}
              />

              <div style={{ flex: 1 }}>
                <input
                  type="text"
                  className="input-base"
                  placeholder="Shift (e.g. 08:00 – 16:00)"
                  value={shift}
                  onChange={(e) => setShift(e.target.value)}
                  style={{ fontSize: '12px', padding: '6px 10px', width: '100%' }}
                />
              </div>
            </div>
          </div>

          {/* Duty Status */}
          <div className="form-field">
            <label className="field-label" style={{ fontSize: '11px' }}>Current Duty Status</label>
            <select
              className="select-base"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              disabled={!staff.isActive}
            >
              <option value="on_duty">🟢 On Active Duty (Taking Patients / Appointments)</option>
              <option value="on_break">🟡 On Break / Meal Interval</option>
              <option value="on_leave">🔴 On Leave / Off Shift</option>
            </select>
          </div>

          {/* Credentials Section for Receptionists */}
          {!isDoctor ? (
            <div
              style={{
                marginTop: '4px',
                padding: '12px',
                background: 'var(--surface-2)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--line)',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Lock size={13} color="var(--amber)" />
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
                    Workstation Login Password &amp; Screen PIN
                  </span>
                </div>
                <span className="badge-pill badge-neutral mono-tag" style={{ fontSize: '9px' }}>
                  ADMIN ACCESS
                </span>
              </div>

              {/* 1. Login Master Password Card */}
              <div
                style={{
                  padding: '8px 10px',
                  background: 'var(--surface-1)',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-2)' }}>
                    Login Master Password:
                  </span>
                  {!isEditingPassword ? (
                    <button
                      type="button"
                      className="btn-base btn-secondary btn-sm"
                      onClick={() => {
                        setIsEditingPassword(true);
                        setNewPassword('');
                      }}
                      style={{ fontSize: '10px', padding: '2px 8px' }}
                    >
                      Reset Password
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn-base btn-ghost-sm"
                      onClick={() => setIsEditingPassword(false)}
                      style={{ fontSize: '10px', padding: '2px 8px' }}
                    >
                      Cancel
                    </button>
                  )}
                </div>

                {!isEditingPassword ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontSize: '13px',
                        letterSpacing: showPassword ? '0.5px' : '2px',
                        color: showPassword ? 'var(--text)' : 'var(--text-3)',
                        fontWeight: 600,
                      }}
                    >
                      {showPassword ? password : '••••••••••••'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}
                      title={showPassword ? 'Hide password' : 'View password'}
                      aria-label="Toggle password visibility"
                    >
                      {showPassword ? <EyeOff size={14} /> : <Eye size={14} color="var(--amber)" />}
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                    <input
                      type="text"
                      className="input-base"
                      placeholder="Enter new password (min. 6 chars)"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      style={{ fontSize: '12px', padding: '6px 10px' }}
                      autoFocus
                    />
                    <button
                      type="button"
                      className="btn-base btn-primary btn-sm"
                      onClick={handleApplyNewPassword}
                      style={{ fontSize: '11px', whiteSpace: 'nowrap' }}
                    >
                      Save Password
                    </button>
                  </div>
                )}
              </div>

              {/* 2. Quick-PIN Card */}
              <div
                style={{
                  padding: '8px 10px',
                  background: 'var(--surface-1)',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-2)' }}>
                    4-Digit Screen Privacy PIN:
                  </span>
                  {!isEditingPin ? (
                    <button
                      type="button"
                      className="btn-base btn-secondary btn-sm"
                      onClick={() => {
                        setIsEditingPin(true);
                        setNewPin('');
                      }}
                      style={{ fontSize: '10px', padding: '2px 8px' }}
                    >
                      Reset PIN
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn-base btn-ghost-sm"
                      onClick={() => setIsEditingPin(false)}
                      style={{ fontSize: '10px', padding: '2px 8px' }}
                    >
                      Cancel
                    </button>
                  )}
                </div>

                {!isEditingPin ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontSize: '13px',
                        letterSpacing: showPin ? '2px' : '3px',
                        color: showPin ? 'var(--amber-text)' : 'var(--text-3)',
                        fontWeight: 700,
                      }}
                    >
                      {showPin ? pin : '••••'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowPin(!showPin)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}
                      title={showPin ? 'Hide PIN' : 'View PIN'}
                      aria-label="Toggle PIN visibility"
                    >
                      {showPin ? <EyeOff size={14} /> : <Eye size={14} color="var(--amber)" />}
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                    <input
                      type="password"
                      maxLength={4}
                      pattern="[0-9]*"
                      inputMode="numeric"
                      className="input-base tabular-nums"
                      placeholder="e.g. 1234"
                      value={newPin}
                      onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      style={{ fontSize: '12px', padding: '6px 10px' }}
                      autoFocus
                    />
                    <button
                      type="button"
                      className="btn-base btn-primary btn-sm"
                      onClick={handleApplyNewPin}
                      style={{ fontSize: '11px', whiteSpace: 'nowrap' }}
                    >
                      Save PIN
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div
              style={{
                marginTop: '4px',
                padding: '10px 12px',
                background: 'var(--surface-2)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--line)',
                fontSize: '11px',
                color: 'var(--text-2)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <CheckCircle2 size={16} color="var(--color-primary-cyan, #0891b2)" style={{ flexShrink: 0 }} />
              <span>
                <strong>Clinical Doctor:</strong> Belongs to the medical scheduling roster.
                Doctors do not require workstation passwords or dashboard logins.
              </span>
            </div>
          )}

          {/* Modal Actions */}
          <div className="modal-actions-row" style={{ marginTop: '12px' }}>
            <button type="button" className="btn-base btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-base btn-primary">
              <Save size={13} />
              <span>Save Staff Profile</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
