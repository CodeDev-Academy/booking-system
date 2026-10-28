import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  User,
  Phone,
  Stethoscope,
  Clock,
  Calendar as CalendarIcon,
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
} from 'lucide-react';
import {
  formatTime,
  toDateInputString,
  toTimeInputString,
  combineDateAndTime,
} from '../../services/timeUtils';
import { validateSlot } from '../../services/slotEngine';

// Standard 15-minute clinic time slots (08:00 AM to 05:30 PM)
const TIME_OPTIONS = (() => {
  const options = [];
  for (let m = 8 * 60; m <= 17 * 60 + 30; m += 15) {
    const h = Math.floor(m / 60);
    const min = m % 60;
    const value = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    const period = h >= 12 ? 'PM' : 'AM';
    const displayH = h % 12 === 0 ? 12 : h % 12;
    const label = `${String(displayH).padStart(2, '0')}:${String(min).padStart(2, '0')} ${period}`;
    options.push({ value, label });
  }
  return options;
})();

export const QuickWalkInModal = ({
  isOpen,
  modalData,
  doctors,
  services,
  busyBlocks = [],
  onClose,
  onConfirm,
  onChangeField,
}) => {
  const [errorBanner, setErrorBanner] = useState(null);

  const {
    doctorId,
    serviceId,
    startTs,
    patientName = '',
    phone = '',
    notes = '',
  } = modalData;

  const currentService = services.find((s) => s.id === serviceId) || services[0];
  const currentDoctor = doctors.find((d) => d.id === doctorId) || doctors[0];

  // Local state for interactive Date and Time pickers
  const [selectedDate, setSelectedDate] = useState(() =>
    toDateInputString(startTs || Date.now())
  );
  const [selectedTime, setSelectedTime] = useState(() =>
    toTimeInputString(startTs || Date.now())
  );

  // Sync date/time if modal reopens with a new startTs (e.g. clicked on calendar slot)
  useEffect(() => {
    if (startTs) {
      setSelectedDate(toDateInputString(startTs));
      setSelectedTime(toTimeInputString(startTs));
    }
  }, [startTs]);

  // Calculate current timestamp from chosen date & time
  const currentCalculatedStartTs = useMemo(() => {
    return combineDateAndTime(selectedDate, selectedTime);
  }, [selectedDate, selectedTime]);

  // Instant Live Clash Detection
  const clashValidation = useMemo(() => {
    if (!currentDoctor || !currentService || !currentCalculatedStartTs) {
      return { ok: true, code: 'OK', message: 'Ready', nextSafeStart: null };
    }

    const slotToCheck = {
      doctorId: currentDoctor.id,
      start: currentCalculatedStartTs,
      durationMin: currentService.durationMin,
      bufferMin: currentService.bufferMin,
    };

    return validateSlot(slotToCheck, busyBlocks);
  }, [currentDoctor, currentService, currentCalculatedStartTs, busyBlocks]);

  if (!isOpen) return null;

  const handleApplySuggestedTime = (safeStartTs) => {
    if (!safeStartTs) return;
    setSelectedDate(toDateInputString(safeStartTs));
    setSelectedTime(toTimeInputString(safeStartTs));
    setErrorBanner(null);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setErrorBanner(null);

    if (!patientName.trim()) {
      setErrorBanner('Please enter the patient’s full name.');
      return;
    }

    if (!clashValidation.ok) {
      setErrorBanner(`Cannot book: ${clashValidation.message}`);
      return;
    }

    const res = onConfirm({
      patientName,
      phone,
      doctorId: currentDoctor.id,
      serviceId: currentService.id,
      startTs: currentCalculatedStartTs,
      notes,
    });

    if (res && !res.success) {
      setErrorBanner(res.message);
    }
  };

  return (
    <div className="calendar-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="calendar-modal-surface" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="calendar-modal-header">
          <div className="modal-title-row">
            <h2 className="modal-title">Book Walk-In Appointment</h2>
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

        <p className="modal-subtitle">
          Schedule an in-person walk-in patient. Checks real-time doctor availability and procedure buffer.
        </p>

        {errorBanner && (
          <div className="modal-error-banner">
            <AlertTriangle size={15} color="var(--danger-text)" />
            <span>{errorBanner}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="walk-in-form">
          {/* Patient Details */}
          <div className="form-group-row">
            <div className="form-field flex-1">
              <label className="field-label">
                <User size={13} color="var(--text-3)" />
                <span>Patient Full Name *</span>
              </label>
              <input
                type="text"
                className="input-base"
                placeholder="e.g. Samuel Adekunle"
                value={patientName}
                onChange={(e) => onChangeField('patientName', e.target.value)}
                autoFocus
              />
            </div>

            <div className="form-field flex-1">
              <label className="field-label">
                <Phone size={13} color="var(--text-3)" />
                <span>Phone Number</span>
              </label>
              <input
                type="tel"
                className="input-base"
                placeholder="+234 803 123 4567"
                value={phone}
                onChange={(e) => onChangeField('phone', e.target.value)}
              />
            </div>
          </div>

          {/* Doctor & Service */}
          <div className="form-group-row">
            <div className="form-field flex-1">
              <label className="field-label">
                <Stethoscope size={13} color="var(--text-3)" />
                <span>Assigned Doctor *</span>
              </label>
              <select
                className="select-base"
                value={currentDoctor.id}
                onChange={(e) => onChangeField('doctorId', e.target.value)}
              >
                {doctors.map((d) => (
                  <option key={d.id} value={d.id} disabled={!d.isOnDuty}>
                    {d.name} ({d.specialty}) {!d.isOnDuty ? '— OFF DUTY' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field flex-1">
              <label className="field-label">
                <Clock size={13} color="var(--text-3)" />
                <span>Procedure *</span>
              </label>
              <select
                className="select-base"
                value={currentService.id}
                onChange={(e) => onChangeField('serviceId', e.target.value)}
              >
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.durationMin}m + {s.bufferMin}m buffer)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Interactive Date & Start Time Pickers */}
          <div className="form-group-row">
            <div className="form-field flex-1">
              <label className="field-label">
                <CalendarIcon size={13} color="var(--text-3)" />
                <span>Date *</span>
              </label>
              <input
                type="date"
                className="input-base"
                value={selectedDate}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  setErrorBanner(null);
                }}
              />
            </div>

            <div className="form-field flex-1">
              <label className="field-label">
                <Clock size={13} color="var(--text-3)" />
                <span>Start Time *</span>
              </label>
              <select
                className="select-base"
                value={selectedTime}
                onChange={(e) => {
                  setSelectedTime(e.target.value);
                  setErrorBanner(null);
                }}
              >
                {TIME_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Live Conflict Warning vs. Available Banner */}
          {!clashValidation.ok ? (
            <div className="clash-alert-box">
              <div className="clash-alert-header">
                <AlertTriangle size={15} color="var(--amber)" />
                <span className="clash-title">Schedule Conflict</span>
              </div>
              <p className="clash-message">{clashValidation.message}</p>
              {clashValidation.nextSafeStart && (
                <button
                  type="button"
                  className="btn-quick-switch"
                  onClick={() => handleApplySuggestedTime(clashValidation.nextSafeStart)}
                >
                  Jump to next opening ({formatTime(clashValidation.nextSafeStart)})
                </button>
              )}
            </div>
          ) : (
            <div className="slot-available-box">
              <CheckCircle2 size={14} color="var(--success)" />
              <span className="slot-available-text">
                Available: {currentDoctor.name} is free at {formatTime(currentCalculatedStartTs)} ({currentService.durationMin}m + {currentService.bufferMin}m buffer)
              </span>
            </div>
          )}

          {/* Notes */}
          <div className="form-field">
            <label className="field-label">
              <span>Front-Desk Notes</span>
            </label>
            <input
              type="text"
              className="input-base"
              placeholder="e.g. Paid in cash at counter, patient waiting in lobby"
              value={notes}
              onChange={(e) => onChangeField('notes', e.target.value)}
            />
          </div>

          {/* Action Buttons */}
          <div className="modal-actions-row">
            <button type="button" className="btn-base btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn-base btn-primary"
              disabled={!clashValidation.ok}
              style={{ opacity: clashValidation.ok ? 1 : 0.6 }}
            >
              <CheckCircle2 size={15} />
              <span>Confirm Walk-In Booking</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
