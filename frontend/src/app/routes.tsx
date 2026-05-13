import { lazy, Suspense } from "react";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { canAccessPath } from "../auth/access";
import { useAuth } from "../auth/AuthContext";
import LoadingState from "../components/LoadingState";
import DashboardLayout from "../layouts/DashboardLayout";

const BaileysPage = lazy(() => import("../pages/BaileysPage"));
const BusinessPartnersPage = lazy(() => import("../pages/BusinessPartnersPage"));
const ChannelAccountsPage = lazy(() => import("../pages/ChannelAccountsPage"));
const ChannelsPage = lazy(() => import("../pages/ChannelsPage"));
const ClientAccountsPage = lazy(() => import("../pages/ClientAccountsPage"));
const ContentTemplatesPage = lazy(() => import("../pages/ContentTemplatesPage"));
const DashboardPage = lazy(() => import("../pages/DashboardPage"));
const GeminiPage = lazy(() => import("../pages/GeminiPage"));
const FlowsPage = lazy(() => import("../pages/FlowsPage"));
const FlowStepsPage = lazy(() => import("../pages/FlowStepsPage"));
const FlowMessagesPage = lazy(() => import("../pages/FlowMessagesPage"));
const FlowDetailPage = lazy(() => import("../pages/FlowDetailPage"));
const MessagesPage = lazy(() => import("../pages/MessagesPage"));
const MessageDetailPage = lazy(() => import("../pages/MessageDetailPage"));
const NotFoundPage = lazy(() => import("../pages/NotFoundPage"));
const OrgUnitsPage = lazy(() => import("../pages/OrgUnitsPage"));
const LoginPage = lazy(() => import("../pages/LoginPage"));
const MedicalAppointmentsPage = lazy(() => import("../pages/MedicalAppointmentsPage"));
const RequestTypesPage = lazy(() => import("../pages/RequestTypesPage"));
const RuntimeTestPage = lazy(() => import("../pages/RuntimeTestPage"));
const ServiceRequestsPage = lazy(() => import("../pages/ServiceRequestsPage"));
const ServiceRequestDetailPage = lazy(() => import("../pages/ServiceRequestDetailPage"));
const ServicesPage = lazy(() => import("../pages/ServicesPage"));
const SessionsPage = lazy(() => import("../pages/SessionsPage"));
const SessionDetailPage = lazy(() => import("../pages/SessionDetailPage"));
const TeamUsersPage = lazy(() => import("../pages/TeamUsersPage"));

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
    <Suspense fallback={<AuthLoadingScreen />}>
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
              <Route path="/team-users" element={<TeamUsersPage />} />
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
    </Suspense>
  );
}
