import React, { useState } from 'react';
import { ShieldCheck, ShieldAlert, Pencil, Minus, Plus, Trash2, CornerDownRight, Check } from 'lucide-react';

/** CandidateSlotCard — one proposed slot with Selection toggle + Edit/Swap drawer. Pure presentational. */
export const CandidateSlotCard = ({
  slot,
  gridIncrementMin,
  isSelected = true,
  onToggleSelect,
  onSelectOnly,
  actions,
}) => {
  const [editing, setEditing] = useState(false);

  return (
    <div
      className={`slot-card ${slot.ok ? 'slot-ok' : 'slot-blocked'} ${
        isSelected ? 'slot-card-selected' : 'slot-card-deselected'
      }`}
    >
      <div className="slot-card-head">
        {slot.ok && (
          <label
            className="slot-select-control"
            title={isSelected ? 'Included in dispatch options' : 'Excluded from dispatch'}
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              className="slot-select-checkbox"
              checked={isSelected}
              onChange={() => onToggleSelect && onToggleSelect(slot.id)}
            />
            <span className="slot-index tabular-nums">{slot.index}</span>
          </label>
        )}
        {!slot.ok && <span className="slot-index tabular-nums">{slot.index}</span>}

        <div className="slot-main">
          <div className="slot-when tabular-nums">
            {slot.dayLabel} · {slot.rangeLabel}
          </div>
          <div className="slot-doctor">
            {slot.doctorName} <span className="slot-dur">({slot.durationLabel})</span>
            {slot.custom && <span className="badge-pill badge-info slot-custom">Custom</span>}
          </div>
        </div>

        <div className="slot-head-actions">
          {slot.ok && (
            <button
              type="button"
              className={`icon-btn ${isSelected ? 'btn-active-pick' : ''}`}
              onClick={() => onSelectOnly && onSelectOnly(slot.id)}
              title="Pick only this slot to approve directly"
            >
              <Check size={12} /> <span>Pick Only</span>
            </button>
          )}
          <button
            type="button"
            className="icon-btn"
            onClick={() => setEditing((v) => !v)}
            aria-expanded={editing}
            aria-label="Edit or swap this slot"
          >
            <Pencil size={14} /> <span>Edit / Swap</span>
          </button>
          <button
            type="button"
            className="icon-btn icon-btn-danger"
            onClick={() => actions.removeSlot(slot.id)}
            aria-label="Remove this slot"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className={`shield-line ${slot.ok ? 'shield-ok' : 'shield-warn'}`}>
        {slot.ok ? <ShieldCheck size={14} /> : <ShieldAlert size={14} />}
        <span>{slot.ok ? 'Conflict-free · buffer preserved' : slot.message}</span>
        {!slot.ok && slot.canSnap && (
          <button
            type="button"
            className="snap-btn"
            onClick={() => actions.snapSlot(slot.id, slot.nextSafeStart)}
          >
            <CornerDownRight size={12} /> Move to earliest opening ({slot.nextSafeLabel})
          </button>
        )}
      </div>

      {editing && (
        <div className="slot-drawer">
          <label className="field-label" htmlFor={`doc-${slot.id}`}>Doctor</label>
          <select
            id={`doc-${slot.id}`}
            className="field-input"
            value={slot.doctorId}
            onChange={(e) => actions.swapDoctor(slot.id, e.target.value)}
          >
            {slot.doctorOptions.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>

          <label className="field-label" htmlFor={`time-${slot.id}`}>Start time</label>
          <div className="scrubber">
            <button
              type="button"
              className="icon-btn"
              onClick={() => actions.nudgeSlot(slot.id, -gridIncrementMin)}
              aria-label={`Move ${gridIncrementMin} minutes earlier`}
            >
              <Minus size={14} /> {gridIncrementMin}m
            </button>
            <input
              id={`time-${slot.id}`}
              type="datetime-local"
              className="field-input tabular-nums"
              value={slot.startValue}
              onChange={(e) => actions.setSlotTime(slot.id, e.target.value)}
            />
            <button
              type="button"
              className="icon-btn"
              onClick={() => actions.nudgeSlot(slot.id, gridIncrementMin)}
              aria-label={`Move ${gridIncrementMin} minutes later`}
            >
              <Plus size={14} /> {gridIncrementMin}m
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
