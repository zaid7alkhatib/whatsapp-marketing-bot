import { NavLink } from "react-router-dom";
import { NAV_ITEMS } from "../app/navigation";

function SidebarNav() {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <p className="sidebar-kicker">Conversational Bot</p>
        <h2 className="sidebar-title">Admin Console</h2>
      </div>

      <nav className="sidebar-nav" aria-label="Primary">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              isActive ? "sidebar-link sidebar-link-active" : "sidebar-link"
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

export default SidebarNav;
