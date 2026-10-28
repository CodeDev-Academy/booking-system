import React, { useState } from 'react';
import { X, Zap, Plus, MessageSquare, Rocket, ShieldCheck, ShieldAlert, Phone, AlertCircle } from 'lucide-react';
import { PatientDossier } from './PatientDossier';
import { CandidateSlotCard } from './CandidateSlotCard';
import { AskInfoPanel } from './AskInfoPanel';

/**
 * ReviewModal — Active review stage for one booking request.
 * Pure presentational: all data arrives as `review`, all behaviour as `actions`.
 */
export const ReviewModal = ({ review, actions }) => {
  const [customDoctor, setCustomDoctor] = useState('');
  const [customTime, setCustomTime] = useState('');
  const [selectedSlotIds, setSelectedSlotIds] = useState([]);

  // Auto-select conflict-free slots whenever slots change for this request
  React.useEffect(() => {
    if (review && Array.isArray(review.slots) && review.slots.length > 0) {
      setSelectedSlotIds(review.slots.filter((s) => s.ok).map((s) => s.id));
    } else {
      setSelectedSlotIds([]);
    }
  }, [review?.id, review?.slots?.length]);

  if (!review) return null;

  const toggleSlotSelect = (slotId) => {
    setSelectedSlotIds((prev) =>
      prev.includes(slotId) ? prev.filter((id) => id !== slotId) : [...prev, slotId]
    );
  };

  const selectOnlyThisSlot = (slotId) => {
    setSelectedSlotIds([slotId]);
  };

  const addCustom = () => {
    const doctorId = customDoctor || (review.slots[0] && review.slots[0].doctorId) || review.doctorOptions[1].id;
    if (!customTime) return;
    actions.addCustomSlot(doctorId, customTime);
    setCustomTime('');
  };

  const selectedCount = selectedSlotIds.length;
  const hasSelectedAny = selectedCount > 0;
  const canDispatchOrApprove = review.phoneValid && hasSelectedAny && review.collisions === 0;

  const handleDispatchOrApprove = () => {
    if (!canDispatchOrApprove) return;
    if (selectedCount === 1) {
      actions.confirmSingleSlot(selectedSlotIds[0]);
    } else {
      actions.dispatchOffers(selectedSlotIds);
    }
  };

  const actionButtonText =
    selectedCount === 1
      ? '✓ Approve 1 Confirmed Slot'
      : selectedCount === 2
      ? `Dispatch 2 Options (${review.offerExpiryMin}-min window)`
      : selectedCount === 3
      ? `Dispatch 3 Options (${review.offerExpiryMin}-min window)`
      : selectedCount > 3
      ? `Dispatch ${selectedCount} Options (${review.offerExpiryMin}-min window)`
      : 'Select at least 1 slot option';

  return (
    <div className="review-overlay" role="dialog" aria-modal="true" aria-label={`Review ${review.code}`}>
      <div className="review-modal">
        <header className="review-head">
          <div>
            <span className="mono-tag review-code">{review.code}</span>
            <h2 className="review-title">Review booking request</h2>
          </div>
          <button type="button" className="icon-btn" onClick={actions.closeRequest} aria-label="Close review">
            <X size={16} />
          </button>
        </header>

        <div className="review-body">
          {/* LEFT — patient & request details */}
          <section className="review-col">
            <h3 className="col-title">Patient &amp; request</h3>

            <label className="field-label" htmlFor="rv-name">Name</label>
            <input
              id="rv-name"
              className="field-input"
              value={review.patientName}
              onChange={(e) => actions.updateField({ patientName: e.target.value })}
            />

            <label className="field-label" htmlFor="rv-phone">Phone (E.164)</label>
            <div className="phone-wrap">
              <Phone size={14} className="phone-icon" />
              <input
                id="rv-phone"
                className={`field-input phone-input tabular-nums ${review.phoneValid ? '' : 'field-error'}`}
                value={review.phoneInput}
                onChange={(e) => actions.updateField({ phone: e.target.value })}
                inputMode="tel"
                aria-invalid={!review.phoneValid}
              />
            </div>
            <div className={`field-hint ${review.phoneValid ? 'hint-ok' : 'hint-bad'}`}>
              {review.phoneValid ? (
                <>Normalized: <span className="tabular-nums">{review.phoneDisplay}</span></>
              ) : (
                <><AlertCircle size={12} /> Enter a valid number (Nigeria +234 by default)</>
              )}
            </div>

            {/* Demographics & Emergency Priority Strip */}
            {(review.isEmergency || review.gender || review.dateOfBirth) && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '6px',
                  padding: '6px 10px',
                  marginBottom: '10px',
                  borderRadius: '6px',
                  background: review.isEmergency ? 'rgba(255, 79, 121, 0.12)' : 'var(--surface-2)',
                  border: review.isEmergency ? '1px solid var(--rose)' : '1px solid var(--border)',
                  fontSize: '11px',
                }}
              >
                {review.isEmergency && (
                  <span style={{ color: 'var(--rose)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    🚨 URGENT EMERGENCY VISIT
                  </span>
                )}
                {review.gender && (
                  <span className="badge-pill badge-neutral mono-tag" style={{ fontSize: '10px' }}>
                    Gender: {review.gender}
                  </span>
                )}
                {review.dateOfBirth && (
                  <span className="badge-pill badge-neutral mono-tag tabular-nums" style={{ fontSize: '10px' }}>
                    DOB: {review.dateOfBirth}
                  </span>
                )}
              </div>
            )}

            <PatientDossier dossier={review.dossier} />

            <label className="field-label" htmlFor="rv-service">Service</label>
            <select
              id="rv-service"
              className="field-input"
              value={review.isCustomService ? 'custom' : review.serviceId}
              onChange={(e) => {
                if (e.target.value === 'custom') {
                  actions.updateField({
                    serviceId: 'custom',
                    customService: review.customService || {
                      id: 'custom',
                      name: 'Custom Treatment',
                      durationMin: 30,
                      bufferMin: 10,
                    },
                  });
                } else {
                  actions.updateField({
                    serviceId: e.target.value,
                    customService: null,
                  });
                }
              }}
            >
              {review.serviceOptions.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
              <option value="custom">✨ + Custom Procedure…</option>
            </select>
            <div className="field-hint">{review.serviceSummary}</div>

            {review.isCustomService && (
              <div className="custom-service-box">
                <div>
                  <label className="field-label" htmlFor="rv-custom-name" style={{ marginTop: 0 }}>Custom Procedure Name</label>
                  <input
                    id="rv-custom-name"
                    className="field-input"
                    placeholder="e.g. Tooth Whitening & Polish"
                    value={review.customService?.name || ''}
                    onChange={(e) =>
                      actions.updateField({
                        customService: {
                          ...(review.customService || {}),
                          name: e.target.value,
                          durationMin: review.customService?.durationMin || 30,
                          bufferMin: review.customService?.bufferMin || 10,
                        },
                      })
                    }
                  />
                </div>
                <div className="field-row" style={{ marginTop: 'var(--space-2)' }}>
                  <div>
                    <label className="field-label" htmlFor="rv-custom-dur" style={{ marginTop: 0 }}>Duration (min)</label>
                    <input
                      id="rv-custom-dur"
                      type="number"
                      min="15"
                      step="15"
                      className="field-input tabular-nums"
                      value={review.customService?.durationMin || 30}
                      onChange={(e) =>
                        actions.updateField({
                          customService: {
                            ...(review.customService || {}),
                            durationMin: Math.max(15, Number(e.target.value) || 15),
                          },
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="field-label" htmlFor="rv-custom-buf" style={{ marginTop: 0 }}>Buffer (min)</label>
                    <input
                      id="rv-custom-buf"
                      type="number"
                      min="5"
                      step="5"
                      className="field-input tabular-nums"
                      value={review.customService?.bufferMin || 10}
                      onChange={(e) =>
                        actions.updateField({
                          customService: {
                            ...(review.customService || {}),
                            bufferMin: Math.max(5, Number(e.target.value) || 5),
                          },
                        })
                      }
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="field-row">
              <div>
                <label className="field-label" htmlFor="rv-doctor">Doctor</label>
                <select
                  id="rv-doctor"
                  className="field-input"
                  value={review.doctorId}
                  onChange={(e) => actions.updateField({ preferredDoctorId: e.target.value || null })}
                >
                  {review.doctorOptions.map((d) => (
                    <option key={d.id || 'any'} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label" htmlFor="rv-window">Preferred time</label>
                <select
                  id="rv-window"
                  className="field-input"
                  value={review.timeWindow}
                  onChange={(e) => actions.updateField({ timeWindow: e.target.value })}
                >
                  {review.windowOptions.map((w) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {/* RIGHT — candidate slots */}
          <section className="review-col">
            <div className="col-title-row">
              <div>
                <h3 className="col-title">Available Slot Options</h3>
                <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>
                  Select 1 to approve directly, or 2–3 options to dispatch.
                </span>
              </div>
              <button type="button" className="btn-base btn-secondary" onClick={actions.checkSlots}>
                <Zap size={14} /> {review.hasChecked ? 'Re-calculate Times' : 'Find Available Times'}
              </button>
            </div>

            {!review.hasChecked && (
              <div className="slots-empty">Click “Find Available Times” to calculate conflict-free options.</div>
            )}
            {review.hasChecked && review.slots.length === 0 && (
              <div className="slots-empty">No slots remain. Re-calculate or add a custom time below.</div>
            )}

            <div className="slot-list">
              {review.slots.map((slot) => (
                <CandidateSlotCard
                  key={slot.id}
                  slot={slot}
                  gridIncrementMin={review.gridIncrementMin}
                  isSelected={selectedSlotIds.includes(slot.id)}
                  onToggleSelect={toggleSlotSelect}
                  onSelectOnly={selectOnlyThisSlot}
                  actions={actions}
                />
              ))}
            </div>

            {review.hasChecked && (
              <div className="custom-slot">
                <div className="custom-slot-title"><Plus size={14} /> Add custom time</div>
                <div className="custom-slot-row">
                  <select
                    className="field-input"
                    value={customDoctor}
                    onChange={(e) => setCustomDoctor(e.target.value)}
                    aria-label="Doctor for custom slot"
                  >
                    <option value="">Doctor…</option>
                    {review.doctorOptions.filter((d) => d.id).map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                  <input
                    type="datetime-local"
                    className="field-input tabular-nums"
                    value={customTime}
                    onChange={(e) => setCustomTime(e.target.value)}
                    aria-label="Custom slot date and time"
                  />
                  <button type="button" className="btn-base btn-secondary" onClick={addCustom} disabled={!customTime}>
                    Add
                  </button>
                </div>
                <div className="field-hint">The schedule engine automatically checks for conflicts and doctor shifts instantly.</div>
              </div>
            )}
          </section>
        </div>

        <footer className="review-foot">
          <button type="button" className="btn-base btn-ghost" onClick={() => actions.toggleInfoPanel(true)}>
            <MessageSquare size={14} /> Ask for info
          </button>

          <div className={`shield-pill ${review.collisions === 0 ? 'shield-pill-ok' : 'shield-pill-warn'}`}>
            {review.collisions === 0 ? <ShieldCheck size={14} /> : <ShieldAlert size={14} />}
            <span className="tabular-nums">
              {review.collisions === 0
                ? 'Schedule Check: No conflicts detected'
                : `Schedule Check: ${review.collisions} conflict${review.collisions === 1 ? '' : 's'} detected`}
            </span>
          </div>

          <div className="dispatch-wrap">
            {!canDispatchOrApprove && (
              <span className="dispatch-reason">
                {!review.phoneValid
                  ? 'Fix patient phone number first'
                  : !hasSelectedAny
                  ? 'Select at least 1 slot option'
                  : review.collisions > 0
                  ? `${review.collisions} slot conflict detected`
                  : ''}
              </span>
            )}
            <button
              type="button"
              className="btn-base btn-primary dispatch-btn"
              disabled={!canDispatchOrApprove}
              onClick={handleDispatchOrApprove}
            >
              <Rocket size={14} /> {actionButtonText}
            </button>
          </div>
        </footer>

        {review.infoPanelOpen && (
          <AskInfoPanel
            prompts={review.infoPrompts}
            onSend={actions.sendInfoRequest}
            onClose={() => actions.toggleInfoPanel(false)}
          />
        )}
      </div>
    </div>
  );
};
