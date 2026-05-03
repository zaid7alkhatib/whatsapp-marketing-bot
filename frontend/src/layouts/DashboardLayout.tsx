import { Outlet, useLocation } from "react-router-dom";
import { NAV_ITEMS } from "../app/navigation";
import { useAuth } from "../auth/AuthContext";
import SidebarNav from "../components/SidebarNav";
import Topbar from "../components/Topbar";

function DashboardLayout() {
  const location = useLocation();
  const { user } = useAuth();
  const currentItem = NAV_ITEMS.find(
    (item) =>
      location.pathname === item.path || location.pathname.startsWith(`${item.path}/`)
  );
  const currentTitle =
    user?.role === "user" && currentItem?.path === "/service-requests"
      ? "General Requests"
      : currentItem?.title ?? "Page Not Found";
  const currentDescription =
    user?.role === "user" && currentItem?.path === "/service-requests"
      ? "Review unresolved clinic requests first, then open older request history only when needed."
      : currentItem?.description ?? "The requested page does not exist.";

  return (
    <div className="dashboard-shell">
      <SidebarNav />

      <div className="dashboard-main">
        <Topbar
          title={currentTitle}
          description={currentDescription}
          section={currentItem?.section ?? "Navigation"}
        />
        <main className="content-area">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default DashboardLayout;
