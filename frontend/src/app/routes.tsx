import { lazy, Suspense } from "react";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { canAccessPath, getDefaultPathForRole } from "../auth/access";
import { useAuth } from "../auth/AuthContext";
import LoadingState from "../components/LoadingState";
import { useClientLocale } from "../i18n/ClientLocaleContext";
import DashboardLayout from "../layouts/DashboardLayout";

const BaileysPage = lazy(() => import("../pages/BaileysPage"));
const ChannelAccountsPage = lazy(() => import("../pages/ChannelAccountsPage"));
const ChannelsPage = lazy(() => import("../pages/ChannelsPage"));
const ContactSectionsPage = lazy(() => import("../pages/ContactSectionsPage"));
const DashboardPage = lazy(() => import("../pages/DashboardPage"));
const InterestedPeoplePage = lazy(() => import("../pages/InterestedPeoplePage"));
const LoginPage = lazy(() => import("../pages/LoginPage"));
const NotFoundPage = lazy(() => import("../pages/NotFoundPage"));
const TemplatesPage = lazy(() => import("../pages/TemplatesPage"));
const WhatsAppOutreachPage = lazy(() => import("../pages/WhatsAppOutreachPage"));
const UsersPage = lazy(() => import("../pages/UsersPage"));

function AuthLoadingScreen() {
  const { t } = useClientLocale();

  return (
    <div className="auth-shell">
      <div className="auth-card auth-card-loading">
        <LoadingState text={t("common.loadingDashboardAccess")} />
      </div>
    </div>
  );
}

function LoginRoute() {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return <AuthLoadingScreen />;
  }

  if (isAuthenticated && user) {
    return <Navigate to={getDefaultPathForRole(user.role)} replace />;
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
    return <Navigate to={getDefaultPathForRole(user.role)} replace />;
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
              <Route index element={<RoleHomeRedirect />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/users" element={<UsersPage />} />
              <Route path="/whatsapp-outreach" element={<WhatsAppOutreachPage />} />
              <Route path="/templates" element={<TemplatesPage />} />
              <Route path="/contact-sections" element={<ContactSectionsPage />} />
              <Route path="/interested-people" element={<InterestedPeoplePage />} />
              <Route path="/baileys" element={<BaileysPage />} />
              <Route path="/channel-accounts" element={<ChannelAccountsPage />} />
              <Route path="/channels" element={<ChannelsPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Route>
        </Route>
      </Routes>
    </Suspense>
  );
}

function RoleHomeRedirect() {
  const { user } = useAuth();
  return <Navigate to={user ? getDefaultPathForRole(user.role) : "/login"} replace />;
}
