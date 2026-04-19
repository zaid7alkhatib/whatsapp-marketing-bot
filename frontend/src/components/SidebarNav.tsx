import { NavLink } from "react-router-dom";
import { NAV_ITEMS } from "../app/navigation";
import type { NavigationItem } from "../types/navigation";

const NAV_SECTIONS = Array.from(
  NAV_ITEMS.reduce((map, item) => {
    const existingItems = map.get(item.section) ?? [];
    existingItems.push(item);
    map.set(item.section, existingItems);
    return map;
  }, new Map<string, NavigationItem[]>())
);

function SidebarNav() {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <p className="sidebar-kicker">Conversational Bot</p>
        <h2 className="sidebar-title">Admin Console</h2>
        <p className="sidebar-brand-copy">
          Configure flows, monitor sessions, and validate runtime behavior from one internal workspace.
        </p>
      </div>

      <nav className="sidebar-nav" aria-label="Primary">
        {NAV_SECTIONS.map(([section, items]) => (
          <div key={section} className="sidebar-group">
            <p className="sidebar-group-title">{section}</p>
            <div className="sidebar-group-links">
              {items.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) =>
                    isActive ? "sidebar-link sidebar-link-active" : "sidebar-link"
                  }
                >
                  <span className="sidebar-link-label">{item.label}</span>
                  <span className="sidebar-link-copy">{item.description}</span>
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="sidebar-status-card">
        <p className="sidebar-status-title">Current Mode</p>
        <p className="sidebar-status-value">Internal staging console</p>
        <p className="sidebar-status-copy">
          Use Runtime Test for controlled message runs before any live provider activation.
        </p>
      </div>
    </aside>
  );
}

export default SidebarNav;
