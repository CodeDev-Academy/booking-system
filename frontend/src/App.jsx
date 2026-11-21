import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Shell } from './components/layout/Shell';

// Dynamic route-level code splitting for optimized initial load
const QueueView = lazy(() => import('./views/QueueView').then((m) => ({ default: m.QueueView })));
const CalendarView = lazy(() => import('./views/CalendarView').then((m) => ({ default: m.CalendarView })));
const LiveVisitsView = lazy(() => import('./views/LiveVisitsView').then((m) => ({ default: m.LiveVisitsView })));
const RecallsView = lazy(() => import('./views/RecallsView').then((m) => ({ default: m.RecallsView })));
const StaffView = lazy(() => import('./views/StaffView').then((m) => ({ default: m.StaffView })));
const SettingsView = lazy(() => import('./views/SettingsView').then((m) => ({ default: m.SettingsView })));
const SimulatorView = lazy(() => import('./views/SimulatorView').then((m) => ({ default: m.SimulatorView })));
const LoginView = lazy(() => import('./views/LoginView').then((m) => ({ default: m.LoginView })));
// Zero-partner route / Step 5: the patient's front door. Deliberately OUTSIDE
// the authenticated Shell — a patient never has a staff account.
const PublicBookingView = lazy(() =>
  import('./views/PublicBookingView').then((m) => ({ default: m.PublicBookingView }))
);

const RouteLoadingFallback = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '300px', color: 'var(--text-3)', fontSize: '13px' }}>
    <span className="duty-dot" style={{ marginRight: '8px' }} />
    <span>Loading Clinic Workstation...</span>
  </div>
);

/**
 * App — Root Application Component
 * Configures client-side routing, navigation shell, and lazy-loaded route views.
 */
function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteLoadingFallback />}>
        <Routes>
          <Route path="/login" element={<LoginView />} />
          <Route path="/book" element={<PublicBookingView />} />
          <Route path="/" element={<Shell />}>
            <Route index element={<Navigate to="/queue" replace />} />
            <Route path="queue" element={<QueueView />} />
            <Route path="calendar" element={<CalendarView />} />
            <Route path="live-visits" element={<LiveVisitsView />} />
            <Route path="recalls" element={<RecallsView />} />
            <Route path="admin/staff" element={<StaffView />} />
            <Route path="admin/settings" element={<SettingsView />} />
            <Route path="simulator" element={<SimulatorView />} />
            {/* Fallback to queue */}
            <Route path="*" element={<Navigate to="/queue" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
