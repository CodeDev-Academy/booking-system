import React, { useState } from 'react';
import {
  Building2,
  Phone,
  Mail,
  Send,
  MessageSquare,
  Globe,
  Coins,
  MapPin,
  CheckCircle2,
  Plus,
  X,
} from 'lucide-react';

export const ClinicProfileCard = ({ clinicProfile, onUpdate, operationalStats }) => {
  const [phoneInput, setPhoneInput] = useState('');
  const [emailInput, setEmailInput] = useState('');

  const phones = Array.isArray(clinicProfile.phones) && clinicProfile.phones.length > 0
    ? clinicProfile.phones
    : clinicProfile.phone
    ? [clinicProfile.phone]
    : ['+234 803 000 1122'];

  const emails = Array.isArray(clinicProfile.emails) && clinicProfile.emails.length > 0
    ? clinicProfile.emails
    : clinicProfile.email
    ? [clinicProfile.email]
    : ['contact@cedarcare.ng'];

  const handleAddPhone = (e) => {
    if (e) e.preventDefault();
    const clean = phoneInput.trim().replace(/,/g, '');
    if (!clean) return;
    if (!phones.includes(clean)) {
      onUpdate('phones', [...phones, clean]);
    }
    setPhoneInput('');
  };

  const handleRemovePhone = (index) => {
    const updated = phones.filter((_, i) => i !== index);
    onUpdate('phones', updated.length > 0 ? updated : ['']);
  };

  const handleAddEmail = (e) => {
    if (e) e.preventDefault();
    const clean = emailInput.trim().replace(/,/g, '');
    if (!clean) return;
    if (!emails.includes(clean)) {
      onUpdate('emails', [...emails, clean]);
    }
    setEmailInput('');
  };

  const handleRemoveEmail = (index) => {
    const updated = emails.filter((_, i) => i !== index);
    onUpdate('emails', updated.length > 0 ? updated : ['']);
  };

  return (
    <div className="settings-card">
      <div className="settings-card-header">
        <div className="settings-card-title-group">
          <div className="settings-icon-badge">
            <Building2 size={18} color="var(--amber)" />
          </div>
          <div>
            <h3 className="settings-card-title">Clinic Identity &amp; Public Channels</h3>
            <p className="settings-card-subtitle">
              Branding, contact details, and messaging gateway IDs displayed to patients.
            </p>
          </div>
        </div>
        <div className="settings-badge-group">
          <span className="badge-pill badge-neutral mono-tag">
            <Globe size={11} style={{ marginRight: '4px' }} />
            {clinicProfile.timezone.split(' ')[0]}
          </span>
          <span className="badge-pill badge-success mono-tag">
            <CheckCircle2 size={11} style={{ marginRight: '4px' }} />
            {operationalStats.activeDaysCount} Days Active
          </span>
        </div>
      </div>

      <div className="settings-grid-2">
        {/* Clinic Legal / Trading Name */}
        <div className="settings-form-group">
          <label className="settings-label" htmlFor="clinicName">
            Clinic Brand Name
          </label>
          <div className="settings-input-wrapper">
            <input
              id="clinicName"
              type="text"
              className="settings-input"
              value={clinicProfile.clinicName}
              onChange={(e) => onUpdate('clinicName', e.target.value)}
              placeholder="e.g. Cedarcare Specialist Clinic"
            />
          </div>
        </div>

        {/* Tagline */}
        <div className="settings-form-group">
          <label className="settings-label" htmlFor="tagline">
            Specialty Tagline
          </label>
          <div className="settings-input-wrapper">
            <input
              id="tagline"
              type="text"
              className="settings-input"
              value={clinicProfile.tagline}
              onChange={(e) => onUpdate('tagline', e.target.value)}
              placeholder="e.g. Excellence in Dental &amp; Family Healthcare"
            />
          </div>
        </div>

        {/* Physical Address */}
        <div className="settings-form-group settings-col-span-2">
          <label className="settings-label" htmlFor="address">
            <MapPin size={13} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
            Physical Street Address (Printed on Booking Confirmations)
          </label>
          <div className="settings-input-wrapper">
            <input
              id="address"
              type="text"
              className="settings-input"
              value={clinicProfile.address}
              onChange={(e) => onUpdate('address', e.target.value)}
              placeholder="Plot 1042 Aminu Kano Crescent, Wuse 2, Abuja, FCT"
            />
          </div>
        </div>

        {/* Multi-Phone Tag Input */}
        <div className="settings-form-group">
          <label className="settings-label">
            <Phone size={13} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
            Clinic Phone Numbers (Tags)
          </label>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 8px',
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              minHeight: '42px',
            }}
          >
            {phones.filter(Boolean).map((phone, idx) => (
              <span
                key={idx}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  background: 'var(--surface-1)',
                  border: '1px solid var(--border)',
                  padding: '3px 8px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  color: 'var(--text)',
                }}
              >
                <span className="tabular-nums">{phone}</span>
                <button
                  type="button"
                  onClick={() => handleRemovePhone(idx)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-3)',
                    padding: '0 2px',
                    lineHeight: 1,
                    fontSize: '14px',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                  title="Remove phone number"
                  aria-label={`Remove phone ${phone}`}
                >
                  &times;
                </button>
              </span>
            ))}

            <input
              type="text"
              className="tabular-nums"
              style={{
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--text)',
                fontSize: '12px',
                flex: '1',
                minWidth: '130px',
                padding: '4px',
              }}
              placeholder={phones.length === 0 ? '+234 803 000 1122' : '+ Add number (Enter)'}
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault();
                  handleAddPhone();
                }
              }}
            />
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '3px' }}>
            Type a phone number and press Enter to add multiple contact lines.
          </span>
        </div>

        {/* Multi-Email Tag Input */}
        <div className="settings-form-group">
          <label className="settings-label">
            <Mail size={13} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
            Clinic Contact Emails (Tags)
          </label>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 8px',
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              minHeight: '42px',
            }}
          >
            {emails.filter(Boolean).map((email, idx) => (
              <span
                key={idx}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  background: 'var(--surface-1)',
                  border: '1px solid var(--border)',
                  padding: '3px 8px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  color: 'var(--text)',
                }}
              >
                <span>{email}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveEmail(idx)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-3)',
                    padding: '0 2px',
                    lineHeight: 1,
                    fontSize: '14px',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                  title="Remove email"
                  aria-label={`Remove email ${email}`}
                >
                  &times;
                </button>
              </span>
            ))}

            <input
              type="email"
              style={{
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--text)',
                fontSize: '12px',
                flex: '1',
                minWidth: '130px',
                padding: '4px',
              }}
              placeholder={emails.length === 0 ? 'contact@cedarcare.ng' : '+ Add email (Enter)'}
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault();
                  handleAddEmail();
                }
              }}
            />
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '3px' }}>
            Type an email and press Enter to add multiple desk inboxes.
          </span>
        </div>

        {/* WhatsApp Phone Number ID */}
        <div className="settings-form-group">
          <label className="settings-label" htmlFor="whatsappPhoneId">
            <MessageSquare size={13} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
            WhatsApp Cloud API Phone ID
          </label>
          <div className="settings-input-wrapper">
            <input
              id="whatsappPhoneId"
              type="text"
              className="settings-input mono-font"
              value={clinicProfile.whatsappPhoneId}
              onChange={(e) => onUpdate('whatsappPhoneId', e.target.value)}
              placeholder="cedarcare_wa_live"
            />
          </div>
        </div>

        {/* Telegram Bot Username */}
        <div className="settings-form-group">
          <label className="settings-label" htmlFor="telegramBot">
            <Send size={13} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
            Telegram Bot Handle
          </label>
          <div className="settings-input-wrapper">
            <input
              id="telegramBot"
              type="text"
              className="settings-input mono-font"
              value={clinicProfile.telegramBot}
              onChange={(e) => onUpdate('telegramBot', e.target.value)}
              placeholder="@cedarcare_bot"
            />
          </div>
        </div>

        {/* Currency & Symbol */}
        <div className="settings-form-group">
          <label className="settings-label" htmlFor="currency">
            <Coins size={13} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
            Billing Currency Code
          </label>
          <div className="settings-input-wrapper">
            <input
              id="currency"
              type="text"
              className="settings-input mono-font"
              value={clinicProfile.currency}
              onChange={(e) => onUpdate('currency', e.target.value)}
              placeholder="NGN"
            />
          </div>
        </div>

        {/* Currency Symbol */}
        <div className="settings-form-group">
          <label className="settings-label" htmlFor="currencySymbol">
            Currency Symbol
          </label>
          <div className="settings-input-wrapper">
            <input
              id="currencySymbol"
              type="text"
              className="settings-input tabular-nums"
              value={clinicProfile.currencySymbol}
              onChange={(e) => onUpdate('currencySymbol', e.target.value)}
              placeholder="₦"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
