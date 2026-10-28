import React, { useState } from 'react';
import {
  X,
  UserPlus,
  User,
  Phone,
  Stethoscope,
  Clock,
  FileText,
  CheckCircle2,
  Sparkles,
  Calendar,
  AlertTriangle,
} from 'lucide-react';
import { DOCTORS, SERVICES } from '../../services/mockData';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { getAllDoctors } from '../../services/slotEngine';

export const WalkInCheckInModal = ({ isOpen, onClose, onCheckIn }) => {
  if (!isOpen) return null;

  // Reactively subscribe to dynamic services in Clinic Settings
  const storeServices = useSettingsStore((s) => s.services?.filter((srv) => srv.isActive !== false));
  const availableServices = storeServices && storeServices.length > 0 ? storeServices : SERVICES;
  const availableDoctors = getAllDoctors();

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    patientType: 'new',
    doctorId: availableDoctors[0]?.id || 'doc-bello',
    serviceId: availableServices[0]?.id || 'svc-dental',
    gender: 'Female',
    dateOfBirth: '',
    isEmergency: false,
    notes: '',
  });

  const handleQuickDemoFill = () => {
    setFormData({
      name: 'Ibrahim Danjuma',
      phone: '0803 445 1199',
      patientType: 'new',
      doctorId: 'doc-bello',
      serviceId: availableServices[0]?.id || 'svc-dental',
      gender: 'Male',
      dateOfBirth: '1988-04-12',
      isEmergency: false,
      notes: 'Walk-in arrival with acute dental discomfort.',
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    onCheckIn(
      formData.name.trim(),
      formData.phone.trim() || '+234 800 000 0000',
      formData.doctorId,
      formData.serviceId,
      formData.patientType,
      formData.notes.trim(),
      {
        dateOfBirth: formData.dateOfBirth || null,
        gender: formData.gender,
        isEmergency: formData.isEmergency,
      }
    );

    onClose();
  };

  return (
    <div className="calendar-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="calendar-modal-surface"
        style={{ maxWidth: '500px', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="calendar-modal-header" style={{ marginBottom: '14px' }}>
          <div className="modal-title-row">
            <UserPlus size={18} color="var(--amber)" />
            <span className="modal-title" style={{ fontSize: '16px' }}>
              Walk-In Patient Check-In
            </span>
          </div>
          <button
            type="button"
            className="icon-btn-close"
            onClick={onClose}
            aria-label="Close Walk-In Modal"
          >
            <X size={18} />
          </button>
        </div>

        <p style={{ fontSize: '12px', color: 'var(--text-3)', margin: '0 0 14px 0', lineHeight: 1.4 }}>
          Register an unscheduled patient arriving at the clinic reception. They will be immediately admitted to the Waiting Room and assigned an on-duty clinician.
        </p>

        {/* Urgent Emergency Toggle Banner */}
        <div
          onClick={() => setFormData({ ...formData, isEmergency: !formData.isEmergency })}
          style={{
            padding: '10px 12px',
            borderRadius: 'var(--radius-md)',
            border: formData.isEmergency ? '1px solid var(--rose)' : '1px solid var(--border)',
            background: formData.isEmergency ? 'rgba(255, 79, 121, 0.12)' : 'var(--surface-2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            marginBottom: '4px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={15} color={formData.isEmergency ? 'var(--rose)' : 'var(--text-3)'} />
            <span style={{ fontSize: '12px', fontWeight: 600, color: formData.isEmergency ? 'var(--rose)' : 'var(--text-2)' }}>
              Urgent / Emergency Medical Triage
            </span>
          </div>
          <span
            className={`badge-pill ${formData.isEmergency ? 'badge-danger' : 'badge-neutral'} mono-tag`}
            style={{ fontSize: '10px' }}
          >
            {formData.isEmergency ? 'PRIORITY' : 'ROUTINE'}
          </span>
        </div>

        {/* Registration Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Patient Full Name */}
          <div>
            <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-3)', marginBottom: '4px' }}>
              Patient Full Name *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Ibrahim Danjuma"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="input-base"
              style={{ width: '100%' }}
            />
          </div>

          {/* Phone Number & Patient Status */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', width: '100%' }}>
            <div style={{ minWidth: 0 }}>
              <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-3)', marginBottom: '4px' }}>
                Phone Number (e.g. 080...)
              </label>
              <input
                type="text"
                placeholder="0803 000 0000"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="input-base tabular-nums"
                style={{ width: '100%' }}
              />
            </div>

            <div style={{ minWidth: 0 }}>
              <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-3)', marginBottom: '4px' }}>
                Patient Status
              </label>
              <select
                value={formData.patientType}
                onChange={(e) => setFormData({ ...formData, patientType: e.target.value })}
                className="select-base"
                style={{ width: '100%' }}
              >
                <option value="new">New Patient</option>
                <option value="returning">Returning Patient</option>
              </select>
            </div>
          </div>

          {/* Gender & Date of Birth */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', width: '100%' }}>
            <div style={{ minWidth: 0 }}>
              <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-3)', marginBottom: '4px' }}>
                Gender
              </label>
              <div style={{ display: 'flex', gap: '6px' }}>
                {['Male', 'Female', 'Other'].map((g) => {
                  const isSel = formData.gender.toLowerCase() === g.toLowerCase();
                  return (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setFormData({ ...formData, gender: g })}
                      style={{
                        flex: 1,
                        padding: '6px 8px',
                        fontSize: '11px',
                        fontWeight: 600,
                        borderRadius: '6px',
                        border: isSel ? '1px solid var(--amber)' : '1px solid var(--border)',
                        background: isSel ? 'rgba(255, 181, 71, 0.15)' : 'var(--surface-2)',
                        color: isSel ? 'var(--amber-text)' : 'var(--text-2)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {g}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ minWidth: 0 }}>
              <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-3)', marginBottom: '4px' }}>
                Date of Birth (Optional)
              </label>
              <input
                type="date"
                value={formData.dateOfBirth}
                onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                className="input-base tabular-nums"
                style={{ width: '100%' }}
              />
            </div>
          </div>

          {/* Doctor & Service */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', width: '100%' }}>
            <div style={{ minWidth: 0 }}>
              <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-3)', marginBottom: '4px' }}>
                Assigned Doctor
              </label>
              <select
                value={formData.doctorId}
                onChange={(e) => setFormData({ ...formData, doctorId: e.target.value })}
                className="select-base"
                style={{ width: '100%' }}
              >
                {availableDoctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.specialty})
                  </option>
                ))}
              </select>
            </div>

            <div style={{ minWidth: 0 }}>
              <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-3)', marginBottom: '4px' }}>
                Clinical Service Needed
              </label>
              <select
                value={formData.serviceId}
                onChange={(e) => setFormData({ ...formData, serviceId: e.target.value })}
                className="select-base"
                style={{ width: '100%' }}
              >
                {availableServices.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.durationMin}m)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Initial Complaint / Triage Note */}
          <div>
            <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-3)', marginBottom: '4px' }}>
              Reception Triage Note (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Acute toothache, swelling since morning"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="input-base"
              style={{ width: '100%' }}
            />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '10px' }}>
            <button
              type="button"
              className="btn-base btn-secondary btn-sm"
              onClick={handleQuickDemoFill}
              style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px' }}
              title="Populate demo data instantly"
            >
              <Sparkles size={12} color="var(--amber)" />
              <span>Quick Demo Fill</span>
            </button>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" className="btn-base btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn-base btn-primary">
                <CheckCircle2 size={14} />
                <span>Admit to Waiting Room</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
