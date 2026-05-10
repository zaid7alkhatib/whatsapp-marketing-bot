import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { NAV_ITEMS } from "../app/navigation";
import { useAuth } from "../auth/AuthContext";
import useRequestInboxCounts from "../hooks/useRequestInboxCounts";
import { useClientLocale } from "../i18n/ClientLocaleContext";
import api from "../services/api";
import type { HealthResponse } from "../types/api";

type HealthStatus = "loading" | "online" | "error";

function DashboardPage() {
  const { user } = useAuth();
  const { isClientUser, t } = useClientLocale();
  const { generalNewCount, appointmentNewCount } = useRequestInboxCounts(user?.role === "user");
  const [status, setStatus] = useState<HealthStatus>("loading");
  const [message, setMessage] = useState(t("common.loading"));
  const featuredPaths =
    user?.role === "user"
      ? [
          "/flow-messages",
          "/flow-steps",
          "/gemini",
          "/baileys",
          "/medical-appointments",
          "/service-requests",
        ]
      : [
          "/client-accounts",
          "/org-units",
          "/gemini",
          "/content-templates",
          "/flows",
          "/flow-steps",
          "/runtime-test",
          "/sessions",
        ];
  const featuredLinks = NAV_ITEMS.filter(
    (item) => !!user && item.allowedRoles.includes(user.role) && featuredPaths.includes(item.path)
  );
  const featuredCountByPath: Record<string, number> =
    isClientUser
      ? {
          "/service-requests": generalNewCount,
          "/medical-appointments": appointmentNewCount,
        }
      : {};
  const getFeaturedLabel = (path: string, label: string) => {
    if (!isClientUser) {
      return label;
    }

    switch (path) {
      case "/flow-messages":
        return t("nav.flowMessages.title");
      case "/flow-steps":
        return t("nav.flowSteps.title");
      case "/gemini":
        return t("nav.gemini.title");
      case "/baileys":
        return t("nav.baileys.title");
      case "/medical-appointments":
        return t("nav.medicalAppointments.title");
      case "/service-requests":
        return t("nav.serviceRequests.title");
      default:
        return label;
    }
  };
  const getFeaturedDescription = (path: string, description: string) => {
    if (!isClientUser) {
      return description;
    }

    switch (path) {
      case "/flow-messages":
        return t("nav.flowMessages.description");
      case "/flow-steps":
        return t("nav.flowSteps.description");
      case "/gemini":
        return t("nav.gemini.description");
      case "/baileys":
        return t("nav.baileys.description");
      case "/medical-appointments":
        return t("nav.medicalAppointments.description");
      case "/service-requests":
        return t("nav.serviceRequests.description");
      default:
        return description;
    }
  };

  const runHealthCheck = useCallback(async () => {
    setStatus("loading");
    setMessage(t("common.loading"));

    try {
      const response = await api.get<HealthResponse>("/health");
      if (response.data.success) {
        setStatus("online");
        setMessage(response.data.message ?? t("dashboard.healthRunning"));
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
          <p className="dashboard-hero-kicker">
            {isClientUser ? t("dashboard.heroKicker") : "Pre-live workspace"}
          </p>
          <h2 className="dashboard-hero-title">
            {isClientUser
              ? t("dashboard.heroTitle")
              : "Operate the platform from metadata setup to runtime verification."}
          </h2>
          <p className="dashboard-hero-description">
            {isClientUser
              ? t("dashboard.heroDescription")
              : "The console is organized around three jobs: configure the workspace, design conversation behavior, and validate what the engine actually does before any provider goes live."}
          </p>
        </div>

        <div className="dashboard-hero-panel">
          <p className="dashboard-panel-label">
            {isClientUser ? t("dashboard.healthTitle") : "Backend health"}
          </p>
          <div className="health-row">
            <span className={`health-pill health-pill-${status}`}>
              {status === "loading"
                ? t("common.loading")
                : status === "online"
                  ? t("dashboard.healthOnline")
                  : t("dashboard.healthOffline")}
            </span>
            <span className="health-message">{message}</span>
          </div>
          <p className="dashboard-panel-copy">
            {isClientUser
              ? t("dashboard.healthSource", { path: "/health" })
              : "Source: /health. Confirm this first before testing flows or provider connectivity."}
          </p>
          <button type="button" className="secondary-button" onClick={() => void runHealthCheck()}>
            {isClientUser ? t("dashboard.healthRetry") : "Retry health check"}
          </button>
        </div>
      </section>

      {isClientUser ? (
        <section className="dashboard-user-guide">
          <h3 className="dashboard-user-guide-title">{t("dashboard.workflowTitle")}</h3>
          <ol className="dashboard-user-guide-list">
            <li>{t("dashboard.workflow1")}</li>
            <li>{t("dashboard.workflow2")}</li>
            <li>{t("dashboard.workflow3")}</li>
            <li>{t("dashboard.workflow4")}</li>
          </ol>
        </section>
      ) : null}

      <section className="dashboard-link-grid">
        {featuredLinks.map((item) => (
          <Link key={item.path} to={item.path} className="dashboard-link-card">
            <p className="dashboard-link-section">
              {isClientUser
                ? item.section === "Conversation Design"
                  ? t("section.conversationDesign")
                  : item.section === "Operations"
                    ? t("section.operations")
                    : item.section
                : item.section}
            </p>
            <h3 className="dashboard-link-title">
              <span>{getFeaturedLabel(item.path, item.label)}</span>
              {featuredCountByPath[item.path] > 0 ? (
                <span className="dashboard-link-counter">
                  {t("dashboard.cardNew", { count: featuredCountByPath[item.path] })}
                </span>
              ) : null}
            </h3>
            <p className="dashboard-link-description">
              {getFeaturedDescription(item.path, item.description)}
            </p>
            <span className="dashboard-link-action">
              {isClientUser ? t("common.openPage") : "Open page"}
            </span>
          </Link>
        ))}
      </section>
    </div>
  );
}

export default DashboardPage;
