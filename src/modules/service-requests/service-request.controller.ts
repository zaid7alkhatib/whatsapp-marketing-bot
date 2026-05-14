import { NextFunction, Request, Response } from "express";
import { readFile } from "fs/promises";
import mongoose from "mongoose";
import { extractInsuranceCardFieldsFromImage } from "../../integrations/gemini/gemini.service";
import { sendBaileysTextMessage } from "../../integrations/baileys/baileys.service";
import {
  AppointmentScheduleDefinition,
  formatAppointmentSlotForMessage,
  generateAppointmentDateOptions,
  generateAppointmentTimeOptions,
} from "../../shared/appointment-schedule";
import { normalizeMessageTextFormatting } from "../../shared/utils/messageFormatting";
import { isClientUserRole, resolveScopedFlow } from "../auth/auth.scope";
import { BotSessionModel } from "../bot-sessions/bot-session.model";
import { BusinessPartnerModel } from "../business-partners/business-partner.model";
import { FlowStepModel } from "../flow-steps/flow-step.model";
import { resolveLocalMediaFilePath } from "../media/media-cloudflare.service";
import { MessageModel } from "../messages/message.model";
import { OrgUnitModel } from "../org-units/org-unit.model";
import { RequestTypeModel } from "../request-types/request-type.model";
import { ServiceModel } from "../services/service.model";
import { ServiceRequestModel } from "./service-request.model";
import {
  CreateServiceRequestBody,
  ServiceRequestSnapshots,
} from "./service-request.types";

interface ClientServiceRequestRecord {
  _id: mongoose.Types.ObjectId | string;
  businessPartnerId?: mongoose.Types.ObjectId | string | null;
  sessionId?: mongoose.Types.ObjectId | string | null;
  statusCode: string;
  priorityCode?: string;
  language?: string;
  submittedAt: Date;
  requestData?: Record<string, unknown>;
  snapshots?: ServiceRequestSnapshots;
  aiSummary?: Record<string, unknown>;
  resolutionData?: Record<string, unknown>;
}

interface ClientSessionRecord {
  _id: mongoose.Types.ObjectId | string;
  businessPartnerId?: mongoose.Types.ObjectId | string | null;
  flowId?: mongoose.Types.ObjectId | string | null;
  channelId?: mongoose.Types.ObjectId | string | null;
  channelAccountId?: mongoose.Types.ObjectId | string | null;
  channelUserRef?: string;
  language?: string;
}

interface ClientBusinessPartnerRecord {
  _id: mongoose.Types.ObjectId | string;
  names?: {
    fullName?: string;
  };
  contactInfo?: {
    phone?: string;
    email?: string;
  };
  personalInfo?: {
    dateOfBirth?: Date | string | null;
  };
  preferredLanguage?: string;
}

interface ClientFormattedOcrField {
  label: string;
  value: string;
}

interface ClientFormattedMediaItem {
  value: string;
  mediaUrl: string;
  mediaMimeType?: string;
  mediaFileName?: string;
}

interface ClientFormattedDetail {
  label: string;
  value: string;
  mediaUrl?: string;
  mediaMimeType?: string;
  mediaFileName?: string;
  mediaItems?: ClientFormattedMediaItem[];
  ocrFields?: ClientFormattedOcrField[];
}

interface ClientFormattedResolutionData {
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
}

interface AppointmentDecisionBody {
  decision?: unknown;
  alternateDate?: unknown;
  alternateTime?: unknown;
}

const APPOINTMENT_REQUEST_TYPE_CODE = "MEDICAL_APPOINTMENT";
const CLIENT_CLINIC_LABEL = "PraxisKhalaf";
const CLINIC_APPOINTMENT_SCHEDULE: AppointmentScheduleDefinition = {
  timezone: "Europe/Berlin",
  daysAhead: 28,
  maxDateOptions: 14,
  weeklySchedule: {
    monday: [
      { start: "08:00", end: "13:00", intervalMinutes: 30 },
      { start: "15:00", end: "18:00", intervalMinutes: 30 },
    ],
    tuesday: [
      { start: "08:00", end: "13:00", intervalMinutes: 30 },
      { start: "15:00", end: "18:00", intervalMinutes: 30 },
    ],
    wednesday: [{ start: "08:00", end: "13:00", intervalMinutes: 30 }],
    thursday: [
      { start: "08:00", end: "13:00", intervalMinutes: 30 },
      { start: "15:00", end: "18:00", intervalMinutes: 30 },
    ],
    friday: [{ start: "08:00", end: "13:00", intervalMinutes: 30 }],
  },
};

const SNAPSHOT_LABEL_OVERRIDES: Record<
  string,
  {
    ar?: string;
    en?: string;
    de?: string;
  }
