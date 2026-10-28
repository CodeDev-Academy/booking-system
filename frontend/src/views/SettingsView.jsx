import React from 'react';
import {
  Settings,
  Sliders,
  CheckCircle2,
  Clock,
  Sparkles,
  Save,
  Bell,
  BellOff,
  Volume2,
} from 'lucide-react';
import { useClinicSettings } from '../hooks/useClinicSettings';
import { useAppModeStore } from '../stores/appModeStore';
import { soundService } from '../services/soundService';
import { ClinicProfileCard } from '../components/settings/ClinicProfileCard';
import { OperatingHoursBento } from '../components/settings/OperatingHoursBento';
import { SchedulingRulesBento } from '../components/settings/SchedulingRulesBento';
import { ServicesManagementBento } from '../components/settings/ServicesManagementBento';
import { ConfigExporterBento } from '../components/settings/ConfigExporterBento';
import { SystemDeploymentBento } from '../components/settings/SystemDeploymentBento';
import '../styles/components/views.css';
import '../styles/components/settings.css';

/**
 * SettingsView — Route View for Task 4.7: Visual Clinic Settings Bento & White-Label Config Exporter
 * Pure presentational orchestration consuming the headless useClinicSettings hook.
 */
export const SettingsView = () => {
  const {
    isDemoMode,
    toggleDemoMode,
    hidePitchSimulator,
    toggleHidePitchSimulator,
    audioEnabled,
    toggleAudio,
  } = useAppModeStore();

  const {
    clinicProfile,
    operatingHours,
    schedulingRules,
    notificationRules,
    services,
    isDirty,
    toast,
    configJsonString,
    operationalStats,
    actions,
  } = useClinicSettings();

  return (
    <div className="view-container">
      {/* Toast Notification Banner */}
      {toast && (
        <div
          className={`calendar-toast-banner toast-${toast.tone}`}
          style={{ marginBottom: '14px' }}
        >
          <div className="toast-content">
            <span className="duty-dot" />
            <span>{toast.text}</span>
          </div>
          <button
            type="button"
            className="toast-close-btn"
            onClick={actions.dismissToast}
          >
            &times;
          </button>
        </div>
      )}

      {/* View Header with Save Button */}
      <div className="view-header">
        <div className="view-title-group">
          <div className="view-heading">
            <Settings size={22} color="var(--amber)" />
            <span>Clinic Settings</span>
            {isDirty && (
              <span className="badge-pill badge-ember mono-tag">UNSAVED EDITS</span>
            )}
          </div>
        </div>

        <div className="view-actions" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '11px', color: isDirty ? 'var(--amber)' : 'var(--text-3)' }}>
            {isDirty ? '● Unsaved changes' : '✓ Synced & saved locally'}
          </span>
          <button
            type="button"
            onClick={actions.saveSettings}
            style={{
              padding: '8px 18px',
              fontSize: '12px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: '#0c1a30',
              color: '#ffffff',
              border: 'none',
              borderRadius: 'var(--radius-full)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            title="Save clinic profile, hours, rules, and reminder settings"
          >
            <Save size={14} color="#38bdf8" />
            <span>{isDirty ? 'Save All Settings' : 'Settings Saved'}</span>
          </button>
        </div>
      </div>

      {/* KPI Overview Strip (Plain English) */}
      <div className="kpi-row">
        <div className="kpi-card">
          <div className="kpi-label">
            <span>Decision Time Limit</span>
            <Sliders size={12} color="var(--amber)" />
          </div>
          <div className="kpi-value tabular-nums">
            {schedulingRules.offerExpiryMinutes}m
          </div>
          <div className="kpi-subtext">Patient offer choice window</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label">
            <span>Temporary Slot Lock</span>
            <CheckCircle2 size={12} color="var(--success-text)" />
          </div>
          <div className="kpi-value tabular-nums">
            {schedulingRules.holdExpiryMinutes}m
          </div>
          <div className="kpi-subtext">Holds slot during confirmation</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label">
            <span>Cleaning &amp; Prep Buffer</span>
            <Sparkles size={12} color="var(--info)" />
          </div>
          <div className="kpi-value tabular-nums">
            {schedulingRules.defaultBufferMinutes}m
          </div>
          <div className="kpi-subtext">Room turnaround between visits</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label">
            <span>Weekly Operations</span>
            <Clock size={12} color="var(--rose)" />
          </div>
          <div className="kpi-value tabular-nums">
            {operationalStats.weeklyHours}h
          </div>
          <div className="kpi-subtext">
            {operationalStats.activeDaysCount} active days / week
          </div>
        </div>
      </div>

      {/* Settings Bento Grid Stack */}
      <div className="settings-view-wrapper">
        {/* 1. Clinic Identity & Channels (Multi-Phone & Multi-Email Tags) */}
        <ClinicProfileCard
          clinicProfile={clinicProfile}
          onUpdate={actions.updateProfile}
          operationalStats={operationalStats}
        />

        {/* 2. Operating Hours & Shifts */}
        <OperatingHoursBento
          operatingHours={operatingHours}
          onToggleDay={actions.toggleDayOpen}
          onUpdateDayHours={actions.updateDayHours}
          operationalStats={operationalStats}
        />

        {/* 3. Compact Front-Desk Audio Chime Control */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            background: 'var(--surface-1)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-sm)',
            flexWrap: 'wrap',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {audioEnabled ? <Bell size={16} color="var(--amber)" /> : <BellOff size={16} color="var(--text-3)" />}
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
              Front-Desk Audio Chimes:
            </span>
            <span className={`badge-pill ${audioEnabled ? 'badge-success' : 'badge-neutral'} mono-tag`} style={{ fontSize: '9px', padding: '1px 6px' }}>
              {audioEnabled ? 'ON' : 'MUTED'}
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>
              (Telegram/WhatsApp patient intake alerts)
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              className="btn-base btn-secondary btn-sm"
              onClick={() => soundService.playChime()}
              style={{ fontSize: '11px', padding: '3px 8px', display: 'flex', alignItems: 'center', gap: '4px' }}
              title="Test audio chime"
            >
              <Volume2 size={12} />
              <span>Test Sound</span>
            </button>

            <button
              type="button"
              className={`btn-base ${audioEnabled ? 'btn-danger' : 'btn-success'} btn-sm`}
              onClick={toggleAudio}
              style={{ fontSize: '11px', padding: '3px 10px' }}
            >
              {audioEnabled ? 'Mute' : 'Turn On'}
            </button>
          </div>
        </div>

        {/* 4. Scheduling Engine Rules & Timers (Plain English) */}
        <SchedulingRulesBento
          schedulingRules={schedulingRules}
          notificationRules={notificationRules}
          onUpdateRule={actions.updateRule}
          onToggleNotification={actions.toggleNotification}
        />

        {/* 5. Clinical Services & Specialties Registry */}
        <ServicesManagementBento
          services={services}
          onAddService={actions.addService}
          onDeleteService={actions.deleteService}
          onToggleActive={actions.toggleServiceActive}
        />

        {/* 6. System Architecture, API Engine & Client Handover */}
        <SystemDeploymentBento
          isDemoMode={isDemoMode}
          onToggleDemoMode={toggleDemoMode}
          hidePitchSimulator={hidePitchSimulator}
          onToggleHidePitchSimulator={toggleHidePitchSimulator}
        />

        {/* 7. White-Label Config Exporter */}
        <ConfigExporterBento
          configJsonString={configJsonString}
          isDirty={isDirty}
          hidePitchSimulator={hidePitchSimulator}
          onExportJson={actions.exportClientConfigJson}
          onCopyJson={actions.copyClientConfigJson}
          onSave={actions.saveSettings}
          onReset={actions.resetToDefaults}
        />
      </div>
    </div>
  );
};
