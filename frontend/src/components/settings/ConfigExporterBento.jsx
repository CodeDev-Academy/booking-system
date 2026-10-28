import React, { useState } from 'react';
import {
  FileCode,
  Download,
  Copy,
  Save,
  RotateCcw,
  Sparkles,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Database,
  Code2,
} from 'lucide-react';

export const ConfigExporterBento = ({
  configJsonString,
  isDirty,
  hidePitchSimulator = false,
  onExportJson,
  onCopyJson,
  onSave,
  onReset,
}) => {
  const [showRawJson, setShowRawJson] = useState(false);

  return (
    <div className="settings-card exporter-card">
      <div className="settings-card-header">
        <div className="settings-card-title-group">
          <div className="settings-icon-badge">
            <Database size={18} color="var(--success-text)" />
          </div>
          <div>
            <h3 className="settings-card-title">
              Clinic System Blueprint & Backup Exporter
            </h3>
            <p className="settings-card-subtitle">
              Generates an automated <code>client-config.json</code> blueprint for zero-code clinic onboarding, cloud database seeding, and complete system backup.
            </p>
          </div>
        </div>

        <div className="exporter-actions-group">
          <button
            type="button"
            className="btn-ghost-sm"
            onClick={onReset}
            title="Reset configuration to template defaults"
          >
            <RotateCcw size={13} style={{ marginRight: '5px' }} />
            Reset Defaults
          </button>

          <button
            type="button"
            className={`btn-save-sm ${isDirty ? 'has-unsaved' : ''}`}
            onClick={onSave}
          >
            {isDirty && <span className="dirty-indicator-dot" />}
            <Save size={13} style={{ marginRight: '5px' }} />
            {isDirty ? 'Save Changes' : 'Saved'}
          </button>

          <button
            type="button"
            className="btn-outline-sm"
            onClick={onCopyJson}
            title="Copy client-config.json to clipboard"
          >
            <Copy size={13} style={{ marginRight: '5px' }} />
            Copy Spec
          </button>

          <button
            type="button"
            className="btn-ember-sm"
            onClick={onExportJson}
          >
            <Download size={13} style={{ marginRight: '5px' }} />
            Export client-config.json
          </button>
        </div>
      </div>

      {/* Non-Technical Clinic Client Friendly Summary View */}
      <div
        style={{
          marginTop: '16px',
          padding: '12px 14px',
          borderRadius: '8px',
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '6px',
              background: 'rgba(50, 200, 80, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CheckCircle2 size={16} color="var(--success-text)" />
          </div>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
              Clinic Blueprint Synchronized
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-3)' }}>
              Hours, services, buffers, and reminder settings packaged for 1-click cloud provisioning.
            </div>
          </div>
        </div>

        {/* Agency / Developer Code Accordion Toggle */}
        {!hidePitchSimulator ? (
          <button
            type="button"
            onClick={() => setShowRawJson(!showRawJson)}
            style={{
              background: showRawJson ? 'var(--surface-3)' : 'transparent',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              padding: '6px 10px',
              fontSize: '11px',
              color: 'var(--text-2)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease',
            }}
            title={showRawJson ? 'Collapse developer JSON' : 'Inspect developer JSON'}
          >
            <Code2 size={13} color="var(--amber)" />
            <span>{showRawJson ? 'Hide Raw JSON (Agency View)' : 'View Raw JSON (Developer / Agency)'}</span>
            {showRawJson ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        ) : (
          <span
            className="badge-pill badge-neutral"
            style={{ fontSize: '11px', padding: '4px 8px' }}
            title="Raw code hidden in Client Handover Mode"
          >
            🛡️ Production Mode · Raw JSON Hidden
          </span>
        )}
      </div>

      {/* Raw JSON Code Container — Only visible when explicitly expanded by Agency */}
      {showRawJson && !hidePitchSimulator && (
        <div className="json-preview-container" style={{ marginTop: '12px' }}>
          <div className="json-preview-chrome">
            <div className="json-chrome-dots">
              <span className="dot dot-red" />
              <span className="dot dot-yellow" />
              <span className="dot dot-green" />
              <span className="json-chrome-title">client-config.json — Agency Developer Blueprint</span>
            </div>
            <div className="json-chrome-meta">
              <span className="badge-pill badge-neutral mono-tag">STANDALONE READY</span>
              <span className="badge-pill badge-ember mono-tag">
                <Sparkles size={11} style={{ marginRight: '4px' }} />
                ZERO-CODE SEED
              </span>
            </div>
          </div>

          <pre className="json-code-block mono-font">
            <code>{configJsonString}</code>
          </pre>
        </div>
      )}
    </div>
  );
};