> = {
  CLINIC_WHATSAPP_INTAKE: {
    ar: "خدمة أونلاين",
    en: "Online Service",
    de: "Online-Service",
  },
  MEDICAL_APPOINTMENT: {
    ar: "موعد طبي",
    en: "Medical Appointment",
    de: "Medizinischer Termin",
  },
  MEDICAL_REQUESTS: {
    ar: "الخدمات الطبية",
    en: "Medical Requests",
    de: "Medizinische Anfragen",
  },
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isAppointmentRequestRecord(serviceRequest: {
  snapshots?: ServiceRequestSnapshots;
  requestData?: Record<string, unknown>;
}): boolean {
  const requestTypeCode = serviceRequest.snapshots?.requestType?.code;
  if (isNonEmptyString(requestTypeCode)) {
    return requestTypeCode.trim().toUpperCase() === APPOINTMENT_REQUEST_TYPE_CODE;
  }

  return serviceRequest.requestData?.service_mode === "medical_appointment";
}

function getAppointmentFriendlyDateLabel(
  appointmentDate: string | undefined,
  language: string | undefined
): string | undefined {
  if (!isNonEmptyString(appointmentDate)) {
    return undefined;
  }

  return formatAppointmentSlotForMessage({
    date: appointmentDate,
    time: "08:00",
    language: language ?? "en",
    timezone: CLINIC_APPOINTMENT_SCHEDULE.timezone,
  }).dateLabel;
}

function getAppointmentFriendlyTimeLabel(
  appointmentTime: string | undefined,
  language: string | undefined
): string | undefined {
  if (!isNonEmptyString(appointmentTime)) {
    return undefined;
  }

  return formatAppointmentSlotForMessage({
    date: "2026-01-01",
    time: appointmentTime,
    language: language ?? "en",
    timezone: CLINIC_APPOINTMENT_SCHEDULE.timezone,
  }).timeLabel;
}

function buildApprovedAppointmentMessage(options: {
  language?: string;
  clinicLabel?: string;
  appointmentDate?: string;
  appointmentTime?: string;
}): string {
  const dateLabel = getAppointmentFriendlyDateLabel(
    options.appointmentDate,
    options.language
  );
  const timeLabel = getAppointmentFriendlyTimeLabel(
    options.appointmentTime,
    options.language
  );
  const clinicLabel = options.clinicLabel || CLIENT_CLINIC_LABEL;
  const normalizedLanguage = isNonEmptyString(options.language)
    ? options.language.trim().toLowerCase()
    : "en";

  if (normalizedLanguage.startsWith("ar")) {
    return [
      "\u062a\u0645 \u062a\u0623\u0643\u064a\u062f \u0637\u0644\u0628 \u0627\u0644\u0645\u0648\u0639\u062f.",
      dateLabel ? `\u0627\u0644\u062a\u0627\u0631\u064a\u062e: ${dateLabel}` : undefined,
      timeLabel ? `\u0627\u0644\u0648\u0642\u062a: ${timeLabel}` : undefined,
      `\u0627\u0644\u0639\u064a\u0627\u062f\u0629: ${clinicLabel}`,
      "\u0646\u062a\u0637\u0644\u0639 \u0644\u0631\u0624\u064a\u062a\u0643.",
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (normalizedLanguage.startsWith("de")) {
    return [
      "Ihr Terminwunsch wurde best\u00e4tigt.",
      dateLabel ? `Datum: ${dateLabel}` : undefined,
      timeLabel ? `Uhrzeit: ${timeLabel}` : undefined,
      `Praxis: ${clinicLabel}`,
      "Wir freuen uns auf Ihren Besuch.",
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    "Your appointment request has been approved.",
    dateLabel ? `Date: ${dateLabel}` : undefined,
    timeLabel ? `Time: ${timeLabel}` : undefined,
    `Clinic: ${clinicLabel}`,
    "We look forward to seeing you.",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildAlternateAppointmentMessage(options: {
  language?: string;
  clinicLabel?: string;
  appointmentDate: string;
  appointmentTime: string;
}): string {
  const slot = formatAppointmentSlotForMessage({
    date: options.appointmentDate,
    time: options.appointmentTime,
    language: options.language ?? "en",
    timezone: CLINIC_APPOINTMENT_SCHEDULE.timezone,
  });
  const clinicLabel = options.clinicLabel || CLIENT_CLINIC_LABEL;
  const normalizedLanguage = isNonEmptyString(options.language)
    ? options.language.trim().toLowerCase()
    : "en";

  if (normalizedLanguage.startsWith("ar")) {
    return normalizeMessageTextFormatting([
      "\u0627\u0644\u0645\u0648\u0639\u062f \u0627\u0644\u0645\u0637\u0644\u0648\u0628 \u063a\u064a\u0631 \u0645\u062a\u0627\u062d \u062d\u0627\u0644\u064a\u064b\u0627.",
      "\u064a\u0645\u0643\u0646\u0646\u0627 \u062a\u0642\u062f\u064a\u0645 \u0627\u0644\u0645\u0648\u0639\u062f \u0627\u0644\u062a\u0627\u0644\u064a \u0644\u0643:",
      `\u0627\u0644\u062a\u0627\u0631\u064a\u062e: ${slot.dateLabel}`,
      `\u0627\u0644\u0648\u0642\u062a: ${slot.timeLabel}`,
      `\u0627\u0644\u0639\u064a\u0627\u062f\u0629: ${clinicLabel}`,
      "1 \u0623\u0648\u0627\u0641\u0642 \u0639\u0644\u0649 \u0647\u0630\u0627 \u0627\u0644\u0645\u0648\u0639\u062f",
      "2 \u0623\u0631\u064a\u062f \u0627\u062e\u062a\u064a\u0627\u0631 \u0645\u0648\u0639\u062f \u0622\u062e\u0631",
      "\u0623\u0631\u0633\u0644: 1 \u0623\u0648 2",
    ].join("\n"));
  }

  if (normalizedLanguage.startsWith("de")) {
    return normalizeMessageTextFormatting([
      "Der gew\u00e4hlte Termin ist aktuell nicht verf\u00fcgbar.",
      "Wir k\u00f6nnen Ihnen stattdessen diesen Termin anbieten:",
      `Datum: ${slot.dateLabel}`,
      `Uhrzeit: ${slot.timeLabel}`,
      `Praxis: ${clinicLabel}`,
      "1 Diesen Termin best\u00e4tigen",
      "2 Einen anderen Termin ausw\u00e4hlen",
      "Antworten Sie mit: 1 oder 2",
    ].join("\n"));
  }

  return normalizeMessageTextFormatting([
    "Your requested appointment is not available right now.",
    "We can offer you this appointment instead:",
    `Date: ${slot.dateLabel}`,
    `Time: ${slot.timeLabel}`,
    `Clinic: ${clinicLabel}`,
    "1 Confirm this appointment",
    "2 Choose another appointment",
    "Reply with: 1 or 2",
  ].join("\n"));
}

function buildGeneralRequestDoneMessage(options: {
  language?: string;
  requestNumber?: string;
}): string {
  const normalizedLanguage = isNonEmptyString(options.language)
    ? options.language.trim().toLowerCase()
    : "en";
  const requestNumber = isNonEmptyString(options.requestNumber)
    ? options.requestNumber.trim()
    : undefined;

  if (normalizedLanguage.startsWith("ar")) {
    return normalizeMessageTextFormatting([
      requestNumber ? `تم إنجاز طلبك رقم ${requestNumber}.` : "تم إنجاز طلبك.",
      "طلبك جاهز الآن.",
      "شكراً لتواصلك مع PraxisKhalaf.",
    ].join("\n"));
  }

  if (normalizedLanguage.startsWith("de")) {
    return normalizeMessageTextFormatting([
      requestNumber
        ? `Ihre Anfrage ${requestNumber} wurde abgeschlossen.`
        : "Ihre Anfrage wurde abgeschlossen.",
      "Ihre Anfrage ist jetzt bereit.",
      "Vielen Dank, dass Sie PraxisKhalaf kontaktiert haben.",
    ].join("\n"));
  }

  return normalizeMessageTextFormatting([
    requestNumber
      ? `Your request ${requestNumber} has been completed.`
      : "Your request has been completed.",
    "Your request is now ready.",
    "Thank you for contacting PraxisKhalaf.",
  ].join("\n"));
}

async function notifyGeneralRequestDone(options: {
  serviceRequestId: string;
  serviceRequest: ClientServiceRequestRecord;
  session: ClientSessionRecord | null;
  authUser?: Request["authUser"];
}): Promise<{ sent: boolean; message?: string; error?: string }> {
  const session = options.session;
  if (
    !session ||
    !session.channelId ||
    !session.channelAccountId ||
    !isNonEmptyString(session.channelUserRef)
  ) {
    return {
      sent: false,
      error: "No WhatsApp session/channel reference was available for this request.",
    };
  }

  const outboundText = buildGeneralRequestDoneMessage({
    language: options.serviceRequest.language ?? session.language,
    requestNumber: options.serviceRequestId.slice(-6),
  });

  try {
    await sendBaileysTextMessage(
      String(session.channelAccountId),
      session.channelUserRef.trim(),
      outboundText
    );

    await MessageModel.create({
      sessionId: session._id,
      channelId: new mongoose.Types.ObjectId(String(session.channelId)),
      channelAccountId: new mongoose.Types.ObjectId(String(session.channelAccountId)),
      direction: "outbound",
      actorType: "staff",
      actorId: options.authUser?.username,
      messageType: "text",
      content: {
        text: outboundText,
      },
      normalizedContent: {
        text: outboundText,
      },
      deliveryStatus: "sent",
      providerPayload: {
        source: "general_request_mark_done",
        requestId: options.serviceRequestId,
      },
      sentAt: new Date(),
      createdAt: new Date(),
    });

    return {
      sent: true,
      message: outboundText,
    };
  } catch (error) {
    return {
      sent: false,
      message: outboundText,
      error: error instanceof Error ? error.message : "Unknown notification error.",
    };
  }
}

function isAllowedAlternateAppointmentSlot(
  alternateDate: string,
  alternateTime: string
): boolean {
  const dateOptions = generateAppointmentDateOptions({
    schedule: CLINIC_APPOINTMENT_SCHEDULE,
    language: "en",
  });
  const allowedDate = dateOptions.find((option) => option.value === alternateDate);
  if (!allowedDate) {
    return false;
  }

  const timeOptions = generateAppointmentTimeOptions({
    schedule: CLINIC_APPOINTMENT_SCHEDULE,
    language: "en",
    selectedDate: alternateDate,
  });

  return timeOptions.some((option) => option.value === alternateTime);
}

function parseAppointmentDecisionBody(body: AppointmentDecisionBody): {
  isValid: boolean;
  message?: string;
  decision?: "approved" | "alternate_offer";
  alternateDate?: string;
  alternateTime?: string;
} {
  const decision = isNonEmptyString(body.decision) ? body.decision.trim() : "";

  if (decision !== "approved" && decision !== "alternate_offer") {
    return {
      isValid: false,
      message: "Field 'decision' must be 'approved' or 'alternate_offer'.",
    };
  }

  const alternateDate = isNonEmptyString(body.alternateDate)
    ? body.alternateDate.trim()
    : undefined;
  const alternateTime = isNonEmptyString(body.alternateTime)
    ? body.alternateTime.trim()
    : undefined;

  if (decision === "alternate_offer") {
    if (!alternateDate || !alternateTime) {
      return {
        isValid: false,
        message: "alternateDate and alternateTime are required for an alternate offer.",
      };
    }

    if (!isAllowedAlternateAppointmentSlot(alternateDate, alternateTime)) {
      return {
        isValid: false,
        message: "The chosen alternate appointment slot is outside the configured opening hours.",
      };
    }
  }

  return {
    isValid: true,
    decision,
    alternateDate,
    alternateTime,
  };
}

async function getScopedServiceRequestSessionIds(
  authUser?: Request["authUser"]
) {
  const scopedFlow = await resolveScopedFlow(authUser);

  if (!scopedFlow) {
    return null;
  }

  const sessionIds = await BotSessionModel.find({ flowId: scopedFlow._id })
    .distinct("_id")
    .exec();

  return {
    scopedFlow,
    sessionIds,
  };
}

function parseDateField(
  value: unknown,
  fieldName: string,
  required: boolean
): { isValid: boolean; date?: Date; message?: string } {
  if (value === undefined || value === null) {
    if (required) {
      return {
        isValid: false,
        message: `Field '${fieldName}' is required and must be a valid date.`,
      };
    }
    return { isValid: true };
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return { isValid: true, date: value };
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return { isValid: true, date: parsed };
    }
  }

  return { isValid: false, message: `Field '${fieldName}' must be a valid date.` };
}

function parseCreateBody(body: CreateServiceRequestBody): {
  isValid: boolean;
  message?: string;
  data?: {
    orgUnitId?: mongoose.Types.ObjectId;
    businessPartnerId?: mongoose.Types.ObjectId;
    sessionId?: mongoose.Types.ObjectId;
    serviceId: mongoose.Types.ObjectId;
    requestTypeId: mongoose.Types.ObjectId;
    statusCode: string;
    priorityCode?: string;
    sourceChannelCode?: string;
    language?: string;
    submittedAt: Date;
    assignedToUserId?: mongoose.Types.ObjectId;
    requestData: Record<string, unknown>;
    aiSummary?: Record<string, unknown>;
    resolutionData?: Record<string, unknown>;
    snapshots?: ServiceRequestSnapshots;
  };
} {
  if (body.orgUnitId !== undefined) {
    if (!isNonEmptyString(body.orgUnitId) || !mongoose.isValidObjectId(body.orgUnitId)) {
      return { isValid: false, message: "Field 'orgUnitId' must be a valid ObjectId." };
    }
  }

  if (body.businessPartnerId !== undefined) {
    if (
      !isNonEmptyString(body.businessPartnerId) ||
      !mongoose.isValidObjectId(body.businessPartnerId)
    ) {
      return { isValid: false, message: "Field 'businessPartnerId' must be a valid ObjectId." };
    }
  }

  if (body.sessionId !== undefined) {
    if (!isNonEmptyString(body.sessionId) || !mongoose.isValidObjectId(body.sessionId)) {
      return { isValid: false, message: "Field 'sessionId' must be a valid ObjectId." };
    }
  }

  if (!isNonEmptyString(body.serviceId) || !mongoose.isValidObjectId(body.serviceId)) {
    return { isValid: false, message: "Field 'serviceId' must be a valid ObjectId." };
  }

  if (!isNonEmptyString(body.requestTypeId) || !mongoose.isValidObjectId(body.requestTypeId)) {
    return { isValid: false, message: "Field 'requestTypeId' must be a valid ObjectId." };
  }

  if (!isNonEmptyString(body.statusCode)) {
    return { isValid: false, message: "Field 'statusCode' is required." };
  }

  if (body.priorityCode !== undefined && !isNonEmptyString(body.priorityCode)) {
    return { isValid: false, message: "Field 'priorityCode' must be a non-empty string." };
  }

  if (body.sourceChannelCode !== undefined && !isNonEmptyString(body.sourceChannelCode)) {
    return { isValid: false, message: "Field 'sourceChannelCode' must be a non-empty string." };
  }

  if (body.language !== undefined && !isNonEmptyString(body.language)) {
    return { isValid: false, message: "Field 'language' must be a non-empty string." };
  }

  const submittedAtResult = parseDateField(body.submittedAt, "submittedAt", true);
  if (!submittedAtResult.isValid || !submittedAtResult.date) {
    return { isValid: false, message: submittedAtResult.message };
  }

  if (body.assignedToUserId !== undefined) {
    if (
      !isNonEmptyString(body.assignedToUserId) ||
      !mongoose.isValidObjectId(body.assignedToUserId)
    ) {
      return { isValid: false, message: "Field 'assignedToUserId' must be a valid ObjectId." };
    }
  }

  if (!isPlainObject(body.requestData)) {
    return { isValid: false, message: "Field 'requestData' is required and must be an object." };
  }

  if (body.aiSummary !== undefined && !isPlainObject(body.aiSummary)) {
    return { isValid: false, message: "Field 'aiSummary' must be an object." };
  }

  if (body.resolutionData !== undefined && !isPlainObject(body.resolutionData)) {
    return { isValid: false, message: "Field 'resolutionData' must be an object." };
  }

  if (body.snapshots !== undefined && !isPlainObject(body.snapshots)) {
    return { isValid: false, message: "Field 'snapshots' must be an object." };
  }

  return {
    isValid: true,
    data: {
      orgUnitId: body.orgUnitId ? new mongoose.Types.ObjectId(body.orgUnitId) : undefined,
      businessPartnerId: body.businessPartnerId
        ? new mongoose.Types.ObjectId(body.businessPartnerId)
        : undefined,
      sessionId: body.sessionId ? new mongoose.Types.ObjectId(body.sessionId) : undefined,
      serviceId: new mongoose.Types.ObjectId(body.serviceId),
      requestTypeId: new mongoose.Types.ObjectId(body.requestTypeId),
      statusCode: body.statusCode.trim(),
      priorityCode: body.priorityCode?.trim(),
      sourceChannelCode: body.sourceChannelCode?.trim(),
      language: body.language?.trim(),
      submittedAt: submittedAtResult.date,
      assignedToUserId: body.assignedToUserId
        ? new mongoose.Types.ObjectId(body.assignedToUserId)
        : undefined,
      requestData: body.requestData as Record<string, unknown>,
      aiSummary: body.aiSummary as Record<string, unknown> | undefined,
      resolutionData: body.resolutionData as Record<string, unknown> | undefined,
      snapshots: body.snapshots as ServiceRequestSnapshots | undefined,
    },
  };
}

function toIdString(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : undefined;
}

function resolveLocalizedText(
  localizedValue: Record<string, unknown> | undefined,
  preferredLanguage?: string
): string | undefined {
  if (!isPlainObject(localizedValue)) {
    return undefined;
  }

  const requestedLanguage = preferredLanguage?.trim().toLowerCase();
  const baseLanguage = requestedLanguage?.split("-")[0];
  const candidateKeys = [requestedLanguage, baseLanguage, "en"].filter(
    (value): value is string => Boolean(value)
  );

  for (const key of candidateKeys) {
    const candidate = localizedValue[key];
    if (isNonEmptyString(candidate)) {
      return candidate.trim();
    }
  }

  for (const value of Object.values(localizedValue)) {
    if (isNonEmptyString(value)) {
      return value.trim();
    }
  }

  return undefined;
}

function humanizeToken(value: string): string {
  return value
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function looksLikeMachineCode(value: string): boolean {
  return /^[A-Z0-9_]+$/.test(value.trim());
}

function formatLanguageLabel(value: string | undefined): string | undefined {
  if (!isNonEmptyString(value)) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "ar") {
    return "Arabic";
  }
  if (normalized === "en") {
    return "English";
  }
  if (normalized === "de") {
    return "German";
  }

  return humanizeToken(normalized);
}

function formatDisplayDate(value: Date | string | undefined | null): string | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
  }

  return parsed.toLocaleDateString();
}

function formatClientValue(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (typeof value === "number") {
    return String(value);
  }

  if (value instanceof Date) {
    return formatDisplayDate(value);
  }

  if (typeof value === "string") {
    const normalized = value.trim();
    if (normalized.length === 0) {
      return undefined;
    }

    const lowerCased = normalized.toLowerCase();
    if (lowerCased === "yes" || lowerCased === "true") {
      return "Yes";
    }
    if (lowerCased === "no" || lowerCased === "false") {
      return "No";
    }
    if (lowerCased === "ar") {
      return "Arabic";
    }
    if (lowerCased === "en") {
      return "English";
    }
    if (lowerCased === "de") {
      return "German";
    }

    return normalized;
  }

  if (Array.isArray(value)) {
    const items = value.map(formatClientValue).filter(
      (item): item is string => Boolean(item && item.trim())
    );
    return items.length > 0 ? items.join(", ") : undefined;
  }

  if (isPlainObject(value)) {
    const items = Object.entries(value)
      .map(([key, nestedValue]) => {
        const formattedValue = formatClientValue(nestedValue);
        return formattedValue ? `${humanizeToken(key)}: ${formattedValue}` : undefined;
      })
      .filter((item): item is string => Boolean(item));

    return items.length > 0 ? items.join(" | ") : undefined;
  }

  return undefined;
}

function getClientFieldLabel(key: string): string {
  const normalizedKey = key.trim().toLowerCase();

  const friendlyLabels: Record<string, string> = {
    selected_language: "Selected language",
    selected_clinic: "Clinic",
    service_mode: "Service mode",
    registered_user: "Registered user",
    quarter_card_current: "Quarter card current",
    request_type_choice: "Request type",
    full_name: "Full name",
    appointment_full_name: "Full name",
    date_of_birth: "Date of birth",
    name_and_dob: "Name and date of birth",
    phone_number: "Phone number",
    appointment_phone: "Phone number",
    appointment_date: "Appointment date",
    appointment_time: "Appointment time",
    medication_and_dosage: "Medication and dosage",
    medical_specialty: "Medical specialty",
    symptoms: "Symptoms",
    symptoms_since: "Symptoms since",
    sick_leave_until: "Sick leave until",
    medical_documents: "Medical documents",
  };

  return friendlyLabels[normalizedKey] ?? humanizeToken(normalizedKey);
}

function resolveSnapshotLabel(
  snapshot: ServiceRequestSnapshots[keyof ServiceRequestSnapshots] | undefined,
  preferredLanguage?: string
): string | undefined {
  if (!snapshot) {
    return undefined;
  }

  const snapshotCode = isNonEmptyString(snapshot.code) ? snapshot.code.trim().toUpperCase() : undefined;
  const languageKey = isNonEmptyString(preferredLanguage)
    ? preferredLanguage.trim().toLowerCase().split("-")[0]
    : "en";
  const localizedLanguageKey = languageKey as "ar" | "en" | "de";
  const fallbackOverride = snapshotCode ? SNAPSHOT_LABEL_OVERRIDES[snapshotCode] : undefined;
  const localizedName = resolveLocalizedText(
    snapshot.name as Record<string, unknown> | undefined,
    preferredLanguage
  );

  if (
    localizedName &&
    !looksLikeMachineCode(localizedName) &&
    !/[?]{2,}|Ã|Ø|Ù/u.test(localizedName)
  ) {
    return localizedName;
  }

  if (fallbackOverride) {
    return (
      fallbackOverride[localizedLanguageKey] ??
      fallbackOverride.en ??
      fallbackOverride.ar ??
      fallbackOverride.de
    );
  }

  return isNonEmptyString(snapshot.code) ? humanizeToken(snapshot.code) : undefined;
}

function resolveClientClinicLabel(): string {
  return CLIENT_CLINIC_LABEL;
}

function extractNameAndDob(value: unknown): { fullName?: string; dateOfBirth?: string } {
  if (!isNonEmptyString(value)) {
    return {};
  }

  const [fullNamePart, dateOfBirthPart] = value
    .split(/\s+-\s+/, 2)
    .map((entry) => entry.trim())
    .filter(Boolean);

  return {
    fullName: fullNamePart || undefined,
    dateOfBirth: dateOfBirthPart || undefined,
  };
}

function resolveChannelUserRefPhone(channelUserRef: string | undefined): string | undefined {
  if (!isNonEmptyString(channelUserRef)) {
    return undefined;
  }

  const withoutSuffix = channelUserRef.trim().split("@")[0].replace(/:\d+$/, "");
  return /^\d{7,}$/.test(withoutSuffix) ? withoutSuffix : undefined;
}

function buildClientRequestReference(serviceRequestId: string): string {
  return serviceRequestId.slice(-6);
}

async function getFlowChoiceMapsByDataKey(
  flowId: mongoose.Types.ObjectId | string
): Promise<Map<string, Record<string, unknown>>> {
  const flowSteps = await FlowStepModel.find({
    flowId,
    type: "choice",
    status: "active",
  })
    .select("stepConfig")
    .lean<Array<{ stepConfig?: Record<string, unknown> }>>();

  const choiceMapsByDataKey = new Map<string, Record<string, unknown>>();

  for (const flowStep of flowSteps) {
    const stepConfig = flowStep.stepConfig;
    if (!isPlainObject(stepConfig)) {
      continue;
    }

    const dataKey = stepConfig.dataKey;
    const choiceMap = stepConfig.choiceMap;
    if (!isNonEmptyString(dataKey) || !isPlainObject(choiceMap)) {
      continue;
    }

    const normalizedDataKey = dataKey.trim().toLowerCase();
    const existingChoiceMap = choiceMapsByDataKey.get(normalizedDataKey) ?? {};

    choiceMapsByDataKey.set(normalizedDataKey, {
      ...existingChoiceMap,
      ...choiceMap,
    });
  }

  return choiceMapsByDataKey;
}

function resolveChoiceMapValue(
  rawValue: unknown,
  choiceMap: Record<string, unknown>
): unknown | undefined {
  if (rawValue === undefined || rawValue === null) {
    return undefined;
  }

  const normalizedRawValue = String(rawValue).trim();
  if (normalizedRawValue.length === 0) {
    return undefined;
  }

  if (!Object.prototype.hasOwnProperty.call(choiceMap, normalizedRawValue)) {
    return undefined;
  }

  return choiceMap[normalizedRawValue];
}

function normalizeSemanticValue(value: unknown): unknown {
  if (isNonEmptyString(value)) {
    const normalized = value.trim();
    if (looksLikeMachineCode(normalized) || /^[a-z0-9_-]+$/i.test(normalized)) {
      return humanizeToken(normalized);
    }

    return normalized;
  }

  return value;
}

function applyChoiceMapValuesToRequestData(
  requestData: Record<string, unknown> | undefined,
  choiceMapsByDataKey: Map<string, Record<string, unknown>>
): Record<string, unknown> | undefined {
  if (!isPlainObject(requestData) || choiceMapsByDataKey.size === 0) {
    return requestData;
  }

  const nextRequestData: Record<string, unknown> = { ...requestData };

  for (const [dataKey, rawValue] of Object.entries(nextRequestData)) {
    const choiceMap = choiceMapsByDataKey.get(dataKey.toLowerCase());
    if (!choiceMap) {
      continue;
    }

    const mappedValue = resolveChoiceMapValue(rawValue, choiceMap);
    if (mappedValue === undefined) {
      continue;
    }

    nextRequestData[dataKey] = normalizeSemanticValue(mappedValue);
  }

  return nextRequestData;
}

function resolveClientPersonData(options: {
  requestData?: Record<string, unknown>;
  businessPartner?: ClientBusinessPartnerRecord | null;
  session?: ClientSessionRecord | null;
}) {
  const nameAndDob = extractNameAndDob(options.requestData?.name_and_dob);
  const fullName =
    options.businessPartner?.names?.fullName?.trim() ||
    (isNonEmptyString(options.requestData?.appointment_full_name)
      ? options.requestData?.appointment_full_name.trim()
      : undefined) ||
    (isNonEmptyString(options.requestData?.full_name)
      ? options.requestData?.full_name.trim()
      : undefined) ||
    nameAndDob.fullName;

  const phone =
    options.businessPartner?.contactInfo?.phone?.trim() ||
    (isNonEmptyString(options.requestData?.appointment_phone)
      ? options.requestData?.appointment_phone.trim()
      : undefined) ||
    (isNonEmptyString(options.requestData?.phone_number)
      ? options.requestData?.phone_number.trim()
      : undefined) ||
    resolveChannelUserRefPhone(options.session?.channelUserRef);

  const email =
    options.businessPartner?.contactInfo?.email?.trim() ||
    (isNonEmptyString(options.requestData?.email)
      ? options.requestData?.email.trim()
      : undefined);

  const dateOfBirth =
    formatDisplayDate(options.businessPartner?.personalInfo?.dateOfBirth) ||
    (isNonEmptyString(options.requestData?.date_of_birth)
      ? options.requestData?.date_of_birth.trim()
      : undefined) ||
    nameAndDob.dateOfBirth;

  const contactReference = isNonEmptyString(options.session?.channelUserRef)
    ? options.session?.channelUserRef.trim()
    : undefined;

  return {
    fullName,
    phone,
    email,
    dateOfBirth,
    contactReference:
      contactReference && contactReference !== phone ? contactReference : undefined,
  };
}

function buildClientRequestKindLabel(
  requestData: Record<string, unknown> | undefined,
  snapshots: ServiceRequestSnapshots | undefined,
  preferredLanguage?: string
): string | undefined {
  const snapshotRequestTypeLabel = resolveSnapshotLabel(snapshots?.requestType, preferredLanguage);

  if (requestData?.service_mode === "medical_appointment") {
    return snapshotRequestTypeLabel ?? "Medical Appointment";
  }

  if (isNonEmptyString(requestData?.request_type_choice)) {
    const normalizedChoice = requestData.request_type_choice.trim();
    if (/^\d+$/.test(normalizedChoice)) {
      return snapshotRequestTypeLabel ?? "Service request";
    }

    return humanizeToken(normalizedChoice);
  }

  return snapshotRequestTypeLabel;
}

function formatClientFieldValueByKey(
  fieldKey: string,
  fieldValue: unknown,
  language?: string
): string | undefined {
  const normalizedKey = fieldKey.trim().toLowerCase();

  if (isNonEmptyString(fieldValue)) {
    const normalizedValue = fieldValue.trim();
    if (
      normalizedKey === "registered_user" ||
      normalizedKey === "quarter_card_current"
    ) {
      if (normalizedValue === "1") {
        return "Yes";
      }
      if (normalizedValue === "2") {
        return "No";
      }
    }

    if (normalizedKey === "appointment_date") {
      return getAppointmentFriendlyDateLabel(normalizedValue, language) ?? normalizedValue;
    }

    if (normalizedKey === "appointment_time") {
      return getAppointmentFriendlyTimeLabel(normalizedValue, language) ?? normalizedValue;
    }

    if (normalizedKey === "service_mode") {
      if (normalizedValue === "medical_appointment") {
        return "Medical appointment";
      }
      if (normalizedValue === "online_service") {
        return "Online service";
      }
    }
  }

  return formatClientValue(fieldValue);
}

function extractClientMediaUrl(fieldValue: unknown): string | undefined {
  if (!isPlainObject(fieldValue)) {
    return undefined;
  }

  if (isNonEmptyString(fieldValue.url)) {
    return fieldValue.url.trim();
  }

  if (isNonEmptyString(fieldValue.mediaUrl)) {
    return fieldValue.mediaUrl.trim();
  }

  return undefined;
}

function extractClientMediaAssetId(fieldValue: unknown): string | undefined {
  if (!isPlainObject(fieldValue)) {
    return undefined;
  }

  return isNonEmptyString(fieldValue.assetId) ? fieldValue.assetId.trim() : undefined;
}

function extractClientMediaMimeType(fieldValue: unknown): string | undefined {
  if (!isPlainObject(fieldValue)) {
    return undefined;
  }

  return isNonEmptyString(fieldValue.mimeType) ? fieldValue.mimeType.trim() : undefined;
}

function extractClientMediaFileName(fieldValue: unknown): string | undefined {
  if (!isPlainObject(fieldValue)) {
    return undefined;
  }

  return isNonEmptyString(fieldValue.fileName) ? fieldValue.fileName.trim() : undefined;
}

function formatClientMediaLabel(fieldValue: unknown): string | undefined {
  if (!isPlainObject(fieldValue)) {
    return undefined;
  }

  const caption =
    isNonEmptyString(fieldValue.caption) ? fieldValue.caption.trim() : undefined;
  const fileName =
    isNonEmptyString(fieldValue.fileName) ? fieldValue.fileName.trim() : undefined;
  const mimeType =
    isNonEmptyString(fieldValue.mimeType) ? fieldValue.mimeType.trim().toLowerCase() : undefined;

  if (caption) {
    return caption;
  }

  if (fileName) {
    return fileName;
  }

  if (mimeType?.startsWith("image/")) {
    return "Attached image";
  }

  return "Attached file";
}

function extractClientMediaItems(fieldValue: unknown): ClientFormattedMediaItem[] {
  if (!Array.isArray(fieldValue)) {
    return [];
  }

  return fieldValue
    .map((entry): ClientFormattedMediaItem | null => {
      const mediaUrl = extractClientMediaUrl(entry);
      if (!mediaUrl) {
        return null;
      }

      return {
        value: formatClientMediaLabel(entry) ?? "Attached file",
        mediaUrl,
        mediaMimeType: extractClientMediaMimeType(entry),
        mediaFileName: extractClientMediaFileName(entry),
      };
    })
    .filter((entry): entry is ClientFormattedMediaItem => entry !== null);
}

function inferMimeTypeFromFileName(fileName: string | undefined): string | undefined {
  if (!isNonEmptyString(fileName)) {
    return undefined;
  }

  const normalizedName = fileName.trim().toLowerCase();
  if (normalizedName.endsWith(".jpg") || normalizedName.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (normalizedName.endsWith(".png")) {
    return "image/png";
  }
  if (normalizedName.endsWith(".webp")) {
    return "image/webp";
  }
  if (normalizedName.endsWith(".gif")) {
    return "image/gif";
  }

  return undefined;
}

function isImageMimeType(value: string | undefined): boolean {
  return isNonEmptyString(value) && value.trim().toLowerCase().startsWith("image/");
}

function normalizeClientOcrFields(value: unknown): ClientFormattedOcrField[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!isPlainObject(entry)) {
        return undefined;
      }

      const label = isNonEmptyString(entry.label) ? entry.label.trim() : undefined;
      const fieldValue = isNonEmptyString(entry.value) ? entry.value.trim() : undefined;

      if (!label || !fieldValue) {
        return undefined;
      }

      return {
        label,
        value: fieldValue,
      };
    })
    .filter((entry): entry is ClientFormattedOcrField => Boolean(entry));
}

function getCachedInsuranceCardOcrFields(options: {
  aiSummary?: Record<string, unknown>;
  fieldValue: unknown;
}): ClientFormattedOcrField[] | undefined {
  if (!isPlainObject(options.aiSummary)) {
    return undefined;
  }

  const cachedSummary = options.aiSummary.insuranceCardOcr;
  if (!isPlainObject(cachedSummary)) {
    return undefined;
  }

  const currentAssetId = extractClientMediaAssetId(options.fieldValue);
  const currentMediaUrl = extractClientMediaUrl(options.fieldValue);
  const cachedAssetId = isNonEmptyString(cachedSummary.sourceAssetId)
    ? cachedSummary.sourceAssetId.trim()
    : undefined;
  const cachedMediaUrl = isNonEmptyString(cachedSummary.sourceUrl)
    ? cachedSummary.sourceUrl.trim()
    : undefined;

  if (currentAssetId && cachedAssetId && currentAssetId !== cachedAssetId) {
    return undefined;
  }

  if (!currentAssetId && currentMediaUrl && cachedMediaUrl && currentMediaUrl !== cachedMediaUrl) {
    return undefined;
  }

  const cachedFields = normalizeClientOcrFields(cachedSummary.fields);
  return cachedFields.length > 0 ? cachedFields : undefined;
}

async function loadMediaBufferForOcr(fieldValue: unknown): Promise<{
  buffer: Buffer;
  mimeType: string;
} | null> {
  const explicitMimeType = extractClientMediaMimeType(fieldValue);
  const inferredMimeType = inferMimeTypeFromFileName(extractClientMediaFileName(fieldValue));
  const mediaUrl = extractClientMediaUrl(fieldValue);
  const assetId = extractClientMediaAssetId(fieldValue);

  if (assetId) {
    try {
      const filePath = await resolveLocalMediaFilePath(assetId);
      const fileBuffer = await readFile(filePath);
      const mimeType = explicitMimeType ?? inferredMimeType ?? "image/jpeg";

      return isImageMimeType(mimeType)
        ? {
            buffer: fileBuffer,
            mimeType,
          }
        : null;
    } catch {
      return null;
    }
  }

  if (!mediaUrl) {
    return null;
  }

  try {
    const response = await fetch(mediaUrl);
    if (!response.ok) {
      return null;
    }

    const responseMimeType = response.headers.get("content-type")?.split(";")[0]?.trim();
    const mimeType = explicitMimeType ?? responseMimeType ?? inferredMimeType ?? "image/jpeg";
    if (!isImageMimeType(mimeType)) {
      return null;
    }

    return {
      buffer: Buffer.from(await response.arrayBuffer()),
      mimeType,
    };
  } catch {
    return null;
  }
}

async function resolveInsuranceCardOcrFields(options: {
  serviceRequestId: string;
  requestData?: Record<string, unknown>;
  aiSummary?: Record<string, unknown>;
}): Promise<ClientFormattedOcrField[] | undefined> {
  const fieldKey = "insurance_card_image";
  const fieldValue = options.requestData?.[fieldKey];

  if (!fieldValue) {
    return undefined;
  }

  const cachedFields = getCachedInsuranceCardOcrFields({
    aiSummary: options.aiSummary,
    fieldValue,
  });
  if (cachedFields) {
    return cachedFields;
  }

  const mediaPayload = await loadMediaBufferForOcr(fieldValue);
  if (!mediaPayload) {
    return undefined;
  }

  try {
    const ocrResult = await extractInsuranceCardFieldsFromImage({
      imageBuffer: mediaPayload.buffer,
      mimeType: mediaPayload.mimeType,
    });

    if (ocrResult.fields.length === 0) {
      return undefined;
    }

    const nextAiSummary = isPlainObject(options.aiSummary)
      ? { ...options.aiSummary }
      : {};

    nextAiSummary.insuranceCardOcr = {
      sourceAssetId: extractClientMediaAssetId(fieldValue),
      sourceUrl: extractClientMediaUrl(fieldValue),
      model: ocrResult.model,
      rawText: ocrResult.rawText,
      fields: ocrResult.fields,
    };

    await ServiceRequestModel.findByIdAndUpdate(options.serviceRequestId, {
      $set: {
        aiSummary: nextAiSummary,
      },
    }).exec();

    return ocrResult.fields;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown OCR error";
    console.warn(
      `[service-requests] insurance-card OCR skipped request=${options.serviceRequestId}: ${errorMessage}`
    );
    return undefined;
  }
}

function buildClientRequestDetails(options: {
  requestData?: Record<string, unknown>;
  language?: string;
  person: {
    fullName?: string;
    phone?: string;
    email?: string;
    dateOfBirth?: string;
  };
  clinicLabel?: string;
  requestKindLabel?: string;
  ocrFieldsByKey?: Map<string, ClientFormattedOcrField[]>;
}): ClientFormattedDetail[] {
  if (!isPlainObject(options.requestData)) {
    return [];
  }

  const hiddenKeys = new Set<string>();
  if (options.person.fullName) {
    hiddenKeys.add("full_name");
    hiddenKeys.add("name_and_dob");
  }
  if (options.person.phone) {
    hiddenKeys.add("phone_number");
  }
  if (options.person.email) {
    hiddenKeys.add("email");
  }
  if (options.person.dateOfBirth) {
    hiddenKeys.add("date_of_birth");
    hiddenKeys.add("name_and_dob");
  }
  if (options.language) {
    hiddenKeys.add("selected_language");
  }
  if (options.clinicLabel) {
    hiddenKeys.add("selected_clinic");
  }
  if (options.requestKindLabel) {
    hiddenKeys.add("service_mode");
  }
  hiddenKeys.add("request_type_choice");

  return Object.entries(options.requestData)
    .filter(([key]) => !hiddenKeys.has(key))
    .reduce<ClientFormattedDetail[]>((details, [key, value]) => {
      const mediaItems = extractClientMediaItems(value);
      if (mediaItems.length > 0) {
        details.push({
          label: getClientFieldLabel(key),
          value:
            mediaItems.length === 1
              ? mediaItems[0].value
              : `${mediaItems.length} attached files`,
          mediaItems,
        });
        return details;
      }

      const mediaUrl = extractClientMediaUrl(value);
      if (mediaUrl) {
        details.push({
          label: getClientFieldLabel(key),
          value: formatClientMediaLabel(value) ?? "Attached image",
          mediaUrl,
          mediaMimeType: extractClientMediaMimeType(value),
          mediaFileName: extractClientMediaFileName(value),
          ocrFields: options.ocrFieldsByKey?.get(key.trim().toLowerCase()),
        });
        return details;
      }

      const formattedValue = formatClientFieldValueByKey(key, value, options.language);
      if (!formattedValue) {
        return details;
      }

      details.push({
        label: getClientFieldLabel(key),
        value: formattedValue,
      });

      return details;
    }, []);
}

function buildClientServiceRequestPayload(options: {
  serviceRequest: ClientServiceRequestRecord;
  session?: ClientSessionRecord | null;
  businessPartner?: ClientBusinessPartnerRecord | null;
  choiceMapsByDataKey?: Map<string, Record<string, unknown>>;
  ocrFieldsByKey?: Map<string, ClientFormattedOcrField[]>;
}) {
  const requestId = String(options.serviceRequest._id);
  const effectiveLanguage =
    options.serviceRequest.language ||
    options.session?.language ||
    options.businessPartner?.preferredLanguage;

  const semanticRequestData = applyChoiceMapValuesToRequestData(
    options.serviceRequest.requestData,
    options.choiceMapsByDataKey ?? new Map()
  );

  const person = resolveClientPersonData({
    requestData: semanticRequestData,
    businessPartner: options.businessPartner,
    session: options.session,
  });

  const clinicLabel = resolveClientClinicLabel();
  const requestKindLabel = buildClientRequestKindLabel(
    semanticRequestData,
    options.serviceRequest.snapshots,
    effectiveLanguage
  );
  const serviceLabel = resolveSnapshotLabel(
    options.serviceRequest.snapshots?.service,
    effectiveLanguage
  );
  const requestTypeCode = isNonEmptyString(options.serviceRequest.snapshots?.requestType?.code)
    ? options.serviceRequest.snapshots?.requestType?.code.trim()
    : undefined;
  const serviceCode = isNonEmptyString(options.serviceRequest.snapshots?.service?.code)
    ? options.serviceRequest.snapshots?.service?.code.trim()
    : undefined;
  const isAppointment = isAppointmentRequestRecord({
    snapshots: options.serviceRequest.snapshots,
    requestData: semanticRequestData,
  });
  const resolutionData = isPlainObject(options.serviceRequest.resolutionData)
    ? options.serviceRequest.resolutionData
    : undefined;
  const storedAppointmentDate = isNonEmptyString(semanticRequestData?.appointment_date)
    ? semanticRequestData.appointment_date.trim()
    : undefined;
  const storedAppointmentTime = isNonEmptyString(semanticRequestData?.appointment_time)
    ? semanticRequestData.appointment_time.trim()
    : undefined;
  const approvedAppointmentDate = isNonEmptyString(resolutionData?.approvedDate)
    ? resolutionData.approvedDate.trim()
    : undefined;
  const approvedAppointmentTime = isNonEmptyString(resolutionData?.approvedTime)
    ? resolutionData.approvedTime.trim()
    : undefined;
  const shouldShowApprovedAppointment =
    ["approved", "done"].includes(options.serviceRequest.statusCode.trim().toLowerCase()) &&
    approvedAppointmentDate &&
    approvedAppointmentTime;
  const requestedAppointmentDate = shouldShowApprovedAppointment
    ? approvedAppointmentDate
    : storedAppointmentDate;
  const requestedAppointmentTime = shouldShowApprovedAppointment
    ? approvedAppointmentTime
    : storedAppointmentTime;
  const resolutionDecision =
    isNonEmptyString(resolutionData?.patientDecision) &&
    resolutionData.patientDecision.trim().toLowerCase() === "confirmed"
      ? "approved"
      : isNonEmptyString(resolutionData?.decision)
        ? resolutionData.decision.trim()
        : undefined;

  return {
    _id: requestId,
    reference: buildClientRequestReference(requestId),
    statusCode: options.serviceRequest.statusCode,
    priorityCode: options.serviceRequest.priorityCode,
    languageCode: effectiveLanguage,
    language: formatLanguageLabel(effectiveLanguage),
    submittedAt: options.serviceRequest.submittedAt,
    requestTypeLabel: requestKindLabel,
    requestTypeCode,
    serviceLabel,
    serviceCode,
    clinicLabel,
    isAppointment,
    requestedAppointmentDate,
    requestedAppointmentDateLabel: getAppointmentFriendlyDateLabel(
      requestedAppointmentDate,
      effectiveLanguage
    ),
    requestedAppointmentTime,
    requestedAppointmentTimeLabel: getAppointmentFriendlyTimeLabel(
      requestedAppointmentTime,
      effectiveLanguage
    ),
    resolutionData: resolutionData
      ? {
          decision: resolutionDecision,
          alternateDate: isNonEmptyString(resolutionData.alternateDate)
            ? resolutionData.alternateDate.trim()
            : undefined,
          alternateDateLabel: getAppointmentFriendlyDateLabel(
            isNonEmptyString(resolutionData.alternateDate)
              ? resolutionData.alternateDate.trim()
              : undefined,
            effectiveLanguage
          ),
          alternateTime: isNonEmptyString(resolutionData.alternateTime)
            ? resolutionData.alternateTime.trim()
            : undefined,
          alternateTimeLabel: getAppointmentFriendlyTimeLabel(
            isNonEmptyString(resolutionData.alternateTime)
              ? resolutionData.alternateTime.trim()
              : undefined,
            effectiveLanguage
          ),
          approvedDate: approvedAppointmentDate,
          approvedDateLabel: getAppointmentFriendlyDateLabel(
            approvedAppointmentDate,
            effectiveLanguage
          ),
          approvedTime: approvedAppointmentTime,
          approvedTimeLabel: getAppointmentFriendlyTimeLabel(
            approvedAppointmentTime,
            effectiveLanguage
          ),
          patientDecision: isNonEmptyString(resolutionData.patientDecision)
            ? resolutionData.patientDecision.trim()
            : undefined,
          patientRespondedAt: formatDisplayDate(
            isNonEmptyString(resolutionData.patientRespondedAt)
              ? resolutionData.patientRespondedAt.trim()
              : undefined
          ),
          awaitingPatientDecision:
            typeof resolutionData.awaitingPatientDecision === "boolean"
              ? resolutionData.awaitingPatientDecision
              : undefined,
          decidedAt: formatDisplayDate(
            isNonEmptyString(resolutionData.decidedAt)
              ? resolutionData.decidedAt.trim()
              : undefined
          ),
        }
      : undefined,
    person,
    details: buildClientRequestDetails({
      requestData: semanticRequestData,
      language: effectiveLanguage,
      person,
      clinicLabel,
      requestKindLabel,
      ocrFieldsByKey: options.ocrFieldsByKey,
    }),
  };
}

async function getScopedAppointmentRequestContext(options: {
  id: string;
  authUser?: Request["authUser"];
}): Promise<{
  serviceRequest: ClientServiceRequestRecord | null;
  session: ClientSessionRecord | null;
} | null> {
  if (isClientUserRole(options.authUser?.role)) {
    const scopedSessionState = await getScopedServiceRequestSessionIds(options.authUser);
    if (!scopedSessionState) {
      return null;
    }

    const scopedRequest = await ServiceRequestModel.findOne({
      _id: options.id,
      sessionId: { $in: scopedSessionState.sessionIds },
    })
      .select("_id businessPartnerId sessionId statusCode priorityCode language submittedAt requestData snapshots resolutionData")
      .lean<ClientServiceRequestRecord | null>();

    if (!scopedRequest) {
      return {
        serviceRequest: null,
        session: null,
      };
    }

    const scopedSession = scopedRequest.sessionId
      ? await BotSessionModel.findById(scopedRequest.sessionId)
          .select("_id businessPartnerId flowId channelUserRef language channelId channelAccountId")
          .lean<ClientSessionRecord | null>()
      : null;

    return {
      serviceRequest: scopedRequest,
      session: scopedSession,
    };
  }

  const serviceRequest = await ServiceRequestModel.findById(options.id)
    .select("_id businessPartnerId sessionId statusCode priorityCode language submittedAt requestData snapshots resolutionData")
    .lean<ClientServiceRequestRecord | null>();

  if (!serviceRequest) {
    return {
      serviceRequest: null,
      session: null,
    };
  }

  const session = serviceRequest.sessionId
    ? await BotSessionModel.findById(serviceRequest.sessionId)
        .select("_id businessPartnerId flowId channelUserRef language channelId channelAccountId")
        .lean<ClientSessionRecord | null>()
    : null;

  return {
    serviceRequest,
    session,
  };
}

export async function getServiceRequests(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (isClientUserRole(req.authUser?.role)) {
      const scopedSessionState = await getScopedServiceRequestSessionIds(req.authUser);
      if (!scopedSessionState) {
        res.status(403).json({
          success: false,
          message: "Client flow scope is not configured.",
        });
        return;
      }

      const serviceRequests = await ServiceRequestModel.find({
        sessionId: { $in: scopedSessionState.sessionIds },
      })
        .select("_id businessPartnerId sessionId statusCode priorityCode language submittedAt requestData snapshots resolutionData")
        .sort({ createdAt: -1 })
        .lean<ClientServiceRequestRecord[]>();

      const sessionIds = serviceRequests
        .map((serviceRequest) => toIdString(serviceRequest.sessionId))
        .filter((value): value is string => Boolean(value));

      const sessions = sessionIds.length
        ? await BotSessionModel.find({ _id: { $in: sessionIds } })
            .select("_id businessPartnerId flowId channelUserRef language")
            .lean<ClientSessionRecord[]>()
        : [];

      const sessionsById = new Map(
        sessions.map((session) => [String(session._id), session] as const)
      );

      const businessPartnerIds = Array.from(
        new Set(
          [
            ...serviceRequests.map((serviceRequest) => toIdString(serviceRequest.businessPartnerId)),
            ...sessions.map((session) => toIdString(session.businessPartnerId)),
          ].filter((value): value is string => Boolean(value))
        )
      );

      const businessPartners = businessPartnerIds.length
        ? await BusinessPartnerModel.find({ _id: { $in: businessPartnerIds } })
            .select("names.fullName contactInfo.phone contactInfo.email personalInfo.dateOfBirth preferredLanguage")
            .lean<ClientBusinessPartnerRecord[]>()
        : [];

      const businessPartnersById = new Map(
        businessPartners.map((businessPartner) => [String(businessPartner._id), businessPartner] as const)
      );

      const choiceMapsByDataKey = await getFlowChoiceMapsByDataKey(scopedSessionState.scopedFlow._id);

      const formattedServiceRequests = serviceRequests.map((serviceRequest) => {
        const session = serviceRequest.sessionId
          ? sessionsById.get(String(serviceRequest.sessionId))
          : undefined;
        const businessPartnerId =
          toIdString(serviceRequest.businessPartnerId) ?? toIdString(session?.businessPartnerId);
        const businessPartner = businessPartnerId
          ? businessPartnersById.get(businessPartnerId)
          : undefined;

        return buildClientServiceRequestPayload({
          serviceRequest,
          session,
          businessPartner,
          choiceMapsByDataKey,
        });
      });

      res.status(200).json({
        success: true,
        data: formattedServiceRequests,
      });
      return;
    }

    const serviceRequests = await ServiceRequestModel.find().sort({ createdAt: -1 }).lean();

    res.status(200).json({
      success: true,
      data: serviceRequests,
    });
  } catch (error) {
    next(error);
  }
}

