import { useEffect, useMemo } from 'react';
import { useSettingsStore } from '../stores/useSettingsStore';

const TOAST_TIMEOUT_MS = 4000;

export const useClinicSettings = () => {
  const store = useSettingsStore();

  useEffect(() => {
    if (!store.toast) return undefined;
    const t = setTimeout(store.dismissToast, TOAST_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [store.toast, store.dismissToast]);

  const {
    clinicProfile,
    operatingHours,
    schedulingRules,
    notificationRules,
    services,
    isDirty,
    toast,
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
    schedulingRules,
    notificationRules,
    store,
  ]);

  // Computed: Operational stats
  const operationalStats = useMemo(() => {
    const activeDays = operatingHours.filter((d) => d.isOpen);
    const activeDaysCount = activeDays.length;

    let totalMinutes = 0;
    activeDays.forEach((d) => {
      const [oH, oM] = d.openTime.split(':').map(Number);
      const [cH, cM] = d.closeTime.split(':').map(Number);
      const openMins = oH * 60 + oM;
      const closeMins = cH * 60 + cM;

      let netDayMins = Math.max(0, closeMins - openMins);

      if (d.lunchStart && d.lunchEnd) {
        const [lsh, lsm] = d.lunchStart.split(':').map(Number);
        const [leh, lem] = d.lunchEnd.split(':').map(Number);
        const lunchMins = Math.max(0, leh * 60 + lem - (lsh * 60 + lsm));
        netDayMins = Math.max(0, netDayMins - lunchMins);
      }

      totalMinutes += netDayMins;
    });

    const weeklyHours = (totalMinutes / 60).toFixed(1);

    return {
      activeDaysCount,
      weeklyHours,
      totalWeeklyAppointmentsCapacity: Math.floor(
        totalMinutes / (30 + schedulingRules.defaultBufferMinutes)
      ),
    };
  }, [operatingHours, schedulingRules.defaultBufferMinutes]);

  return {
    clinicProfile,
    operatingHours,
    schedulingRules,
    notificationRules,
    services,
    isDirty,
    toast,
    configJsonString,
    operationalStats,
    actions: {
      updateProfile: store.updateProfile,
      updateDayHours: store.updateDayHours,
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
    },
  };
};
