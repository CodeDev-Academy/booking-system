import React, { useState } from 'react';
import { XIcon, SendIcon, MessageSquareIcon, SparklesIcon } from '../common/Icons';

export const AskForInfoDrawer = ({ request, isOpen, onClose, onSendMessage }) => {
  if (!isOpen || !request) return null;

  const PRESET_PROMPTS = [
    {
      id: 'doctor-flex',
      title: 'Doctor Flexibility',
      text: `Hello ${request.patient_name}, regarding your appointment request at MedPulse Clinic: Dr. ${request.preferred_doctor_name || 'your preferred specialist'} has limited openings on your chosen dates. Would you be open to an earlier morning slot with Dr. Bello or Dr. Okafor?`
    },
    {
      id: 'service-clarify',
      title: 'Clarify Symptoms / Service',
      text: `Hello ${request.patient_name}, thank you for contacting MedPulse Clinic. To ensure we schedule sufficient time for your ${request.service_name}, could you briefly let us know if you are experiencing active pain or discomfort?`
    },
    {
      id: 'alt-dates',
      title: 'Alternative Days Request',
      text: `Hello ${request.patient_name}, our schedule for ${request.preferred_dates ? request.preferred_dates.join(', ') : 'your requested dates'} is currently fully booked during the ${request.preferred_time_window} window. Would Wednesday or Thursday morning work well for you instead?`
    },
    {
      id: 'urgent-triage',
      title: 'Emergency Triage Check',
      text: `Hello ${request.patient_name}, if you require urgent emergency care for acute swelling or trauma today, please reply immediately or call front desk at +234 1 234 5678 so we can reserve our priority emergency slot.`
    }
  ];

  const [selectedPromptId, setSelectedPromptId] = useState(PRESET_PROMPTS[0].id);
  const [customMessage, setCustomMessage] = useState(PRESET_PROMPTS[0].text);
  const [isSending, setIsSending] = useState(false);

  const handleSelectPreset = (preset) => {
    setSelectedPromptId(preset.id);
    setCustomMessage(preset.text);
  };

  const handleSend = () => {
    if (!customMessage.trim()) return;
    setIsSending(true);
    setTimeout(() => {
      onSendMessage(request.request_id, customMessage, request.channel);
      setIsSending(false);
      onClose();
    }, 400);
  };

  return (
    <div className="slide-over-overlay" onClick={onClose}>
      <div className="slide-over-panel" onClick={(e) => e.stopPropagation()}>
        {/* Drawer Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: 'var(--color-surface-subtle)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              backgroundColor: 'var(--color-primary-light)',
              color: 'var(--color-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <MessageSquareIcon size={18} color="var(--color-primary)" />
            </div>
            <div>
              <h3 style={{ fontSize: '1.0625rem', margin: 0 }}>Clinical Prompt / Message</h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', margin: 0 }}>
                Direct dispatch to {request.patient_name} via {request.channel.toUpperCase()}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-sm" style={{ padding: '6px' }}>
            <XIcon size={18} color="var(--color-text-muted)" />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '24px', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto' }}>
          {/* Patient Details Snapshot */}
          <div style={{
            backgroundColor: 'var(--color-bg-app)',
            borderRadius: '12px',
            padding: '14px',
            border: '1px solid var(--color-border)'
          }}>
            <div style={{ fontSize: '0.8125rem', fontWeight: '600', color: 'var(--color-text-main)' }}>
              Recipient: {request.patient_name} ({request.patient_phone})
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>
              Service: {request.service_name} • Channel: {request.channel}
            </div>
          </div>

          {/* Quick Preset Selector */}
          <div>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <SparklesIcon size={14} color="var(--color-primary)" />
              Clinical Prompt Presets:
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
              {PRESET_PROMPTS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => handleSelectPreset(preset)}
                  style={{
                    textAlign: 'left',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    fontSize: '0.8125rem',
                    fontWeight: selectedPromptId === preset.id ? '600' : '500',
                    backgroundColor: selectedPromptId === preset.id ? 'var(--color-primary-light)' : 'var(--color-surface)',
                    border: selectedPromptId === preset.id ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
                    color: selectedPromptId === preset.id ? 'var(--color-primary-dark)' : 'var(--color-text-main)',
                    transition: 'all var(--transition-fast)'
                  }}
                >
                  {preset.title}
                </button>
              ))}
            </div>
          </div>

          {/* Editable Textarea */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <label className="form-label">Message Preview & Custom Edits:</label>
            <textarea
              className="form-control"
              rows={6}
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              style={{
                flex: 1,
                resize: 'vertical',
                lineHeight: 1.5,
                fontSize: '0.875rem',
                fontFamily: 'inherit'
              }}
            />
            <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', marginTop: '6px' }}>
              Message will be delivered immediately through {request.channel.toUpperCase()} webhook.
            </span>
          </div>
        </div>

        {/* Drawer Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: '10px',
          backgroundColor: '#ffffff'
        }}>
          <button onClick={onClose} className="btn btn-secondary">
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={isSending || !customMessage.trim()}
            className="btn btn-primary"
            style={{ minWidth: '150px' }}
          >
            <SendIcon size={16} color="white" />
            {isSending ? 'Dispatching...' : `Send via ${request.channel}`}
          </button>
        </div>
      </div>
    </div>
  );
};
