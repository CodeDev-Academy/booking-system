import React from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { LeftRail } from './LeftRail';
import { Header } from './Header';
import { PrivacyLockModal } from './PrivacyLockModal';
import { useAppModeStore } from '../../stores/appModeStore';
import { useAuthStore } from '../../stores/useAuthStore';

/**
 * Shell — Root Master Layout Container
 * Hosts the LeftRail, Top Clinic Header, child Viewport Outlet, and PrivacyLockModal overlay.
 * Hardened for HIPAA/NDPR: unmounts dashboard DOM tree when workstation is locked.
 */
export const Shell = () => {
  const { isMobileDrawerOpen, closeMobileDrawer } = useAppModeStore();
  const { isLocked, isAuthenticated } = useAuthStore();

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
