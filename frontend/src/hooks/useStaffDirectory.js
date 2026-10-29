import { useState, useMemo, useEffect } from 'react';
import { useStaffStore } from '../stores/useStaffStore';
import { useAppModeStore } from '../stores/appModeStore';
import { apiService } from '../services/apiService';

const TOAST_TIMEOUT_MS = 4000;

export const useStaffDirectory = () => {
  const store = useStaffStore();
  const isDemoMode = useAppModeStore((s) => s.isDemoMode);
  const [liveAnalytics, setLiveAnalytics] = useState(null);

  useEffect(() => {
    if (!store.toast) return undefined;
    const t = setTimeout(store.dismissToast, TOAST_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [store.toast, store.dismissToast]);

  useEffect(() => {
    if (isDemoMode) {
      setLiveAnalytics(null);
      return undefined;
    }
    let active = true;
    apiService
      .fetchAnalyticsSummary()
      .then((data) => {
        if (active && data) {
          setLiveAnalytics(data);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [isDemoMode]);

  const {
    staffList,
    selectedTab,
    searchQuery,
    addStaffModalOpen,
    editStaffModal,
    resetPinModal,
    toast,
  } = store;

  const filteredStaff = useMemo(() => {
    let list = staffList;
    if (selectedTab !== 'all') {
      list = list.filter((s) => s.role === selectedTab);
    }
    if (searchQuery && searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((s) =>
        (s.name && s.name.toLowerCase().includes(q)) ||
        (s.email && s.email.toLowerCase().includes(q)) ||
        (s.specialty && s.specialty.toLowerCase().includes(q)) ||
        (s.role && s.role.toLowerCase().includes(q)) ||
        (s.roleLabel && s.roleLabel.toLowerCase().includes(q)) ||
        (s.shift && s.shift.toLowerCase().includes(q))
      );
    }
    return list;
  }, [staffList, selectedTab, searchQuery]);

  // Performance & Attendance KPI Metrics
  const metrics = useMemo(() => {
    const totalStaff = staffList.length;
    const activeOnDuty = staffList.filter((s) => s.status === 'on_duty' && s.isActive).length;
    const doctorsCount = staffList.filter((s) => s.role === 'doctor').length;
    const doctorsActive = staffList.filter((s) => s.role === 'doctor' && s.status === 'on_duty' && s.isActive).length;
    const receptionistsCount = staffList.filter((s) => s.role === 'receptionist').length;
    const totalPatientsHandled = staffList.reduce((acc, s) => acc + (s.patientsHandled || 0), 0);

    return {
      totalStaff,
      activeOnDuty,
      doctorsCount,
      doctorsActive,
      receptionistsCount,
      totalPatientsHandled,
      attendanceRatePct:
        liveAnalytics?.attendanceRatePct !== undefined ? liveAnalytics.attendanceRatePct : 97.4,
      avgTriageVelocityMin:
        liveAnalytics?.avgTriageVelocityMin !== undefined && liveAnalytics.avgTriageVelocityMin > 0
          ? liveAnalytics.avgTriageVelocityMin
          : 3.8,
      hourlyDistribution: liveAnalytics?.hourlyDistribution || null,
    };
  }, [staffList, liveAnalytics]);

  return {
    staffList: filteredStaff,
    rawStaffCount: staffList.length,
    selectedTab,
    searchQuery,
    metrics,
    addStaffModalOpen,
    editStaffModal,
    resetPinModal,
    toast,
    actions: {
      setSelectedTab: store.setSelectedTab,
      setSearchQuery: store.setSearchQuery,
      setDutyStatus: store.setDutyStatus,
      toggleStaffActive: store.toggleStaffActive,
      openEditStaffModal: store.openEditStaffModal,
      closeEditStaffModal: store.closeEditStaffModal,
      updateStaffMember: store.updateStaffMember,
      openResetPinModal: store.openResetPinModal,
      closeResetPinModal: store.closeResetPinModal,
      confirmResetPin: store.confirmResetPin,
      openAddStaffModal: store.openAddStaffModal,
      closeAddStaffModal: store.closeAddStaffModal,
      addStaffMember: store.addStaffMember,
      exportAppointmentsCSV: store.exportAppointmentsCSV,
      exportAttendanceCSV: store.exportAttendanceCSV,
      dismissToast: store.dismissToast,
    },
  };
};