export async function getServiceRequestById(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({
        success: false,
        message: "Invalid service request id.",
      });
      return;
    }

    if (isClientUserRole(req.authUser?.role)) {
      const scopedSessionState = await getScopedServiceRequestSessionIds(req.authUser);
      if (!scopedSessionState) {
        res.status(403).json({
          success: false,
          message: "Client flow scope is not configured.",
        });
        return;
      }

      const serviceRequest = await ServiceRequestModel.findOne({
        _id: id,
        sessionId: { $in: scopedSessionState.sessionIds },
      })
        .select("_id businessPartnerId sessionId statusCode priorityCode language submittedAt requestData snapshots aiSummary resolutionData")
        .lean<ClientServiceRequestRecord | null>();

      if (!serviceRequest) {
        res.status(404).json({
          success: false,
          message: "Service request not found.",
        });
        return;
      }

      const session = serviceRequest.sessionId
        ? await BotSessionModel.findById(serviceRequest.sessionId)
            .select("_id businessPartnerId flowId channelUserRef language")
            .lean<ClientSessionRecord | null>()
        : null;

      const businessPartnerId =
        toIdString(serviceRequest.businessPartnerId) ?? toIdString(session?.businessPartnerId);
      const businessPartner = businessPartnerId
        ? await BusinessPartnerModel.findById(businessPartnerId)
            .select("names.fullName contactInfo.phone contactInfo.email personalInfo.dateOfBirth preferredLanguage")
            .lean<ClientBusinessPartnerRecord | null>()
        : null;

      const choiceMapsByDataKey = await getFlowChoiceMapsByDataKey(scopedSessionState.scopedFlow._id);
      const insuranceCardOcrFields = await resolveInsuranceCardOcrFields({
        serviceRequestId: String(serviceRequest._id),
        requestData: serviceRequest.requestData,
        aiSummary: serviceRequest.aiSummary,
      });

      const ocrFieldsByKey = new Map<string, ClientFormattedOcrField[]>();
      if (insuranceCardOcrFields && insuranceCardOcrFields.length > 0) {
        ocrFieldsByKey.set("insurance_card_image", insuranceCardOcrFields);
      }

      res.status(200).json({
        success: true,
        data: buildClientServiceRequestPayload({
          serviceRequest,
          session,
          businessPartner,
          choiceMapsByDataKey,
          ocrFieldsByKey,
        }),
      });
      return;
    }

    const serviceRequest = await ServiceRequestModel.findById(id).lean();
    if (!serviceRequest) {
      res.status(404).json({
        success: false,
        message: "Service request not found.",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: serviceRequest,
    });
  } catch (error) {
    next(error);
  }
}

