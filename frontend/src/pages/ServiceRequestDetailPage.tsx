import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import {
  useClientLocale,
  type ClientLanguage,
} from "../i18n/ClientLocaleContext";
import InlineAlert from "../components/InlineAlert";
import JsonBlock from "../components/JsonBlock";
import LoadingState from "../components/LoadingState";
import PageSection from "../components/PageSection";
import StatusBadge from "../components/StatusBadge";
import api from "../services/api";
import type { ApiSuccessResponse } from "../types/api";
import {
  getLocalizedRequestTypeLabel,
  getLocalizedServiceAreaLabel,
} from "../utils/requestLabels";

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
    approvedDate?: string;
    approvedDateLabel?: string;
    approvedTime?: string;
    approvedTimeLabel?: string;
    patientDecision?: string;
    patientRespondedAt?: string;
    awaitingPatientDecision?: boolean;
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

const detailPageCopy = {
  en: {
    requestPrefix: "Request",
    serviceRequestDetail: "Service Request Detail",
    detailedRecord: "Detailed service request record.",
    detectedCardDetails: "Detected card details",
    openFile: "Open file",
    attachment: "Attachment",
    loadingMediaError: "Could not load image preview.",
    missingId: "Service request id is missing.",
    failedToLoad: "Failed to load service request.",
    failedScheduleOptions: "Failed to load appointment schedule options.",
    chooseAlternateFirst: "Choose an alternate appointment date and time first.",
    failedDecision: "Failed to send the appointment decision.",
    approvalSent: "Approval sent to the customer.",
    alternateSent: "Alternate appointment offer sent to the customer.",
    failedMarkDone: "Failed to mark request as done.",
    alreadyDone: "This request is already marked as done.",
    rejectRequest: "Reject Request",
    rejecting: "Rejecting...",
    failedReject: "Failed to reject request.",
    rejectedSuccess: "Request rejected and the customer was notified.",
    alreadyRejected: "This request has been rejected.",
    confirmReject:
      "Reject this request because the insurance card was not entered for the current quarter?",
    saving: "Saving...",
    sending: "Sending...",
    appointmentDecision: "Appointment Decision",
    requestedDate: "Requested Date",
    requestedTime: "Requested Time",
    currentDecision: "Current Decision",
    alternateOffer: "Alternate Offer",
    pending: "Pending",
    none: "None",
    approveRequestedAppointment: "Approve Requested Appointment",
    alternateDate: "Alternate Date",
    alternateTime: "Alternate Time",
    chooseDate: "Choose date",
    chooseTime: "Choose time",
    sendAlternateAppointment: "Send Alternate Appointment",
    id: "ID",
    sourceChannelCode: "Source Channel Code",
    submittedAt: "Submitted At",
    serviceId: "Service ID",
    requestTypeId: "Request Type ID",
    createdAt: "Created At",
    updatedAt: "Updated At",
    requestData: "Request Data",
    aiSummary: "AI Summary",
    snapshots: "Snapshots",
  },
  ar: {
    requestPrefix: "\u0627\u0644\u0637\u0644\u0628",
    serviceRequestDetail: "\u062a\u0641\u0627\u0635\u064a\u0644 \u0627\u0644\u0637\u0644\u0628",
    detailedRecord: "\u0633\u062c\u0644 \u062a\u0641\u0635\u064a\u0644\u064a \u0644\u0644\u0637\u0644\u0628.",
    detectedCardDetails: "\u0628\u064a\u0627\u0646\u0627\u062a \u0627\u0644\u0628\u0637\u0627\u0642\u0629 \u0627\u0644\u0645\u0643\u062a\u0634\u0641\u0629",
    openFile: "\u0641\u062a\u062d \u0627\u0644\u0645\u0644\u0641",
    attachment: "\u0645\u0631\u0641\u0642",
    loadingMediaError: "\u062a\u0639\u0630\u0631 \u062a\u062d\u0645\u064a\u0644 \u0645\u0639\u0627\u064a\u0646\u0629 \u0627\u0644\u0635\u0648\u0631\u0629.",
    missingId: "\u0645\u0639\u0631\u0641 \u0627\u0644\u0637\u0644\u0628 \u063a\u064a\u0631 \u0645\u0648\u062c\u0648\u062f.",
    failedToLoad: "\u062a\u0639\u0630\u0631 \u062a\u062d\u0645\u064a\u0644 \u0627\u0644\u0637\u0644\u0628.",
    failedScheduleOptions: "\u062a\u0639\u0630\u0631 \u062a\u062d\u0645\u064a\u0644 \u062e\u064a\u0627\u0631\u0627\u062a \u0627\u0644\u0645\u0648\u0627\u0639\u064a\u062f \u0627\u0644\u0628\u062f\u064a\u0644\u0629.",
    chooseAlternateFirst: "\u0627\u062e\u062a\u0631 \u0627\u0644\u062a\u0627\u0631\u064a\u062e \u0648\u0627\u0644\u0648\u0642\u062a \u0627\u0644\u0628\u062f\u064a\u0644\u064a\u0646 \u0623\u0648\u0644\u0627.",
    failedDecision: "\u062a\u0639\u0630\u0631 \u0625\u0631\u0633\u0627\u0644 \u0642\u0631\u0627\u0631 \u0627\u0644\u0645\u0648\u0639\u062f.",
    approvalSent: "\u062a\u0645 \u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u0645\u0648\u0627\u0641\u0642\u0629 \u0625\u0644\u0649 \u0627\u0644\u0639\u0645\u064a\u0644.",
    alternateSent: "\u062a\u0645 \u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u0645\u0648\u0639\u062f \u0627\u0644\u0628\u062f\u064a\u0644 \u0625\u0644\u0649 \u0627\u0644\u0639\u0645\u064a\u0644.",
    failedMarkDone: "\u062a\u0639\u0630\u0631 \u0648\u0636\u0639 \u0639\u0644\u0627\u0645\u0629 \u0645\u0646\u062c\u0632 \u0639\u0644\u0649 \u0627\u0644\u0637\u0644\u0628.",
    alreadyDone: "\u062a\u0645 \u0648\u0636\u0639 \u0639\u0644\u0627\u0645\u0629 \u0645\u0646\u062c\u0632 \u0639\u0644\u0649 \u0647\u0630\u0627 \u0627\u0644\u0637\u0644\u0628 \u0628\u0627\u0644\u0641\u0639\u0644.",
    rejectRequest: "\u0631\u0641\u0636 \u0627\u0644\u0637\u0644\u0628",
    rejecting: "\u062c\u0627\u0631\u064a \u0627\u0644\u0631\u0641\u0636...",
    failedReject: "\u062a\u0639\u0630\u0631 \u0631\u0641\u0636 \u0627\u0644\u0637\u0644\u0628.",
    rejectedSuccess: "\u062a\u0645 \u0631\u0641\u0636 \u0627\u0644\u0637\u0644\u0628 \u0648\u0625\u0628\u0644\u0627\u063a \u0627\u0644\u0639\u0645\u064a\u0644.",
    alreadyRejected: "\u062a\u0645 \u0631\u0641\u0636 \u0647\u0630\u0627 \u0627\u0644\u0637\u0644\u0628.",
    confirmReject:
      "\u0647\u0644 \u062a\u0631\u064a\u062f \u0631\u0641\u0636 \u0627\u0644\u0637\u0644\u0628 \u0644\u0623\u0646 \u0628\u0637\u0627\u0642\u0629 \u0627\u0644\u062a\u0623\u0645\u064a\u0646 \u0644\u0645 \u062a\u064f\u062f\u062e\u0644 \u0641\u064a \u0627\u0644\u0631\u0628\u0639 \u0627\u0644\u0633\u0646\u0648\u064a \u0627\u0644\u062d\u0627\u0644\u064a\u061f",
    saving: "\u062c\u0627\u0631\u064a \u0627\u0644\u062d\u0641\u0638...",
    sending: "\u062c\u0627\u0631\u064a \u0627\u0644\u0625\u0631\u0633\u0627\u0644...",
    appointmentDecision: "\u0642\u0631\u0627\u0631 \u0627\u0644\u0645\u0648\u0639\u062f",
    requestedDate: "\u0627\u0644\u062a\u0627\u0631\u064a\u062e \u0627\u0644\u0645\u0637\u0644\u0648\u0628",
    requestedTime: "\u0627\u0644\u0648\u0642\u062a \u0627\u0644\u0645\u0637\u0644\u0648\u0628",
    currentDecision: "\u0627\u0644\u0642\u0631\u0627\u0631 \u0627\u0644\u062d\u0627\u0644\u064a",
    alternateOffer: "\u0627\u0644\u0645\u0648\u0639\u062f \u0627\u0644\u0628\u062f\u064a\u0644",
    pending: "\u0642\u064a\u062f \u0627\u0644\u0627\u0646\u062a\u0638\u0627\u0631",
    none: "\u0644\u0627 \u064a\u0648\u062c\u062f",
    approveRequestedAppointment: "\u0627\u0639\u062a\u0645\u0627\u062f \u0627\u0644\u0645\u0648\u0639\u062f \u0627\u0644\u0645\u0637\u0644\u0648\u0628",
    alternateDate: "\u062a\u0627\u0631\u064a\u062e \u0628\u062f\u064a\u0644",
    alternateTime: "\u0648\u0642\u062a \u0628\u062f\u064a\u0644",
    chooseDate: "\u0627\u062e\u062a\u0631 \u0627\u0644\u062a\u0627\u0631\u064a\u062e",
    chooseTime: "\u0627\u062e\u062a\u0631 \u0627\u0644\u0648\u0642\u062a",
    sendAlternateAppointment: "\u0625\u0631\u0633\u0627\u0644 \u0645\u0648\u0639\u062f \u0628\u062f\u064a\u0644",
    id: "\u0627\u0644\u0645\u0639\u0631\u0641",
    sourceChannelCode: "\u0631\u0645\u0632 \u0642\u0646\u0627\u0629 \u0627\u0644\u0645\u0635\u062f\u0631",
    submittedAt: "\u062a\u0627\u0631\u064a\u062e \u0627\u0644\u0625\u0631\u0633\u0627\u0644",
    serviceId: "\u0645\u0639\u0631\u0641 \u0627\u0644\u062e\u062f\u0645\u0629",
    requestTypeId: "\u0645\u0639\u0631\u0641 \u0646\u0648\u0639 \u0627\u0644\u0637\u0644\u0628",
    createdAt: "\u062a\u0627\u0631\u064a\u062e \u0627\u0644\u0625\u0646\u0634\u0627\u0621",
    updatedAt: "\u062a\u0627\u0631\u064a\u062e \u0627\u0644\u062a\u062d\u062f\u064a\u062b",
    requestData: "\u0628\u064a\u0627\u0646\u0627\u062a \u0627\u0644\u0637\u0644\u0628",
    aiSummary: "\u0645\u0644\u062e\u0635 \u0627\u0644\u0630\u0643\u0627\u0621 \u0627\u0644\u0627\u0635\u0637\u0646\u0627\u0639\u064a",
    snapshots: "\u0627\u0644\u0644\u0642\u0637\u0627\u062a",
  },
  de: {
    requestPrefix: "Anfrage",
    serviceRequestDetail: "Anfragedetails",
    detailedRecord: "Detaillierter Anfragesatz.",
    detectedCardDetails: "Erkannte Kartendaten",
    openFile: "Datei \u00f6ffnen",
    attachment: "Anhang",
    loadingMediaError: "Bildvorschau konnte nicht geladen werden.",
    missingId: "Anfrage-ID fehlt.",
    failedToLoad: "Anfrage konnte nicht geladen werden.",
    failedScheduleOptions: "Terminoptionen konnten nicht geladen werden.",
    chooseAlternateFirst: "W\u00e4hlen Sie zuerst ein alternatives Datum und eine Uhrzeit.",
    failedDecision: "Die Terminentscheidung konnte nicht gesendet werden.",
    approvalSent: "Die Best\u00e4tigung wurde an den Kunden gesendet.",
    alternateSent: "Der Alternativtermin wurde an den Kunden gesendet.",
    failedMarkDone: "Anfrage konnte nicht als erledigt markiert werden.",
    alreadyDone: "Diese Anfrage ist bereits als erledigt markiert.",
    rejectRequest: "Anfrage ablehnen",
    rejecting: "Wird abgelehnt...",
    failedReject: "Anfrage konnte nicht abgelehnt werden.",
    rejectedSuccess: "Anfrage wurde abgelehnt und der Kunde benachrichtigt.",
    alreadyRejected: "Diese Anfrage wurde abgelehnt.",
    confirmReject:
      "Diese Anfrage ablehnen, weil die Versicherungskarte im aktuellen Quartal nicht eingelesen wurde?",
    saving: "Wird gespeichert...",
    sending: "Wird gesendet...",
    appointmentDecision: "Terminentscheidung",
    requestedDate: "Gew\u00fcnschtes Datum",
    requestedTime: "Gew\u00fcnschte Uhrzeit",
    currentDecision: "Aktuelle Entscheidung",
    alternateOffer: "Alternativangebot",
    pending: "Ausstehend",
    none: "Keines",
    approveRequestedAppointment: "Gew\u00fcnschten Termin best\u00e4tigen",
    alternateDate: "Alternatives Datum",
    alternateTime: "Alternative Uhrzeit",
    chooseDate: "Datum w\u00e4hlen",
    chooseTime: "Uhrzeit w\u00e4hlen",
    sendAlternateAppointment: "Alternativtermin senden",
    id: "ID",
    sourceChannelCode: "Quellkanal-Code",
    submittedAt: "Eingereicht am",
    serviceId: "Service-ID",
    requestTypeId: "Anfragetyp-ID",
    createdAt: "Erstellt am",
    updatedAt: "Aktualisiert am",
    requestData: "Anfragedaten",
    aiSummary: "KI-Zusammenfassung",
    snapshots: "Momentaufnahmen",
  },
} as const;

