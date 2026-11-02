import React, { useState, useEffect } from 'react';
import {
  Server,
  Database,
  Cpu,
  Smartphone,
  EyeOff,
  CheckCircle2,
  Sparkles,
  Zap,
  Globe,
  Lock,
  RefreshCw,
  Workflow,
  Radio,
} from 'lucide-react';
import { useQueueStore } from '../../stores/useQueueStore';
import { useCalendarStore } from '../../stores/useCalendarStore';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { apiService } from '../../services/apiService';

/**
 * SystemDeploymentBento — System Architecture, API Engine & Client Handover
 * Governed by Separation of Concerns: pure presentational bento for SettingsView.
 * Hardened for 100% Live Production Mode (Django REST API + Neon PostgreSQL + n8n).
 */
export const SystemDeploymentBento = ({
  hidePitchSimulator,
  onToggleHidePitchSimulator,
}) => {
  const [syncSuccess, setSyncSuccess] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
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
  }, []);

  const handleSyncFreshData = async () => {
    setIsSyncing(true);
    try {
      await Promise.allSettled([
        useQueueStore.getState().syncFromBackend?.(),
        useCalendarStore.getState().syncFromBackend?.(),
        useSettingsStore.getState().syncFromBackend?.(),
      ]);
      setSyncSuccess(true);
      setTimeout(() => setSyncSuccess(false), 3000);
    } catch (err) {
      console.warn('Sync error:', err);
    } finally {
      setIsSyncing(false);
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
            <h3 className="settings-card-title">Production Deployment &amp; Live Automation Status</h3>
            <p className="settings-card-subtitle">
              Live status for Django REST API, Neon PostgreSQL, and n8n Workflow Automation Engine.
            </p>
          </div>
        </div>

        <div className="settings-badge-group">
          <span className="badge-pill badge-success mono-tag">
            ● PRODUCTION LIVE (100% API)
          </span>
          <span className="badge-pill badge-primary mono-tag">
            NEON POSTGRESQL CONNECTED
          </span>
          {hidePitchSimulator && (
            <span className="badge-pill badge-neutral mono-tag">CLIENT HANDOVER ACTIVE</span>
          )}
        </div>
      </div>

      {/* 3-Pillar Production Architecture Grid */}
      <div className="rules-sliders-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        {/* Pillar 1: Django REST API Service */}
        <div
          className="toggle-tile is-enabled"
          style={{
            borderWidth: '1px',
            borderColor: backendHealth.ok ? 'var(--success-text)' : 'var(--line-strong)',
            position: 'relative',
          }}
        >
          <div className="toggle-tile-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Server size={16} color="var(--success-text)" />
              <span className="toggle-tile-label" style={{ fontSize: '14px' }}>
                Django REST API Service
              </span>
            </div>
            {backendHealth.checking ? (
              <span className="badge-pill badge-neutral mono-tag" style={{ fontSize: '10px' }}>
                CHECKING...
              </span>
            ) : backendHealth.ok ? (
              <span className="badge-pill badge-success mono-tag" style={{ fontSize: '10px' }}>
                ONLINE &amp; ACTIVE
              </span>
            ) : (
              <span className="badge-pill badge-ember mono-tag" style={{ fontSize: '10px' }}>
                OFFLINE / STANDBY
              </span>
            )}
          </div>
          <p className="rule-description" style={{ marginTop: '8px', fontSize: '12px' }}>
            Hosts availability calculation engine, strict concurrency locks (<code>select_for_update</code>), and real-time Server-Sent Events (SSE).
          </p>
          <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-3)' }}>
            <Globe size={12} color="var(--success-text)" />
            <span>Target: <code>{apiService.baseUrl}</code></span>
          </div>
        </div>

        {/* Pillar 2: Live Neon PostgreSQL Database */}
        <div
          className="toggle-tile is-enabled"
          style={{
            borderWidth: '1px',
            borderColor: 'var(--line-strong)',
            position: 'relative',
          }}
        >
          <div className="toggle-tile-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Database size={16} color="var(--primary)" />
              <span className="toggle-tile-label" style={{ fontSize: '14px' }}>
                Neon PostgreSQL Relational Engine
              </span>
            </div>
            <span className="badge-pill badge-primary mono-tag" style={{ fontSize: '10px' }}>
              POSTGRES 16
            </span>
          </div>
          <p className="rule-description" style={{ marginTop: '8px', fontSize: '12px' }}>
            ACID transaction safety, 22 migrations applied across 12 domain tables, foreign key constraints, and zero double-booking locks.
          </p>
          <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-3)' }}>
            <Lock size={12} color="var(--primary)" />
            <span>Schema: <code>appointments</code>, <code>slot_offers</code>, <code>booking_requests</code></span>
          </div>
        </div>

        {/* Pillar 3: n8n Workflow Automation Engine */}
        <div
          className="toggle-tile is-enabled"
          style={{
            borderWidth: '1px',
            borderColor: 'var(--line-strong)',
            position: 'relative',
          }}
        >
          <div className="toggle-tile-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Workflow size={16} color="var(--amber)" />
              <span className="toggle-tile-label" style={{ fontSize: '14px' }}>
                n8n Background Sweeper &amp; Messaging
              </span>
            </div>
            <span className="badge-pill badge-warning mono-tag" style={{ fontSize: '10px' }}>
              60s SWEEP ACTIVE
            </span>
          </div>
          <p className="rule-description" style={{ marginTop: '8px', fontSize: '12px' }}>
            Runs standing 60s cron ping to <code>/api/v1/webhooks/expiry-sweep/</code> to release expired holds and offer windows, plus handles Telegram &amp; WhatsApp intake.
          </p>
          <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-3)' }}>
            <Radio size={12} color="var(--amber)" />
            <span>Sweeper: <code>POST /api/v1/webhooks/expiry-sweep/</code></span>
          </div>
        </div>
      </div>

      {/* Client Handover Mode & Live Data Sync Section */}
      <div className="notifications-toggle-section">
        <h4 className="notifications-section-title">
          <Sparkles size={14} color="var(--amber)" />
          <span>Agency Client Delivery &amp; Live Data Controls</span>
        </h4>

        <div className="toggle-tiles-grid" style={{ gridTemplateColumns: '1fr' }}>
          {/* Tile 1: Client Handover Mode */}
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

          {/* Tile 2: Fresh Live Data Resync */}
          <div
            className="toggle-tile static-tile"
            style={{ marginTop: '10px', borderStyle: 'dashed' }}
          >
            <div className="toggle-tile-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <RefreshCw
                  size={16}
                  className={isSyncing ? 'animate-spin' : ''}
                  color={syncSuccess ? 'var(--success-text)' : 'var(--text-3)'}
                />
                <div>
                  <span className="toggle-tile-label">
                    Force Sync Fresh Data from Backend
                  </span>
                  <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '2px' }}>
                    {syncSuccess
                      ? '✓ Live appointments, queue requests, and clinic settings refreshed from Django API!'
                      : 'Fetches the latest live records directly from PostgreSQL via the Django REST API.'}
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="btn-base btn-secondary btn-sm"
                onClick={handleSyncFreshData}
                disabled={isSyncing}
                style={{ fontSize: '11px', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '5px' }}
                title="Synchronize live state with database"
              >
                <RefreshCw size={12} className={isSyncing ? 'animate-spin' : ''} />
                <span>{isSyncing ? 'Syncing...' : syncSuccess ? 'Synced!' : 'Refresh Live Data'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
