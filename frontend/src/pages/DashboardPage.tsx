import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { NAV_ITEMS } from "../app/navigation";
import { useAuth } from "../auth/AuthContext";
import { useClientLocale } from "../i18n/ClientLocaleContext";
import NavigationIcon from "../components/NavigationIcon";
import api from "../services/api";
import type { HealthResponse } from "../types/api";

type HealthStatus = "loading" | "online" | "error";

function DashboardPage() {
  const { user } = useAuth();
  const { t } = useClientLocale();
  const [status, setStatus] = useState<HealthStatus>("loading");
  const [message, setMessage] = useState(t("common.loading"));
  const featuredPaths =
    user?.role === "super_admin"
      ? ["/users", "/whatsapp-outreach", "/templates", "/contact-sections", "/interested-people", "/baileys", "/channel-accounts", "/channels"]
      : user?.role === "admin"
        ? ["/whatsapp-outreach", "/templates", "/contact-sections", "/interested-people", "/baileys", "/channel-accounts", "/channels"]
      : ["/whatsapp-outreach", "/templates", "/contact-sections", "/interested-people", "/baileys"];
  const featuredLinks = NAV_ITEMS.filter(
    (item) => !!user && item.allowedRoles.includes(user.role) && featuredPaths.includes(item.path)
  );

  const runHealthCheck = useCallback(async () => {
    setStatus("loading");
    setMessage(t("common.loading"));

    try {
      const response = await api.get<HealthResponse>("/health");
      if (response.data.success) {
        setStatus("online");
        setMessage(t("dashboard.serverRunning"));
        return;
      }

      setStatus("error");
      setMessage(t("dashboard.healthUnavailable"));
    } catch {
      setStatus("error");
      setMessage(t("dashboard.healthUnavailable"));
    }
  }, [t]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void runHealthCheck();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [runHealthCheck]);

  return (
    <div className="dashboard-overview">
      <section className="dashboard-hero">
        <div className="dashboard-hero-copy">
          <p className="dashboard-hero-kicker">{t("dashboard.kicker")}</p>
          <h2 className="dashboard-hero-title">{t("dashboard.title")}</h2>
          <p className="dashboard-hero-description">
            {t("dashboard.description")}
          </p>
        </div>

        <div className="dashboard-hero-panel">
          <p className="dashboard-panel-label">{t("dashboard.health")}</p>
          <div className="health-row">
            <span className={`health-pill health-pill-${status}`}>
              {status === "loading" ? t("status.loading") : status === "online" ? t("status.online") : t("status.offline")}
            </span>
            <span className="health-message">{message}</span>
          </div>
          <p className="dashboard-panel-copy">
            {t("dashboard.healthSource")}
          </p>
          <button type="button" className="secondary-button" onClick={() => void runHealthCheck()}>
            {t("dashboard.retryHealth")}
          </button>
        </div>
      </section>

      <section className="dashboard-link-grid">
        {featuredLinks.map((item) => (
          <Link key={item.path} to={item.path} className="dashboard-link-card">
            <div className="dashboard-link-card-top">
              <NavigationIcon icon={item.icon} className="dashboard-link-icon" />
              <p className="dashboard-link-section">{t(item.sectionKey ?? item.section)}</p>
            </div>
            <div className="dashboard-link-card-copy">
              <h3 className="dashboard-link-title">{t(item.labelKey ?? item.label)}</h3>
              <p className="dashboard-link-description">{t(item.descriptionKey ?? item.description)}</p>
            </div>
            <span className="dashboard-link-action">{t("dashboard.openPage")}</span>
          </Link>
        ))}
      </section>
    </div>
  );
}

export default DashboardPage;
