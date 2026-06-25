import { useMemo } from "react";
import { NavLink } from "react-router-dom";
import { NAV_ITEMS } from "../app/navigation";
import { useAuth } from "../auth/AuthContext";
import { useClientLocale } from "../i18n/ClientLocaleContext";
import type { NavigationItem } from "../types/navigation";

function SidebarNav() {
  const { user, logout } = useAuth();
  const { isClientUser, t } = useClientLocale();
  const visibleItems = useMemo(
    () => NAV_ITEMS.filter((item) => (user ? item.allowedRoles.includes(user.role) : false)),
    [user]
  );
  const navSections = useMemo(
    () =>
      Array.from(
        visibleItems.reduce((map, item) => {
          const sectionKey = item.sectionKey ?? item.section;
          const existingItems = map.get(sectionKey) ?? [];
          existingItems.push(item);
          map.set(sectionKey, existingItems);
          return map;
        }, new Map<string, NavigationItem[]>())
      ),
    [visibleItems]
  );

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <p className="sidebar-kicker">{t("sidebar.brand")}</p>
        <h2 className="sidebar-title">
          {isClientUser ? t("sidebar.clientTitle") : t("sidebar.adminTitle")}
        </h2>
        <p className="sidebar-brand-copy">
          {isClientUser ? t("sidebar.clientDescription") : t("sidebar.adminDescription")}
        </p>
      </div>

      <nav className="sidebar-nav" aria-label="Primary">
        {navSections.map(([sectionKey, items]) => (
          <div key={sectionKey} className="sidebar-group">
            <p className="sidebar-group-title">{t(sectionKey)}</p>
            <div className="sidebar-group-links">
              {items.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) =>
                    isActive ? "sidebar-link sidebar-link-active" : "sidebar-link"
                  }
                >
                  <span className="sidebar-link-label">{t(item.labelKey ?? item.label)}</span>
                  <span className="sidebar-link-copy">{t(item.descriptionKey ?? item.description)}</span>
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="sidebar-status-card">
        <p className="sidebar-status-title">{t("sidebar.currentMode")}</p>
        <p className="sidebar-status-value">
          {isClientUser ? t("sidebar.clientMode") : t("sidebar.adminMode")}
        </p>
      </div>

      <button
        type="button"
        className="sidebar-logout-button"
        onClick={() => void logout()}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="sidebar-logout-icon">
          <path d="M10 4H6.5C5.1 4 4 5.1 4 6.5v11C4 18.9 5.1 20 6.5 20H10" />
          <path d="M14 7l5 5-5 5" />
          <path d="M19 12H9" />
        </svg>
        <span>{t("topbar.logout")}</span>
      </button>
    </aside>
  );
}

export default SidebarNav;
