import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from '@/features/auth/useAuth';
import { useIdleTimeout } from '@/features/auth/useIdleTimeout';
import LoginPage from '@/features/auth/LoginPage';
import DashboardPage from '@/features/dashboard/DashboardPage';
import ApprovalsPage from '@/features/approvals/ApprovalsPage';
import IncidentsPage from '@/features/incidents/IncidentsPage';
import MapPage from '@/features/map/MapPage';
import AmbulanceRequestsPage from '@/features/ambulance_requests/AmbulanceRequestsPage';
import DispatchPage from '@/features/dispatch/DispatchPage';
import RespondersPage from '@/features/responders/RespondersPage';
import DevicesPage from '@/features/devices/DevicesPage';
import ReportsPage from '@/features/reports/ReportsPage';
import AuditPage from '@/features/audit/AuditPage';
import SettingsPage from '@/features/settings/SettingsPage';

function IdleGuard() {
  useIdleTimeout();
  return null;
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { admin, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }
  if (!admin) return <Navigate to="/login" state={{ from: location }} replace />;
  return <>{children}</>;
}

export function AppRouter() {
  return (
    <>
      <IdleGuard />
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<RequireAuth><DashboardPage /></RequireAuth>} />
      <Route path="/incidents" element={<RequireAuth><IncidentsPage /></RequireAuth>} />
      <Route path="/responders" element={<RequireAuth><RespondersPage /></RequireAuth>} />
      <Route path="/dispatch" element={<RequireAuth><DispatchPage /></RequireAuth>} />
      <Route path="/ambulance-requests" element={<RequireAuth><AmbulanceRequestsPage /></RequireAuth>} />
      <Route path="/map" element={<RequireAuth><MapPage /></RequireAuth>} />
      <Route path="/devices" element={<RequireAuth><DevicesPage /></RequireAuth>} />
      <Route path="/approvals" element={<RequireAuth><ApprovalsPage /></RequireAuth>} />
      <Route path="/reports" element={<RequireAuth><ReportsPage /></RequireAuth>} />
      <Route path="/audit" element={<RequireAuth><AuditPage /></RequireAuth>} />
      <Route path="/settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
    </>
  );
}