const statusLabels: Record<string, Record<ClientLanguage, string>> = {
  new: { en: "New", ar: "\u062c\u062f\u064a\u062f", de: "Neu" },
  done: { en: "Done", ar: "\u0645\u0646\u062c\u0632", de: "Erledigt" },
  approved: { en: "Approved", ar: "\u0645\u0642\u0628\u0648\u0644", de: "Best\u00e4tigt" },
  alternate_offered: {
    en: "Alternate Offered",
    ar: "\u062a\u0645 \u0627\u0642\u062a\u0631\u0627\u062d \u0628\u062f\u064a\u0644",
    de: "Alternative angeboten",
  },
  rejected: { en: "Rejected", ar: "\u0645\u0631\u0641\u0648\u0636", de: "Abgelehnt" },
  pending: { en: "Pending", ar: "\u0642\u064a\u062f \u0627\u0644\u0627\u0646\u062a\u0638\u0627\u0631", de: "Ausstehend" },
};

function getDetailPageCopy(language: ClientLanguage) {
  return detailPageCopy[language] ?? detailPageCopy.en;
}

function getStatusToneClass(value: string): string {
  const normalizedValue = value.trim().toLowerCase();

  if (["active", "online", "published", "completed", "done", "approved"].includes(normalizedValue)) {
    return "status-positive";
  }

  if (["inactive", "archived", "cancelled", "rejected"].includes(normalizedValue)) {
    return "status-negative";
  }

  if (["draft", "pending", "paused", "new", "alternate_offered", "alternate-offered"].includes(normalizedValue)) {
    return "status-warning";
  }

  return "status-neutral";
}

