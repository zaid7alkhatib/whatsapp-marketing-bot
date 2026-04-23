import { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import { isClientUserRole, resolveScopedFlow } from "../auth/auth.scope";
import { BotSessionModel } from "../bot-sessions/bot-session.model";
import { BusinessPartnerModel } from "../business-partners/business-partner.model";
import { FlowStepModel } from "../flow-steps/flow-step.model";
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
}

interface ClientSessionRecord {
  _id: mongoose.Types.ObjectId | string;
  businessPartnerId?: mongoose.Types.ObjectId | string | null;
  flowId?: mongoose.Types.ObjectId | string | null;
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

interface ClientFormattedDetail {
  label: string;
  value: string;
  mediaUrl?: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
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
    registered_user: "Registered user",
    quarter_card_current: "Quarter card current",
    request_type_choice: "Request type",
    full_name: "Full name",
    date_of_birth: "Date of birth",
    name_and_dob: "Name and date of birth",
    phone_number: "Phone number",
    medication_and_dosage: "Medication and dosage",
    medical_specialty: "Medical specialty",
    symptoms: "Symptoms",
    symptoms_since: "Symptoms since",
    sick_leave_until: "Sick leave until",
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

  const localizedName = resolveLocalizedText(
    snapshot.name as Record<string, unknown> | undefined,
    preferredLanguage
  );

  if (localizedName && !looksLikeMachineCode(localizedName)) {
    return localizedName;
  }

  return isNonEmptyString(snapshot.code) ? humanizeToken(snapshot.code) : undefined;
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
    (isNonEmptyString(options.requestData?.full_name)
      ? options.requestData?.full_name.trim()
      : undefined) ||
    nameAndDob.fullName;

  const phone =
    options.businessPartner?.contactInfo?.phone?.trim() ||
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
  fieldValue: unknown
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

function formatClientMediaLabel(fieldValue: unknown): string | undefined {
  if (!isPlainObject(fieldValue)) {
    return undefined;
  }

  const caption =
    isNonEmptyString(fieldValue.caption) ? fieldValue.caption.trim() : undefined;
  const fileName =
    isNonEmptyString(fieldValue.fileName) ? fieldValue.fileName.trim() : undefined;

  return caption || fileName || "Attached image";
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
  hiddenKeys.add("request_type_choice");

  return Object.entries(options.requestData)
    .filter(([key]) => !hiddenKeys.has(key))
    .map(([key, value]) => {
      const mediaUrl = extractClientMediaUrl(value);
      if (mediaUrl) {
        return {
          label: getClientFieldLabel(key),
          value: formatClientMediaLabel(value) ?? "Attached image",
          mediaUrl,
        };
      }

      const formattedValue = formatClientFieldValueByKey(key, value);
      if (!formattedValue) {
        return undefined;
      }

      return {
        label: getClientFieldLabel(key),
        value: formattedValue,
      };
    })
    .filter((detail): detail is ClientFormattedDetail => Boolean(detail));
}

function buildClientServiceRequestPayload(options: {
  serviceRequest: ClientServiceRequestRecord;
  session?: ClientSessionRecord | null;
  businessPartner?: ClientBusinessPartnerRecord | null;
  choiceMapsByDataKey?: Map<string, Record<string, unknown>>;
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

  const clinicLabel = resolveSnapshotLabel(
    options.serviceRequest.snapshots?.orgUnit,
    effectiveLanguage
  );
  const requestKindLabel = buildClientRequestKindLabel(
    semanticRequestData,
    options.serviceRequest.snapshots,
    effectiveLanguage
  );
  const serviceLabel = resolveSnapshotLabel(
    options.serviceRequest.snapshots?.service,
    effectiveLanguage
  );

  return {
    _id: requestId,
    reference: buildClientRequestReference(requestId),
    statusCode: options.serviceRequest.statusCode,
    priorityCode: options.serviceRequest.priorityCode,
    language: formatLanguageLabel(effectiveLanguage),
    submittedAt: options.serviceRequest.submittedAt,
    requestTypeLabel: requestKindLabel,
    serviceLabel,
    clinicLabel,
    person,
    details: buildClientRequestDetails({
      requestData: semanticRequestData,
      language: effectiveLanguage,
      person,
      clinicLabel,
      requestKindLabel,
    }),
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
        .select("_id businessPartnerId sessionId statusCode priorityCode language submittedAt requestData snapshots")
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
        .select("_id businessPartnerId sessionId statusCode priorityCode language submittedAt requestData snapshots")
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

      res.status(200).json({
        success: true,
        data: buildClientServiceRequestPayload({
          serviceRequest,
          session,
          businessPartner,
          choiceMapsByDataKey,
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
