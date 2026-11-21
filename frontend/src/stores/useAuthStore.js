import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { soundService } from '../services/soundService';
import { apiService } from '../services/apiService';
import { useAppModeStore } from './appModeStore';

/**
 * AUTHORIZED_STAFF_ACCOUNTS — demo-mode personas ONLY (system review
 * finding #2). These accounts exist so the demo experience has one-click
 * logins; they are NEVER consulted in live mode (login() returns before
 * reaching them) and the credentials are deliberately synthetic — .example
 * emails and demo- passwords — so that nothing in the shipped bundle
 * resembles a real staff credential.
 *
 * Strictly Two Roles:
 * 1. Receptionists (each with her own shift account)
 * 2. Clinic Administrator / Practice Manager (overall dashboard control)
 */
export const AUTHORIZED_STAFF_ACCOUNTS = [
  {
    id: 'staff-01',
    name: 'Sarah Aliyu',
    email: 'sarah.demo@cedarcare.example',
    aliases: ['sarah.demo@cedarcare.example', 'sarah@demo.example'],
    role: 'receptionist',
    roleLabel: 'Lead Receptionist',
    shift: 'Morning Shift (08:00 – 16:00)',
    avatar: 'SA',
    pin: '1234',
    password: 'demo-password-1',
    passwords: ['demo-password-1'],
    isActive: true,
  },
  {
    id: 'staff-02',
    name: 'Chioma Okeke',
    email: 'chioma.demo@cedarcare.example',
    aliases: ['chioma.demo@cedarcare.example', 'chioma@demo.example'],
    role: 'receptionist',
    roleLabel: 'Front Desk Receptionist',
    shift: 'Afternoon / Evening Shift (12:00 – 18:00)',
    avatar: 'CO',
    pin: '5678',
    password: 'demo-password-2',
    passwords: ['demo-password-2'],
    isActive: true,
  },
  {
    id: 'staff-03',
    name: 'Dr. Ibrahim Musa',
    email: 'admin.demo@cedarcare.example',
    aliases: ['admin.demo@cedarcare.example', 'admin@demo.example'],
    role: 'clinic_admin',
    roleLabel: 'Practice Manager & Clinic Director',
    shift: 'General Practice Administration',
    avatar: 'IM',
    pin: '1234',
    password: 'demo-password-3',
    passwords: ['demo-password-3'],
    isActive: true,
  },
];

/**
 * useAuthStore — Headless Logic Layer for Staff Authentication & PIN Lock State
 * Implements Bank/Healthcare Grade Security:
 * - Brute-force throttling (5 failed attempts -> 15m lockout)
 * - Bot honeypot trap
 * - Constant-time lookup delay
 * - 401 instant session revocation
 * - Session persistence across page refreshes
 */
