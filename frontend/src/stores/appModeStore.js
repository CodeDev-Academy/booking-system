import { create } from 'zustand';

/**
 * AppModeStore — Headless Logic Layer for Application & Session State
 * Governed by strict Separation of Concerns: zero JSX, pure state management.
 */
const getInitialDemoMode = () => {
  if (typeof window === 'undefined') return true;
  const saved = localStorage.getItem('cedarcare_demo_mode');
  if (saved !== null) return saved === 'true';
  const isLocal =
    window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  return isLocal;
};

const getInitialHideSim = () => {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem('cedarcare_hide_simulator') === 'true';
};

export const useAppModeStore = create((set) => ({
  // Mode switch: Standalone Mock Demo vs Live Django REST API
  isDemoMode: getInitialDemoMode(),
  toggleDemoMode: () =>
    set((state) => {
      const next = !state.isDemoMode;
      if (typeof window !== 'undefined') localStorage.setItem('cedarcare_demo_mode', String(next));
      return { isDemoMode: next };
    }),
  setDemoMode: (isDemo) => {
    if (typeof window !== 'undefined') localStorage.setItem('cedarcare_demo_mode', String(isDemo));
    set({ isDemoMode: isDemo });
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
