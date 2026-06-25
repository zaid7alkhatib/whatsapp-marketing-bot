import { Outlet, useLocation } from "react-router-dom";
import { NAV_ITEMS } from "../app/navigation";
import SidebarNav from "../components/SidebarNav";
import Topbar from "../components/Topbar";
import { useClientLocale } from "../i18n/ClientLocaleContext";

function DashboardLayout() {
  const location = useLocation();
  const { t } = useClientLocale();
  const currentItem = NAV_ITEMS.find(
    (item) =>
      location.pathname === item.path || location.pathname.startsWith(`${item.path}/`)
  );

  return (
    <div className="dashboard-shell">
      <SidebarNav />

      <div className="dashboard-main">
        <Topbar
          title={currentItem ? t(currentItem.titleKey ?? currentItem.title) : t("notFound.title")}
          description={
            currentItem
              ? t(currentItem.descriptionKey ?? currentItem.description)
              : t("notFound.description")
          }
          section={currentItem ? t(currentItem.sectionKey ?? currentItem.section) : ""}
        />
        <main className="content-area">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default DashboardLayout;
