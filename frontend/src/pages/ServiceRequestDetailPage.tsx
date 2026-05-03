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
  languageCode?: string;
  language?: string;
  submittedAt: string;
  requestTypeLabel?: string;
  requestTypeCode?: string;
  serviceLabel?: string;
  serviceCode?: string;
  clinicLabel?: string;
  isAppointment?: boolean;
  requestedAppointmentDate?: string;
  requestedAppointmentDateLabel?: string;
  requestedAppointmentTime?: string;
  requestedAppointmentTimeLabel?: string;
  resolutionData?: {
    decision?: string;
    alternateDate?: string;
    alternateDateLabel?: string;
    alternateTime?: string;
    alternateTimeLabel?: string;
    decidedAt?: string;
  };
  person?: ClientServiceRequestPerson;
  details?: Array<{
    label: string;
    value: string;
    mediaUrl?: string;
    mediaMimeType?: string;
    mediaFileName?: string;
    mediaItems?: Array<{
      value: string;
      mediaUrl: string;
      mediaMimeType?: string;
      mediaFileName?: string;
    }>;
    ocrFields?: Array<{
      label: string;
      value: string;
    }>;
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

interface AppointmentScheduleOption {
  input: string;
  value: string;
  label: string;
}

interface AppointmentScheduleOptionsResponse {
  dateOptions: AppointmentScheduleOption[];
  timeOptions: AppointmentScheduleOption[];
}

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
  mediaMimeType,
  mediaFileName,
  label,
  value,
  ocrFields,
}: {
  mediaUrl: string;
  mediaMimeType?: string;
  mediaFileName?: string;
  label: string;
  value: string;
  ocrFields?: Array<{
    label: string;
    value: string;
  }>;
}) {
  const [resolvedUrl, setResolvedUrl] = useState<string>(mediaUrl);
  const [loadError, setLoadError] = useState<string | null>(null);
  const isImageAttachment = (mediaMimeType ?? "").toLowerCase().startsWith("image/");

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
      {ocrFields && ocrFields.length > 0 ? (
        <div className="detail-media-ocr">
          <span className="detail-label">Detected card details</span>
          <div className="detail-media-ocr-grid">
            {ocrFields.map((field) => (
              <div
                className="detail-media-ocr-item"
                key={`${field.label}-${field.value}`}
              >
                <span className="detail-label">{field.label}</span>
                <span className="detail-value">{field.value}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {loadError ? <span className="state-text">{loadError}</span> : null}
      {!loadError ? (
        <a className="table-link" href={resolvedUrl} target="_blank" rel="noreferrer">
          {isImageAttachment ? "Open full image" : `Open file${mediaFileName ? `: ${mediaFileName}` : ""}`}
        </a>
      ) : null}
      {!loadError && isImageAttachment ? (
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

function ClientDetailMediaGallery({
  label,
  mediaItems,
}: {
  label: string;
  mediaItems: Array<{
    value: string;
    mediaUrl: string;
    mediaMimeType?: string;
    mediaFileName?: string;
  }>;
}) {
  return (
    <div className="detail-media-gallery">
      {mediaItems.map((item, index) => (
        <div className="detail-media-gallery-item" key={`${item.mediaUrl}-${index}`}>
          <span className="detail-label">Attachment {index + 1}</span>
          <ClientDetailMediaPreview
            mediaUrl={item.mediaUrl}
            mediaMimeType={item.mediaMimeType}
            mediaFileName={item.mediaFileName}
            label={`${label} ${index + 1}`}
            value={item.value}
          />
        </div>
      ))}
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
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [decisionSuccess, setDecisionSuccess] = useState<string | null>(null);
  const [isSubmittingDecision, setIsSubmittingDecision] = useState(false);
  const [markDoneError, setMarkDoneError] = useState<string | null>(null);
  const [markDoneSuccess, setMarkDoneSuccess] = useState<string | null>(null);
  const [isMarkingDone, setIsMarkingDone] = useState(false);
  const [appointmentDateOptions, setAppointmentDateOptions] = useState<
    AppointmentScheduleOption[]
  >([]);
  const [appointmentTimeOptions, setAppointmentTimeOptions] = useState<
    AppointmentScheduleOption[]
  >([]);
  const [alternateDate, setAlternateDate] = useState("");
  const [alternateTime, setAlternateTime] = useState("");

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
      setDecisionError(null);
      setDecisionSuccess(null);
      setMarkDoneError(null);
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

  const loadAppointmentSchedule = useCallback(
    async (selectedDate?: string) => {
      if (!clientServiceRequest?.isAppointment) {
        setAppointmentDateOptions([]);
        setAppointmentTimeOptions([]);
        return;
      }

      try {
        const response = await api.get<ApiSuccessResponse<AppointmentScheduleOptionsResponse>>(
          "/api/v1/client/medical-appointments/schedule-options",
          {
            params: {
              language: clientServiceRequest.languageCode ?? "en",
              selectedDate,
            },
          }
        );

        if (!response.data.success || !response.data.data) {
          throw new Error(response.data.message ?? "Failed to load appointment schedule.");
        }

        setAppointmentDateOptions(response.data.data.dateOptions ?? []);
        setAppointmentTimeOptions(response.data.data.timeOptions ?? []);
      } catch (error) {
        const apiMessage = axios.isAxiosError(error)
          ? (error.response?.data as { message?: string } | undefined)?.message
          : undefined;
        setDecisionError(apiMessage ?? "Failed to load appointment schedule options.");
      }
    },
    [clientServiceRequest]
  );

  useEffect(() => {
    if (!clientServiceRequest?.isAppointment) {
      setAppointmentDateOptions([]);
      setAppointmentTimeOptions([]);
      setAlternateDate("");
      setAlternateTime("");
      return;
    }

    void loadAppointmentSchedule();
  }, [clientServiceRequest, loadAppointmentSchedule]);

  useEffect(() => {
    if (!alternateDate) {
      setAppointmentTimeOptions([]);
      setAlternateTime("");
      return;
    }

    void loadAppointmentSchedule(alternateDate);
  }, [alternateDate, loadAppointmentSchedule]);

  const submitAppointmentDecision = useCallback(
    async (decision: "approved" | "alternate_offer") => {
      if (!id || !clientServiceRequest?.isAppointment) {
        return;
      }

      if (decision === "alternate_offer" && (!alternateDate || !alternateTime)) {
        setDecisionError("Choose an alternate appointment date and time first.");
        return;
      }

      setIsSubmittingDecision(true);
      setDecisionError(null);
      setDecisionSuccess(null);

      try {
        const response = await api.post<ApiSuccessResponse>(
          `/api/v1/client/medical-appointments/${id}/decision`,
          {
            decision,
            alternateDate: decision === "alternate_offer" ? alternateDate : undefined,
            alternateTime: decision === "alternate_offer" ? alternateTime : undefined,
          }
        );

        if (!response.data.success) {
          throw new Error(response.data.message ?? "Failed to submit appointment decision.");
        }

        setDecisionSuccess(
          decision === "approved"
            ? "Approval sent to the customer."
            : "Alternate appointment offer sent to the customer."
        );
        await loadServiceRequest();
      } catch (error) {
        const apiMessage = axios.isAxiosError(error)
          ? (error.response?.data as { message?: string } | undefined)?.message
          : undefined;
        setDecisionError(apiMessage ?? "Failed to send the appointment decision.");
      } finally {
        setIsSubmittingDecision(false);
      }
    },
    [alternateDate, alternateTime, clientServiceRequest, id, loadServiceRequest]
  );

  const markRequestDone = useCallback(async () => {
    if (!id || !clientServiceRequest) {
      return;
    }

    setIsMarkingDone(true);
    setMarkDoneError(null);
    setMarkDoneSuccess(null);

    try {
      const response = await api.post<ApiSuccessResponse>(
        `/api/v1/client/service-requests/${id}/mark-done`
      );

      if (!response.data.success) {
        throw new Error(response.data.message ?? "Failed to mark request as done.");
      }

      setMarkDoneSuccess("Request marked as done.");
      await loadServiceRequest();
    } catch (error) {
      const apiMessage = axios.isAxiosError(error)
        ? (error.response?.data as { message?: string } | undefined)?.message
        : undefined;
      setMarkDoneError(apiMessage ?? "Failed to mark request as done.");
    } finally {
      setIsMarkingDone(false);
    }
  }, [clientServiceRequest, id, loadServiceRequest]);

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
          {clientServiceRequest.statusCode.toLowerCase() !== "done" ? (
            <div className="runtime-form">
              <div className="appointment-decision-actions">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={isMarkingDone}
                  onClick={() => void markRequestDone()}
                >
                  {isMarkingDone ? "Saving..." : "Mark as Done"}
                </button>
              </div>
              {markDoneError ? <InlineAlert tone="error" message={markDoneError} /> : null}
              {markDoneSuccess ? <InlineAlert tone="success" message={markDoneSuccess} /> : null}
            </div>
          ) : (
            <InlineAlert tone="success" message="This request is already marked as done." />
          )}

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
                      className={`detail-row${detail.mediaUrl || detail.mediaItems?.length ? " detail-row-media" : ""}`}
                      key={`${detail.label}-${detail.value}-${detail.mediaUrl ?? detail.mediaItems?.length ?? "text"}`}
                    >
                      <span className="detail-label">{detail.label}</span>
                      {detail.mediaItems && detail.mediaItems.length > 0 ? (
                        <ClientDetailMediaGallery
                          label={detail.label}
                          mediaItems={detail.mediaItems}
                        />
                      ) : detail.mediaUrl ? (
                        <ClientDetailMediaPreview
                          mediaUrl={detail.mediaUrl}
                          mediaMimeType={detail.mediaMimeType}
                          mediaFileName={detail.mediaFileName}
                          label={detail.label}
                          value={detail.value}
                          ocrFields={detail.ocrFields}
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

          {clientServiceRequest.isAppointment ? (
            <div>
              <h3 className="detail-section-heading">Appointment Decision</h3>
              <div className="runtime-form appointment-decision-panel">
                <div className="detail-grid appointment-summary-grid">
                  <div className="detail-row">
                    <span className="detail-label">Requested Date</span>
                    <span className="detail-value">
                      {clientServiceRequest.requestedAppointmentDateLabel ||
                        clientServiceRequest.requestedAppointmentDate ||
                        "Not provided"}
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Requested Time</span>
                    <span className="detail-value">
                      {clientServiceRequest.requestedAppointmentTimeLabel ||
                        clientServiceRequest.requestedAppointmentTime ||
                        "Not provided"}
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Current Decision</span>
                    <span className="detail-value">
                      {clientServiceRequest.resolutionData?.decision
                        ? clientServiceRequest.resolutionData.decision.replace(/_/g, " ")
                        : "Pending"}
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Alternate Offer</span>
                    <span className="detail-value">
                      {clientServiceRequest.resolutionData?.alternateDateLabel &&
                      clientServiceRequest.resolutionData?.alternateTimeLabel
                        ? `${clientServiceRequest.resolutionData.alternateDateLabel} at ${clientServiceRequest.resolutionData.alternateTimeLabel}`
                        : "None"}
                    </span>
                  </div>
                </div>

                {decisionError ? <InlineAlert tone="error" message={decisionError} /> : null}
                {decisionSuccess ? <InlineAlert tone="success" message={decisionSuccess} /> : null}

                <div className="appointment-decision-actions">
                  <button
                    type="button"
                    className="primary-button"
                    disabled={
                      isSubmittingDecision ||
                      !clientServiceRequest.requestedAppointmentDate ||
                      !clientServiceRequest.requestedAppointmentTime
                    }
                    onClick={() => void submitAppointmentDecision("approved")}
                  >
                    {isSubmittingDecision ? "Sending..." : "Approve Requested Appointment"}
                  </button>
                </div>

                <div className="appointment-alternate-grid">
                  <label className="form-field">
                    <span>Alternate Date</span>
                    <select
                      className="input-control"
                      value={alternateDate}
                      onChange={(event) => setAlternateDate(event.target.value)}
                    >
                      <option value="">Choose date</option>
                      {appointmentDateOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="form-field">
                    <span>Alternate Time</span>
                    <select
                      className="input-control"
                      value={alternateTime}
                      onChange={(event) => setAlternateTime(event.target.value)}
                      disabled={!alternateDate}
                    >
                      <option value="">Choose time</option>
                      {appointmentTimeOptions.map((option) => (
                        <option key={`${option.value}-${option.input}`} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="appointment-decision-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={isSubmittingDecision || !alternateDate || !alternateTime}
                    onClick={() => void submitAppointmentDecision("alternate_offer")}
                  >
                    {isSubmittingDecision ? "Sending..." : "Send Alternate Appointment"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
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
