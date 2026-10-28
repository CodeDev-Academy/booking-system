import React, { useState, useEffect } from 'react';
import {
  Server,
  Database,
  Cpu,
  Smartphone,
  EyeOff,
  Eye,
  CheckCircle2,
  Sparkles,
  Zap,
  Globe,
  Lock,
  RotateCcw,
} from 'lucide-react';
import { useQueueStore } from '../../stores/useQueueStore';
import { useCalendarStore } from '../../stores/useCalendarStore';
import { useVisitsStore } from '../../stores/useVisitsStore';
import { apiService } from '../../services/apiService';

/**
 * SystemDeploymentBento — System Architecture, API Engine & Client Handover
 * Governed by Separation of Concerns: pure presentational bento for SettingsView.
 */
export const SystemDeploymentBento = ({
  isDemoMode,
  onToggleDemoMode,
  hidePitchSimulator,
  onToggleHidePitchSimulator,
}) => {
  const [resetSuccess, setResetSuccess] = useState(false);
  const [backendHealth, setBackendHealth] = useState({ checking: true, ok: false, error: null });

  useEffect(() => {
    let active = true;
    apiService.checkHealth().then((res) => {
      if (active) {
        setBackendHealth({ checking: false, ok: res.ok, error: res.error });
      }
    });
    return () => {
      active = false;
    };
  }, [isDemoMode]);

  const handleResetAllDemoStores = () => {
    try {
      useQueueStore.getState().resetToDemoDefaults();
      useCalendarStore.getState().resetToDemoDefaults();
      useVisitsStore.getState().resetToDemoDefaults();
      setResetSuccess(true);
      setTimeout(() => setResetSuccess(false), 3000);
    } catch (err) {
      console.warn('Reset error:', err);
    }
  };
  return (
    <div className="settings-card">
      <div className="settings-card-header">
        <div className="settings-card-title-group">
          <div className="settings-icon-badge">
            <Server size={18} color="var(--primary)" />
          </div>
          <div>
            <h3 className="settings-card-title">System Architecture, API Engine & Client Handover</h3>
            <p className="settings-card-subtitle">
              Manage backend connectivity mode (Offline Demo vs Django Live API) and agency client delivery settings.
            </p>
          </div>
        </div>

        <div className="settings-badge-group">
          <span className={`badge-pill ${isDemoMode ? 'badge-warning' : 'badge-success'} mono-tag`}>
            {isDemoMode ? 'OFFLINE DEMO MODE' : 'DJANGO LIVE API CONNECTED'}
          </span>
          {hidePitchSimulator && (
            <span className="badge-pill badge-primary mono-tag">CLIENT HANDOVER ACTIVE</span>
          )}
        </div>
      </div>

      {/* Mode Selection Row (Two Interactive Cards) */}
      <div className="rules-sliders-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        {/* Card 1: Offline Demo Mode */}
        <div
          className={`toggle-tile ${isDemoMode ? 'is-enabled' : ''}`}
          onClick={() => {
            if (!isDemoMode) onToggleDemoMode();
          }}
          role="button"
          tabIndex={0}
          style={{
            cursor: 'pointer',
            borderWidth: isDemoMode ? '2px' : '1px',
            borderColor: isDemoMode ? 'var(--amber)' : 'var(--line-strong)',
            position: 'relative',
          }}
        >
          <div className="toggle-tile-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Cpu size={16} color="var(--amber)" />
              <span className="toggle-tile-label" style={{ fontSize: '14px' }}>
                Offline Demo Mode (In-Memory)
              </span>
            </div>
            {isDemoMode ? (
              <span className="badge-pill badge-ember mono-tag" style={{ fontSize: '10px' }}>
                ACTIVE
              </span>
            ) : (
              <button
                type="button"
                className="btn-base btn-secondary btn-sm"
                style={{ fontSize: '11px', padding: '2px 8px' }}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleDemoMode();
                }}
              >
                Switch
              </button>
            )}
          </div>
          <p className="rule-description" style={{ marginTop: '8px', fontSize: '12px' }}>
            Operates completely in-browser memory without requiring an active backend or database. Pre-seeded with realistic Nigerian clinic patients (Amina Yusuf, Tunde Musa, Kenneth Danjuma) and immediate slot calculation.
          </p>
          <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-3)' }}>
            <Zap size={12} color="var(--amber)" />
            <span>Best for client sales pitches, receptionist training, and offline presentations.</span>
          </div>
        </div>

        {/* Card 2: Django Live REST API Mode */}
        <div
          className={`toggle-tile ${!isDemoMode ? 'is-enabled' : ''}`}
          onClick={() => {
            if (isDemoMode) onToggleDemoMode();
          }}
          role="button"
          tabIndex={0}
          style={{
            cursor: 'pointer',
            borderWidth: !isDemoMode ? '2px' : '1px',
            borderColor: !isDemoMode ? 'var(--success-text)' : 'var(--line-strong)',
            position: 'relative',
          }}
        >
          <div className="toggle-tile-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Database size={16} color="var(--success-text)" />
              <span className="toggle-tile-label" style={{ fontSize: '14px' }}>
                Django Live REST API Mode
              </span>
            </div>
            {!isDemoMode ? (
              <span className="badge-pill badge-success mono-tag" style={{ fontSize: '10px' }}>
                ACTIVE
              </span>
            ) : (
              <button
                type="button"
                className="btn-base btn-secondary btn-sm"
                style={{ fontSize: '11px', padding: '2px 8px' }}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleDemoMode();
                }}
              >
                Switch
              </button>
            )}
          </div>
          <p className="rule-description" style={{ marginTop: '8px', fontSize: '12px' }}>
            Connects live to the Django REST backend (Railway / <code>localhost:8000</code>). Enforces relational transactions, database-level atomic row locks (<code>select_for_update</code>), and triggers n8n webhooks for automated Telegram/WhatsApp dispatch.
          </p>
          <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', fontSize: '11px', color: 'var(--text-3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Globe size={12} color="var(--success-text)" />
              <span>Target: <code>{apiService.baseUrl}</code></span>
            </div>
            {backendHealth.checking ? (
              <span style={{ color: 'var(--amber)' }}>Checking connection...</span>
            ) : backendHealth.ok ? (
              <span className="badge-pill badge-success mono-tag" style={{ fontSize: '9px' }}>
                BACKEND ONLINE &amp; HEALTHY
              </span>
            ) : (
              <span className="badge-pill badge-neutral mono-tag" style={{ fontSize: '9px' }}>
                DISCONNECTED (STANDBY)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Client Handover Mode Toggle Section */}
      <div className="notifications-toggle-section">
        <h4 className="notifications-section-title">
          <Sparkles size={14} color="var(--amber)" />
          <span>Agency Client Delivery &amp; White-Label Controls</span>
        </h4>

        <div className="toggle-tiles-grid" style={{ gridTemplateColumns: '1fr' }}>
          <div
            className={`toggle-tile ${hidePitchSimulator ? 'is-enabled' : ''}`}
            onClick={onToggleHidePitchSimulator}
            role="button"
            tabIndex={0}
            style={{ cursor: 'pointer' }}
          >
            <div className="toggle-tile-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {hidePitchSimulator ? (
                  <EyeOff size={16} color="var(--primary)" />
                ) : (
                  <Smartphone size={16} color="var(--amber)" />
                )}
                <div>
                  <span className="toggle-tile-label">
                    Client Handover Mode (Hide Pitch Simulator from Sidebar)
                  </span>
                  <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '2px' }}>
                    {hidePitchSimulator
                      ? 'Activated — Pitch Simulator is hidden from the sidebar navigation.'
                      : 'Deactivated — Pitch Simulator is visible for demo pitches.'}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className={`badge-pill ${hidePitchSimulator ? 'badge-primary' : 'badge-neutral'} mono-tag`}>
                  {hidePitchSimulator ? 'SIMULATOR HIDDEN' : 'SIMULATOR VISIBLE'}
                </span>
                <input
                  type="checkbox"
                  checked={hidePitchSimulator}
                  onChange={onToggleHidePitchSimulator}
                  style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: 'var(--amber)' }}
                  onClick={(e) => e.stopPropagation()}
                  aria-label="Toggle Client Handover Mode"
                />
              </div>
            </div>

            <p className="rule-description" style={{ marginTop: '8px', fontSize: '12px' }}>
              When delivering this software to a paying clinic client, turn this ON. It removes the Pitch Simulator, mobile test injection frame, and agency demonstration shortcuts from the navigation rail, delivering a clean, professional clinic workstation strictly focused on Patient Queue, Doctor Schedule, Live Room Visits, and Staff Management.
            </p>
          </div>

          {/* Workstation Storage & Practice Data Reset Tile */}
          <div
            className="toggle-tile static-tile"
            style={{ marginTop: '10px', borderStyle: 'dashed' }}
          >
            <div className="toggle-tile-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <RotateCcw size={16} color={resetSuccess ? 'var(--success-text)' : 'var(--text-3)'} />
                <div>
                  <span className="toggle-tile-label">
                    Reset Practice Data &amp; Test Bookings
                  </span>
                  <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '2px' }}>
                    {resetSuccess
                      ? '✓ Practice patients and sample appointments successfully restored!'
                      : 'Clears any test appointments you booked and restores the clean sample patient records.'}
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="btn-base btn-secondary btn-sm"
                onClick={handleResetAllDemoStores}
                style={{ fontSize: '11px', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '5px' }}
                title="Clears test appointments and restores initial sample patients"
              >
                <RotateCcw size={12} />
                <span>{resetSuccess ? 'Restored!' : 'Reset Practice Data'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
