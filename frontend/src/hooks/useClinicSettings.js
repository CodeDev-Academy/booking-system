import { useEffect, useMemo } from 'react';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useAppModeStore } from '../stores/appModeStore';

const TOAST_TIMEOUT_MS = 4000;

export const useClinicSettings = () => {
  const store = useSettingsStore();
  const isDemoMode = useAppModeStore((s) => s.isDemoMode);

  useEffect(() => {
    if (!isDemoMode && store.syncFromBackend) {
      store.syncFromBackend();
    }
    if (!isDemoMode && store.loadReserveSlots) {
      store.loadReserveSlots();
    }
  }, [isDemoMode, store.syncFromBackend, store.loadReserveSlots]);

  useEffect(() => {
    if (!store.toast) return undefined;
    const t = setTimeout(store.dismissToast, TOAST_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [store.toast, store.dismissToast]);

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
  } = store;

  // Computed: Real-time formatted client-config.json string
  const configJsonString = useMemo(() => {
    try {
      const config = store.generateClientConfigJson();
      return JSON.stringify(config, null, 2);
    } catch {
      return '{}';
    }
  }, [
    clinicProfile,
    operatingHours,
    clinicHours,
    lunchBreak,
    schedulingRules,
    notificationRules,
    store,
  ]);

  // Computed: Operational stats
  const operationalStats = useMemo(() => {
    const activeDays = operatingHours.filter((d) => d.isOpen);
    const activeDaysCount = activeDays.length;

    const toMinutes = (hhmm) => {
      const [h, m] = String(hhmm || '0:0').split(':').map(Number);
      return (h || 0) * 60 + (m || 0);
    };
    // One clinic-wide schedule: open/close and the lunch break come from the
    // single saved setting, not from each row's leftovers.
    const dayMins = Math.max(0, toMinutes(clinicHours.closeTime) - toMinutes(clinicHours.openTime));
    const lunchMins = Math.max(0, toMinutes(lunchBreak.end) - toMinutes(lunchBreak.start));
    const totalMinutes = activeDaysCount * Math.max(0, dayMins - lunchMins);

    const weeklyHours = (totalMinutes / 60).toFixed(1);

    return {
      activeDaysCount,
      weeklyHours,
      totalWeeklyAppointmentsCapacity: Math.floor(
        totalMinutes / (30 + schedulingRules.defaultBufferMinutes)
      ),
    };
  }, [operatingHours, clinicHours, lunchBreak, schedulingRules.defaultBufferMinutes]);

  return {
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
    actions: {
      updateProfile: store.updateProfile,
      updateClinicHours: store.updateClinicHours,
      updateLunchBreak: store.updateLunchBreak,
      toggleDayOpen: store.toggleDayOpen,
      updateRule: store.updateRule,
      toggleNotification: store.toggleNotification,
      addService: store.addService,
      deleteService: store.deleteService,
      toggleServiceActive: store.toggleServiceActive,
      saveSettings: store.saveSettings,
      resetToDefaults: store.resetToDefaults,
      exportClientConfigJson: store.exportClientConfigJson,
      copyClientConfigJson: store.copyClientConfigJson,
      dismissToast: store.dismissToast,
      addReserveSlot: store.addReserveSlot,
      removeReserveSlot: store.removeReserveSlot,
    },
  };
};
