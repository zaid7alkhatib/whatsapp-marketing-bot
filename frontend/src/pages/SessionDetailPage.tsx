import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { Link, useParams } from "react-router-dom";
import InlineAlert from "../components/InlineAlert";
import JsonBlock from "../components/JsonBlock";
import LoadingState from "../components/LoadingState";
import PageSection from "../components/PageSection";
import StatusBadge from "../components/StatusBadge";
import api from "../services/api";
import type { ApiSuccessResponse } from "../types/api";

interface SessionDetailRecord {
  _id: string;
  channelUserRef: string;
  language: string;
  statusCode: string;
  currentStepCode?: string;
  startedAt: string;
  endedAt?: string;
  lastActivityAt: string;
  orgUnitId?: string;
  channelId: string;
  channelAccountId: string;
  businessPartnerId?: string;
  flowId: string;
  flowVersion: number;
  collectedData?: unknown;
  contextSnapshot?: unknown;
  metadata?: unknown;
}

function formatDateTime(value?: string): string {
  if (!value) {
    return "-";
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return "-";
  }

  return parsedDate.toLocaleString();
}

function SessionDetailPage() {
  const { id } = useParams<{ id: string }>();

  const [session, setSession] = useState<SessionDetailRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isNotFound, setIsNotFound] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadSession = useCallback(async () => {
    if (!id) {
      setIsLoading(false);
      setIsNotFound(true);
      setErrorMessage("Session id is missing.");
      return;
    }

    setIsLoading(true);
    setIsNotFound(false);
    setErrorMessage(null);

    try {
      const response = await api.get<ApiSuccessResponse<SessionDetailRecord>>(
        `/api/v1/bot-sessions/${id}`
      );

      if (!response.data.success || !response.data.data) {
        throw new Error(response.data.message ?? "Failed to load session.");
      }

      setSession(response.data.data);
    } catch (error) {
      setSession(null);
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          setIsNotFound(true);
          setErrorMessage("Session not found.");
        } else {
          const apiMessage = (error.response?.data as { message?: string } | undefined)?.message;
          setErrorMessage(apiMessage ?? error.message ?? "Failed to load session.");
        }
      } else {
        setErrorMessage("Failed to load session.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  return (
    <PageSection
      title="Session Detail"
      description="Detailed bot session record."
      onRefresh={() => void loadSession()}
    >
      <p className="state-text">
        <Link className="table-link" to="/sessions">
          Back to Sessions
        </Link>
      </p>

      {isLoading ? <LoadingState text="Loading session..." /> : null}

      {!isLoading && isNotFound ? <InlineAlert tone="empty" message={errorMessage ?? "Session not found."} /> : null}

      {!isLoading && !isNotFound && errorMessage ? <InlineAlert tone="error" message={errorMessage} /> : null}

      {!isLoading && !errorMessage && session ? (
        <>
          <div className="table-wrap detail-wrap">
            <div className="detail-grid">
              <div className="detail-row">
                <span className="detail-label">ID</span>
                <span className="detail-value cell-mono">{session._id}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Channel User Ref</span>
                <span className="detail-value">{session.channelUserRef || "-"}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Language</span>
                <span className="detail-value">{session.language || "-"}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Status</span>
                <span className="detail-value">
                  <StatusBadge value={session.statusCode} />
                </span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Current Step Code</span>
                <span className="detail-value">{session.currentStepCode || "-"}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Started At</span>
                <span className="detail-value">{formatDateTime(session.startedAt)}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Ended At</span>
                <span className="detail-value">{formatDateTime(session.endedAt)}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Last Activity At</span>
                <span className="detail-value">{formatDateTime(session.lastActivityAt)}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Org Unit ID</span>
                <span className="detail-value cell-mono">{session.orgUnitId || "-"}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Channel ID</span>
                <span className="detail-value cell-mono">{session.channelId}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Channel Account ID</span>
                <span className="detail-value cell-mono">{session.channelAccountId}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Business Partner ID</span>
                <span className="detail-value cell-mono">{session.businessPartnerId || "-"}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Flow ID</span>
                <span className="detail-value cell-mono">{session.flowId}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Flow Version</span>
                <span className="detail-value">{session.flowVersion}</span>
              </div>
            </div>
          </div>

          <JsonBlock title="Collected Data" value={session.collectedData} />
          <JsonBlock title="Context Snapshot" value={session.contextSnapshot} />
          <JsonBlock title="Metadata" value={session.metadata} />
        </>
      ) : null}
    </PageSection>
  );
}

export default SessionDetailPage;
