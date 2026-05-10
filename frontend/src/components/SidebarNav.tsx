import { useMemo } from "react";
import { NavLink } from "react-router-dom";
import { NAV_ITEMS } from "../app/navigation";
import { useAuth } from "../auth/AuthContext";
import useRequestInboxCounts from "../hooks/useRequestInboxCounts";
import { useClientLocale } from "../i18n/ClientLocaleContext";
import type { NavigationItem } from "../types/navigation";

function SidebarNav() {
  const { user } = useAuth();
  const { isClientUser, t } = useClientLocale();
  const { generalNewCount, appointmentNewCount } = useRequestInboxCounts(user?.role === "user");
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
  const getSectionLabel = (section: string) => {
    if (!isClientUser) {
      return section;
    }

    switch (section.toLowerCase()) {
      case "overview":
        return t("section.overview");
      case "conversation design":
        return t("section.conversationDesign");
      case "operations":
        return t("section.operations");
      case "workspace setup":
        return t("section.workspaceSetup");
      default:
        return section;
    }
  };
  const countByPath = useMemo<Partial<Record<string, number>>>(
    () =>
      isClientUser
        ? {
            "/service-requests": generalNewCount,
            "/medical-appointments": appointmentNewCount,
          }
        : {},
    [appointmentNewCount, generalNewCount, isClientUser]
  );
  const getItemLabel = (item: NavigationItem) => {
    if (!isClientUser) {
      return item.label;
    }

    switch (item.path) {
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
        return item.label;
    }
  };
  const getItemDescription = (item: NavigationItem) => {
    if (!isClientUser) {
      return item.description;
    }

    switch (item.path) {
      case "/dashboard":
        return t("nav.dashboard.description");
      case "/flow-messages":
        return t("nav.flowMessages.description");
      case "/flow-steps":
        return t("nav.flowSteps.description");
      case "/service-requests":
        return t("nav.serviceRequests.description");
      case "/medical-appointments":
        return t("nav.medicalAppointments.description");
      case "/baileys":
        return t("nav.baileys.description");
      case "/gemini":
        return t("nav.gemini.description");
      default:
        return item.description;
    }
  };

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
        {navSections.map(([section, items]) => (
          <div key={section} className="sidebar-group">
            <p className="sidebar-group-title">{getSectionLabel(section)}</p>
            <div className="sidebar-group-links">
              {items.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) =>
                    isActive ? "sidebar-link sidebar-link-active" : "sidebar-link"
                  }
                >
                  <span className="sidebar-link-label">
                    <span>{getItemLabel(item)}</span>
            {(countByPath[item.path] ?? 0) > 0 ? (
              <span className="sidebar-link-counter">{countByPath[item.path] ?? 0}</span>
            ) : null}
                  </span>
                  <span className="sidebar-link-copy">{getItemDescription(item)}</span>
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="sidebar-status-card">
        <p className="sidebar-status-title">{t("sidebar.currentMode")}</p>
        <p className="sidebar-status-value">
          {isClientUser ? t("sidebar.clientScopeTitle") : "Internal staging console"}
        </p>
        <p className="sidebar-status-copy">
          {isClientUser
            ? t("sidebar.clientScopeDescription")
            : "Use Runtime Test for controlled message runs before any live provider activation."}
        </p>
      </div>
    </aside>
  );
}

export default SidebarNav;
