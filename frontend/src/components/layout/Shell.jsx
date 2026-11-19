import React, { useEffect } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { LeftRail } from './LeftRail';
import { Header } from './Header';
import { PrivacyLockModal } from './PrivacyLockModal';
import { useAppModeStore } from '../../stores/appModeStore';
import { useAuthStore } from '../../stores/useAuthStore';
import { useQueueStore } from '../../stores/useQueueStore';
import { useCalendarStore } from '../../stores/useCalendarStore';
import { usePinLock } from '../../hooks/usePinLock';
import { apiService } from '../../services/apiService';
import { soundService } from '../../services/soundService';

/**
 * Shell — Root Master Layout Container
 * Hosts the LeftRail, Top Clinic Header, child Viewport Outlet, and PrivacyLockModal overlay.
 * Hardened for HIPAA/NDPR: unmounts dashboard DOM tree when workstation is locked.
 */
export const Shell = () => {
  const { isMobileDrawerOpen, closeMobileDrawer } = useAppModeStore();
  const { isLocked, isAuthenticated } = useAuthStore();
  // Fix 5 — stranded patients must be visible from anywhere in the hub, not
  // only on the calendar page. The count is read here (the container) and
  // handed to the rail as a prop.
  const strandedCount = useCalendarStore((state) => state.stranded?.count || 0);

  // Active idle timer listener for the 20-minute inactivity privacy lock
  usePinLock();

  // Fix 5 — a stranded patient (still booked under a doctor on leave) has to
  // be visible while reception sits on the queue, not only on the calendar.
  // Quiet refresh: no loading flash, and a failed read keeps the last count.
  useEffect(() => {
    if (!isAuthenticated) return undefined;

    const refreshStranded = () => {
      if (useCalendarStore.getState().loadStranded) {
        useCalendarStore.getState().loadStranded({ silent: true });
      }
    };

    refreshStranded();
    const timer = setInterval(refreshStranded, 60000);
    return () => clearInterval(timer);
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;

    const disconnect = apiService.connectEventStream((evt) => {
      if (!evt || !evt.type) return;

      if (evt.type === 'request.created') {
        if (useQueueStore.getState().syncFromBackend) {
          useQueueStore.getState().syncFromBackend();
        }
        soundService.playChime();
      } else if (evt.type === 'slot.held' || evt.type === 'appointment.status_changed') {
        if (useQueueStore.getState().syncFromBackend) {
          useQueueStore.getState().syncFromBackend();
        }
        if (useCalendarStore.getState().syncFromBackend) {
          useCalendarStore.getState().syncFromBackend();
        }
        if (useCalendarStore.getState().loadStranded) {
          useCalendarStore.getState().loadStranded({ silent: true });
        }
        soundService.playChime();
      } else if (evt.type === 'request.reviewing') {
        const reqId = evt.request_id || evt.data?.request_id;
        const reviewer = evt.reviewer_name || evt.data?.reviewer_name || null;
        const reviewerEmail = (evt.reviewer_email || evt.data?.reviewer_email || '').toLowerCase();
        // Hide MY OWN presence badge by comparing identities (email), not a
        // hardcoded first name (system review finding #8).
        const myEmail = (useAuthStore.getState().currentStaff?.email || '').toLowerCase();
        if (reqId && (!reviewerEmail || reviewerEmail !== myEmail)) {
          useQueueStore.getState().updateRequestField(reqId, {
            reviewingBy: evt.action === 'stop_review' ? null : reviewer,
          });
        }
      } else if (evt.type === 'request.re_requested') {
        // An expired-offer patient asked for fresh times: refresh the queue so
        // the priority Re-Requested tab updates live (was previously unhandled).
        if (useQueueStore.getState().syncFromBackend) {
          useQueueStore.getState().syncFromBackend();
        }
        soundService.playChime();
      }
    });

    return () => {
      if (disconnect) disconnect();
    };
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="app-shell">
      {/* Mobile Backdrop Overlay */}
      {isMobileDrawerOpen && (
        <div
          className="sidebar-backdrop"
          onClick={closeMobileDrawer}
          aria-label="Close Navigation Drawer"
        />
      )}

      {isLocked ? (
        <PrivacyLockModal />
      ) : (
        <>
          <LeftRail strandedCount={strandedCount} />
          <div className="main-stage">
            <Header />
            <main className="content-viewport" id="main-content">
              <Outlet />
            </main>
          </div>
        </>
      )}
    </div>
  );
};
