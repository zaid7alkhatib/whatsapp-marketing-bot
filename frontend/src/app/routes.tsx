import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { canAccessPath } from "../auth/access";
import { useAuth } from "../auth/AuthContext";
import LoadingState from "../components/LoadingState";
import DashboardLayout from "../layouts/DashboardLayout";
import BaileysPage from "../pages/BaileysPage";
import BusinessPartnersPage from "../pages/BusinessPartnersPage";
import ChannelAccountsPage from "../pages/ChannelAccountsPage";
import ChannelsPage from "../pages/ChannelsPage";
import ClientAccountsPage from "../pages/ClientAccountsPage";
import ContentTemplatesPage from "../pages/ContentTemplatesPage";
import DashboardPage from "../pages/DashboardPage";
import GeminiPage from "../pages/GeminiPage";
import FlowsPage from "../pages/FlowsPage";
import FlowStepsPage from "../pages/FlowStepsPage";
import FlowMessagesPage from "../pages/FlowMessagesPage";
import FlowDetailPage from "../pages/FlowDetailPage";
import MessagesPage from "../pages/MessagesPage";
import MessageDetailPage from "../pages/MessageDetailPage";
import NotFoundPage from "../pages/NotFoundPage";
import OrgUnitsPage from "../pages/OrgUnitsPage";
import LoginPage from "../pages/LoginPage";
import MedicalAppointmentsPage from "../pages/MedicalAppointmentsPage";
import RequestTypesPage from "../pages/RequestTypesPage";
import RuntimeTestPage from "../pages/RuntimeTestPage";
import ServiceRequestsPage from "../pages/ServiceRequestsPage";
import ServiceRequestDetailPage from "../pages/ServiceRequestDetailPage";
import ServicesPage from "../pages/ServicesPage";
import SessionsPage from "../pages/SessionsPage";
import SessionDetailPage from "../pages/SessionDetailPage";

function AuthLoadingScreen() {
  return (
    <div className="auth-shell">
      <div className="auth-card auth-card-loading">
        <LoadingState text="Loading dashboard access..." />
      </div>
    </div>
  );
}

function LoginRoute() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <AuthLoadingScreen />;
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return <LoginPage />;
}

function RequireAuth() {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <AuthLoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}

function RequireRoleAccess() {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!canAccessPath(user.role, location.pathname)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route element={<RequireAuth />}>
        <Route element={<DashboardLayout />}>
          <Route element={<RequireRoleAccess />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/org-units" element={<OrgUnitsPage />} />
            <Route path="/client-accounts" element={<ClientAccountsPage />} />
            <Route path="/channels" element={<ChannelsPage />} />
            <Route path="/channel-accounts" element={<ChannelAccountsPage />} />
            <Route path="/business-partners" element={<BusinessPartnersPage />} />
            <Route path="/services" element={<ServicesPage />} />
            <Route path="/request-types" element={<RequestTypesPage />} />
            <Route path="/content-templates" element={<ContentTemplatesPage />} />
            <Route path="/flows" element={<FlowsPage />} />
            <Route path="/flows/:id" element={<FlowDetailPage />} />
            <Route path="/flow-steps" element={<FlowStepsPage />} />
            <Route path="/flow-messages" element={<FlowMessagesPage />} />
            <Route path="/gemini" element={<GeminiPage />} />
            <Route path="/sessions" element={<SessionsPage />} />
            <Route path="/sessions/:id" element={<SessionDetailPage />} />
            <Route path="/messages" element={<MessagesPage />} />
            <Route path="/messages/:id" element={<MessageDetailPage />} />
            <Route path="/medical-appointments" element={<MedicalAppointmentsPage />} />
            <Route path="/service-requests" element={<ServiceRequestsPage />} />
            <Route path="/service-requests/:id" element={<ServiceRequestDetailPage />} />
            <Route path="/baileys" element={<BaileysPage />} />
            <Route path="/runtime-test" element={<RuntimeTestPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  );
}
