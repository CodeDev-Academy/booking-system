import React from 'react';
import { CheckCircleIcon } from '../common/Icons';

export const ClinicSettingsModule = ({ controller, chimeEnabled, setChimeEnabled, onTestChime }) => {
  const {
    formData,
    saveSuccess,
    toggleDay,
    updateField,
    saveSettings
  } = controller;

  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const handleSubmit = (e) => {
    e.preventDefault();
    saveSettings();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '14px'
      }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', color: '#ffffff', margin: 0 }}>Clinic Settings & Rules</h2>
          <p style={{ fontSize: '0.8125rem', color: '#8e8e93', margin: 0, marginTop: '2px' }}>
            Operating hours, booking rules, and notification preferences.
          </p>
        </div>

        {saveSuccess && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: 'rgba(118, 226, 67, 0.15)',
            color: 'var(--color-accent-green)',
            padding: '6px 14px',
            borderRadius: 'var(--radius-pill)',
            fontSize: '0.8125rem',
            fontWeight: '600',
            border: '1px solid rgba(118, 226, 67, 0.3)'
          }}>
            <CheckCircleIcon size={14} color="var(--color-accent-green)" />
            Settings saved!
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Notification Preferences (Moved here from header per feedback) */}
        <div className="glass-card" style={{ padding: '24px 28px' }}>
          <h3 style={{ fontSize: '1.0625rem', color: '#ffffff', marginBottom: '4px' }}>Desk Notifications</h3>
          <p style={{ fontSize: '0.75rem', color: '#8e8e93', marginBottom: '18px' }}>
            Alert preferences for the receptionist desk.
          </p>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
            <div>
              <div style={{ fontWeight: '600', color: '#ffffff', fontSize: '0.875rem' }}>
                New Request Sound Alert (Chime)
              </div>
              <div style={{ fontSize: '0.75rem', color: '#8e8e93', marginTop: '2px' }}>
                Plays a pleasant sound chime when a patient submits a new booking request.
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                type="button"
                onClick={() => {
                  setChimeEnabled(!chimeEnabled);
                  if (!chimeEnabled && onTestChime) onTestChime();
                }}
                className={`btn-pill ${chimeEnabled ? 'btn-pill-orange' : 'btn-pill-glass'}`}
                style={{ padding: '6px 16px' }}
              >
                {chimeEnabled ? '🔊 Sound Enabled' : '🔇 Muted'}
              </button>
            </div>
          </div>
        </div>

        {/* Clinic Profile */}
        <div className="glass-card" style={{ padding: '28px' }}>
          <h3 style={{ fontSize: '1.0625rem', color: '#ffffff', marginBottom: '4px' }}>Clinic Identity</h3>
          <p style={{ fontSize: '0.75rem', color: '#8e8e93', marginBottom: '20px' }}>
            Information shown to patients on messaging receipts.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Clinic Name</label>
              <input
                type="text"
                className="form-control-glass"
                value={formData.clinic_name}
                onChange={(e) => updateField('clinic_name', e.target.value)}
                required
              />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Tagline</label>
              <input
                type="text"
                className="form-control-glass"
                value={formData.tagline}
                onChange={(e) => updateField('tagline', e.target.value)}
              />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Phone</label>
              <input
                type="text"
                className="form-control-glass"
                value={formData.phone}
                onChange={(e) => updateField('phone', e.target.value)}
              />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Address</label>
              <input
                type="text"
                className="form-control-glass"
                value={formData.address}
                onChange={(e) => updateField('address', e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Operating Hours & Days */}
        <div className="glass-card" style={{ padding: '28px' }}>
          <h3 style={{ fontSize: '1.0625rem', color: '#ffffff', marginBottom: '4px' }}>Operating Hours</h3>
          <p style={{ fontSize: '0.75rem', color: '#8e8e93', marginBottom: '20px' }}>
            Defines slot boundary limits for the scheduling engine.
          </p>

          <div style={{ marginBottom: '18px' }}>
            <label className="form-label">Working Days:</label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
              {DAYS.map(day => {
                const isSelected = formData.working_days?.includes(day);
                return (
                  <button
                    type="button"
                    key={day}
                    onClick={() => toggleDay(day)}
                    className="btn-pill"
                    style={{
                      padding: '7px 14px',
                      fontSize: '0.75rem',
                      fontWeight: isSelected ? '700' : '500',
                      backgroundColor: isSelected ? '#ffffff' : 'rgba(255, 255, 255, 0.04)',
                      color: isSelected ? '#0c0d0e' : '#8e8e93',
                      border: isSelected ? 'none' : '1px solid rgba(255, 255, 255, 0.08)'
                    }}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Opening Time</label>
              <input
                type="time"
                className="form-control-glass"
                value={formData.open_time}
                onChange={(e) => updateField('open_time', e.target.value)}
              />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Closing Time</label>
              <input
                type="time"
                className="form-control-glass"
                value={formData.close_time}
                onChange={(e) => updateField('close_time', e.target.value)}
              />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Lunch Start</label>
              <input
                type="time"
                className="form-control-glass"
                value={formData.lunch_break_start}
                onChange={(e) => updateField('lunch_break_start', e.target.value)}
              />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Lunch End</label>
              <input
                type="time"
                className="form-control-glass"
                value={formData.lunch_break_end}
                onChange={(e) => updateField('lunch_break_end', e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Scheduling Rules */}
        <div className="glass-card" style={{ padding: '28px' }}>
          <h3 style={{ fontSize: '1.0625rem', color: '#ffffff', marginBottom: '4px' }}>Scheduling Rules & Buffers</h3>
          <p style={{ fontSize: '0.75rem', color: '#8e8e93', marginBottom: '20px' }}>
            Rules enforced when calculating candidate slots.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Offer Expiry (Minutes)</label>
              <input
                type="number"
                className="form-control-glass"
                value={formData.offer_expiry_minutes}
                onChange={(e) => updateField('offer_expiry_minutes', parseInt(e.target.value) || 60)}
              />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Hold Expiry (Minutes)</label>
              <input
                type="number"
                className="form-control-glass"
                value={formData.hold_expiry_minutes}
                onChange={(e) => updateField('hold_expiry_minutes', parseInt(e.target.value) || 15)}
              />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Buffer Between Visits (Minutes)</label>
              <input
                type="number"
                className="form-control-glass"
                value={formData.default_buffer_minutes}
                onChange={(e) => updateField('default_buffer_minutes', parseInt(e.target.value) || 10)}
              />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="submit" className="btn-pill btn-pill-orange" style={{ padding: '12px 28px', fontSize: '0.875rem' }}>
            Save Settings
          </button>
        </div>
      </form>
    </div>
  );
};
