import React from 'react';
import {
  SmartphoneIcon,
  CalendarIcon,
  ClockIcon,
  UserIcon,
  PhoneIcon,
  SendIcon,
  CheckCircleIcon,
  SparklesIcon,
  RefreshCwIcon,
  ShieldIcon
} from '../common/Icons';
import { INITIAL_SERVICES, INITIAL_DOCTORS } from '../../utils/mockData';
import { usePatientSimulator } from '../../hooks/usePatientSimulator';

export const PatientSimulatorModule = (props) => {
  // Logic cleanly extracted into custom hook
  const {
    selectedServiceId,
    setSelectedServiceId,
    preferredDoctorId,
    setPreferredDoctorId,
    selectedDate,
    setSelectedDate,
    timeWindow,
    setTimeWindow,
    patientName,
    setPatientName,
    patientPhone,
    setPatientPhone,
    patientType,
    setPatientType,
    channel,
    setChannel,
    phoneChannel,
    setPhoneChannel,
    phoneMessages,
    activeSlotOffer,
    offerCountdown,
    isExpired,
    confirmedBooking,
    nextTwoWeeks,
    formatCountdown,
    handleWebBookingSubmit,
    selectSlot,
    simulateExpiry,
    reRequestNewTimes
  } = usePatientSimulator(props);

  return (
    <div>
      {/* Module Title */}
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '1.5rem', marginBottom: '4px' }}>Client Pitch Simulator & Patient Booking Widget</h1>
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
          Pitch the end-to-end human-in-the-loop workflow: submit from the web form, approve from desk, and experience the Telegram/WhatsApp bot interaction live.
        </p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))',
        gap: '28px',
        alignItems: 'start'
      }}>
        {/* Left Column: Embeddable Patient Booking Web Form */}
        <div className="card" style={{ padding: '28px', borderTop: '4px solid var(--color-primary)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div>
              <span className="badge badge-primary">Embeddable Web Widget</span>
              <h2 style={{ fontSize: '1.25rem', marginTop: '6px' }}>Patient Intake Form</h2>
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Public Website View</span>
          </div>

          <form onSubmit={handleWebBookingSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Service Selection */}
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Select Treatment / Service</label>
              <select
                className="form-control"
                value={selectedServiceId}
                onChange={(e) => setSelectedServiceId(e.target.value)}
              >
                {INITIAL_SERVICES.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.duration_minutes}m — ${s.price})
                  </option>
                ))}
              </select>
            </div>

            {/* Doctor Preference */}
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Doctor Preference</label>
              <select
                className="form-control"
                value={preferredDoctorId}
                onChange={(e) => setPreferredDoctorId(e.target.value)}
              >
                <option value="any">Any Available Specialist</option>
                {INITIAL_DOCTORS.map(d => (
                  <option key={d.id} value={d.id}>{d.name} ({d.specialty})</option>
                ))}
              </select>
            </div>

            {/* 2-Week Date Selector Pills */}
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Preferred Date (Next 14 Days)</label>
              <div style={{
                display: 'flex',
                gap: '8px',
                overflowX: 'auto',
                paddingBottom: '6px'
              }}>
                {nextTwoWeeks.map((item) => {
                  const isSelected = selectedDate === item.dateStr;
                  return (
                    <button
                      type="button"
                      key={item.dateStr}
                      onClick={() => setSelectedDate(item.dateStr)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '8px',
                        fontSize: '0.75rem',
                        fontWeight: isSelected ? '700' : '500',
                        backgroundColor: isSelected ? 'var(--color-primary)' : 'var(--color-surface-subtle)',
                        color: isSelected ? 'white' : 'var(--color-text-main)',
                        border: isSelected ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Time Window */}
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Preferred Time Window</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                {[
                  { id: 'morning', label: '🌅 Morning (08–12)' },
                  { id: 'afternoon', label: '☀️ Afternoon (12–16)' },
                  { id: 'evening', label: '🌙 Evening (16–18)' }
                ].map(w => (
                  <button
                    type="button"
                    key={w.id}
                    onClick={() => setTimeWindow(w.id)}
                    style={{
                      padding: '8px 4px',
                      borderRadius: '8px',
                      fontSize: '0.75rem',
                      fontWeight: timeWindow === w.id ? '700' : '500',
                      backgroundColor: timeWindow === w.id ? 'var(--color-primary-light)' : 'var(--color-surface)',
                      color: timeWindow === w.id ? 'var(--color-primary-dark)' : 'var(--color-text-main)',
                      border: timeWindow === w.id ? '1px solid var(--color-primary)' : '1px solid var(--color-border)'
                    }}
                  >
                    {w.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Patient Personal Details */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Full Name</label>
                <input
                  type="text"
                  className="form-control"
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Phone Number (WhatsApp/Telegram)</label>
                <input
                  type="tel"
                  className="form-control"
                  value={patientPhone}
                  onChange={(e) => setPatientPhone(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Channel and Patient Type */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Notification Channel</label>
                <select
                  className="form-control"
                  value={channel}
                  onChange={(e) => setChannel(e.target.value)}
                >
                  <option value="whatsapp">WhatsApp Interactive</option>
                  <option value="telegram">Telegram Bot</option>
                  <option value="web">Web Portal</option>
                </select>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Patient History</label>
                <select
                  className="form-control"
                  value={patientType}
                  onChange={(e) => setPatientType(e.target.value)}
                >
                  <option value="new">First Time Patient</option>
                  <option value="returning">Returning Patient</option>
                </select>
              </div>
            </div>

            {/* Upfront Policy Disclaimer */}
            <div style={{
              backgroundColor: 'var(--color-surface-subtle)',
              border: '1px solid var(--color-border)',
              borderRadius: '10px',
              padding: '10px 14px',
              fontSize: '0.75rem',
              color: 'var(--color-text-muted)'
            }}>
              💡 <strong>Booking Policy:</strong> Available slot offers are held for 1 hour once sent by reception so other patients have fair access to the schedule.
            </div>

            <button type="submit" className="btn btn-primary btn-lg" style={{ marginTop: '6px' }}>
              <SendIcon size={18} color="white" />
              Submit Booking Request
            </button>
          </form>
        </div>

        {/* Right Column: Split-Screen Telegram / WhatsApp Smartphone Simulator */}
        <div>
          {/* Channel Toggle & Expiry Simulator button */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '12px'
          }}>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                onClick={() => setPhoneChannel('whatsapp')}
                style={{
                  padding: '6px 12px',
                  borderRadius: '20px',
                  fontSize: '0.75rem',
                  fontWeight: '700',
                  backgroundColor: phoneChannel === 'whatsapp' ? '#25D366' : 'var(--color-surface)',
                  color: phoneChannel === 'whatsapp' ? 'white' : 'var(--color-text-main)',
                  border: '1px solid #25D366'
                }}
              >
                💬 WhatsApp Flow
              </button>
              <button
                onClick={() => setPhoneChannel('telegram')}
                style={{
                  padding: '6px 12px',
                  borderRadius: '20px',
                  fontSize: '0.75rem',
                  fontWeight: '700',
                  backgroundColor: phoneChannel === 'telegram' ? '#0088cc' : 'var(--color-surface)',
                  color: phoneChannel === 'telegram' ? 'white' : 'var(--color-text-main)',
                  border: '1px solid #0088cc'
                }}
              >
                ✈️ Telegram Bot
              </button>
            </div>

            <button
              onClick={simulateExpiry}
              className="btn btn-secondary btn-sm"
              title="Test Phase C: Graceful Expiry & 1-Click Re-engagement"
              style={{ fontSize: '0.75rem' }}
            >
              ⏳ Simulate 60m Expiry
            </button>
          </div>

          {/* Smartphone Hardware Frame */}
          <div style={{
            maxWidth: '380px',
            margin: '0 auto',
            backgroundColor: '#1e293b',
            borderRadius: '40px',
            padding: '12px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.45)',
            border: '4px solid #334155'
          }}>
            {/* Phone Screen Container */}
            <div style={{
              backgroundColor: phoneChannel === 'whatsapp' ? '#efeae2' : '#e4eaf0',
              borderRadius: '32px',
              height: '620px',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              position: 'relative'
            }}>
              {/* Phone Status Bar */}
              <div style={{
                height: '24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 18px',
                fontSize: '0.6875rem',
                fontWeight: '600',
                color: '#334155'
              }}>
                <span>09:41</span>
                <div style={{ width: '60px', height: '12px', backgroundColor: '#0f172a', borderRadius: '10px' }} />
                <span>5G 100%</span>
              </div>

              {/* Chat App Header */}
              <div style={{
                backgroundColor: phoneChannel === 'whatsapp' ? '#075e54' : '#229ed9',
                color: 'white',
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    backgroundColor: 'white',
                    color: '#075e54',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: '800',
                    fontSize: '0.8125rem'
                  }}>
                    MP
                  </div>
                  <div>
                    <div style={{ fontWeight: '700', fontSize: '0.875rem', lineHeight: 1.1 }}>
                      MedPulse Clinic Bot
                    </div>
                    <div style={{ fontSize: '0.6875rem', opacity: 0.85 }}>
                      Official Healthcare Bot
                    </div>
                  </div>
                </div>

                {activeSlotOffer && !isExpired && !confirmedBooking && (
                  <div style={{
                    fontSize: '0.6875rem',
                    backgroundColor: 'rgba(0,0,0,0.25)',
                    padding: '3px 8px',
                    borderRadius: '12px',
                    fontFamily: 'monospace'
                  }}>
                    ⏳ {formatCountdown(offerCountdown)}
                  </div>
                )}
              </div>

              {/* Chat Message Stream */}
              <div style={{
                flex: 1,
                padding: '14px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}>
                {phoneMessages.map((msg) => (
                  <div
                    key={msg.id}
                    style={{
                      alignSelf: msg.sender === 'patient' ? 'flex-end' : 'flex-start',
                      maxWidth: '85%'
                    }}
                  >
                    <div style={{
                      backgroundColor: msg.sender === 'patient'
                        ? (phoneChannel === 'whatsapp' ? '#dcf8c6' : '#effdde')
                        : '#ffffff',
                      borderRadius: '12px',
                      padding: '10px 12px',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                      fontSize: '0.8125rem',
                      color: '#0f172a',
                      whiteSpace: 'pre-wrap',
                      lineHeight: 1.4
                    }}>
                      {msg.text}

                      {/* Interactive Slot Buttons */}
                      {msg.slots && !confirmedBooking && !isExpired && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '10px' }}>
                          {msg.slots.map((slot, sIdx) => (
                            <button
                              key={slot.id || sIdx}
                              onClick={() => selectSlot(slot)}
                              style={{
                                width: '100%',
                                padding: '8px 10px',
                                borderRadius: '8px',
                                fontSize: '0.75rem',
                                fontWeight: '700',
                                backgroundColor: phoneChannel === 'whatsapp' ? '#128C7E' : '#229ed9',
                                color: 'white',
                                textAlign: 'left',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.15)'
                              }}
                            >
                              <span>{sIdx + 1}️⃣ {slot.display_label}</span>
                              <span style={{ fontSize: '0.6875rem', opacity: 0.9 }}>Select ➔</span>
                            </button>
                          ))}
                        </div>
                      )}

                      {/* 1-Click Re-Engagement Button if Expired */}
                      {msg.isExpiredPrompt && (
                        <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <button
                            onClick={reRequestNewTimes}
                            style={{
                              width: '100%',
                              padding: '10px',
                              borderRadius: '8px',
                              fontSize: '0.8125rem',
                              fontWeight: '700',
                              backgroundColor: 'var(--color-warning)',
                              color: 'white',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '6px'
                            }}
                          >
                            <RefreshCwIcon size={14} color="white" />
                            🔄 See New Times
                          </button>
                          <a
                            href="tel:+23412345678"
                            style={{
                              textAlign: 'center',
                              fontSize: '0.6875rem',
                              color: 'var(--color-primary)',
                              textDecoration: 'none',
                              fontWeight: '600'
                            }}
                          >
                            💬 Chat with Reception Desk
                          </a>
                        </div>
                      )}

                      <div style={{
                        textAlign: 'right',
                        fontSize: '0.625rem',
                        color: '#94a3b8',
                        marginTop: '4px'
                      }}>
                        {msg.time}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Chat Input Bar */}
              <div style={{
                padding: '8px 12px',
                backgroundColor: '#ffffff',
                borderTop: '1px solid #cbd5e1',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <input
                  type="text"
                  placeholder="Type a message..."
                  disabled
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: '20px',
                    border: '1px solid #e2e8f0',
                    fontSize: '0.75rem',
                    backgroundColor: '#f8fafc',
                    outline: 'none'
                  }}
                />
                <button
                  disabled
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    backgroundColor: phoneChannel === 'whatsapp' ? '#075e54' : '#229ed9',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white'
                  }}
                >
                  <SendIcon size={14} color="white" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
