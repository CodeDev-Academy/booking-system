import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginPage } from './components/auth/LoginPage';
import { QuickPinLockModal } from './components/auth/QuickPinLockModal';
import { Header } from './components/common/Header';
import { Navigation } from './components/common/Navigation';

// Presentational Modules (UI)
import { RequestsModule } from './components/requests/RequestsModule';
import { LiveVisitsModule } from './components/visits/LiveVisitsModule';
import { StaffDirectoryModule } from './components/staff/StaffDirectoryModule';
import { AnalyticsModule } from './components/analytics/AnalyticsModule';
import { ClinicSettingsModule } from './components/settings/ClinicSettingsModule';
import { PatientSimulatorModule } from './components/simulator/PatientSimulatorModule';

// Logic Custom Hooks (Business Logic)
import { useBookingRequests } from './hooks/useBookingRequests';
import { useLiveVisits } from './hooks/useLiveVisits';
import { useStaffDirectory } from './hooks/useStaffDirectory';
import { useClinicSettings } from './hooks/useClinicSettings';

// Utilities
import { playNotificationChime } from './utils/audioChime';
import './App.css';

const MainApp = () => {
  const { currentUser } = useAuth();
  const [activeModule, setActiveModule] = useState('requests'); // requests, visits, staff, analytics, settings, simulator
  const [chimeEnabled, setChimeEnabled] = useState(true);
  const [toast, setToast] = useState(null);
  const [activeDispatchedOffers, setActiveDispatchedOffers] = useState([]);

  const showToast = (message) => {
    setToast(message);
    setTimeout(() => setToast(null), 4000);
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
      setActiveDispatchedOffers(prev => [...prev, offer]);
      showToast(`Approved candidate slots for ${offer.patientName}! Dispatched with 1-hour expiry.`);
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

  // If user is unauthenticated or deactivated, render Login Portal
  if (!currentUser) {
    return <LoginPage />;
  }

  // --- Cross-Module Event Bridges (Patient Simulator Integration) ---
  const handlePatientWebSubmit = (newReq) => {
    requestsController.addExternalRequest(newReq);
    showToast(`📥 Patient booking submitted via Web Widget! Ref: ${newReq.request_id}`);
  };

  const handlePatientSelectSlot = (appointmentId, slot, pName, pPhone) => {
    const newAppointment = {
      appointment_id: appointmentId,
      patient_name: pName,
      patient_phone: pPhone,
      doctor_id: slot.doctor_id,
      doctor_name: slot.doctor_name,
      service_name: "Dental Consultation",
      start_datetime: slot.start_datetime,
      end_datetime: slot.end_datetime,
      time_label: slot.display_label,
      status: 'confirmed',
      arrival_at: null,
      room: 'Confirmed Upcoming',
      notes: 'Booked via patient phone simulator.'
    };
    visitsController.addConfirmedAppointment(newAppointment);
    showToast(`🎉 Patient confirmed slot! Appointment ${appointmentId} placed on Live Schedule.`);
  };

  const handlePatientReRequest = (reqId, pName) => {
    requestsController.reEngageExpired(reqId);
    showToast(`⚡ Priority Alert: ${pName} re-requested fresh available times!`);
  };

  // Live badge counts from controllers
  const pendingRequestsCount = requestsController.requests.filter(
    r => ['awaiting_review', 're_requested'].includes(r.status)
  ).length;

  const waitingVisitsCount = visitsController.arrivedCount;
  const onDutyStaffCount = staffController.staffList.filter(s => s.duty_status === 'on_duty').length;

  return (
    <div className="app-container">
      {/* Quick PIN Auto-Lock Overlay */}
      <QuickPinLockModal />

      {/* Header */}
      <Header
        chimeEnabled={chimeEnabled}
        setChimeEnabled={setChimeEnabled}
        onTestChime={triggerChime}
      />

      {/* Navigation */}
      <Navigation
        activeModule={activeModule}
        setActiveModule={setActiveModule}
        pendingRequestsCount={pendingRequestsCount}
        waitingVisitsCount={waitingVisitsCount}
        onDutyStaffCount={onDutyStaffCount}
      />

      {/* Main Content Area */}
      <main className="main-content">
        <div className="container">
          {activeModule === 'requests' && (
            <RequestsModule
              controller={requestsController}
              onSendMessage={(reqId, msg, ch) => {
                showToast(`Clinical prompt delivered to patient via ${ch.toUpperCase()} webhook.`);
              }}
            />
          )}

          {activeModule === 'visits' && (
            <LiveVisitsModule
              controller={visitsController}
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
            />
          )}

          {activeModule === 'simulator' && (
            <PatientSimulatorModule
              onSubmitPatientRequest={handlePatientWebSubmit}
              activeDispatchedOffers={activeDispatchedOffers}
              onPatientSelectSlot={handlePatientSelectSlot}
              onPatientReRequestNewTimes={handlePatientReRequest}
            />
          )}
        </div>
      </main>

      {/* Global Toast Alert */}
      {toast && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          backgroundColor: 'var(--color-primary-dark)',
          color: 'white',
          padding: '14px 22px',
          borderRadius: '12px',
          boxShadow: 'var(--shadow-xl)',
          zIndex: 2000,
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          fontSize: '0.875rem',
          maxWidth: '440px'
        }}>
          <span>🔔</span>
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
