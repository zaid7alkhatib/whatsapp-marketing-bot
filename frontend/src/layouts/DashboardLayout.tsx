import { Outlet, useLocation } from "react-router-dom";
import { NAV_ITEMS } from "../app/navigation";
import SidebarNav from "../components/SidebarNav";
import Topbar from "../components/Topbar";

function DashboardLayout() {
  const location = useLocation();
  const currentItem = NAV_ITEMS.find(
    (item) =>
      location.pathname === item.path || location.pathname.startsWith(`${item.path}/`)
  );

  return (
    <div className="dashboard-shell">
      <SidebarNav />

      <div className="dashboard-main">
        <Topbar
          title={currentItem?.title ?? "Page Not Found"}
          description={currentItem?.description ?? "The requested page does not exist."}
        />
        <main className="content-area">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default DashboardLayout;
