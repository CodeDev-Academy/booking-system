import React, { useState, useEffect } from 'react';
import {
  Settings,
  Sliders,
  Clock,
  Save,
  Bell,
  BellOff,
  Volume2,
  Database,
} from 'lucide-react';
import { useClinicSettings } from '../hooks/useClinicSettings';
import { useAppModeStore } from '../stores/appModeStore';
import { useCalendarStore } from '../stores/useCalendarStore';
import { soundService } from '../services/soundService';
import { ClinicProfileCard } from '../components/settings/ClinicProfileCard';
import { OperatingHoursBento } from '../components/settings/OperatingHoursBento';
import { ReserveSlotsBento } from '../components/settings/ReserveSlotsBento';
import { SchedulingRulesBento } from '../components/settings/SchedulingRulesBento';
import { ServicesManagementBento } from '../components/settings/ServicesManagementBento';
import { ConfigExporterBento } from '../components/settings/ConfigExporterBento';
import { SystemDeploymentBento } from '../components/settings/SystemDeploymentBento';
import '../styles/components/views.css';
import '../styles/components/settings.css';

/**
 * SettingsView — Organized 3-Tab Clinic Settings & White-Label Config Exporter
 * Pure presentational orchestration consuming the headless useClinicSettings hook.
 */
export const SettingsView = () => {
  const [activeTab, setActiveTab] = useState('clinic'); // 'clinic' | 'services' | 'system'

  const {
    hidePitchSimulator,
    toggleHidePitchSimulator,
    audioEnabled,
    toggleAudio,
  } = useAppModeStore();

  const {
    clinicProfile,
    operatingHours,
    clinicHours,
    lunchBreak,
    schedulingRules,
    notificationRules,
    services,
    isDirty,
    toast,
    reserveSlots,
    reserveBusy,
    configJsonString,
    operationalStats,
    actions,
  } = useClinicSettings();

  // The reserve form's doctor options are the real roster. The calendar store
  // already knows how to load it; reuse that instead of a second source.
  const doctors = useCalendarStore((s) => s.doctors);
  const syncCalendar = useCalendarStore((s) => s.syncFromBackend);
  const isDemoMode = useAppModeStore((s) => s.isDemoMode);
  useEffect(() => {
    if (!isDemoMode && doctors.length === 0 && syncCalendar) {
      syncCalendar();
    }
  }, [isDemoMode, doctors.length, syncCalendar]);

  return (
    <div className="view-container">
      {/* Toast Notification Banner */}
      {toast && (
        <div
          className={`calendar-toast-banner toast-${toast.tone}`}
          style={{ marginBottom: '8px' }}
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

      {/* Compact Header with 3-Tab Switcher & Save Button */}
      <div className="view-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <div className="view-heading">
            <Settings size={18} color="var(--amber)" />
            <span>Clinic Settings</span>
            {isDirty && (
              <span className="badge-pill badge-ember mono-tag">UNSAVED</span>
            )}
          </div>

          <div className="segmented-tabs" role="tablist" aria-label="Settings sections">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'clinic'}
              className={`segmented-tab-btn ${activeTab === 'clinic' ? 'active' : ''}`}
              onClick={() => setActiveTab('clinic')}
            >
              <Clock size={13} />
              <span>Clinic &amp; Hours</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'services'}
              className={`segmented-tab-btn ${activeTab === 'services' ? 'active' : ''}`}
              onClick={() => setActiveTab('services')}
            >
              <Sliders size={13} />
              <span>Services &amp; Rules</span>
              {services?.length > 0 && (
                <span className="segmented-tab-count">{services.length}</span>
              )}
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'system'}
              className={`segmented-tab-btn ${activeTab === 'system' ? 'active' : ''}`}
              onClick={() => setActiveTab('system')}
            >
              <Database size={13} />
              <span>System &amp; Backup</span>
            </button>
          </div>
        </div>

        <div className="view-actions">
          <span style={{ fontSize: '11px', color: isDirty ? 'var(--amber)' : 'var(--text-3)' }}>
            {isDirty ? '● Unsaved changes' : '✓ Saved'}
          </span>
          <button
            type="button"
            onClick={actions.saveSettings}
            className="btn-obsidian"
            title="Save clinic profile, hours, rules, and reminder settings"
          >
            <Save size={13} />
            <span>{isDirty ? 'Save Settings' : 'Saved'}</span>
          </button>
        </div>
      </div>

      {/* Tab 1: Clinic Identity, Operating Hours & Desk Chimes */}
      {activeTab === 'clinic' && (
        <div className="settings-view-wrapper">
          <ClinicProfileCard
            clinicProfile={clinicProfile}
            onUpdate={actions.updateProfile}
            operationalStats={operationalStats}
          />

          <OperatingHoursBento
            operatingHours={operatingHours}
            clinicHours={clinicHours}
            lunchBreak={lunchBreak}
            onToggleDay={actions.toggleDayOpen}
            onUpdateClinicHours={actions.updateClinicHours}
            onUpdateLunchBreak={actions.updateLunchBreak}
            operationalStats={operationalStats}
          />

          <ReserveSlotsBento
            reserveSlots={reserveSlots}
            busy={reserveBusy}
            doctors={doctors}
            onAdd={actions.addReserveSlot}
            onRemove={actions.removeReserveSlot}
          />

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              background: 'var(--surface-1)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--line)',
              flexWrap: 'wrap',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {audioEnabled ? <Bell size={15} color="var(--amber)" /> : <BellOff size={15} color="var(--text-3)" />}
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
                Front-Desk Audio Chimes
              </span>
              <span className={`badge-pill ${audioEnabled ? 'badge-success' : 'badge-neutral'} mono-tag`} style={{ fontSize: '10px', padding: '1px 6px' }}>
                {audioEnabled ? 'ON' : 'MUTED'}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>
                Alerts when a new patient request arrives
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                className="btn-base btn-secondary btn-sm"
                onClick={() => soundService.playChime()}
                style={{ fontSize: '11px', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '4px' }}
                title="Test audio chime"
              >
                <Volume2 size={12} />
                <span>Test Sound</span>
              </button>

              <button
                type="button"
                className={`btn-base ${audioEnabled ? 'btn-secondary' : 'btn-primary'} btn-sm`}
                onClick={toggleAudio}
                style={{ fontSize: '11px', padding: '4px 10px' }}
              >
                {audioEnabled ? 'Mute' : 'Turn On'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Services Catalogue & Scheduling Rules */}
      {activeTab === 'services' && (
        <div className="settings-view-wrapper">
          <ServicesManagementBento
            services={services}
            onAddService={actions.addService}
            onDeleteService={actions.deleteService}
            onToggleActive={actions.toggleServiceActive}
          />

          <SchedulingRulesBento
            schedulingRules={schedulingRules}
            notificationRules={notificationRules}
            onUpdateRule={actions.updateRule}
            onToggleNotification={actions.toggleNotification}
          />
        </div>
      )}

      {/* Tab 3: System Deployment & JSON Backup */}
      {activeTab === 'system' && (
        <div className="settings-view-wrapper">
          <SystemDeploymentBento
            hidePitchSimulator={hidePitchSimulator}
            onToggleHidePitchSimulator={toggleHidePitchSimulator}
          />

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
      )}
    </div>
  );
};
