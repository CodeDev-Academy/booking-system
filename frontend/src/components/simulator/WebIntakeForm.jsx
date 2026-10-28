import React from 'react';
import {
  User,
  Phone,
  FileText,
  Send,
  CheckCircle2,
  Stethoscope,
  Clock,
  Sparkles,
  Calendar,
  AlertTriangle,
  RotateCcw,
  Check,
  MapPin,
  ShieldCheck,
} from 'lucide-react';
import { formatNaira } from '../../services/mockData';
import { getDoctor, getService } from '../../services/slotEngine';
import { formatDayLabel, formatTime } from '../../services/timeUtils';

export const WebIntakeForm = ({
  stage = 'intake',
  webForm,
  servicesList,
  doctorsList,
  onUpdateForm,
  onApplyPreset,
  onSubmit,
  isSubmitting,
  activeRequest,
  offeredSlots = [],
  remainingOfferSeconds = 3600,
  confirmedAppointment,
  onSelectSlot,
  onReRequestFreshTimes,
  onReset,
}) => {
  // Format MM:SS for countdown timer
  const formatTimer = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // 1. CONFIRMED SCREEN (Step 7: Final Confirmation)
  if (stage === 'confirmed' && confirmedAppointment) {
    return (
      <div className="web-intake-container">
        <div className="mobile-confirmed-card">
          <div className="confirmed-icon-circle">
            <CheckCircle2 size={36} color="var(--success-text)" />
          </div>

          <span className="badge-pill badge-ember mono-tag" style={{ alignSelf: 'center' }}>
            APPOINTMENT CONFIRMED
          </span>

          <h3 className="confirmed-heading">You're All Set!</h3>
          <p className="confirmed-subtext">
            Your appointment has been secured on the clinic schedule.
          </p>

          <div className="confirmed-details-box">
            <div className="confirmed-detail-row">
              <span className="conf-label">Reference #</span>
              <span className="conf-value mono-tag">{confirmedAppointment.appointmentId}</span>
            </div>
            <div className="confirmed-detail-row">
              <span className="conf-label">Patient</span>
              <span className="conf-value">{confirmedAppointment.patientName}</span>
            </div>
            <div className="confirmed-detail-row">
              <span className="conf-label">Service</span>
              <span className="conf-value">{confirmedAppointment.serviceName}</span>
            </div>
            <div className="confirmed-detail-row">
              <span className="conf-label">Specialist</span>
              <span className="conf-value">{confirmedAppointment.doctorName}</span>
            </div>
            <div className="confirmed-detail-row">
              <span className="conf-label">Date & Time</span>
              <span className="conf-value conf-highlight tabular-nums">
                {confirmedAppointment.dateLabel} at {confirmedAppointment.timeLabel}
              </span>
            </div>
            <div className="confirmed-detail-row">
              <span className="conf-label">Location</span>
              <span className="conf-value" style={{ fontSize: '11px' }}>
                <MapPin size={11} style={{ display: 'inline', marginRight: '3px' }} />
                {confirmedAppointment.roomName}
              </span>
            </div>
          </div>

          <div className="confirmed-reminder-note">
            <ShieldCheck size={14} color="var(--success-text)" />
            <span>
              Automated reminder will be sent 24 hours prior to visit via WhatsApp &amp; SMS.
            </span>
          </div>

          <button
            type="button"
            className="mobile-submit-btn"
            onClick={onReset}
            style={{ marginTop: '12px' }}
          >
            <RotateCcw size={13} style={{ marginRight: '6px' }} />
            Book Another Visit (Reset Demo)
          </button>
        </div>
      </div>
    );
  }

  // 2. EXPIRED SCREEN (Phase C: Graceful Expiry & Re-Engagement)
  if (stage === 'expired') {
    return (
      <div className="web-intake-container">
        <div className="mobile-expired-card">
          <div className="expired-icon-circle">
            <AlertTriangle size={32} color="var(--amber)" />
          </div>

          <span className="badge-pill badge-neutral mono-tag" style={{ alignSelf: 'center' }}>
            OFFER WINDOW EXPIRED
          </span>

          <h3 className="expired-heading">Slots Released</h3>
          <p className="expired-subtext">
            To keep our schedule open for all patients, previously offered slots expired after 60 minutes. We'd still love to see you!
          </p>

          <button
            id="btn-rerequest-fresh"
            type="button"
            className="mobile-submit-btn"
            onClick={onReRequestFreshTimes}
            style={{ marginTop: '8px' }}
          >
            <RotateCcw size={14} style={{ marginRight: '6px' }} />
            Request Fresh Times from Reception
          </button>

          <div className="mobile-disclaimer" style={{ marginTop: '10px' }}>
            <span>⚡ Placed directly into receptionist's priority Re-Requested tab.</span>
          </div>
        </div>
      </div>
    );
  }

  // 3. SLOTS OFFERED SCREEN (Step 5: Patient Selects Option)
  if (stage === 'slots_offered') {
    return (
      <div className="web-intake-container">
        <div className="mobile-clinic-banner">
          <div className="mobile-clinic-badge">
            <div className="clinic-status-dot pulse" />
            <span>Cedarcare Specialist Clinic</span>
          </div>
          <h4 className="mobile-form-title">Available Times Approved</h4>
          <p className="mobile-form-subtitle">
            Front desk has verified doctor availability. Choose your preferred time:
          </p>
        </div>

        {/* 60-Minute Expiry Countdown Ticker */}
        <div className="offer-countdown-banner">
          <Clock size={14} color="var(--amber)" />
          <div className="countdown-text-group">
            <span className="countdown-title">Offer Expires in:</span>
            <span className="countdown-timer tabular-nums">
              {formatTimer(remainingOfferSeconds)}
            </span>
          </div>
        </div>

        {/* 3 Selectable Candidate Slot Cards */}
        <div className="slots-candidate-stack">
          {offeredSlots.map((slot, index) => {
            const doc = getDoctor(slot.doctorId);
            const svc = activeRequest ? getService(activeRequest.serviceId) : null;
            return (
              <div
                key={slot.id || index}
                id={`slot-option-${index + 1}`}
                className="slot-candidate-card"
                onClick={() => onSelectSlot(slot)}
              >
                <div className="slot-card-left">
                  <span className="slot-choice-pill">Choice {index + 1}</span>
                  <div className="slot-datetime-title tabular-nums">
                    {formatDayLabel(slot.start)} · {formatTime(slot.start)}
                  </div>
                  <div className="slot-doctor-line">
                    <Stethoscope size={11} style={{ marginRight: '4px' }} />
                    <span>{doc?.name || 'Doctor'} · {doc?.specialty || 'Specialist'}</span>
                  </div>
                  <div className="slot-duration-line">
                    <Clock size={10} style={{ marginRight: '3px' }} />
                    <span>{svc?.durationMin || 30} mins consultation</span>
                  </div>
                </div>

                <button
                  type="button"
                  className="btn-select-slot"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectSlot(slot);
                  }}
                >
                  <Check size={14} style={{ marginRight: '4px' }} />
                  Select
                </button>
              </div>
            );
          })}
        </div>

        <div className="mobile-disclaimer">
          <span>🔒 Selecting a time places an instant 15-minute temporary database hold.</span>
        </div>
      </div>
    );
  }

  // 4. WAITING FOR FRONT DESK REVIEW (Step 3: Receptionist Review)
  if (stage === 'waiting_review' && activeRequest) {
    const svc = getService(activeRequest.serviceId);
    return (
      <div className="web-intake-container">
        <div className="mobile-waiting-card">
          <div className="waiting-spinner-ring">
            <div className="duty-dot pulse" style={{ width: '12px', height: '12px' }} />
          </div>

          <span className="badge-pill badge-amber mono-tag" style={{ alignSelf: 'center' }}>
            AWAITING FRONT DESK
          </span>

          <h3 className="waiting-heading">Request Transmitted!</h3>
          <span className="waiting-code mono-tag">{activeRequest.code}</span>

          <p className="waiting-subtext">
            Front desk receptionist <strong>Chioma</strong> is reviewing clinic schedule rules and doctor shifts for your requested service.
          </p>

          <div className="waiting-summary-box">
            <div className="waiting-summary-row">
              <span className="ws-label">Patient:</span>
              <span className="ws-val">{activeRequest.patientName}</span>
            </div>
            <div className="waiting-summary-row">
              <span className="ws-label">Treatment:</span>
              <span className="ws-val">{svc?.name || 'Dental Consultation'}</span>
            </div>
            <div className="waiting-summary-row">
              <span className="ws-label">Preferred Window:</span>
              <span className="ws-val text-capitalize">{activeRequest.timeWindow}</span>
            </div>
          </div>

          <div className="waiting-tip-banner">
            <Sparkles size={13} color="var(--amber)" />
            <span>Watch the front desk screen on the right to approve candidate slots!</span>
          </div>
        </div>
      </div>
    );
  }

  // 5. DEFAULT: INTAKE FORM (Step 1: Capture Request)
  return (
    <div className="web-intake-container">
      {/* Clinic Header Inside Mobile View */}
      <div className="mobile-clinic-banner">
        <div className="mobile-clinic-badge">
          <div className="clinic-status-dot pulse" />
          <span>Cedarcare Specialist Clinic</span>
        </div>
        <h4 className="mobile-form-title">Request an Appointment</h4>
        <p className="mobile-form-subtitle">
          Reception desk will calculate available slots and dispatch 3 options to you.
        </p>
      </div>

      {/* Rapid Demo Preset Shortcuts */}
      <div className="demo-preset-strip">
        <span className="preset-label">Pitch Presets:</span>
        <button
          type="button"
          className="btn-preset-pill"
          onClick={() => onApplyPreset('amina')}
          title="Fill Amina Yusuf (Dental, Returning)"
        >
          ✨ Amina (Dental)
        </button>
        <button
          type="button"
          className="btn-preset-pill"
          onClick={() => onApplyPreset('tunde')}
          title="Fill Tunde Musa (Check-up, New)"
        >
          ✨ Tunde (Check-up)
        </button>
      </div>

      {/* Step 1: Treatment Selection */}
      <div className="mobile-section">
        <div className="mobile-section-header">
          <span className="step-num-pill">1</span>
          <span className="section-label">Select Treatment</span>
        </div>
        <div className="service-options-stack">
          {servicesList.map((svc) => {
            const isSelected = webForm.serviceId === svc.id;
            return (
              <div
                key={svc.id}
                className={`service-option-card ${isSelected ? 'selected' : ''}`}
                onClick={() => onUpdateForm('serviceId', svc.id)}
              >
                <div className="service-card-main">
                  <span className="service-card-name">{svc.name}</span>
                  <span className="service-card-price tabular-nums">
                    {formatNaira(svc.priceNgn)}
                  </span>
                </div>
                <div className="service-card-meta">
                  <span className="meta-pill">
                    <Clock size={11} style={{ marginRight: '3px' }} />
                    {svc.durationMin} mins
                  </span>
                  <span className="meta-pill">
                    <Sparkles size={11} style={{ marginRight: '3px' }} />
                    +{svc.bufferMin}m buffer
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Step 2: Preferred Time of Day */}
      <div className="mobile-section">
        <div className="mobile-section-header">
          <span className="step-num-pill">2</span>
          <span className="section-label">Preferred Time Window</span>
        </div>
        <div className="time-window-triplet">
          <button
            type="button"
            className={`window-btn ${webForm.timeWindow === 'morning' ? 'active' : ''}`}
            onClick={() => onUpdateForm('timeWindow', 'morning')}
          >
            ☀️ Morning
            <span className="window-hours">08:00 – 12:00</span>
          </button>
          <button
            type="button"
            className={`window-btn ${webForm.timeWindow === 'afternoon' ? 'active' : ''}`}
            onClick={() => onUpdateForm('timeWindow', 'afternoon')}
          >
            🌤️ Afternoon
            <span className="window-hours">13:00 – 17:00</span>
          </button>
          <button
            type="button"
            className={`window-btn ${webForm.timeWindow === 'evening' ? 'active' : ''}`}
            onClick={() => onUpdateForm('timeWindow', 'evening')}
          >
            🌙 Evening
            <span className="window-hours">16:00 – 18:00</span>
          </button>
        </div>
      </div>

      {/* Step 3: Patient Information */}
      <div className="mobile-section">
        <div className="mobile-section-header">
          <span className="step-num-pill">3</span>
          <span className="section-label">Your Details</span>
        </div>

        <div className="mobile-input-group">
          <label className="mobile-field-label">Full Name</label>
          <div className="mobile-input-box">
            <User size={13} color="var(--text-3)" />
            <input
              type="text"
              className="mobile-input"
              value={webForm.patientName}
              onChange={(e) => onUpdateForm('patientName', e.target.value)}
              placeholder="e.g. Amina Yusuf"
            />
          </div>
        </div>

        <div className="mobile-input-group">
          <label className="mobile-field-label">Phone / WhatsApp (E.164)</label>
          <div className="mobile-input-box">
            <Phone size={13} color="var(--text-3)" />
            <input
              type="tel"
              className="mobile-input tabular-nums"
              value={webForm.phone}
              onChange={(e) => onUpdateForm('phone', e.target.value)}
              placeholder="+234 801 234 5678"
            />
          </div>
        </div>

        {/* Gender Selection */}
        <div className="mobile-input-group">
          <label className="mobile-field-label">Gender</label>
          <div style={{ display: 'flex', gap: '6px' }}>
            {['Female', 'Male', 'Other'].map((g) => {
              const isSel = (webForm.gender || 'Female').toLowerCase() === g.toLowerCase();
              return (
                <button
                  key={g}
                  type="button"
                  onClick={() => onUpdateForm('gender', g)}
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

        {/* Date of Birth */}
        <div className="mobile-input-group">
          <label className="mobile-field-label">Date of Birth</label>
          <div className="mobile-input-box">
            <Calendar size={13} color="var(--text-3)" />
            <input
              type="date"
              className="mobile-input tabular-nums"
              value={webForm.dateOfBirth || ''}
              onChange={(e) => onUpdateForm('dateOfBirth', e.target.value)}
            />
          </div>
        </div>

        {/* Emergency Triage Toggle */}
        <div
          onClick={() => onUpdateForm('isEmergency', !webForm.isEmergency)}
          style={{
            padding: '8px 10px',
            borderRadius: '6px',
            border: webForm.isEmergency ? '1px solid var(--rose)' : '1px solid var(--border)',
            background: webForm.isEmergency ? 'rgba(255, 79, 121, 0.12)' : 'var(--surface-2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            marginTop: '4px',
            marginBottom: '4px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <AlertTriangle size={13} color={webForm.isEmergency ? 'var(--rose)' : 'var(--text-3)'} />
            <span style={{ fontSize: '11px', fontWeight: 600, color: webForm.isEmergency ? 'var(--rose)' : 'var(--text-2)' }}>
              Urgent / Emergency Clinical Visit
            </span>
          </div>
          <span
            className={`badge-pill ${webForm.isEmergency ? 'badge-danger' : 'badge-neutral'} mono-tag`}
            style={{ fontSize: '9px', padding: '1px 6px' }}
          >
            {webForm.isEmergency ? 'URGENT' : 'STANDARD'}
          </span>
        </div>

        <div className="mobile-input-group">
          <label className="mobile-field-label">Symptoms / Notes (Optional)</label>
          <div className="mobile-input-box">
            <FileText size={13} color="var(--text-3)" style={{ marginTop: '4px' }} />
            <textarea
              className="mobile-textarea"
              rows={2}
              value={webForm.symptoms}
              onChange={(e) => onUpdateForm('symptoms', e.target.value)}
              placeholder="Describe your symptoms or reason for visit..."
            />
          </div>
        </div>
      </div>

      {/* Submit Action Button */}
      <button
        id="btn-submit-web-booking"
        type="button"
        className={`mobile-submit-btn ${isSubmitting ? 'submitting' : ''}`}
        disabled={isSubmitting}
        onClick={onSubmit}
      >
        <Send size={14} style={{ marginRight: '6px' }} />
        {isSubmitting ? 'Transmitting to Desk...' : 'Submit to Reception Desk'}
      </button>

      <div className="mobile-disclaimer">
        <span>🔒 Available slot offers will be held for 1 hour once sent.</span>
      </div>
    </div>
  );
};