export async function createServiceRequest(
  req: Request<unknown, unknown, CreateServiceRequestBody>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parsed = parseCreateBody(req.body);
    if (!parsed.isValid || !parsed.data) {
      res.status(400).json({
        success: false,
        message: parsed.message,
      });
      return;
    }

    const service = await ServiceModel.findById(parsed.data.serviceId).lean();
    if (!service) {
      res.status(400).json({
        success: false,
        message: "serviceId does not reference an existing service.",
      });
      return;
    }

    const requestType = await RequestTypeModel.findById(parsed.data.requestTypeId).lean();
    if (!requestType) {
      res.status(400).json({
        success: false,
        message: "requestTypeId does not reference an existing request type.",
      });
      return;
    }

    let orgUnitSnapshot: ServiceRequestSnapshots["orgUnit"];
    if (parsed.data.orgUnitId) {
      const orgUnit = await OrgUnitModel.findById(parsed.data.orgUnitId).lean();
      if (!orgUnit) {
        res.status(400).json({
          success: false,
          message: "orgUnitId does not reference an existing org unit.",
        });
        return;
      }
      orgUnitSnapshot = {
        code: orgUnit.code,
        name: orgUnit.name
          ? {
              ar: orgUnit.name.ar,
              en: orgUnit.name.en,
              de: orgUnit.name.de,
            }
          : undefined,
      };
    }

    if (parsed.data.businessPartnerId) {
      const businessPartnerExists = await BusinessPartnerModel.exists({
        _id: parsed.data.businessPartnerId,
      });
      if (!businessPartnerExists) {
        res.status(400).json({
          success: false,
          message: "businessPartnerId does not reference an existing business partner.",
        });
        return;
      }
    }

    if (parsed.data.sessionId) {
      const sessionExists = await BotSessionModel.exists({ _id: parsed.data.sessionId });
      if (!sessionExists) {
        res.status(400).json({
          success: false,
          message: "sessionId does not reference an existing bot session.",
        });
        return;
      }
    }

    const snapshots: ServiceRequestSnapshots = {
      ...(parsed.data.snapshots ?? {}),
      service: {
        code: service.code,
        name: service.name
          ? {
              ar: service.name.ar,
              en: service.name.en,
              de: service.name.de,
            }
          : undefined,
      },
      requestType: {
        code: requestType.code,
        name: requestType.name
          ? {
              ar: requestType.name.ar,
              en: requestType.name.en,
              de: requestType.name.de,
            }
          : undefined,
      },
      orgUnit: orgUnitSnapshot ?? parsed.data.snapshots?.orgUnit,
    };

    const serviceRequest = await ServiceRequestModel.create({
      ...parsed.data,
      snapshots,
    });

    res.status(201).json({
      success: true,
      data: serviceRequest,
    });
  } catch (error) {
    next(error);
  }
}

