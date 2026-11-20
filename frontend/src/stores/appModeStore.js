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
  // Wave 3 (review Medium): the old guard returned false whenever a window
  // existed, so the SAVED preference never applied. Read the preference
  // first; only a windowless (SSR/test) context falls back to false.
  if (typeof window === 'undefined') return false;
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
  // Wave 3 / Step 3.7-B: no fake default staff member. The real session's
  // identity lives in useAuthStore (set at login) — this field is only a
  // consumer-side mirror for demo tooling, so it starts EMPTY.
  currentStaff: null,
  setCurrentStaff: (staff) => set({ currentStaff: staff }),

  // Audio Chime notification toggle
  audioEnabled: true,
  toggleAudio: () => set((state) => ({ audioEnabled: !state.audioEnabled })),

  // Live Queue & Shift KPI Counters
  // Wave 3 / Step 3.7-B: no hardcoded badge numbers. useTriageQueue sets the
  // real counts when the queue mounts; until then the badges honestly read 0.
  queueCounts: {
    newRequests: 0,
    reRequested: 0,
    needsAttention: 0,
    expiredOffers: 0,
    todaySchedule: 0,
  },
  setQueueCounts: (counts) => set({ queueCounts: counts }),

  // Clinic Metadata — display fallback only. The real name/address comes
  // from the settings store's API sync and is read where it is shown.
  clinicInfo: {
    name: 'Clinic',
    branch: '',
    phone: '',
    hours: '08:00 - 18:00',
  },
}));
