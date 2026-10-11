import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginPage } from './components/auth/LoginPage';
import { QuickPinLockModal } from './components/auth/QuickPinLockModal';
import { Sidebar } from './components/common/Sidebar';
import { Header } from './components/common/Header';

// Presentational Modules (UI)
import { RequestsModule } from './components/requests/RequestsModule';
import { LiveVisitsModule } from './components/visits/LiveVisitsModule';
import { StaffDirectoryModule } from './components/staff/StaffDirectoryModule';
import { AnalyticsModule } from './components/analytics/AnalyticsModule';
import { ClinicSettingsModule } from './components/settings/ClinicSettingsModule';

// Custom Hooks (Business Logic)
import { useBookingRequests } from './hooks/useBookingRequests';
import { useLiveVisits } from './hooks/useLiveVisits';
import { useStaffDirectory } from './hooks/useStaffDirectory';
import { useClinicSettings } from './hooks/useClinicSettings';

// Utilities
import { playNotificationChime } from './utils/audioChime';
import './App.css';

const MainApp = () => {
  const { currentUser, lockScreen } = useAuth();
  const [activeModule, setActiveModule] = useState('requests'); // requests, visits, staff, analytics, settings
  const [chimeEnabled, setChimeEnabled] = useState(true);
  const [toast, setToast] = useState(null);

  const showToast = (message) => {
    setToast(message);
    setTimeout(() => setToast(null), 3500);
  };

  const triggerChime = () => {
    if (chimeEnabled) {
      playNotificationChime();
    }
  };

  // --- Logic Separation: Custom Hooks Controllers ---
  const requestsController = useBookingRequests({
    onNewRequestNotification: triggerChime,
    onDispatchedOffer: (offer) => {
      showToast(`Dispatched 1-hour slot options to ${offer.patientName}!`);
    }
  });

  const visitsController = useLiveVisits({
    onNotification: triggerChime
  });

  const staffController = useStaffDirectory({
    onToast: showToast
  });

  const settingsController = useClinicSettings({
    onToast: showToast
  });

  // Dynamic Doctors List derived directly from Staff Directory
  const activeDoctors = React.useMemo(() => {
    return staffController.staffList
      .filter(s => s.role === 'doctor' && s.is_active)
      .map(s => ({
        id: s.id,
        name: s.full_name,
        specialty: s.specialty || s.desk || 'Practitioner',
        email: s.email,
        phone: s.phone,
        duty_status: s.duty_status
      }));
  }, [staffController.staffList]);

  // If unauthenticated or deactivated, render Login Portal
  if (!currentUser) {
    return <LoginPage />;
  }

  // Simple Titles for Top Header
  const getModuleTitle = () => {
    switch (activeModule) {
      case 'requests': return 'New Patient Requests';
      case 'visits': return "Today's Visits";
      case 'staff': return 'Staff Directory';
      case 'analytics': return 'Reports & Analytics';
      case 'settings': return 'Clinic Settings';
      default: return 'Reception Desk';
    }
  };

  const pendingRequestsCount = requestsController.requests.filter(
    r => ['awaiting_review', 're_requested'].includes(r.status)
  ).length;

  return (
    <div className="dashboard-layout">
      {/* Quick PIN Auto-Lock Overlay */}
      <QuickPinLockModal />

      {/* Floating Dark Glass Sidebar */}
      <Sidebar
        activeModule={activeModule}
        setActiveModule={setActiveModule}
        pendingRequestsCount={pendingRequestsCount}
        onLockScreen={lockScreen}
      />

      {/* Main Content Area */}
      <div className="dashboard-main-area">
        {/* Sleek Minimal Top Header */}
        <Header
          activeTitle={getModuleTitle()}
        />

        {/* Dedicated Section View */}
        <main style={{ flex: 1 }}>
          {activeModule === 'requests' && (
            <RequestsModule
              controller={requestsController}
              doctors={activeDoctors}
              onSendMessage={(reqId, msg, ch) => {
                showToast(`Message sent via ${ch.toUpperCase()}.`);
              }}
            />
          )}

          {activeModule === 'visits' && (
            <LiveVisitsModule
              controller={visitsController}
              doctors={activeDoctors}
            />
          )}

          {activeModule === 'staff' && (
            <StaffDirectoryModule
              controller={staffController}
            />
          )}

          {activeModule === 'analytics' && (
            <AnalyticsModule
              appointments={visitsController.appointments}
              requests={requestsController.requests}
              staffList={staffController.staffList}
            />
          )}

          {activeModule === 'settings' && (
            <ClinicSettingsModule
              controller={settingsController}
              chimeEnabled={chimeEnabled}
              setChimeEnabled={setChimeEnabled}
              onTestChime={triggerChime}
            />
          )}
        </main>
      </div>

      {/* Translucent Dark Glass Toast Notification */}
      {toast && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          background: 'rgba(20, 21, 25, 0.92)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          color: '#ffffff',
          padding: '12px 20px',
          borderRadius: 'var(--radius-pill)',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)',
          zIndex: 3000,
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          fontSize: '0.8125rem'
        }}>
          <span style={{ color: 'var(--color-accent-orange)' }}>⚡</span>
          <div>{toast}</div>
        </div>
      )}
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}
