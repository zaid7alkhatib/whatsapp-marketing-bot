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

interface FlowDetailRecord {
  _id: string;
  code: string;
  name: string;
  version: number;
  status: string;
  startStepCode: string;
  appliesTo?: unknown;
  settings?: unknown;
  createdAt?: string;
  updatedAt?: string;
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

function FlowDetailPage() {
  const { id } = useParams<{ id: string }>();

  const [flow, setFlow] = useState<FlowDetailRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isNotFound, setIsNotFound] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadFlow = useCallback(async () => {
    if (!id) {
      setIsLoading(false);
      setIsNotFound(true);
      setErrorMessage("Flow id is missing.");
      return;
    }

    setIsLoading(true);
    setIsNotFound(false);
    setErrorMessage(null);

    try {
      const response = await api.get<ApiSuccessResponse<FlowDetailRecord>>(`/api/v1/flows/${id}`);

      if (!response.data.success || !response.data.data) {
        throw new Error(response.data.message ?? "Failed to load flow.");
      }

      setFlow(response.data.data);
    } catch (error) {
      setFlow(null);
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          setIsNotFound(true);
          setErrorMessage("Flow not found.");
        } else {
          const apiMessage = (error.response?.data as { message?: string } | undefined)?.message;
          setErrorMessage(apiMessage ?? error.message ?? "Failed to load flow.");
        }
      } else {
        setErrorMessage("Failed to load flow.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadFlow();
  }, [loadFlow]);

  return (
    <PageSection
      title="Flow Detail"
      description="Detailed flow record."
      onRefresh={() => void loadFlow()}
    >
      <p className="state-text">
        <Link className="table-link" to="/flows">
          Back to Flows
        </Link>
      </p>

      {isLoading ? <LoadingState text="Loading flow..." /> : null}

      {!isLoading && isNotFound ? <InlineAlert tone="empty" message={errorMessage ?? "Flow not found."} /> : null}

      {!isLoading && !isNotFound && errorMessage ? <InlineAlert tone="error" message={errorMessage} /> : null}

      {!isLoading && !errorMessage && flow ? (
        <>
          <div className="table-wrap detail-wrap">
            <div className="detail-grid">
              <div className="detail-row">
                <span className="detail-label">ID</span>
                <span className="detail-value cell-mono">{flow._id}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Code</span>
                <span className="detail-value">{flow.code}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Name</span>
                <span className="detail-value">{flow.name}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Version</span>
                <span className="detail-value">{flow.version}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Status</span>
                <span className="detail-value">
                  <StatusBadge value={flow.status} />
                </span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Start Step Code</span>
                <span className="detail-value">{flow.startStepCode}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Created At</span>
                <span className="detail-value">{formatDateTime(flow.createdAt)}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Updated At</span>
                <span className="detail-value">{formatDateTime(flow.updatedAt)}</span>
              </div>
            </div>
          </div>

          <JsonBlock title="Applies To" value={flow.appliesTo} />
          <JsonBlock title="Settings" value={flow.settings} />
        </>
      ) : null}
    </PageSection>
  );
}

export default FlowDetailPage;
