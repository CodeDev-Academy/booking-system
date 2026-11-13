import { create } from 'zustand';

/**
 * AppModeStore — Headless Logic Layer for Application & Session State
 * Governed by strict Separation of Concerns: zero JSX, pure state management.
 * PERMANENT PRODUCTION STATE: isDemoMode is strictly FALSE (100% Live Django REST API + Postgres).
 */
const getInitialDemoMode = () => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('cedarcare_demo_mode', 'false');
  }
  return false;
};

const getInitialHideSim = () => {
  if (typeof window !== 'undefined') return false;
  return localStorage.getItem('cedarcare_hide_simulator') === 'true';
};

export const useAppModeStore = create((set) => ({
  // Production Mode: 100% Live REST API & PostgreSQL Database (Zero Mock Mode)
  isDemoMode: false,
  toggleDemoMode: () => {
    // Demo mode disabled: system is permanently in Live Production Mode
    if (typeof window !== 'undefined') localStorage.setItem('cedarcare_demo_mode', 'false');
    set({ isDemoMode: false });
  },
  setDemoMode: () => {
    if (typeof window !== 'undefined') localStorage.setItem('cedarcare_demo_mode', 'false');
    set({ isDemoMode: false });
  },

  // Client Handover Mode (Hide Pitch Simulator from navigation)
  hidePitchSimulator: getInitialHideSim(),
  toggleHidePitchSimulator: () =>
    set((state) => {
      const next = !state.hidePitchSimulator;
      if (typeof window !== 'undefined') localStorage.setItem('cedarcare_hide_simulator', String(next));
      return { hidePitchSimulator: next };
    }),
  setHidePitchSimulator: (hide) => {
    if (typeof window !== 'undefined') localStorage.setItem('cedarcare_hide_simulator', String(hide));
    set({ hidePitchSimulator: hide });
  },

  // Sidebar responsive collapse & mobile drawer state
  isSidebarCollapsed: false,
  isMobileDrawerOpen: false,
  toggleSidebar: () =>
    set((state) => {
      const isMobile = typeof window !== 'undefined' && window.innerWidth < 1024;
      if (isMobile) {
        return { isMobileDrawerOpen: !state.isMobileDrawerOpen };
      }
      return { isSidebarCollapsed: !state.isSidebarCollapsed };
    }),
  openMobileDrawer: () => set({ isMobileDrawerOpen: true }),
  closeMobileDrawer: () => set({ isMobileDrawerOpen: false }),
  setSidebarCollapsed: (collapsed) => set({ isSidebarCollapsed: collapsed }),

  // Active Receptionist Session
  currentStaff: {
    id: 'staff-01',
    name: 'Sarah Aliyu',
    role: 'Receptionist',
    shift: 'Morning Shift',
    code: 'REC-01',
    avatar: 'SA',
    isLocked: false,
  },
  setCurrentStaff: (staff) => set({ currentStaff: staff }),

  // Audio Chime notification toggle
  audioEnabled: true,
  toggleAudio: () => set((state) => ({ audioEnabled: !state.audioEnabled })),

  // Live Queue & Shift KPI Counters
  queueCounts: {
    newRequests: 4,
    reRequested: 2,
    needsAttention: 1,
    expiredOffers: 1,
    todaySchedule: 8,
  },
  setQueueCounts: (counts) => set({ queueCounts: counts }),

  // Clinic Metadata
  clinicInfo: {
    name: 'Cedarcare Specialist Clinic',
    branch: 'Wuse 2, Abuja',
    phone: '+234 901 234 5678',
    hours: '08:00 – 18:00',
  },
}));
