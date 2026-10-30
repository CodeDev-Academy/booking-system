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
  const { isMobileDrawerOpen, closeMobileDrawer, isDemoMode } = useAppModeStore();
  const { isLocked, isAuthenticated } = useAuthStore();

  // Active idle timer listener for the 20-minute inactivity privacy lock
  usePinLock();

  useEffect(() => {
    if (!isAuthenticated || isDemoMode) return undefined;

    const disconnect = apiService.connectEventStream((evt) => {
      if (!evt || !evt.type) return;

      if (evt.type === 'request.created') {
        if (useQueueStore.getState().syncFromBackend) {
          useQueueStore.getState().syncFromBackend();
        }
        soundService.playChime();
      } else if (evt.type === 'slot.held' || evt.type === 'appointment.updated') {
        if (useQueueStore.getState().syncFromBackend) {
          useQueueStore.getState().syncFromBackend();
        }
        if (useCalendarStore.getState().syncFromBackend) {
          useCalendarStore.getState().syncFromBackend();
        }
        soundService.playChime();
      } else if (evt.type === 'presence.reviewing') {
        const reqId = evt.request_id || evt.data?.request_id;
        const reviewer = evt.reviewer_name || evt.data?.reviewer_name || null;
        if (reqId) {
          useQueueStore.getState().updateRequestField(reqId, {
            reviewingBy: evt.action === 'stop_review' ? null : reviewer,
          });
        }
      }
    });

    return () => {
      if (disconnect) disconnect();
    };
  }, [isAuthenticated, isDemoMode]);

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
          <LeftRail />
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
