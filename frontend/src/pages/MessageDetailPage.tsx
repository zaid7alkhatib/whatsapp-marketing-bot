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

interface MessageDetailRecord {
  _id: string;
  sessionId: string;
  direction: string;
  actorType: string;
  messageType: string;
  externalMessageId?: string;
  deliveryStatus?: string;
  content?: unknown;
  normalizedContent?: unknown;
  providerPayload?: unknown;
  sentAt?: string;
  receivedAt?: string;
  createdAt: string;
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

function MessageDetailPage() {
  const { id } = useParams<{ id: string }>();

  const [message, setMessage] = useState<MessageDetailRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isNotFound, setIsNotFound] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadMessage = useCallback(async () => {
    if (!id) {
      setIsLoading(false);
      setIsNotFound(true);
      setErrorMessage("Message id is missing.");
      return;
    }

    setIsLoading(true);
    setIsNotFound(false);
    setErrorMessage(null);

    try {
      const response = await api.get<ApiSuccessResponse<MessageDetailRecord>>(`/api/v1/messages/${id}`);

      if (!response.data.success || !response.data.data) {
        throw new Error(response.data.message ?? "Failed to load message.");
      }

      setMessage(response.data.data);
    } catch (error) {
      setMessage(null);
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          setIsNotFound(true);
          setErrorMessage("Message not found.");
        } else {
          const apiMessage = (error.response?.data as { message?: string } | undefined)?.message;
          setErrorMessage(apiMessage ?? error.message ?? "Failed to load message.");
        }
      } else {
        setErrorMessage("Failed to load message.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadMessage();
  }, [loadMessage]);

  return (
    <PageSection
      title="Message Detail"
      description="Detailed inbound/outbound message record."
      onRefresh={() => void loadMessage()}
    >
      <p className="state-text">
        <Link className="table-link" to="/messages">
          Back to Messages
        </Link>
      </p>

      {isLoading ? <LoadingState text="Loading message..." /> : null}

      {!isLoading && isNotFound ? <InlineAlert tone="empty" message={errorMessage ?? "Message not found."} /> : null}

      {!isLoading && !isNotFound && errorMessage ? <InlineAlert tone="error" message={errorMessage} /> : null}

      {!isLoading && !errorMessage && message ? (
        <>
          <div className="table-wrap detail-wrap">
            <div className="detail-grid">
              <div className="detail-row">
                <span className="detail-label">ID</span>
                <span className="detail-value cell-mono">{message._id}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Session ID</span>
                <span className="detail-value cell-mono">{message.sessionId}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Direction</span>
                <span className="detail-value">
                  <StatusBadge value={message.direction} />
                </span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Actor Type</span>
                <span className="detail-value">{message.actorType}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Message Type</span>
                <span className="detail-value">{message.messageType}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">External Message ID</span>
                <span className="detail-value cell-mono">{message.externalMessageId || "-"}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Delivery Status</span>
                <span className="detail-value">{message.deliveryStatus || "-"}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Sent At</span>
                <span className="detail-value">{formatDateTime(message.sentAt)}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Received At</span>
                <span className="detail-value">{formatDateTime(message.receivedAt)}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Created At</span>
                <span className="detail-value">{formatDateTime(message.createdAt)}</span>
              </div>
            </div>
          </div>

          <JsonBlock title="Content" value={message.content} />
          <JsonBlock title="Normalized Content" value={message.normalizedContent} />
          <JsonBlock title="Provider Payload" value={message.providerPayload} />
        </>
      ) : null}
    </PageSection>
  );
}

export default MessageDetailPage;
