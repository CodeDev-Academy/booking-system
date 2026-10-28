import React, { useState } from 'react';
import { X, Send } from 'lucide-react';

/** AskInfoPanel — slide-over for the [Ask for Info] action. Pure presentational. */
export const AskInfoPanel = ({ prompts, onSend, onClose }) => {
  const [text, setText] = useState('');
  const trimmed = text.trim();

  return (
    <aside className="info-panel" aria-label="Ask patient for more information">
      <div className="info-panel-head">
        <h3>Ask for info</h3>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close panel">
          <X size={14} />
        </button>
      </div>
      <p className="info-panel-sub">Sent to the patient on their original channel.</p>

      <label className="field-label" htmlFor="info-prompt">Pre-written prompt</label>
      <select
        id="info-prompt"
        className="field-input"
        value=""
        onChange={(e) => e.target.value && setText(e.target.value)}
      >
        <option value="">Choose a prompt…</option>
        {prompts.map((p) => (
          <option key={p} value={p}>{p}</option>
        ))}
      </select>

      <label className="field-label" htmlFor="info-text">Message</label>
      <textarea
        id="info-text"
        className="field-input info-textarea"
        rows={5}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Type a custom question…"
      />

      <button
        type="button"
        className="btn-base btn-primary info-send"
        disabled={!trimmed}
        onClick={() => onSend(trimmed)}
      >
        <Send size={14} /> Send to patient
      </button>
    </aside>
  );
};
