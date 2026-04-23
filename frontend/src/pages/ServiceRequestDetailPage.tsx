import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import InlineAlert from "../components/InlineAlert";
import JsonBlock from "../components/JsonBlock";
import LoadingState from "../components/LoadingState";
import PageSection from "../components/PageSection";
import StatusBadge from "../components/StatusBadge";
import api from "../services/api";
import type { ApiSuccessResponse } from "../types/api";

interface ClientServiceRequestPerson {
  fullName?: string;
  phone?: string;
  email?: string;
  dateOfBirth?: string;
  contactReference?: string;
}

interface ClientServiceRequestDetailRecord {
  _id: string;
  reference?: string;
  statusCode: string;
  priorityCode?: string;
  language?: string;
  submittedAt: string;
  requestTypeLabel?: string;
  serviceLabel?: string;
  clinicLabel?: string;
  person?: ClientServiceRequestPerson;
  details?: Array<{
    label: string;
    value: string;
    mediaUrl?: string;
  }>;
}

interface AdminServiceRequestDetailRecord {
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

type ServiceRequestDetailRecord =
  | ClientServiceRequestDetailRecord
  | AdminServiceRequestDetailRecord;

function formatDateTime(value?: string): string {
  if (!value) {
    return "-";
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return parsedDate.toLocaleString();
}

function ClientDetailMediaPreview({
  mediaUrl,
  label,
  value,
}: {
  mediaUrl: string;
  label: string;
  value: string;
}) {
  const [resolvedUrl, setResolvedUrl] = useState<string>(mediaUrl);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let isCancelled = false;

    async function loadProtectedMedia(): Promise<void> {
      if (!mediaUrl.includes("/api/v1/media/local/")) {
        setResolvedUrl(mediaUrl);
        setLoadError(null);
        return;
      }

      try {
        const response = await api.get<Blob>(mediaUrl, {
          responseType: "blob",
        });

        objectUrl = URL.createObjectURL(response.data);
        if (!isCancelled) {
          setResolvedUrl(objectUrl);
          setLoadError(null);
        }
      } catch {
        if (!isCancelled) {
          setLoadError("Could not load image preview.");
        }
      }
    }

    void loadProtectedMedia();

    return () => {
      isCancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [mediaUrl]);

  return (
    <div className="detail-media-block">
      <span className="detail-value">{value}</span>
      {loadError ? <span className="state-text">{loadError}</span> : null}
      {!loadError ? (
        <a className="table-link" href={resolvedUrl} target="_blank" rel="noreferrer">
          Open full image
        </a>
      ) : null}
      {!loadError ? (
        <img
          className="detail-media-preview"
          src={resolvedUrl}
          alt={label}
          loading="lazy"
        />
      ) : null}
    </div>
  );
}

function ServiceRequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const isClientUser = user?.role === "user";

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

  const clientServiceRequest = isClientUser
    ? (serviceRequest as ClientServiceRequestDetailRecord | null)
    : null;
  const adminServiceRequest = !isClientUser
    ? (serviceRequest as AdminServiceRequestDetailRecord | null)
    : null;

  return (
    <PageSection
      title={
        isClientUser
          ? `Request ${clientServiceRequest?.reference ?? id?.slice(-6) ?? ""}`.trim()
          : "Service Request Detail"
      }
      description={
        isClientUser
          ? "Formatted clinic request details for the client workspace."
          : "Detailed service request record."
      }
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

      {!isLoading && !isNotFound && errorMessage ? (
        <InlineAlert tone="error" message={errorMessage} />
      ) : null}

      {!isLoading && !errorMessage && clientServiceRequest && isClientUser ? (
        <div className="detail-section-stack">
          <div className="table-wrap detail-wrap">
            <div className="detail-grid">
              <div className="detail-row">
                <span className="detail-label">Request Number</span>
                <span className="detail-value">{clientServiceRequest.reference || "-"}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Status</span>
                <span className="detail-value">
                  <StatusBadge value={clientServiceRequest.statusCode} />
                </span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Service Needed</span>
                <span className="detail-value">
                  {clientServiceRequest.requestTypeLabel || "-"}
                </span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Clinic</span>
                <span className="detail-value">{clientServiceRequest.clinicLabel || "-"}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Service Area</span>
                <span className="detail-value">{clientServiceRequest.serviceLabel || "-"}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Language</span>
                <span className="detail-value">{clientServiceRequest.language || "-"}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Priority</span>
                <span className="detail-value">{clientServiceRequest.priorityCode || "-"}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Submitted At</span>
                <span className="detail-value">
                  {formatDateTime(clientServiceRequest.submittedAt)}
                </span>
              </div>
            </div>
          </div>

          <div>
            <h3 className="detail-section-heading">Person Details</h3>
            <div className="table-wrap detail-wrap">
              <div className="detail-grid">
                <div className="detail-row">
                  <span className="detail-label">Full Name</span>
                  <span className="detail-value">
                    {clientServiceRequest.person?.fullName || "Not provided"}
                  </span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Phone Number</span>
                  <span className="detail-value">
                    {clientServiceRequest.person?.phone ||
                      clientServiceRequest.person?.contactReference ||
                      "Not provided"}
                  </span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Email</span>
                  <span className="detail-value">
                    {clientServiceRequest.person?.email || "Not provided"}
                  </span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Date of Birth</span>
                  <span className="detail-value">
                    {clientServiceRequest.person?.dateOfBirth || "Not provided"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div>
            <h3 className="detail-section-heading">Submitted Information</h3>
            {clientServiceRequest.details && clientServiceRequest.details.length > 0 ? (
              <div className="table-wrap detail-wrap">
                <div className="detail-grid">
                  {clientServiceRequest.details.map((detail) => (
                    <div
                      className={`detail-row${detail.mediaUrl ? " detail-row-media" : ""}`}
                      key={`${detail.label}-${detail.value}-${detail.mediaUrl ?? "text"}`}
                    >
                      <span className="detail-label">{detail.label}</span>
                      {detail.mediaUrl ? (
                        <ClientDetailMediaPreview
                          mediaUrl={detail.mediaUrl}
                          label={detail.label}
                          value={detail.value}
                        />
                      ) : (
                        <span className="detail-value">{detail.value}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <InlineAlert
                tone="empty"
                message="No additional submitted details are available for this request."
              />
            )}
          </div>
        </div>
      ) : null}

      {!isLoading && !errorMessage && adminServiceRequest && !isClientUser ? (
        <>
          <div className="table-wrap detail-wrap">
            <div className="detail-grid">
              <div className="detail-row">
                <span className="detail-label">ID</span>
                <span className="detail-value cell-mono">{adminServiceRequest._id}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Status</span>
                <span className="detail-value">
                  <StatusBadge value={adminServiceRequest.statusCode} />
                </span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Priority</span>
                <span className="detail-value">{adminServiceRequest.priorityCode || "-"}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Source Channel Code</span>
                <span className="detail-value">{adminServiceRequest.sourceChannelCode || "-"}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Language</span>
                <span className="detail-value">{adminServiceRequest.language || "-"}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Submitted At</span>
                <span className="detail-value">{formatDateTime(adminServiceRequest.submittedAt)}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Org Unit ID</span>
                <span className="detail-value cell-mono">{adminServiceRequest.orgUnitId || "-"}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Business Partner ID</span>
                <span className="detail-value cell-mono">
                  {adminServiceRequest.businessPartnerId || "-"}
                </span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Session ID</span>
                <span className="detail-value cell-mono">{adminServiceRequest.sessionId || "-"}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Service ID</span>
                <span className="detail-value cell-mono">{adminServiceRequest.serviceId}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Request Type ID</span>
                <span className="detail-value cell-mono">{adminServiceRequest.requestTypeId}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Created At</span>
                <span className="detail-value">{formatDateTime(adminServiceRequest.createdAt)}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Updated At</span>
                <span className="detail-value">{formatDateTime(adminServiceRequest.updatedAt)}</span>
              </div>
            </div>
          </div>

          <JsonBlock title="Request Data" value={adminServiceRequest.requestData} />
          <JsonBlock title="AI Summary" value={adminServiceRequest.aiSummary} />
          <JsonBlock title="Snapshots" value={adminServiceRequest.snapshots} />
        </>
      ) : null}
    </PageSection>
  );
}

export default ServiceRequestDetailPage;