function getLocalizedStatusLabel(value: string, language: ClientLanguage): string {
  const normalizedValue = value.trim().toLowerCase().replace(/-/g, "_");
  return statusLabels[normalizedValue]?.[language] ?? value;
}

function getLocalizedLanguageLabel(
  value: string | undefined,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  const normalizedValue = (value ?? "").trim().toLowerCase();

  if (normalizedValue === "ar" || normalizedValue === "arabic") {
    return t("language.arabic");
  }

  if (normalizedValue === "de" || normalizedValue === "german" || normalizedValue === "deutsch") {
    return t("language.german");
  }

  if (normalizedValue === "en" || normalizedValue === "english") {
    return t("language.english");
  }

  return value || "-";
}

function getLocalizedDetailLabel(
  label: string,
  t: (key: string, params?: Record<string, string | number>) => string,
  language: ClientLanguage,
): string {
  const normalizedLabel = label.trim().toLowerCase();

  const mappedLabels: Record<string, string> = {
    "insurance card image": t("requestDetail.insuranceCardImage"),
    "medical documents": t("requestDetail.medicalDocuments"),
    "medication and dosage":
      language === "ar"
        ? "اسم الدواء والجرعة"
        : language === "de"
          ? "Medikament und Dosierung"
          : "Medication and Dosage",
    "registered user":
      language === "ar" ? "مريض مسجل" : language === "de" ? "Registrierter Patient" : "Registered User",
    "quarter card current":
      language === "ar"
        ? "بطاقة التأمين للربع الحالي"
        : language === "de"
          ? "Quartalskarte aktuell"
          : "Quarter Card Current",
    "upload medical documents":
      language === "ar"
        ? "إرسال مستندات طبية"
        : language === "de"
          ? "Medizinische Dokumente senden"
          : "Upload Medical Documents",
  };

  return mappedLabels[normalizedLabel] ?? label;
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
  const { language, t } = useClientLocale();
  const copy = getDetailPageCopy(language);
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
          setLoadError(copy.loadingMediaError);
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
  }, [copy.loadingMediaError, mediaUrl]);

  return (
    <div className="detail-media-block">
      <span className="detail-value">{value}</span>
      {ocrFields && ocrFields.length > 0 ? (
        <div className="detail-media-ocr">
          <span className="detail-label">{copy.detectedCardDetails}</span>
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
          {isImageAttachment
            ? t("common.openFullImage")
            : `${copy.openFile}${mediaFileName ? `: ${mediaFileName}` : ""}`}
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
  const { language } = useClientLocale();
  const copy = getDetailPageCopy(language);

  return (
    <div className="detail-media-gallery">
      {mediaItems.map((item, index) => (
        <div className="detail-media-gallery-item" key={`${item.mediaUrl}-${index}`}>
          <span className="detail-label">
            {copy.attachment} {index + 1}
          </span>
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
  const { language, t } = useClientLocale();
  const copy = getDetailPageCopy(language);
  const isClientUser = user?.role === "user" || user?.role === "employee";

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
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [rejectSuccess, setRejectSuccess] = useState<string | null>(null);
  const [isRejecting, setIsRejecting] = useState(false);
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
      setErrorMessage(copy.missingId);
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
        throw new Error(response.data.message ?? copy.failedToLoad);
      }

      setServiceRequest(response.data.data);
      setDecisionError(null);
      setDecisionSuccess(null);
      setMarkDoneError(null);
      setRejectError(null);
    } catch (error) {
      setServiceRequest(null);
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          setIsNotFound(true);
          setErrorMessage(t("requestDetail.notFound"));
        } else {
          const apiMessage = (error.response?.data as { message?: string } | undefined)?.message;
          setErrorMessage(apiMessage ?? error.message ?? copy.failedToLoad);
        }
      } else {
        setErrorMessage(copy.failedToLoad);
      }
    } finally {
      setIsLoading(false);
    }
  }, [copy.failedToLoad, copy.missingId, id, t]);

  useEffect(() => {
    void loadServiceRequest();
  }, [loadServiceRequest]);

  const clientServiceRequest = isClientUser
    ? (serviceRequest as ClientServiceRequestDetailRecord | null)
    : null;
  const adminServiceRequest = !isClientUser
    ? (serviceRequest as AdminServiceRequestDetailRecord | null)
    : null;
  const appointmentStatus = clientServiceRequest?.statusCode.trim().toLowerCase() ?? "";
  const isAwaitingPatientAppointmentDecision =
    appointmentStatus === "alternate_offered" ||
    clientServiceRequest?.resolutionData?.awaitingPatientDecision === true;
  const isFinalAppointmentDecision =
    appointmentStatus === "approved" || appointmentStatus === "done";
  const isAppointmentDecisionLocked =
    isAwaitingPatientAppointmentDecision || isFinalAppointmentDecision;

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
          throw new Error(response.data.message ?? copy.failedScheduleOptions);
        }

        setAppointmentDateOptions(response.data.data.dateOptions ?? []);
        setAppointmentTimeOptions(response.data.data.timeOptions ?? []);
      } catch (error) {
        const apiMessage = axios.isAxiosError(error)
          ? (error.response?.data as { message?: string } | undefined)?.message
          : undefined;
        setDecisionError(apiMessage ?? copy.failedScheduleOptions);
      }
    },
    [clientServiceRequest, copy.failedScheduleOptions]
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
        setDecisionError(copy.chooseAlternateFirst);
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
            ? copy.approvalSent
            : copy.alternateSent
        );
        window.dispatchEvent(new Event("service-requests:changed"));
        await loadServiceRequest();
      } catch (error) {
        const apiMessage = axios.isAxiosError(error)
          ? (error.response?.data as { message?: string } | undefined)?.message
          : undefined;
        setDecisionError(apiMessage ?? copy.failedDecision);
      } finally {
        setIsSubmittingDecision(false);
      }
    },
    [
      alternateDate,
      alternateTime,
      clientServiceRequest,
      copy.alternateSent,
      copy.approvalSent,
      copy.chooseAlternateFirst,
      copy.failedDecision,
      id,
      loadServiceRequest,
    ]
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
        throw new Error(response.data.message ?? copy.failedMarkDone);
      }

      setMarkDoneSuccess(t("requestDetail.markDoneSuccess"));
      window.dispatchEvent(new Event("service-requests:changed"));
      await loadServiceRequest();
    } catch (error) {
      const apiMessage = axios.isAxiosError(error)
        ? (error.response?.data as { message?: string } | undefined)?.message
        : undefined;
      setMarkDoneError(apiMessage ?? copy.failedMarkDone);
    } finally {
      setIsMarkingDone(false);
    }
  }, [clientServiceRequest, copy.failedMarkDone, id, loadServiceRequest, t]);

  const rejectRequest = useCallback(async () => {
    if (!id || !clientServiceRequest || clientServiceRequest.isAppointment) {
      return;
    }

    if (!window.confirm(copy.confirmReject)) {
      return;
    }

    setIsRejecting(true);
    setRejectError(null);
    setRejectSuccess(null);
    setMarkDoneError(null);
    setMarkDoneSuccess(null);

    try {
      const response = await api.post<ApiSuccessResponse>(
        `/api/v1/client/service-requests/${id}/reject`
      );

      if (!response.data.success) {
        throw new Error(response.data.message ?? copy.failedReject);
      }

      setRejectSuccess(copy.rejectedSuccess);
      window.dispatchEvent(new Event("service-requests:changed"));
      await loadServiceRequest();
    } catch (error) {
      const apiMessage = axios.isAxiosError(error)
        ? (error.response?.data as { message?: string } | undefined)?.message
        : undefined;
      setRejectError(apiMessage ?? copy.failedReject);
    } finally {
      setIsRejecting(false);
    }
  }, [clientServiceRequest, copy.confirmReject, copy.failedReject, copy.rejectedSuccess, id, loadServiceRequest]);

  return (
    <PageSection
      title={
        isClientUser
          ? `${copy.requestPrefix} ${clientServiceRequest?.reference ?? id?.slice(-6) ?? ""}`.trim()
          : copy.serviceRequestDetail
      }
      description={
        isClientUser
          ? t("requestDetail.description")
          : copy.detailedRecord
      }
      onRefresh={() => void loadServiceRequest()}
    >
      <p className="state-text">
        <Link className="table-link" to="/service-requests">
          {clientServiceRequest?.isAppointment
            ? t("requestDetail.backToAppointments")
            : t("requestDetail.backToRequests")}
        </Link>
      </p>

      {isLoading ? <LoadingState text={t("requestDetail.loading")} /> : null}

      {!isLoading && isNotFound ? (
        <InlineAlert tone="empty" message={errorMessage ?? t("requestDetail.notFound")} />
      ) : null}

      {!isLoading && !isNotFound && errorMessage ? (
        <InlineAlert tone="error" message={errorMessage} />
      ) : null}

      {!isLoading && !errorMessage && clientServiceRequest && isClientUser ? (
        <div className="detail-section-stack">
          {!clientServiceRequest.isAppointment &&
          !["done", "rejected"].includes(clientServiceRequest.statusCode.toLowerCase()) ? (
            <div className="runtime-form">
              <div className="appointment-decision-actions">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={isMarkingDone || isRejecting}
                  onClick={() => void markRequestDone()}
                >
                  {isMarkingDone ? copy.saving : t("common.markDone")}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={isMarkingDone || isRejecting}
                  onClick={() => void rejectRequest()}
                >
                  {isRejecting ? copy.rejecting : copy.rejectRequest}
                </button>
              </div>
              {markDoneError ? <InlineAlert tone="error" message={markDoneError} /> : null}
              {markDoneSuccess ? <InlineAlert tone="success" message={markDoneSuccess} /> : null}
              {rejectError ? <InlineAlert tone="error" message={rejectError} /> : null}
              {rejectSuccess ? <InlineAlert tone="success" message={rejectSuccess} /> : null}
            </div>
          ) : !clientServiceRequest.isAppointment &&
            clientServiceRequest.statusCode.toLowerCase() === "done" ? (
            <InlineAlert tone="success" message={copy.alreadyDone} />
          ) : !clientServiceRequest.isAppointment &&
            clientServiceRequest.statusCode.toLowerCase() === "rejected" ? (
            <InlineAlert tone="error" message={copy.alreadyRejected} />
          ) : null}

          <div className="table-wrap detail-wrap">
            <div className="detail-grid">
              <div className="detail-row">
                <span className="detail-label">{t("requestDetail.requestNumber")}</span>
                <span className="detail-value">{clientServiceRequest.reference || "-"}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">{t("common.status")}</span>
                <span className="detail-value">
                  <span
                    className={`status-badge ${getStatusToneClass(clientServiceRequest.statusCode)}`}
                  >
                    {getLocalizedStatusLabel(clientServiceRequest.statusCode, language)}
                  </span>
                </span>
              </div>
              <div className="detail-row">
                <span className="detail-label">{t("requestDetail.serviceNeeded")}</span>
                <span className="detail-value">
                  {getLocalizedRequestTypeLabel({
                    code: clientServiceRequest.requestTypeCode,
                    label: clientServiceRequest.requestTypeLabel,
                    language,
                  })}
                </span>
              </div>
              <div className="detail-row">
                <span className="detail-label">{t("requestDetail.clinic")}</span>
                <span className="detail-value">{clientServiceRequest.clinicLabel || "PraxisKhalaf"}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">{t("requestDetail.serviceArea")}</span>
                <span className="detail-value">
                  {getLocalizedServiceAreaLabel(clientServiceRequest.serviceLabel, language)}
                </span>
              </div>
              <div className="detail-row">
                <span className="detail-label">{t("requestDetail.language")}</span>
                <span className="detail-value">
                  {getLocalizedLanguageLabel(
                    clientServiceRequest.languageCode ?? clientServiceRequest.language,
                    t,
                  )}
                </span>
              </div>
              <div className="detail-row">
                <span className="detail-label">{t("requestDetail.priority")}</span>
                <span className="detail-value">{clientServiceRequest.priorityCode || "-"}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">{copy.submittedAt}</span>
                <span className="detail-value">
                  {formatDateTime(clientServiceRequest.submittedAt)}
                </span>
              </div>
            </div>
          </div>

          <div>
            <h3 className="detail-section-heading">{t("requestDetail.personDetails")}</h3>
            <div className="table-wrap detail-wrap">
              <div className="detail-grid">
                <div className="detail-row">
                  <span className="detail-label">{t("requestDetail.fullName")}</span>
                  <span className="detail-value">
                    {clientServiceRequest.person?.fullName || t("common.notProvided")}
                  </span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">{t("requestDetail.phoneNumber")}</span>
                  <span className="detail-value">
                    {clientServiceRequest.person?.phone ||
                      clientServiceRequest.person?.contactReference ||
                      t("common.notProvided")}
                  </span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">{t("requestDetail.email")}</span>
                  <span className="detail-value">
                    {clientServiceRequest.person?.email || t("common.notProvided")}
                  </span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">{t("requestDetail.dateOfBirth")}</span>
                  <span className="detail-value">
                    {clientServiceRequest.person?.dateOfBirth || t("common.notProvided")}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div>
            <h3 className="detail-section-heading">{t("requestDetail.submittedInformation")}</h3>
            {clientServiceRequest.details && clientServiceRequest.details.length > 0 ? (
              <div className="table-wrap detail-wrap">
                <div className="detail-grid">
                  {clientServiceRequest.details.map((detail) => (
                    <div
                      className={`detail-row${detail.mediaUrl || detail.mediaItems?.length ? " detail-row-media" : ""}`}
                      key={`${detail.label}-${detail.value}-${detail.mediaUrl ?? detail.mediaItems?.length ?? "text"}`}
                    >
                      <span className="detail-label">
                        {getLocalizedDetailLabel(detail.label, t, language)}
                      </span>
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
                message={t("requestDetail.noSubmittedData")}
              />
            )}
          </div>

          {clientServiceRequest.isAppointment ? (
            <div>
              <h3 className="detail-section-heading">{copy.appointmentDecision}</h3>
              <div className="runtime-form appointment-decision-panel">
                <div className="detail-grid appointment-summary-grid">
                  <div className="detail-row">
                    <span className="detail-label">{copy.requestedDate}</span>
                    <span className="detail-value">
                      {clientServiceRequest.requestedAppointmentDateLabel ||
                        clientServiceRequest.requestedAppointmentDate ||
                        t("common.notProvided")}
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">{copy.requestedTime}</span>
                    <span className="detail-value">
                      {clientServiceRequest.requestedAppointmentTimeLabel ||
                        clientServiceRequest.requestedAppointmentTime ||
                        t("common.notProvided")}
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">{copy.currentDecision}</span>
                    <span className="detail-value">
                      {clientServiceRequest.resolutionData?.decision
                        ? getLocalizedStatusLabel(
                            clientServiceRequest.resolutionData.decision,
                            language,
                          )
                        : copy.pending}
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">{copy.alternateOffer}</span>
                    <span className="detail-value">
                      {clientServiceRequest.resolutionData?.alternateDateLabel &&
                      clientServiceRequest.resolutionData?.alternateTimeLabel
                        ? `${clientServiceRequest.resolutionData.alternateDateLabel} at ${clientServiceRequest.resolutionData.alternateTimeLabel}`
                        : copy.none}
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
                      isAppointmentDecisionLocked ||
                      !clientServiceRequest.requestedAppointmentDate ||
                      !clientServiceRequest.requestedAppointmentTime
                    }
                    onClick={() => void submitAppointmentDecision("approved")}
                  >
                    {isSubmittingDecision ? copy.sending : copy.approveRequestedAppointment}
                  </button>
                </div>

                <div className="appointment-alternate-grid">
                  <label className="form-field">
                    <span>{copy.alternateDate}</span>
                    <select
                      className="input-control"
                      value={alternateDate}
                      onChange={(event) => setAlternateDate(event.target.value)}
                      disabled={isAppointmentDecisionLocked}
                    >
                      <option value="">{copy.chooseDate}</option>
                      {appointmentDateOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="form-field">
                    <span>{copy.alternateTime}</span>
                    <select
                      className="input-control"
                      value={alternateTime}
                      onChange={(event) => setAlternateTime(event.target.value)}
                      disabled={isAppointmentDecisionLocked || !alternateDate}
                    >
                      <option value="">{copy.chooseTime}</option>
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
                    disabled={
                      isSubmittingDecision ||
                      isAppointmentDecisionLocked ||
                      !alternateDate ||
                      !alternateTime
                    }
                    onClick={() => void submitAppointmentDecision("alternate_offer")}
                  >
                    {isSubmittingDecision ? copy.sending : copy.sendAlternateAppointment}
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
                <span className="detail-label">{copy.id}</span>
                <span className="detail-value cell-mono">{adminServiceRequest._id}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">{t("common.status")}</span>
                <span className="detail-value">
                  <StatusBadge value={adminServiceRequest.statusCode} />
                </span>
              </div>
              <div className="detail-row">
                <span className="detail-label">{t("requestDetail.priority")}</span>
                <span className="detail-value">{adminServiceRequest.priorityCode || "-"}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">{copy.sourceChannelCode}</span>
                <span className="detail-value">{adminServiceRequest.sourceChannelCode || "-"}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">{t("requestDetail.language")}</span>
                <span className="detail-value">
                  {getLocalizedLanguageLabel(adminServiceRequest.language, t)}
                </span>
              </div>
              <div className="detail-row">
                <span className="detail-label">{copy.submittedAt}</span>
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
                <span className="detail-label">{copy.serviceId}</span>
                <span className="detail-value cell-mono">{adminServiceRequest.serviceId}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">{copy.requestTypeId}</span>
                <span className="detail-value cell-mono">{adminServiceRequest.requestTypeId}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">{copy.createdAt}</span>
                <span className="detail-value">{formatDateTime(adminServiceRequest.createdAt)}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">{copy.updatedAt}</span>
                <span className="detail-value">{formatDateTime(adminServiceRequest.updatedAt)}</span>
              </div>
            </div>
          </div>

          <JsonBlock title={copy.requestData} value={adminServiceRequest.requestData} />
          <JsonBlock title={copy.aiSummary} value={adminServiceRequest.aiSummary} />
          <JsonBlock title={copy.snapshots} value={adminServiceRequest.snapshots} />
        </>
      ) : null}
    </PageSection>
  );
}

export default ServiceRequestDetailPage;