export const useAuthStore = create(
  persist(
    (set, get) => ({
      // Active Authenticated Staff (Unauthenticated by default; hydrated from session)
      isAuthenticated: false,
      currentStaff: null,
      pin: '',

      // Workstation Lock State (20-Minute Idle Overlay)
      isLocked: false,
      failedAttempts: 0, // PIN failed attempts
      lockoutRemaining: 0, // PIN cooldown timer in seconds
      lockTimeoutMinutes: 20, // 20-minute idle threshold

      // Password Login Brute-Force Shield State
      loginFailedAttempts: 0,
      loginLockoutUntil: 0, // Timestamp (ms) until login unlocked

      // 401 Unauthorized Governance
      isEjected: false,
      ejectionReason: null,

      // In-App Toast
      toast: null,

      // --- ACTIONS ---

      // Authenticate via Email & Password with Security Protections
      login: async ({ email, password, honeypot = '' }) => {
        const { loginFailedAttempts, loginLockoutUntil } = get();
        const now = Date.now();

        // 1. Hole 1 Defense: Honeypot Anti-Bot Trap
        if (honeypot && honeypot.trim() !== '') {
          // Bot detected: simulate delay and reject silently
          await new Promise((r) => setTimeout(r, 800));
          return { success: false, message: 'Invalid email or password.' };
        }

        // 2. Hole 1 Defense: Brute-Force Account Freeze Check
        if (loginLockoutUntil && now < loginLockoutUntil) {
          const remainingSec = Math.ceil((loginLockoutUntil - now) / 1000);
          const remainingMin = Math.ceil(remainingSec / 60);
          soundService.playAlert();
          return {
            success: false,
            message: `Account temporarily locked due to 5 consecutive failed attempts. Please retry in ${remainingMin} minute(s).`,
            isLockedOut: true,
            lockoutRemainingSeconds: remainingSec,
          };
        }

        const normalizedEmail = (email || '').trim().toLowerCase();
        const normalizedPassword = (password || '').trim();

        // 3. Hole 2 Defense: Constant-Time simulated execution
        await new Promise((r) => setTimeout(r, 350));

        const isLive = !useAppModeStore.getState().isDemoMode;

        if (isLive) {
          try {
            const result = await apiService.login(normalizedEmail, normalizedPassword, honeypot);
            if (result && result.access) {
              localStorage.setItem('cbs_auth_token', result.access);
              // Wave 4 / Step 4.1: keep the 30-day renewal key. The login body
              // has always carried it — until now it was thrown away, so the
              // session died with the 60-minute access token.
              if (result.refresh) {
                localStorage.setItem('cbs_refresh_token', result.refresh);
              }
              const staffUser = result.user || {
                id: result.id || 'staff-live',
                name: result.full_name || 'Clinic Staff',
                email: normalizedEmail,
                role: result.role || 'receptionist',
                avatar: 'CS',
              };

              set({
                isAuthenticated: true,
                currentStaff: staffUser,
                // No fabricated PIN in live mode: the server never sends one
                // back, and unlockWorkstation asks the server anyway (Phase 2.5).
                pin: staffUser.pin || '',
                isLocked: false,
                loginFailedAttempts: 0,
                loginLockoutUntil: 0,
                isEjected: false,
                ejectionReason: null,
              });

              soundService.playChime();
              return { success: true, staff: staffUser };
            }
          } catch (err) {
            if (err.isNetworkError) {
              // Live mode NEVER falls back to the local demo accounts: if the
              // clinic server cannot be reached, authentication fails. A
              // blocked or failed request (e.g. via DevTools) must not open a
              // side door into the workstation UI.
              soundService.playAlert();
              return {
                success: false,
                message: 'Cannot reach the clinic server. Check your connection and try again.',
                isNetworkError: true,
              };
            }

            const nextAttempts = loginFailedAttempts + 1;
            const willLock = nextAttempts >= 5;
            const lockUntil = willLock ? Date.now() + 15 * 60 * 1000 : 0;

            set({
              loginFailedAttempts: nextAttempts,
              loginLockoutUntil: lockUntil,
            });

            soundService.playAlert();
            return {
              success: false,
              message: err.message || 'Invalid email or password.',
              attemptsRemaining: Math.max(0, 5 - nextAttempts),
            };
          }
        }

        // Local Fallback & Demo Mode Matching — demo mode ONLY.
        // In live mode the server's answer is final (an unreachable server is
        // handled above); the local demo accounts can never authenticate a
        // live session.
        if (isLive) {
          return {
            success: false,
            message: 'Invalid email or password.',
          };
        }

        const staff = AUTHORIZED_STAFF_ACCOUNTS.find(
          (a) =>
            a.email.toLowerCase() === normalizedEmail ||
            (a.aliases && a.aliases.some((alias) => alias.toLowerCase() === normalizedEmail))
        );

        const isPasswordValid =
          staff &&
          (staff.password === normalizedPassword ||
            (staff.passwords && staff.passwords.includes(normalizedPassword)));

        if (!staff || !isPasswordValid) {
          const nextAttempts = loginFailedAttempts + 1;
          const willLock = nextAttempts >= 5;
          const lockUntil = willLock ? Date.now() + 15 * 60 * 1000 : 0;

          set({
            loginFailedAttempts: nextAttempts,
            loginLockoutUntil: lockUntil,
          });

          soundService.playAlert();
          return {
            success: false,
            message: willLock
              ? 'Security Lockout: 5 failed attempts reached. Workstation locked for 15 minutes.'
              : `Invalid email or password. (${5 - nextAttempts} attempt${5 - nextAttempts === 1 ? '' : 's'} remaining)`,
            attemptsRemaining: Math.max(0, 5 - nextAttempts),
          };
        }

        // Check if account is suspended (Hole 5 Defense)
        if (!staff.isActive) {
          soundService.playAlert();
          return {
            success: false,
            message: 'Your staff account has been deactivated by the Clinic Administrator.',
          };
        }

        // Successful Login
        set({
          isAuthenticated: true,
          currentStaff: staff,
          pin: staff.pin,
          isLocked: false,
          loginFailedAttempts: 0,
          loginLockoutUntil: 0,
          isEjected: false,
          ejectionReason: null,
        });

        soundService.playChime();
        return { success: true, staff };
      },

      // 1-Click Quick Demo Login (Strictly Receptionists or Clinic Admin)
      quickDemoLogin: (staffId) => {
        // Demo mode only: the 1-click presets must never authenticate a live
        // workstation, even if a future view wires the button back up.
        if (!useAppModeStore.getState().isDemoMode) {
          return { success: false, message: 'Demo login is disabled in live mode.' };
        }
        const staff = AUTHORIZED_STAFF_ACCOUNTS.find((a) => a.id === staffId) || AUTHORIZED_STAFF_ACCOUNTS[0];
        set({
          isAuthenticated: true,
          currentStaff: staff,
          pin: staff.pin,
          isLocked: false,
          loginFailedAttempts: 0,
          loginLockoutUntil: 0,
          isEjected: false,
          ejectionReason: null,
        });
        soundService.playChime();
        return { success: true, staff };
      },

      clearLoginLockout: () => {
        set({ loginFailedAttempts: 0, loginLockoutUntil: 0 });
      },

      // Log Out: Clear Session & Return to Login Portal (Optimistic & Instant)
      logout: () => {
        try {
          apiService.logout();
        } catch {
          // Ignore network errors on logout
        }
        localStorage.removeItem('cbs_auth_token');
        localStorage.removeItem('cbs_refresh_token');
        set({
          isAuthenticated: false,
          currentStaff: null,
          pin: null,
          isLocked: false,
          isEjected: false,
          ejectionReason: null,
        });
        soundService.playChime();
      },

      // Switch User / Return to Master Login Portal
      switchUser: () => {
        try {
          apiService.logout();
        } catch {
          // Ignore network errors
        }
        localStorage.removeItem('cbs_auth_token');
        localStorage.removeItem('cbs_refresh_token');
        set({
          isAuthenticated: false,
          currentStaff: null,
          pin: null,
          isLocked: false,
          failedAttempts: 0,
          lockoutRemaining: 0,
          isEjected: false,
          ejectionReason: null,
        });
        soundService.playChime();
      },

      // Lock Workstation (Manual or 20m Idle Timeout)
      lockWorkstation: () => set({ isLocked: true }),

      // Verify 4-Digit Quick-PIN
      unlockWorkstation: async (pinAttempt) => {
        const { pin, failedAttempts, lockoutRemaining, currentStaff } = get();

        if (lockoutRemaining > 0) {
          return { success: false, reason: 'LOCKED_OUT' };
        }

        // Demo mode: local persona check (there is no backend session).
        if (useAppModeStore.getState().isDemoMode) {
          const correctPin = pin || currentStaff?.pin || '1234';
          if (pinAttempt === correctPin) {
            set({
              isLocked: false,
              failedAttempts: 0,
              lockoutRemaining: 0,
            });
            return { success: true };
          }
          const nextAttempts = failedAttempts + 1;
          if (nextAttempts >= 3) {
            set({ failedAttempts: nextAttempts, lockoutRemaining: 60 });
            return { success: false, reason: 'MAX_ATTEMPTS_EXCEEDED', cooldown: 60 };
          }
          set({ failedAttempts: nextAttempts });
          return { success: false, reason: 'INVALID_PIN', attemptsLeft: 3 - nextAttempts };
        }

        // Live mode: the server is the ONLY PIN authority (Phase 2.5, system
        // review finding #3). The client holds no PIN and no '1234' fallback —
        // the old code unlocked on a locally guessed value and merely told the
        // backend afterwards. The endpoint requires the staff session, so the
        // PIN is verified against the same account the JWT belongs to.
        try {
          await apiService.unlockPin(pinAttempt);
          set({
            isLocked: false,
            failedAttempts: 0,
            lockoutRemaining: 0,
          });
          return { success: true };
        } catch (err) {
          // Session expired while locked: a full password re-login is required.
          if (err.status === 401) {
            get().logout();
            return { success: false, reason: 'SESSION_EXPIRED' };
          }
          // Server-side 3-strike shield active: mirror its cooldown locally.
          if (err.status === 423) {
            const cooldown = (err.details && err.details.cooldown_seconds) || 60;
            set({ failedAttempts: 3, lockoutRemaining: cooldown });
            return { success: false, reason: 'MAX_ATTEMPTS_EXCEEDED', cooldown };
          }
          // 400 INVALID_PIN (or anything unexpected): count the attempt.
          const nextAttempts = failedAttempts + 1;
          if (nextAttempts >= 3) {
            set({ failedAttempts: nextAttempts, lockoutRemaining: 60 });
            return { success: false, reason: 'MAX_ATTEMPTS_EXCEEDED', cooldown: 60 };
          }
          set({ failedAttempts: nextAttempts });
          return { success: false, reason: 'INVALID_PIN', attemptsLeft: 3 - nextAttempts };
        }
      },

      // Tick PIN cooldown timer
      decrementLockout: () => {
        const { lockoutRemaining } = get();
        if (lockoutRemaining > 1) {
          set({ lockoutRemaining: lockoutRemaining - 1 });
        } else if (lockoutRemaining === 1) {
          set({ lockoutRemaining: 0, failedAttempts: 0 });
        }
      },

      resetLockout: () => set({ lockoutRemaining: 0, failedAttempts: 0 }),

      // Immediate 401 Session Ejection
      ejectSession: (reason = 'Staff session revoked by Clinic Administrator') => {
        localStorage.removeItem('cbs_auth_token');
        localStorage.removeItem('cbs_refresh_token');
        set({
          isAuthenticated: false,
          currentStaff: null,
          isLocked: false,
          isEjected: true,
          ejectionReason: reason,
        });
      },

      setLockTimeout: (minutes) => set({ lockTimeoutMinutes: minutes }),

      dismissToast: () => set({ toast: null }),
    }),
    {
      name: 'cbs_auth_session',
      partialize: (state) => ({
        isAuthenticated: state.isAuthenticated,
        currentStaff: state.currentStaff,
        pin: state.pin,
      }),
    }
  )
);

// Listen for global 401 unauthorized events emitted by apiService
if (typeof window !== 'undefined') {
  window.addEventListener('cbs_auth_unauthorized', () => {
    useAuthStore.getState().ejectSession('Your session has expired or was revoked by Clinic Administration.');
  });
}

