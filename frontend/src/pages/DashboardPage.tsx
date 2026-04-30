import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { NAV_ITEMS } from "../app/navigation";
import { useAuth } from "../auth/AuthContext";
import api from "../services/api";
import type { HealthResponse } from "../types/api";

type HealthStatus = "loading" | "online" | "error";

function DashboardPage() {
  const { user } = useAuth();
  const [status, setStatus] = useState<HealthStatus>("loading");
  const [message, setMessage] = useState("Checking backend connectivity...");
  const featuredPaths =
    user?.role === "user"
      ? ["/flow-messages", "/flow-steps", "/gemini", "/baileys", "/service-requests"]
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
          <h2 className="dashboard-hero-title">
            {user?.role === "user"
              ? "Run the clinic WhatsApp flow from a tightly scoped client workspace."
              : "Operate the platform from metadata setup to runtime verification."}
          </h2>
          <p className="dashboard-hero-description">
            {user?.role === "user"
              ? "Use this workspace to maintain one clinic WhatsApp flow safely: update the message text people see, adjust step-by-step routing, pair WhatsApp, and follow real clinic requests."
              : "The console is organized around three jobs: configure the workspace, design conversation behavior, and validate what the engine actually does before any provider goes live."}
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

      {user?.role === "user" ? (
        <section className="dashboard-user-guide">
          <h3 className="dashboard-user-guide-title">Recommended workflow</h3>
          <ol className="dashboard-user-guide-list">
            <li>Write or update the visible prompt text first in <code>Flow Messages</code>.</li>
            <li>Use <code>Flow Steps</code> to inspect the full clinic flow, add new steps, and control where each answer goes next.</li>
            <li>Pair WhatsApp in <code>WhatsApp Pairing</code> before going live.</li>
            <li>Monitor real outcomes and uploaded documents in <code>Service Requests</code>.</li>
          </ol>
        </section>
      ) : null}

      <section className="dashboard-link-grid">
        {featuredLinks.map((item) => (
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
