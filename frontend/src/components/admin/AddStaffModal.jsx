import React, { useState } from 'react';
import {
  X,
  UserPlus,
  Mail,
  Clock,
  KeyRound,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  Stethoscope,
  Briefcase,
  Plus,
} from 'lucide-react';
import {
  useSettingsStore,
  DEFAULT_STAFF_ROLES,
  DEFAULT_STAFF_SPECIALTIES,
} from '../../stores/useSettingsStore';

export const AddStaffModal = ({
  isOpen,
  onClose,
  onAddStaff,
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
  const [specialty, setSpecialty] = useState('Triage & Verification');
  const [shift, setShift] = useState('08:00 – 16:00 WAT');
  const [password, setPassword] = useState('password123');
  const [pin, setPin] = useState('1234');
  const [showPassword, setShowPassword] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [newRoleInput, setNewRoleInput] = useState('');
  const [newSpecialtyInput, setNewSpecialtyInput] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const isDoctor =
    role.toLowerCase().includes('doctor') ||
    role.toLowerCase().includes('physician') ||
    role.toLowerCase() === 'doc';

  const handleAddNewRole = () => {
    const trimmed = newRoleInput.trim();
    if (trimmed) {
      addStaffRole(trimmed);
      setRole(trimmed);
      setNewRoleInput('');
    }
  };

  const handleAddNewSpecialty = () => {
    const trimmed = newSpecialtyInput.trim();
    if (trimmed) {
      addStaffSpecialty(trimmed);
      setSpecialty(trimmed);
      setNewSpecialtyInput('');
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      setError('Name and email are required.');
      return;
    }

    if (!isDoctor) {
      if (!password.trim() || password.trim().length < 6) {
        setError('Password must be at least 6 characters.');
        return;
      }
      if (!/^\d{4}$/.test(pin)) {
        setError('PIN must be exactly 4 numeric digits.');
        return;
      }
    }

    setError('');
    onAddStaff({
      name: name.trim(),
      email: email.trim(),
      role: isDoctor ? 'doctor' : role.toLowerCase(),
      roleLabel: role,
      specialty: specialty.trim() || (isDoctor ? 'General Practice' : 'Reception Triage'),
      shift,
      password: !isDoctor ? password.trim() : undefined,
      pin: !isDoctor ? pin.trim() : undefined,
    });
  };

  return (
    <div className="calendar-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="calendar-modal-surface"
        onClick={(e) => e.stopPropagation()}
        style={{ width: '540px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto' }}
      >
        <div className="calendar-modal-header">
          <div className="modal-title-row">
            <span className="badge-pill badge-primary mono-tag">TEAM ENROLLMENT</span>
            <h2 className="modal-title">Add Clinic Staff Member</h2>
          </div>
          <button
            type="button"
            className="icon-btn-close"
            onClick={onClose}
            aria-label="Close Add Staff Modal"
          >
            <X size={18} />
          </button>
        </div>

        <p className="modal-subtitle">
          Enrolls a clinician or front-desk receptionist into the clinic system with assigned shift hours and duties.
        </p>

        {error && (
          <div className="modal-error-banner">
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="walk-in-form" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Full Name & Email */}
          <div className="form-group-row" style={{ display: 'flex', gap: '10px' }}>
            <div className="form-field flex-1">
              <label className="field-label">
                <span>Full Name *</span>
              </label>
              <input
                type="text"
                className="input-base"
                placeholder={isDoctor ? 'e.g. Dr. Emeka Nwosu' : 'e.g. Amina Garba'}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                required
              />
            </div>

            <div className="form-field flex-1">
              <label className="field-label">
                <Mail size={13} color="var(--text-3)" />
                <span>Email Address *</span>
              </label>
              <input
                type="email"
                className="input-base"
                placeholder="staff.member@cedarcare.ng"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Interactive Role Selection Pills */}
          <div className="form-field">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <label className="field-label" style={{ marginBottom: 0 }}>
                <Briefcase size={13} color="var(--text-3)" />
                <span>Staff Role / Position *</span>
              </label>
              <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>
                Selected: <strong style={{ color: 'var(--amber)' }}>{role}</strong>
              </span>
            </div>

            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 10px',
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                minHeight: '42px',
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
                      gap: '5px',
                      padding: '4px 9px',
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
                        display: 'flex',
                        alignItems: 'center',
                      }}
                      title={`Remove ${r} role`}
                      aria-label={`Remove ${r}`}
                    >
                      &times;
                    </button>
                  </span>
                );
              })}

              <div style={{ display: 'inline-flex', alignItems: 'center', flex: 1, minWidth: '130px' }}>
                <input
                  type="text"
                  placeholder="+ Add Role (Enter)"
                  value={newRoleInput}
                  onChange={(e) => setNewRoleInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddNewRole();
                    }
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    color: 'var(--text)',
                    fontSize: '11px',
                    padding: '3px 6px',
                    width: '100%',
                  }}
                />
              </div>
            </div>
          </div>

          {/* Interactive Specialty / Department Selection Pills */}
          <div className="form-field">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <label className="field-label" style={{ marginBottom: 0 }}>
                <Stethoscope size={13} color="var(--text-3)" />
                <span>Specialty / Department</span>
              </label>
              <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>
                Selected: <strong style={{ color: 'var(--color-primary-cyan, #0891b2)' }}>{specialty || 'None'}</strong>
              </span>
            </div>

            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 10px',
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                minHeight: '42px',
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
                      gap: '5px',
                      padding: '4px 9px',
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
                        display: 'flex',
                        alignItems: 'center',
                      }}
                      title={`Remove ${s} specialty`}
                      aria-label={`Remove ${s}`}
                    >
                      &times;
                    </button>
                  </span>
                );
              })}

              <div style={{ display: 'inline-flex', alignItems: 'center', flex: 1, minWidth: '140px' }}>
                <input
                  type="text"
                  placeholder="+ Add Specialty (Enter)"
                  value={newSpecialtyInput}
                  onChange={(e) => setNewSpecialtyInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddNewSpecialty();
                    }
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    color: 'var(--text)',
                    fontSize: '11px',
                    padding: '3px 6px',
                    width: '100%',
                  }}
                />
              </div>
            </div>
          </div>

          {/* Working Shift */}
          <div className="form-field">
            <label className="field-label">
              <Clock size={13} color="var(--text-3)" />
              <span>Working Shift Hours</span>
            </label>
            <input
              type="text"
              className="input-base"
              value={shift}
              onChange={(e) => setShift(e.target.value)}
              placeholder="e.g. 08:00 – 16:00 WAT"
            />
          </div>

          {/* Credentials Section for Receptionists vs Doctor info banner */}
          {!isDoctor ? (
            <div
              style={{
                marginTop: '6px',
                padding: '12px 14px',
                background: 'var(--surface-2)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--line)',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Lock size={13} color="var(--amber)" />
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
                  Workstation Credentials ({role})
                </span>
              </div>

              {/* Password */}
              <div className="form-field">
                <label className="field-label" style={{ fontSize: '11px' }}>
                  <span>Initial Master Password (min. 6 chars) *</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="input-base"
                    placeholder="Set initial password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    style={{ paddingRight: '36px' }}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-3)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                    title={showPassword ? 'Hide password' : 'View password'}
                  >
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} color="var(--amber)" />}
                  </button>
                </div>
              </div>

              {/* 4-digit PIN with Eye Toggle */}
              <div className="form-field">
                <label className="field-label" style={{ fontSize: '11px' }}>
                  <KeyRound size={12} color="var(--amber)" />
                  <span>Initial 4-Digit Quick-PIN *</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPin ? 'text' : 'password'}
                    maxLength={4}
                    pattern="[0-9]*"
                    inputMode="numeric"
                    className="input-base tabular-nums"
                    placeholder="e.g. 1234"
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    style={{ paddingRight: '36px' }}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPin(!showPin)}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-3)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                    title={showPin ? 'Hide PIN' : 'View PIN'}
                    aria-label="Toggle PIN visibility"
                  >
                    {showPin ? <EyeOff size={14} /> : <Eye size={14} color="var(--amber)" />}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div
              style={{
                marginTop: '6px',
                padding: '12px 14px',
                background: 'var(--surface-2)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--line)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '12px',
                color: 'var(--text-2)',
              }}
            >
              <CheckCircle2 size={16} color="var(--color-primary-cyan, #0891b2)" style={{ flexShrink: 0 }} />
              <span>
                <strong>Clinical Doctor:</strong> Doctors are medical resources scheduled for patient consultations. They do not require workstation passwords or dashboard logins.
              </span>
            </div>
          )}

          <div className="modal-actions-row" style={{ marginTop: '14px' }}>
            <button type="button" className="btn-base btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-base btn-primary">
              <UserPlus size={14} />
              <span>Enroll Staff Member</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
