import React from 'react';
import {
  CalendarClock,
  CheckCircle2,
  Pencil,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useRecalls } from '../hooks/useRecalls';
import '../styles/components/recalls.css';

const TABS = [
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'sent', label: 'Sent' },
  { id: 'done', label: 'Done' },
  { id: 'cancelled', label: 'Cancelled' },
];

const STATUS_LABEL = {
  upcoming: 'Upcoming',
  sent: 'Sent',
  done: 'Done',
  cancelled: 'Cancelled',
};

const EMPTY_TEXT = {
  upcoming: 'No recalls waiting. They are created from Live Visits when a visit is finished.',
  sent: 'Nothing has been sent yet.',
  done: 'No patient has come back yet.',
  cancelled: 'Nothing has been cancelled.',
};

function formatWhen(dateIso, timeIso) {
  if (!dateIso) return '—';
  const day = new Date(`${dateIso}T00:00:00`);
  const label = day.toLocaleDateString(undefined, {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
  });
  return `${label} · ${(timeIso || '09:00').slice(0, 5)}`;
}

/**
 * RecallsView — every planned follow-up in one place.
 *
 * DESIGN ONLY: the hook owns fetching, filtering and the three actions. Nothing
 * here decides what is allowed; Django answers, and the notice shows its words.
 */
export function RecallsView({ embedded = false }) {
  const recalls = useRecalls();
  const editing = recalls.edit;

  return (
    <div className={embedded ? 'recalls-page' : 'view-container recalls-page'}>
      <div className="view-header" style={embedded ? { borderBottom: 'none', paddingBottom: 0 } : undefined}>
        <div className="view-title-group">
          {!embedded && (
            <div className="view-heading">
              <CalendarClock size={18} color="var(--amber)" />
              <span>Follow-up Recalls</span>
            </div>
          )}
          <p className="recalls-subtitle">
            Every recall is here. A recall with no message is a private note and is never sent.
          </p>
        </div>

        <label className="recalls-search">
          <Search size={14} />
          <input
            type="search"
            placeholder="Search patient, phone or code"
            value={recalls.search}
            onChange={(event) => recalls.onSearchChange(event.target.value)}
            aria-label="Search recalls"
          />
        </label>
      </div>

      {recalls.notice && (
        <div className={`recalls-notice is-${recalls.notice.tone}`} role="alert">
          <span>{recalls.notice.text}</span>
          <button
            type="button"
            className="icon-btn-close"
            onClick={recalls.dismissNotice}
            aria-label="Dismiss message"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <div className="recalls-tabs" role="tablist" aria-label="Recall groups">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={recalls.tab === tab.id}
            className={`recalls-tab${recalls.tab === tab.id ? ' is-active' : ''}`}
            onClick={() => recalls.setTab(tab.id)}
          >
            {tab.label}
            <span className="recalls-tab-count tabular-nums">{recalls.counts[tab.id] ?? 0}</span>
          </button>
        ))}
      </div>

      {recalls.loading && <p className="recalls-hint">Loading recalls…</p>}
      {recalls.error && (
        <p className="recalls-notice is-error" role="alert">{recalls.error}</p>
      )}

      {!recalls.loading && !recalls.error && recalls.items.length === 0 && (
        <p className="recalls-empty">{EMPTY_TEXT[recalls.tab] || 'Nothing here.'}</p>
      )}

      <ul className="recalls-list">
        {recalls.items.map((item) => {
          const isEditing = editing?.id === item.id;
          const canEdit = item.status === 'upcoming' && !isEditing;
          return (
            <li key={item.id} className="recall-card">
              <div className="recall-card-head">
                <div className="recall-card-title">
                  <span className="recall-patient">{item.patient_name}</span>
                  <span className={`recall-status is-${item.status}`}>
                    {STATUS_LABEL[item.status] || item.status}
                  </span>
                </div>
                <span className="recall-code mono-tag">{item.appointment_code}</span>
              </div>

              <div className="recall-meta">
                <span>{item.doctor_name || 'Doctor'}</span>
                <span className="recall-dot" />
                <span>{item.service_name || 'Service'}</span>
                <span className="recall-dot" />
                <span className="tabular-nums">{formatWhen(item.follow_up_date, item.send_at)}</span>
              </div>

              {isEditing ? (
                <div className="recall-edit">
                  <div className="recall-edit-row">
                    <label className="recall-edit-field">
                      <span>Date</span>
                      <input
                        type="date"
                        className="input-base"
                        value={editing.followUpDate}
                        onChange={(e) => recalls.changeEdit('followUpDate', e.target.value)}
                      />
                    </label>
                    <label className="recall-edit-field">
                      <span>Send at</span>
                      <input
                        type="time"
                        className="input-base"
                        value={editing.sendAt}
                        onChange={(e) => recalls.changeEdit('sendAt', e.target.value)}
                      />
                    </label>
                  </div>
                  <label className="recall-edit-field">
                    <span>
                      Message for the patient
                      <span className="recall-counter">{editing.patientMessage.length}/300</span>
                    </span>
                    <textarea
                      className="input-base textarea-base"
                      rows={3}
                      maxLength={300}
                      placeholder="Leave empty and nothing will be sent."
                      value={editing.patientMessage}
                      onChange={(e) => recalls.changeEdit('patientMessage', e.target.value)}
                    />
                  </label>
                  <div className="recall-actions">
                    <button type="button" className="btn-base btn-secondary" onClick={recalls.closeEdit}>
                      Close
                    </button>
                    <button
                      type="button"
                      className="btn-base btn-primary"
                      onClick={recalls.saveEdit}
                      disabled={recalls.saving || !editing.followUpDate}
                    >
                      {recalls.saving ? 'Saving…' : 'Save changes'}
                    </button>
                  </div>
                </div>
              ) : (
                <p className={`recall-message${item.patient_message ? '' : ' is-note-only'}`}>
                  {item.patient_message
                    ? `“${item.patient_message}”`
                    : 'Note only — no message will be sent.'}
                </p>
              )}

              {!isEditing && (
                <div className="recall-actions">
                  {canEdit && (
                    <button
                      type="button"
                      className="btn-base btn-secondary"
                      onClick={() => recalls.startEdit(item)}
                    >
                      <Pencil size={13} /> Edit
                    </button>
                  )}
                  {item.status === 'upcoming' && (
                    <button
                      type="button"
                      className="btn-base btn-secondary recall-danger"
                      onClick={() => recalls.cancel(item)}
                      disabled={recalls.saving}
                    >
                      <Trash2 size={13} /> Cancel
                    </button>
                  )}
                  {(item.status === 'upcoming' || item.status === 'sent') && (
                    <button
                      type="button"
                      className="btn-base btn-primary"
                      onClick={() => recalls.markDone(item)}
                      disabled={recalls.saving}
                    >
                      <CheckCircle2 size={13} /> Mark done
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default RecallsView;
