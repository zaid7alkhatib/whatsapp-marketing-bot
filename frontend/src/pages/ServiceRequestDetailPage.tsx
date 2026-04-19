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

interface ServiceRequestDetailRecord {
  _id: string;
  statusCode: string;
  priorityCode?: string;
  sourceChannelCode?: string;
  language?: string;
  submittedAt: string;
  orgUnitId?: string;
  businessPartnerId?: string;
  sessionId?: string;
  serviceId: string;
  requestTypeId: string;
  requestData?: unknown;
  aiSummary?: unknown;
  snapshots?: unknown;
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

function ServiceRequestDetailPage() {
  const { id } = useParams<{ id: string }>();

  const [serviceRequest, setServiceRequest] = useState<ServiceRequestDetailRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isNotFound, setIsNotFound] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadServiceRequest = useCallback(async () => {
    if (!id) {
      setIsLoading(false);
      setIsNotFound(true);
      setErrorMessage("Service request id is missing.");
      return;
    }

    setIsLoading(true);
    setIsNotFound(false);
    setErrorMessage(null);

    try {
      const response = await api.get<ApiSuccessResponse<ServiceRequestDetailRecord>>(
        `/api/v1/service-requests/${id}`
      );

      if (!response.data.success || !response.data.data) {
        throw new Error(response.data.message ?? "Failed to load service request.");
      }

      setServiceRequest(response.data.data);
    } catch (error) {
      setServiceRequest(null);
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          setIsNotFound(true);
          setErrorMessage("Service request not found.");
        } else {
          const apiMessage = (error.response?.data as { message?: string } | undefined)?.message;
          setErrorMessage(apiMessage ?? error.message ?? "Failed to load service request.");
        }
      } else {
        setErrorMessage("Failed to load service request.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadServiceRequest();
  }, [loadServiceRequest]);

  return (
    <PageSection
      title="Service Request Detail"
      description="Detailed service request record."
      onRefresh={() => void loadServiceRequest()}
    >
      <p className="state-text">
        <Link className="table-link" to="/service-requests">
          Back to Service Requests
        </Link>
      </p>

      {isLoading ? <LoadingState text="Loading service request..." /> : null}

      {!isLoading && isNotFound ? (
        <InlineAlert tone="empty" message={errorMessage ?? "Service request not found."} />
      ) : null}

      {!isLoading && !isNotFound && errorMessage ? <InlineAlert tone="error" message={errorMessage} /> : null}

      {!isLoading && !errorMessage && serviceRequest ? (
        <>
          <div className="table-wrap detail-wrap">
            <div className="detail-grid">
              <div className="detail-row">
                <span className="detail-label">ID</span>
                <span className="detail-value cell-mono">{serviceRequest._id}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Status</span>
                <span className="detail-value">
                  <StatusBadge value={serviceRequest.statusCode} />
                </span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Priority</span>
                <span className="detail-value">{serviceRequest.priorityCode || "-"}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Source Channel Code</span>
                <span className="detail-value">{serviceRequest.sourceChannelCode || "-"}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Language</span>
                <span className="detail-value">{serviceRequest.language || "-"}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Submitted At</span>
                <span className="detail-value">{formatDateTime(serviceRequest.submittedAt)}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Org Unit ID</span>
                <span className="detail-value cell-mono">{serviceRequest.orgUnitId || "-"}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Business Partner ID</span>
                <span className="detail-value cell-mono">
                  {serviceRequest.businessPartnerId || "-"}
                </span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Session ID</span>
                <span className="detail-value cell-mono">{serviceRequest.sessionId || "-"}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Service ID</span>
                <span className="detail-value cell-mono">{serviceRequest.serviceId}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Request Type ID</span>
                <span className="detail-value cell-mono">{serviceRequest.requestTypeId}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Created At</span>
                <span className="detail-value">{formatDateTime(serviceRequest.createdAt)}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Updated At</span>
                <span className="detail-value">{formatDateTime(serviceRequest.updatedAt)}</span>
              </div>
            </div>
          </div>

          <JsonBlock title="Request Data" value={serviceRequest.requestData} />
          <JsonBlock title="AI Summary" value={serviceRequest.aiSummary} />
          <JsonBlock title="Snapshots" value={serviceRequest.snapshots} />
        </>
      ) : null}
    </PageSection>
  );
}

export default ServiceRequestDetailPage;
