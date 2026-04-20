import { useMemo } from "react";
import { NavLink } from "react-router-dom";
import { NAV_ITEMS } from "../app/navigation";
import { useAuth } from "../auth/AuthContext";
import type { NavigationItem } from "../types/navigation";

function SidebarNav() {
  const { user } = useAuth();
  const visibleItems = useMemo(
    () => NAV_ITEMS.filter((item) => (user ? item.allowedRoles.includes(user.role) : false)),
    [user]
  );
  const navSections = useMemo(
    () =>
      Array.from(
        visibleItems.reduce((map, item) => {
          const existingItems = map.get(item.section) ?? [];
          existingItems.push(item);
          map.set(item.section, existingItems);
          return map;
        }, new Map<string, NavigationItem[]>())
      ),
    [visibleItems]
  );

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <p className="sidebar-kicker">Conversational Bot</p>
        <h2 className="sidebar-title">{user?.role === "user" ? "Client Console" : "Admin Console"}</h2>
        <p className="sidebar-brand-copy">
          {user?.role === "user"
            ? "Review service requests, manage the clinic WhatsApp flow steps, and pair the approved WhatsApp account."
            : "Configure flows, monitor sessions, and validate runtime behavior from one internal workspace."}
        </p>
      </div>

      <nav className="sidebar-nav" aria-label="Primary">
        {navSections.map(([section, items]) => (
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
        <p className="sidebar-status-value">
          {user?.role === "user" ? "Client-limited workspace" : "Internal staging console"}
        </p>
        <p className="sidebar-status-copy">
          {user?.role === "user"
            ? "Only the scoped flow, the scoped WhatsApp account, and the related service requests are visible."
            : "Use Runtime Test for controlled message runs before any live provider activation."}
        </p>
      </div>
    </aside>
  );
}

export default SidebarNav;
