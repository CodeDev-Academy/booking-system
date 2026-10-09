import React from 'react';
import { CheckCircleIcon } from '../common/Icons';

export const ClinicSettingsModule = ({ controller }) => {
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
    <div>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '24px',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', marginBottom: '4px' }}>Visual Clinic Settings & Rules</h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
            No-code configuration for clinic operating hours, messaging bots, and scheduling buffer rules.
          </p>
        </div>

        {saveSuccess && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: 'var(--color-success-bg)',
            color: 'var(--color-success-text)',
            padding: '8px 14px',
            borderRadius: '10px',
            fontSize: '0.8125rem',
            fontWeight: '600',
            border: '1px solid var(--color-success-border)'
          }}>
            <CheckCircleIcon size={16} color="var(--color-success)" />
            Settings saved successfully!
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* Section 1: Clinic Profile */}
        <div className="card" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '1.125rem', marginBottom: '4px' }}>Clinic Identity & Contact</h3>
          <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginBottom: '18px' }}>
            Information shown to patients on Telegram, WhatsApp, and confirmation receipts.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Clinic Name</label>
              <input
                type="text"
                className="form-control"
                value={formData.clinic_name}
                onChange={(e) => updateField('clinic_name', e.target.value)}
                required
              />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Brand Tagline</label>
              <input
                type="text"
                className="form-control"
                value={formData.tagline}
                onChange={(e) => updateField('tagline', e.target.value)}
              />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Front Desk Phone Number</label>
              <input
                type="text"
                className="form-control"
                value={formData.phone}
                onChange={(e) => updateField('phone', e.target.value)}
              />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Physical Address</label>
              <input
                type="text"
                className="form-control"
                value={formData.address}
                onChange={(e) => updateField('address', e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Section 2: Messaging Gateways */}
        <div className="card" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '1.125rem', marginBottom: '4px' }}>Messaging Bot Credentials</h3>
          <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginBottom: '18px' }}>
            Direct integration with Telegram Bot API and WhatsApp Cloud API webhooks.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Telegram Bot Token</label>
              <input
                type="text"
                className="form-control"
                value={formData.telegram_bot_token}
                onChange={(e) => updateField('telegram_bot_token', e.target.value)}
              />
              <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                Primary fast-development channel with zero Meta verification delay.
              </span>
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">WhatsApp Phone Number ID</label>
              <input
                type="text"
                className="form-control"
                value={formData.whatsapp_phone_id}
                onChange={(e) => updateField('whatsapp_phone_id', e.target.value)}
              />
              <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                Optional production channel for Meta WhatsApp interactive buttons.
              </span>
            </div>
          </div>
        </div>

        {/* Section 3: Operating Hours & Breaks */}
        <div className="card" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '1.125rem', marginBottom: '4px' }}>Operating Hours & Doctor Lunch Breaks</h3>
          <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginBottom: '18px' }}>
            Defines slot boundary limits for the scheduling engine.
          </p>

          <div style={{ marginBottom: '18px' }}>
            <label className="form-label">Clinic Working Days:</label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
              {DAYS.map(day => {
                const isSelected = formData.working_days?.includes(day);
                return (
                  <button
                    type="button"
                    key={day}
                    onClick={() => toggleDay(day)}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '8px',
                      fontSize: '0.8125rem',
                      fontWeight: isSelected ? '700' : '500',
                      backgroundColor: isSelected ? 'var(--color-primary)' : 'var(--color-surface-subtle)',
                      color: isSelected ? 'white' : 'var(--color-text-main)',
                      border: isSelected ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
                      transition: 'all 0.15s'
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
                className="form-control"
                value={formData.open_time}
                onChange={(e) => updateField('open_time', e.target.value)}
              />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Closing Time</label>
              <input
                type="time"
                className="form-control"
                value={formData.close_time}
                onChange={(e) => updateField('close_time', e.target.value)}
              />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Lunch Break Starts</label>
              <input
                type="time"
                className="form-control"
                value={formData.lunch_break_start}
                onChange={(e) => updateField('lunch_break_start', e.target.value)}
              />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Lunch Break Ends</label>
              <input
                type="time"
                className="form-control"
                value={formData.lunch_break_end}
                onChange={(e) => updateField('lunch_break_end', e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Section 4: Clinical Scheduling Rules & Reminders */}
        <div className="card" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '1.125rem', marginBottom: '4px' }}>Clinical Scheduling Rules & Toggles</h3>
          <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginBottom: '18px' }}>
            Manage slot expiration, buffers, emergency reserves, and automated patient reminders.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '20px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Slot Offer Expiry (Minutes)</label>
              <input
                type="number"
                className="form-control"
                value={formData.offer_expiry_minutes}
                onChange={(e) => updateField('offer_expiry_minutes', parseInt(e.target.value) || 60)}
              />
              <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                Standard 60-minute window for patient to select an approved slot.
              </span>
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Atomic Slot Hold Expiry (Minutes)</label>
              <input
                type="number"
                className="form-control"
                value={formData.hold_expiry_minutes}
                onChange={(e) => updateField('hold_expiry_minutes', parseInt(e.target.value) || 15)}
              />
              <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                Temporary lock placed when patient clicks a time option.
              </span>
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Default Buffer Time (Minutes)</label>
              <input
                type="number"
                className="form-control"
                value={formData.default_buffer_minutes}
                onChange={(e) => updateField('default_buffer_minutes', parseInt(e.target.value) || 10)}
              />
              <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                Sanitization and turnaround buffer between patients.
              </span>
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Emergency Reserved Slots Per Shift</label>
              <input
                type="number"
                className="form-control"
                value={formData.emergency_slots_per_shift}
                onChange={(e) => updateField('emergency_slots_per_shift', parseInt(e.target.value) || 1)}
              />
              <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                Kept reserved for emergency walk-ins.
              </span>
            </div>
          </div>

          {/* Toggle Switches */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={formData.enable_24h_reminder}
                onChange={(e) => updateField('enable_24h_reminder', e.target.checked)}
                style={{ width: '18px', height: '18px', accentColor: 'var(--color-primary)' }}
              />
              <div>
                <div style={{ fontWeight: '600', fontSize: '0.875rem' }}>Automated 24-Hour Reminder Message</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                  Sends Telegram/WhatsApp confirmation button 24 hours prior to visit.
                </div>
              </div>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={formData.enable_2h_reminder}
                onChange={(e) => updateField('enable_2h_reminder', e.target.checked)}
                style={{ width: '18px', height: '18px', accentColor: 'var(--color-primary)' }}
              />
              <div>
                <div style={{ fontWeight: '600', fontSize: '0.875rem' }}>Automated 2-Hour "On The Way" Reminder</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                  Sends clinic address navigation pin 2 hours before the appointment.
                </div>
              </div>
            </label>
          </div>
        </div>

        {/* Submit Button */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
          <button type="submit" className="btn btn-primary btn-lg" style={{ minWidth: '220px' }}>
            Save Clinic Settings
          </button>
        </div>
      </form>
    </div>
  );
};
