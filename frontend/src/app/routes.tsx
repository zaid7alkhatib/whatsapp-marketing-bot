import { Navigate, Route, Routes } from "react-router-dom";
import DashboardLayout from "../layouts/DashboardLayout";
import BaileysPage from "../pages/BaileysPage";
import BusinessPartnersPage from "../pages/BusinessPartnersPage";
import ChannelAccountsPage from "../pages/ChannelAccountsPage";
import ChannelsPage from "../pages/ChannelsPage";
import ContentTemplatesPage from "../pages/ContentTemplatesPage";
import DashboardPage from "../pages/DashboardPage";
import FlowsPage from "../pages/FlowsPage";
import FlowStepsPage from "../pages/FlowStepsPage";
import FlowDetailPage from "../pages/FlowDetailPage";
import MessagesPage from "../pages/MessagesPage";
import MessageDetailPage from "../pages/MessageDetailPage";
import NotFoundPage from "../pages/NotFoundPage";
import OrgUnitsPage from "../pages/OrgUnitsPage";
import RequestTypesPage from "../pages/RequestTypesPage";
import RuntimeTestPage from "../pages/RuntimeTestPage";
import ServiceRequestsPage from "../pages/ServiceRequestsPage";
import ServiceRequestDetailPage from "../pages/ServiceRequestDetailPage";
import ServicesPage from "../pages/ServicesPage";
import SessionsPage from "../pages/SessionsPage";
import SessionDetailPage from "../pages/SessionDetailPage";

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<DashboardLayout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/org-units" element={<OrgUnitsPage />} />
        <Route path="/channels" element={<ChannelsPage />} />
        <Route path="/channel-accounts" element={<ChannelAccountsPage />} />
        <Route path="/business-partners" element={<BusinessPartnersPage />} />
        <Route path="/services" element={<ServicesPage />} />
        <Route path="/request-types" element={<RequestTypesPage />} />
        <Route path="/content-templates" element={<ContentTemplatesPage />} />
        <Route path="/flows" element={<FlowsPage />} />
        <Route path="/flows/:id" element={<FlowDetailPage />} />
        <Route path="/flow-steps" element={<FlowStepsPage />} />
        <Route path="/sessions" element={<SessionsPage />} />
        <Route path="/sessions/:id" element={<SessionDetailPage />} />
        <Route path="/messages" element={<MessagesPage />} />
        <Route path="/messages/:id" element={<MessageDetailPage />} />
        <Route path="/service-requests" element={<ServiceRequestsPage />} />
        <Route path="/service-requests/:id" element={<ServiceRequestDetailPage />} />
        <Route path="/baileys" element={<BaileysPage />} />
        <Route path="/runtime-test" element={<RuntimeTestPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
