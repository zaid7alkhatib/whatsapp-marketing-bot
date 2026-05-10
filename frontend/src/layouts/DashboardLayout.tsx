import { Outlet, useLocation } from "react-router-dom";
import { NAV_ITEMS } from "../app/navigation";
import SidebarNav from "../components/SidebarNav";
import Topbar from "../components/Topbar";
import { useClientLocale } from "../i18n/ClientLocaleContext";

function DashboardLayout() {
  const location = useLocation();
  const { isClientUser, t } = useClientLocale();
  const currentItem = NAV_ITEMS.find(
    (item) =>
      location.pathname === item.path || location.pathname.startsWith(`${item.path}/`)
  );

  const getLocalizedTitle = () => {
    if (!isClientUser || !currentItem) {
      return currentItem?.title ?? "Page Not Found";
    }

    switch (currentItem.path) {
      case "/dashboard":
        return t("nav.dashboard.title");
      case "/flow-messages":
        return t("nav.flowMessages.title");
      case "/flow-steps":
        return t("nav.flowSteps.title");
      case "/service-requests":
        return t("nav.serviceRequests.title");
      case "/medical-appointments":
        return t("nav.medicalAppointments.title");
      case "/baileys":
        return t("nav.baileys.title");
      case "/gemini":
        return t("nav.gemini.title");
      default:
        return currentItem.title;
    }
  };

  const getLocalizedDescription = () => {
    if (!isClientUser || !currentItem) {
      return currentItem?.description ?? "The requested page does not exist.";
    }

    switch (currentItem.path) {
      case "/dashboard":
        return t("nav.dashboard.description");
      case "/flow-messages":
        return t("nav.flowMessages.description");
      case "/flow-steps":
        return t("nav.flowSteps.description");
      case "/service-requests":
        return "Review unresolved clinic requests first, then open older request history only when needed.";
      case "/medical-appointments":
        return t("nav.medicalAppointments.description");
      case "/baileys":
        return t("nav.baileys.description");
      case "/gemini":
        return t("nav.gemini.description");
      default:
        return currentItem.description;
    }
  };

  const getLocalizedSection = () => {
    if (!isClientUser) {
      return currentItem?.section ?? "Navigation";
    }

    switch ((currentItem?.section ?? "").toLowerCase()) {
      case "overview":
        return t("section.overview");
      case "conversation design":
        return t("section.conversationDesign");
      case "operations":
        return t("section.operations");
      case "workspace setup":
        return t("section.workspaceSetup");
      default:
        return currentItem?.section ?? t("section.navigation");
    }
  };

  return (
    <div className="dashboard-shell">
      <SidebarNav />

      <div className="dashboard-main">
        <Topbar
          title={getLocalizedTitle()}
          description={getLocalizedDescription()}
          section={getLocalizedSection()}
        />
        <main className="content-area">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default DashboardLayout;
