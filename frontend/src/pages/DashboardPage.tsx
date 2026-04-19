import { useCallback, useEffect, useState } from "react";
import api from "../services/api";
import type { HealthResponse } from "../types/api";

type HealthStatus = "loading" | "online" | "error";

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
    <section className="card">
      <h2 className="card-title">Backend Health</h2>
      <p className="card-description">
        Current API status from <code>/health</code>.
      </p>

      <div className="health-row">
        <span className={`health-pill health-pill-${status}`}>
          {status === "loading" ? "Loading" : status === "online" ? "Online" : "Error"}
        </span>
        <span className="health-message">{message}</span>
      </div>

      <button type="button" className="secondary-button" onClick={() => void runHealthCheck()}>
        Retry health check
      </button>
    </section>
  );
}

export default DashboardPage;

