import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { NAV_ITEMS } from "../app/navigation";
import api from "../services/api";
import type { HealthResponse } from "../types/api";

type HealthStatus = "loading" | "online" | "error";

const FEATURED_LINKS = NAV_ITEMS.filter((item) =>
  ["/org-units", "/content-templates", "/flows", "/flow-steps", "/runtime-test", "/sessions"].includes(
    item.path
  )
);

function DashboardPage() {
  const [status, setStatus] = useState<HealthStatus>("loading");
  const [message, setMessage] = useState("Checking backend connectivity...");

  const runHealthCheck = useCallback(async () => {
    setStatus("loading");
    setMessage("Checking backend connectivity...");

    try {
      const response = await api.get<HealthResponse>("/health");
      if (response.data.success) {
        setStatus("online");
        setMessage(response.data.message ?? "Backend is reachable.");
        return;
      }

      setStatus("error");
      setMessage("Health endpoint responded without success.");
    } catch {
      setStatus("error");
      setMessage("Unable to reach backend.");
    }
  }, []);

  useEffect(() => {
    void runHealthCheck();
  }, [runHealthCheck]);

  return (
    <div className="dashboard-overview">
      <section className="dashboard-hero">
        <div className="dashboard-hero-copy">
          <p className="dashboard-hero-kicker">Pre-live workspace</p>
          <h2 className="dashboard-hero-title">Operate the platform from metadata setup to runtime verification.</h2>
          <p className="dashboard-hero-description">
            The console is organized around three jobs: configure the workspace, design conversation
            behavior, and validate what the engine actually does before any provider goes live.
          </p>
        </div>

        <div className="dashboard-hero-panel">
          <p className="dashboard-panel-label">Backend health</p>
          <div className="health-row">
            <span className={`health-pill health-pill-${status}`}>
              {status === "loading" ? "Loading" : status === "online" ? "Online" : "Error"}
            </span>
            <span className="health-message">{message}</span>
          </div>
          <p className="dashboard-panel-copy">
            Source: <code>/health</code>. Confirm this first before testing flows or provider connectivity.
          </p>
          <button type="button" className="secondary-button" onClick={() => void runHealthCheck()}>
            Retry health check
          </button>
        </div>
      </section>

      <section className="dashboard-link-grid">
        {FEATURED_LINKS.map((item) => (
          <Link key={item.path} to={item.path} className="dashboard-link-card">
            <p className="dashboard-link-section">{item.section}</p>
            <h3 className="dashboard-link-title">{item.label}</h3>
            <p className="dashboard-link-description">{item.description}</p>
            <span className="dashboard-link-action">Open page</span>
          </Link>
        ))}
      </section>
    </div>
  );
}

export default DashboardPage;
