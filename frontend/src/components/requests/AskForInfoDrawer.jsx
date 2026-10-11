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
    }, 300);
  };

  return (
    <div className="slide-over-overlay" onClick={onClose}>
      <div className="slide-over-glass-panel" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{
          padding: '24px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div>
            <h3 style={{ fontSize: '1.125rem', color: '#ffffff', margin: 0 }}>Clinical Prompt / Message</h3>
            <p style={{ fontSize: '0.75rem', color: '#8e8e93', margin: 0, marginTop: '2px' }}>
              Direct dispatch to {request.patient_name} via {request.channel.toUpperCase()}
            </p>
          </div>
          <button onClick={onClose} style={{ color: '#8e8e93', padding: '6px' }}>
            <XIcon size={18} color="currentColor" />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '24px', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto' }}>
          {/* Quick Preset Selector */}
          <div>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <SparklesIcon size={12} color="var(--color-accent-orange)" />
              Clinical Prompt Presets:
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
              {PRESET_PROMPTS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => handleSelectPreset(preset)}
                  style={{
                    textAlign: 'left',
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '0.8125rem',
                    fontWeight: selectedPromptId === preset.id ? '700' : '500',
                    backgroundColor: selectedPromptId === preset.id ? 'rgba(255, 107, 0, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                    border: selectedPromptId === preset.id ? '1px solid var(--color-accent-orange)' : '1px solid rgba(255, 255, 255, 0.06)',
                    color: selectedPromptId === preset.id ? '#ffffff' : '#8e8e93',
                    transition: 'all 0.15s'
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
              className="form-control-glass"
              rows={6}
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              style={{ flex: 1, resize: 'none', lineHeight: 1.5, marginTop: '8px' }}
            />
          </div>
        </div>

        {/* Drawer Footer */}
        <div style={{
          padding: '20px 24px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: '10px'
        }}>
          <button onClick={onClose} className="btn-pill btn-pill-glass">
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={isSending || !customMessage.trim()}
            className="btn-pill btn-pill-orange"
          >
            <SendIcon size={14} color="#ffffff" />
            <span>{isSending ? 'Sending...' : 'Dispatch Message'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