export async function getMedicalAppointmentScheduleOptions(
  req: Request<unknown, unknown, unknown, { selectedDate?: string; language?: string }>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const language = isNonEmptyString(req.query.language) ? req.query.language.trim() : "en";
    const selectedDate = isNonEmptyString(req.query.selectedDate)
      ? req.query.selectedDate.trim()
      : undefined;

    const dateOptions = generateAppointmentDateOptions({
      schedule: CLINIC_APPOINTMENT_SCHEDULE,
      language,
    });

    const timeOptions = selectedDate
      ? generateAppointmentTimeOptions({
          schedule: CLINIC_APPOINTMENT_SCHEDULE,
          language,
          selectedDate,
        })
      : [];

    res.status(200).json({
      success: true,
      data: {
        dateOptions,
        timeOptions,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function submitMedicalAppointmentDecision(
  req: Request<{ id: string }, unknown, AppointmentDecisionBody>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({
        success: false,
        message: "Invalid service request id.",
      });
      return;
    }

    const parsedDecision = parseAppointmentDecisionBody(req.body);
    if (!parsedDecision.isValid || !parsedDecision.decision) {
      res.status(400).json({
        success: false,
        message: parsedDecision.message,
      });
      return;
    }

    const scopedContext = await getScopedAppointmentRequestContext({
      id,
      authUser: req.authUser,
    });

    if (!scopedContext) {
      res.status(403).json({
        success: false,
        message: "Client flow scope is not configured.",
      });
      return;
    }

    const { serviceRequest, session } = scopedContext;
    if (!serviceRequest) {
      res.status(404).json({
        success: false,
        message: "Appointment request not found.",
      });
      return;
    }

    if (!isAppointmentRequestRecord(serviceRequest)) {
      res.status(400).json({
        success: false,
        message: "This request is not a medical appointment request.",
      });
      return;
    }

    if (!session || !session.channelAccountId || !isNonEmptyString(session.channelUserRef)) {
      res.status(400).json({
        success: false,
        message: "The appointment request is missing session channel delivery details.",
      });
      return;
    }

    const requestData = isPlainObject(serviceRequest.requestData)
      ? serviceRequest.requestData
      : {};
    const requestedDate = isNonEmptyString(requestData.appointment_date)
      ? requestData.appointment_date.trim()
      : undefined;
    const requestedTime = isNonEmptyString(requestData.appointment_time)
      ? requestData.appointment_time.trim()
      : undefined;
    const language = serviceRequest.language || session.language || "en";
    const clinicLabel = resolveClientClinicLabel();

    let nextStatusCode = "approved";
    let outboundText = "";

    if (parsedDecision.decision === "approved") {
      if (!requestedDate || !requestedTime) {
        res.status(400).json({
          success: false,
          message:
            "The requested appointment slot is missing from this request and cannot be approved directly.",
        });
        return;
      }

      outboundText = buildApprovedAppointmentMessage({
        language,
        clinicLabel,
        appointmentDate: requestedDate,
        appointmentTime: requestedTime,
      });
    } else {
      nextStatusCode = "alternate_offered";
      outboundText = buildAlternateAppointmentMessage({
        language,
        clinicLabel,
        appointmentDate: parsedDecision.alternateDate!,
        appointmentTime: parsedDecision.alternateTime!,
      });
    }

    await sendBaileysTextMessage(
      String(session.channelAccountId),
      session.channelUserRef.trim(),
      outboundText
    );

    if (!session.channelId || !mongoose.isValidObjectId(session.channelId)) {
      res.status(500).json({
        success: false,
        message: "Linked session is missing a valid channel reference.",
      });
      return;
    }

    await MessageModel.create({
      sessionId: session._id,
      channelId: new mongoose.Types.ObjectId(String(session.channelId)),
      channelAccountId: session.channelAccountId,
      direction: "outbound",
      actorType: "staff",
      actorId: req.authUser?.username,
      messageType: "text",
      content: {
        text: outboundText,
      },
      normalizedContent: {
        text: outboundText,
      },
      deliveryStatus: "sent",
      providerPayload: {
        source: "appointment_dashboard_decision",
        requestId: id,
        decision: parsedDecision.decision,
      },
      sentAt: new Date(),
      createdAt: new Date(),
    });

    const resolutionData: Record<string, unknown> = {
      decision: parsedDecision.decision,
      decidedAt: new Date().toISOString(),
      decidedByUsername: req.authUser?.username,
      decidedByDisplayName: req.authUser?.displayName,
      requestedDate,
      requestedTime,
      alternateDate:
        parsedDecision.decision === "alternate_offer" ? parsedDecision.alternateDate : undefined,
      alternateTime:
        parsedDecision.decision === "alternate_offer" ? parsedDecision.alternateTime : undefined,
      deliveredMessage: outboundText,
      awaitingPatientDecision: parsedDecision.decision === "alternate_offer",
    };

    await ServiceRequestModel.findByIdAndUpdate(id, {
      $set: {
        statusCode: nextStatusCode,
        resolutionData,
      },
    }).exec();

    res.status(200).json({
      success: true,
      data: {
        requestId: id,
        statusCode: nextStatusCode,
        resolutionData,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function markServiceRequestDone(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({
        success: false,
        message: "Invalid service request id.",
      });
      return;
    }

    if (!isClientUserRole(req.authUser?.role)) {
      res.status(403).json({
        success: false,
        message: "Only client workspace users can mark requests as done from this endpoint.",
      });
      return;
    }

    const scopedSessionState = await getScopedServiceRequestSessionIds(req.authUser);
    if (!scopedSessionState) {
      res.status(403).json({
        success: false,
        message: "Client flow scope is not configured.",
      });
      return;
    }

    const serviceRequest = await ServiceRequestModel.findOne({
      _id: id,
      sessionId: { $in: scopedSessionState.sessionIds },
    })
      .select("_id businessPartnerId sessionId statusCode language requestData snapshots resolutionData")
      .lean<ClientServiceRequestRecord | null>();

    if (!serviceRequest) {
      res.status(404).json({
        success: false,
        message: "Service request not found.",
      });
      return;
    }

    if (serviceRequest.statusCode.trim().toLowerCase() === "done") {
      res.status(200).json({
        success: true,
        data: {
          requestId: id,
          statusCode: "done",
        },
      });
      return;
    }

    if (isAppointmentRequestRecord(serviceRequest)) {
      res.status(400).json({
        success: false,
        message: "Appointment requests use the medical appointment workflow.",
      });
      return;
    }

    const session = serviceRequest.sessionId
      ? await BotSessionModel.findById(serviceRequest.sessionId)
          .select("_id businessPartnerId flowId channelUserRef language channelId channelAccountId")
          .lean<ClientSessionRecord | null>()
      : null;

    const notificationResult = await notifyGeneralRequestDone({
      serviceRequestId: id,
      serviceRequest,
      session,
      authUser: req.authUser,
    });

    const nextResolutionData = {
      ...(isPlainObject(serviceRequest.resolutionData) ? serviceRequest.resolutionData : {}),
      doneAt: new Date().toISOString(),
      doneByUsername: req.authUser?.username,
      doneByDisplayName: req.authUser?.displayName,
      doneNotification: {
        sent: notificationResult.sent,
        sentAt: notificationResult.sent ? new Date().toISOString() : undefined,
        message: notificationResult.message,
        error: notificationResult.error,
      },
    };

    await ServiceRequestModel.findByIdAndUpdate(id, {
      $set: {
        statusCode: "done",
        resolutionData: nextResolutionData,
      },
    }).exec();

    res.status(200).json({
      success: true,
      data: {
        requestId: id,
        statusCode: "done",
        resolutionData: nextResolutionData,
      },
    });
  } catch (error) {
    next(error);
  }
}
