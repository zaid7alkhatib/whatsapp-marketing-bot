import mongoose from "mongoose";
import { generateGeminiReply } from "../../integrations/gemini/gemini.service";
import { BotSessionModel } from "../bot-sessions/bot-session.model";
import { BusinessPartnerModel } from "../business-partners/business-partner.model";
import { ChannelAccountModel } from "../channel-accounts/channel-account.model";
import { ChannelModel } from "../channels/channel.model";
import { ContentTemplateModel } from "../content-templates/content-template.model";
import { FlowStepModel } from "../flow-steps/flow-step.model";
import { FlowModel } from "../flows/flow.model";
import { MessageModel } from "../messages/message.model";
import { OrgUnitModel } from "../org-units/org-unit.model";
import { RequestTypeModel } from "../request-types/request-type.model";
import { SessionStepResponseModel } from "../session-step-responses/session-step-response.model";
import { ServiceRequestModel } from "../service-requests/service-request.model";
import { ServiceModel } from "../services/service.model";
import {
  CreatedOutboundMessage,
  ChoiceTransitionRule,
  FlowStepLike,
  MessageTransitionRule,
  ProcessMessageBody,
  ProcessMessageResult,
  StartSessionBody,
  StartSessionResult,
} from "./bot-engine.types";

class BotEngineError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "BotEngineError";
    this.statusCode = statusCode;
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasUsableValue(value: unknown): boolean {
  if (value === undefined || value === null) {
    return false;
  }

  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  return true;
}

function parseObjectId(value: unknown, fieldName: string, required: boolean): mongoose.Types.ObjectId | undefined {
  if (value === undefined || value === null) {
    if (required) {
      throw new BotEngineError(`Field '${fieldName}' is required.`);
    }
    return undefined;
  }

  if (!isNonEmptyString(value) || !mongoose.isValidObjectId(value)) {
    throw new BotEngineError(`Field '${fieldName}' must be a valid ObjectId.`);
  }

  return new mongoose.Types.ObjectId(value);
}

function normalizeStepCode(stepCode: string): string {
  return stepCode.trim().toUpperCase();
}

function extractGeminiPrompt(inputText: string | undefined): string | undefined {
  if (!isNonEmptyString(inputText)) {
    return undefined;
  }

  const match = inputText.trim().match(/^\/ai(?:\s+(.*))?$/i);
  if (!match) {
    return undefined;
  }

  return (match[1] ?? "").trim();
}

function getTransitionNextStepCode(rule: ChoiceTransitionRule | MessageTransitionRule): string | undefined {
  const nextStep = "nextStepCode" in rule ? rule.nextStepCode : undefined;
  const toStep = "toStepCode" in rule ? rule.toStepCode : undefined;

  if (isNonEmptyString(nextStep)) {
    return normalizeStepCode(nextStep);
  }

  if (isNonEmptyString(toStep)) {
    return normalizeStepCode(toStep);
  }

  return undefined;
}

interface ResolvedTemplateMediaPayload {
  provider: string;
  assetId: string;
  url: string;
  thumbnailUrl?: string;
  mimeType?: string;
  fileName?: string;
}

interface ResolvedTemplatePayload {
  text: string;
  contentType?: string;
  media?: ResolvedTemplateMediaPayload;
}

interface OutboundTemplatePayload {
  text: string;
  contentType?: string;
  media?: ResolvedTemplateMediaPayload;
}

interface InboundMediaPayload {
  provider: string;
  assetId: string;
  url: string;
  thumbnailUrl?: string;
  mimeType?: string;
  fileName?: string;
}

function extractResolvedTemplateMediaPayload(
  media: unknown
): ResolvedTemplateMediaPayload | undefined {
  if (!isPlainObject(media)) {
    return undefined;
  }

  const provider = isNonEmptyString(media.provider) ? media.provider.trim() : "";
  const assetId = isNonEmptyString(media.assetId) ? media.assetId.trim() : "";
  const url = isNonEmptyString(media.url) ? media.url.trim() : "";

  if (!provider || !assetId || !url) {
    return undefined;
  }

  return {
    provider,
    assetId,
    url,
    thumbnailUrl: isNonEmptyString(media.thumbnailUrl) ? media.thumbnailUrl.trim() : undefined,
    mimeType: isNonEmptyString(media.mimeType) ? media.mimeType.trim() : undefined,
    fileName: isNonEmptyString(media.fileName) ? media.fileName.trim() : undefined,
  };
}

async function resolveTemplatePayloadByContentKey(
  contentKey: string | undefined,
  language: string
): Promise<ResolvedTemplatePayload> {
  if (!isNonEmptyString(contentKey)) {
    return { text: "" };
  }

  const template = await ContentTemplateModel.findOne({ key: contentKey.trim() }).lean();
  if (!template) {
    return { text: "" };
  }

  const resolvedText = template.translations
    ? resolveTemplateTextByLanguage(
        template.translations as Record<string, unknown>,
        language
      )
    : "";

  return {
    text: resolvedText,
    contentType: isNonEmptyString(template.contentType)
      ? template.contentType.trim()
      : undefined,
    media: extractResolvedTemplateMediaPayload(template.media),
  };
}

function buildOutboundTemplatePayload(
  resolvedPayload: ResolvedTemplatePayload,
  templateValues: Record<string, unknown>
): OutboundTemplatePayload {
  return {
    text: renderTemplateContent(resolvedPayload.text, templateValues),
    contentType: resolvedPayload.contentType,
    media: resolvedPayload.media,
  };
}

function resolveOutboundMessageType(payload: OutboundTemplatePayload): "text" | "image" {
  if (payload.media?.url) {
    return "image";
  }

  return "text";
}

function resolveTemplateTextByLanguage(
  translations: Record<string, unknown>,
  sessionLanguage: string
): string {
  const normalizedLanguage = isNonEmptyString(sessionLanguage)
    ? sessionLanguage.trim().toLowerCase()
    : "";

  if (normalizedLanguage && isNonEmptyString(translations[normalizedLanguage])) {
    return translations[normalizedLanguage]!.trim();
  }

  const baseLanguageKey = normalizedLanguage.split("-")[0];
  if (
    baseLanguageKey &&
    baseLanguageKey !== normalizedLanguage &&
    isNonEmptyString(translations[baseLanguageKey])
  ) {
    return translations[baseLanguageKey]!.trim();
  }

  if (isNonEmptyString(translations.en)) {
    return translations.en.trim();
  }

  for (const value of Object.values(translations)) {
    if (isNonEmptyString(value)) {
      return value.trim();
    }
  }

  return "";
}

function renderTemplateContent(
  templateText: string,
  templateValues: Record<string, unknown>
): string {
  if (!isNonEmptyString(templateText)) {
    return templateText;
  }

  return templateText.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (fullMatch, key: string) => {
    const value = templateValues[key];
    if (value === undefined || value === null) {
      return fullMatch;
    }
    return String(value);
  });
}

async function buildTemplateValuesForSession(session: {
  businessPartnerId?: mongoose.Types.ObjectId | null;
  collectedData?: unknown;
}): Promise<Record<string, unknown>> {
  const templateValues: Record<string, unknown> = {};

  if (session.businessPartnerId) {
    const businessPartner = await BusinessPartnerModel.findById(session.businessPartnerId)
      .select("names")
      .lean();

    if (businessPartner?.names) {
      if (businessPartner.names.fullName !== undefined && businessPartner.names.fullName !== null) {
        templateValues.name = businessPartner.names.fullName;
      }

      if (businessPartner.names.firstName !== undefined && businessPartner.names.firstName !== null) {
        templateValues.firstName = businessPartner.names.firstName;
      }

      if (businessPartner.names.lastName !== undefined && businessPartner.names.lastName !== null) {
        templateValues.lastName = businessPartner.names.lastName;
      }
    }
  }

  if (isPlainObject(session.collectedData)) {
    Object.assign(templateValues, session.collectedData);
  }

  return templateValues;
}

async function loadFlowStep(flowId: mongoose.Types.ObjectId, stepCode: string): Promise<FlowStepLike | null> {
  return FlowStepModel.findOne({
    flowId,
    code: normalizeStepCode(stepCode),
  }).lean() as Promise<FlowStepLike | null>;
}

async function createOutboundBotMessage(
  session: {
    _id: mongoose.Types.ObjectId;
    channelId: mongoose.Types.ObjectId;
    channelAccountId: mongoose.Types.ObjectId;
  },
  stepCode: string,
  payload: OutboundTemplatePayload
): Promise<CreatedOutboundMessage | null> {
  const hasText = isNonEmptyString(payload.text);
  const hasMedia = isNonEmptyString(payload.media?.url);

  if (!hasText && !hasMedia) {
    return null;
  }

  const now = new Date();
  const outboundMessageType = resolveOutboundMessageType(payload);
  const outboundContent: Record<string, unknown> = hasMedia
    ? {
        text: payload.text,
        caption: payload.text,
        mediaUrl: payload.media?.url,
        media: payload.media,
      }
    : {
        text: payload.text,
      };

  const outboundMessageDoc = await MessageModel.create({
    sessionId: session._id,
    channelId: session.channelId,
    channelAccountId: session.channelAccountId,
    direction: "outbound",
    actorType: "bot",
    messageType: outboundMessageType,
    content: outboundContent,
    sentAt: now,
    createdAt: now,
  });

  return {
    stepCode: normalizeStepCode(stepCode),
    messageId: String(outboundMessageDoc._id),
    text: payload.text,
  };
}

async function createServiceRequestOnSessionCompletion(session: {
  _id: mongoose.Types.ObjectId;
  flowId: mongoose.Types.ObjectId;
  orgUnitId?: mongoose.Types.ObjectId | null;
  businessPartnerId?: mongoose.Types.ObjectId | null;
  channelId: mongoose.Types.ObjectId;
  language: string;
  collectedData?: unknown;
}): Promise<string | undefined> {
  const flow = await FlowModel.findById(session.flowId).lean();
  if (!flow?.settings?.createServiceRequestOnCompletion) {
    return undefined;
  }

  const serviceIdRaw = flow.settings.serviceId;
  const requestTypeIdRaw = flow.settings.requestTypeId;

  if (!serviceIdRaw || !requestTypeIdRaw) {
    return undefined;
  }

  if (!mongoose.isValidObjectId(serviceIdRaw) || !mongoose.isValidObjectId(requestTypeIdRaw)) {
    throw new BotEngineError(
      "Flow settings serviceId/requestTypeId are invalid. Cannot auto-create service request."
    );
  }

  const serviceId = new mongoose.Types.ObjectId(serviceIdRaw);
  const requestTypeId = new mongoose.Types.ObjectId(requestTypeIdRaw);

  const [service, requestType] = await Promise.all([
    ServiceModel.findById(serviceId).lean(),
    RequestTypeModel.findById(requestTypeId).lean(),
  ]);

  if (!service) {
    throw new BotEngineError(
      "Flow settings serviceId does not reference an existing service. Cannot auto-create service request."
    );
  }

  if (!requestType) {
    throw new BotEngineError(
      "Flow settings requestTypeId does not reference an existing request type. Cannot auto-create service request."
    );
  }

  const [channel, orgUnit] = await Promise.all([
    ChannelModel.findById(session.channelId).select("code").lean(),
    session.orgUnitId ? OrgUnitModel.findById(session.orgUnitId).lean() : Promise.resolve(null),
  ]);

  const sourceChannelCode =
    channel && isNonEmptyString(channel.code) ? channel.code : "system";

  const now = new Date();
  const requestData = isPlainObject(session.collectedData) ? session.collectedData : {};

  const existingServiceRequest = await ServiceRequestModel.findOne({
    sessionId: session._id,
    serviceId,
    requestTypeId,
  })
    .select("_id")
    .lean();

  if (existingServiceRequest?._id) {
    return String(existingServiceRequest._id);
  }

  const serviceRequest = await ServiceRequestModel.create({
    orgUnitId: session.orgUnitId ?? undefined,
    businessPartnerId: session.businessPartnerId ?? undefined,
    sessionId: session._id,
    serviceId,
    requestTypeId,
    statusCode: "new",
    priorityCode: "normal",
    sourceChannelCode,
    language: session.language,
    submittedAt: now,
    requestData,
    aiSummary: {},
    snapshots: {
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
      orgUnit: orgUnit
        ? {
            code: orgUnit.code,
            name: orgUnit.name
              ? {
                  ar: orgUnit.name.ar,
                  en: orgUnit.name.en,
                  de: orgUnit.name.de,
                }
              : undefined,
          }
        : undefined,
    },
    createdAt: now,
    updatedAt: now,
  });

  return String(serviceRequest._id);
}

function parseStartSessionBody(body: StartSessionBody): {
  channelAccountId: mongoose.Types.ObjectId;
  channelUserRef: string;
  flowId: mongoose.Types.ObjectId;
  language: string;
  orgUnitId?: mongoose.Types.ObjectId;
  businessPartnerId?: mongoose.Types.ObjectId;
} {
  const channelAccountId = parseObjectId(body.channelAccountId, "channelAccountId", true)!;
  const flowId = parseObjectId(body.flowId, "flowId", true)!;
  const orgUnitId = parseObjectId(body.orgUnitId, "orgUnitId", false);
  const businessPartnerId = parseObjectId(body.businessPartnerId, "businessPartnerId", false);

  if (!isNonEmptyString(body.channelUserRef)) {
    throw new BotEngineError("Field 'channelUserRef' is required.");
  }

  if (!isNonEmptyString(body.language)) {
    throw new BotEngineError("Field 'language' is required.");
  }

  return {
    channelAccountId,
    channelUserRef: body.channelUserRef.trim(),
    flowId,
    language: body.language.trim(),
    orgUnitId,
    businessPartnerId,
  };
}

function parseProcessMessageBody(body: ProcessMessageBody): {
  sessionId: mongoose.Types.ObjectId;
  messageType: string;
  text?: string;
  media?: InboundMediaPayload;
  externalMessageId?: string;
} {
  const sessionId = parseObjectId(body.sessionId, "sessionId", true)!;

  if (!isNonEmptyString(body.messageType)) {
    throw new BotEngineError("Field 'messageType' is required.");
  }

  if (body.text !== undefined && body.text !== null && typeof body.text !== "string") {
    throw new BotEngineError("Field 'text' must be a string when provided.");
  }

  if (body.media !== undefined && body.media !== null && !isPlainObject(body.media)) {
    throw new BotEngineError("Field 'media' must be an object when provided.");
  }

  if (body.externalMessageId !== undefined && !isNonEmptyString(body.externalMessageId)) {
    throw new BotEngineError("Field 'externalMessageId' must be a non-empty string when provided.");
  }

  let parsedMedia: InboundMediaPayload | undefined;
  if (isPlainObject(body.media)) {
    const provider = isNonEmptyString(body.media.provider) ? body.media.provider.trim() : "";
    const assetId = isNonEmptyString(body.media.assetId) ? body.media.assetId.trim() : "";
    const url = isNonEmptyString(body.media.url) ? body.media.url.trim() : "";

    if (!provider || !assetId || !url) {
      throw new BotEngineError(
        "Fields 'media.provider', 'media.assetId', and 'media.url' are required when media is provided."
      );
    }

    parsedMedia = {
      provider,
      assetId,
      url,
      thumbnailUrl: isNonEmptyString(body.media.thumbnailUrl)
        ? body.media.thumbnailUrl.trim()
        : undefined,
      mimeType: isNonEmptyString(body.media.mimeType) ? body.media.mimeType.trim() : undefined,
      fileName: isNonEmptyString(body.media.fileName) ? body.media.fileName.trim() : undefined,
    };
  }

  return {
    sessionId,
    messageType: body.messageType.trim(),
    text: typeof body.text === "string" ? body.text : undefined,
    media: parsedMedia,
    externalMessageId: body.externalMessageId?.trim(),
  };
}

async function resolveChoiceNextStepCode(
  transitionConfig: unknown[] | undefined,
  text: string | undefined
): Promise<{ nextStepCode: string; normalizedValue?: string } | null> {
  if (!Array.isArray(transitionConfig)) {
    return null;
  }

  for (const entry of transitionConfig) {
    const rule = entry as ChoiceTransitionRule;
    if (!rule || typeof rule !== "object") {
      continue;
    }

    if (!("when" in rule) || typeof rule.when !== "object" || rule.when === null) {
      continue;
    }

    const condition = rule.when as { operator?: unknown; value?: unknown };
    if (condition.operator !== "eq") {
      continue;
    }

    const conditionValue =
      typeof condition.value === "string" ||
      typeof condition.value === "number" ||
      typeof condition.value === "boolean"
        ? String(condition.value).trim()
        : undefined;

    if (!isNonEmptyString(conditionValue)) {
      continue;
    }

    if (text === conditionValue) {
      const nextStepCode = getTransitionNextStepCode(rule);
      if (nextStepCode) {
        const ruleObject = rule as Record<string, unknown>;
        const semanticValueCandidate =
          (typeof ruleObject.normalizedValue === "string" &&
            ruleObject.normalizedValue.trim().length > 0
            ? ruleObject.normalizedValue
            : undefined) ??
          (typeof ruleObject.storeValue === "string" &&
          ruleObject.storeValue.trim().length > 0
            ? ruleObject.storeValue
            : undefined) ??
          conditionValue;

        return {
          nextStepCode,
          normalizedValue:
            typeof semanticValueCandidate === "string" && semanticValueCandidate.trim().length > 0
              ? semanticValueCandidate.trim()
              : undefined,
        };
      }
    }
  }

  return null;
}

async function resolveMessageNextStepCode(
  transitionConfig: unknown[] | undefined
): Promise<string | null> {
  if (!Array.isArray(transitionConfig)) {
    return null;
  }

  for (const entry of transitionConfig) {
    const rule = entry as MessageTransitionRule;
    if (!rule || typeof rule !== "object") {
      continue;
    }

    if (rule.when === "always") {
      const nextStepCode = getTransitionNextStepCode(rule);
      if (nextStepCode) {
        return nextStepCode;
      }
    }
  }

  return null;
}

function extractStepDataKey(step: FlowStepLike): string | undefined {
  if (!isPlainObject(step.stepConfig)) {
    return undefined;
  }

  const dataKey = step.stepConfig.dataKey;
  if (!isNonEmptyString(dataKey)) {
    return undefined;
  }

  return dataKey.trim();
}

function resolveChoiceMapValue(step: FlowStepLike, normalizedInputText: string | undefined): unknown {
  if (!isNonEmptyString(normalizedInputText)) {
    return undefined;
  }

  if (!isPlainObject(step.stepConfig)) {
    return undefined;
  }

  const choiceMap = step.stepConfig.choiceMap;
  if (!isPlainObject(choiceMap)) {
    return undefined;
  }

  if (!Object.prototype.hasOwnProperty.call(choiceMap, normalizedInputText)) {
    return undefined;
  }

  return choiceMap[normalizedInputText];
}

function resolveOrgUnitIdFromChoiceValue(
  step: FlowStepLike,
  semanticChoiceValue: string
): mongoose.Types.ObjectId | undefined {
  if (!isPlainObject(step.stepConfig)) {
    return undefined;
  }

  const orgUnitMap = step.stepConfig.orgUnitMap;
  if (!isPlainObject(orgUnitMap)) {
    return undefined;
  }

  const normalizedChoiceKey = semanticChoiceValue.trim();
  if (normalizedChoiceKey.length === 0) {
    return undefined;
  }

  if (!Object.prototype.hasOwnProperty.call(orgUnitMap, normalizedChoiceKey)) {
    return undefined;
  }

  const mappedOrgUnitIdValue = orgUnitMap[normalizedChoiceKey];
  if (!isNonEmptyString(mappedOrgUnitIdValue)) {
    return undefined;
  }

  const mappedOrgUnitId = mappedOrgUnitIdValue.trim();
  if (!mongoose.isValidObjectId(mappedOrgUnitId)) {
    return undefined;
  }

  return new mongoose.Types.ObjectId(mappedOrgUnitId);
}

export async function startSession(body: StartSessionBody): Promise<StartSessionResult> {
  const parsed = parseStartSessionBody(body);

  const channelAccount = await ChannelAccountModel.findById(parsed.channelAccountId).lean();
  if (!channelAccount) {
    throw new BotEngineError("channelAccountId does not reference an existing channel account.");
  }

  const flow = await FlowModel.findById(parsed.flowId).lean();
  if (!flow) {
    throw new BotEngineError("flowId does not reference an existing flow.");
  }

  if (parsed.orgUnitId) {
    const orgUnitExists = await OrgUnitModel.exists({ _id: parsed.orgUnitId });
    if (!orgUnitExists) {
      throw new BotEngineError("orgUnitId does not reference an existing org unit.");
    }
  }

  if (parsed.businessPartnerId) {
    const businessPartnerExists = await BusinessPartnerModel.exists({ _id: parsed.businessPartnerId });
    if (!businessPartnerExists) {
      throw new BotEngineError("businessPartnerId does not reference an existing business partner.");
    }
  }

  const firstStep = await loadFlowStep(flow._id, flow.startStepCode);
  if (!firstStep) {
    throw new BotEngineError("Flow start step could not be found.", 404);
  }

  const now = new Date();
  const session = await BotSessionModel.create({
    orgUnitId: parsed.orgUnitId,
    channelId: channelAccount.channelId,
    channelAccountId: parsed.channelAccountId,
    businessPartnerId: parsed.businessPartnerId,
    flowId: parsed.flowId,
    flowVersion: flow.version,
    statusCode: "active",
    language: parsed.language,
    channelUserRef: parsed.channelUserRef,
    currentStepCode: normalizeStepCode(flow.startStepCode),
    startedAt: now,
    lastActivityAt: now,
  });

  const templateValues = await buildTemplateValuesForSession(session);
  const resolvedTemplatePayload = await resolveTemplatePayloadByContentKey(
    firstStep.contentKey,
    session.language
  );
  const outboundPayload = buildOutboundTemplatePayload(
    resolvedTemplatePayload,
    templateValues
  );
  const currentContent = outboundPayload.text;
  const outboundMessage = await createOutboundBotMessage(
    session,
    firstStep.code,
    outboundPayload
  );

  return {
    session: session.toObject(),
    currentStep: firstStep as unknown as Record<string, unknown>,
    currentContent,
    createdOutboundMessageId: outboundMessage ? outboundMessage.messageId : null,
  };
}

export async function processMessage(body: ProcessMessageBody): Promise<ProcessMessageResult> {
  const parsed = parseProcessMessageBody(body);

  const session = await BotSessionModel.findById(parsed.sessionId);
  if (!session) {
    throw new BotEngineError("sessionId does not reference an existing bot session.", 404);
  }

  if (!isNonEmptyString(session.currentStepCode)) {
    throw new BotEngineError("Session currentStepCode is not set.", 400);
  }

  const previousStepCode = normalizeStepCode(session.currentStepCode);
  const currentStep = await loadFlowStep(session.flowId, previousStepCode);
  if (!currentStep) {
    throw new BotEngineError("Current flow step could not be found.", 404);
  }

  const now = new Date();
  const normalizedInputText = typeof parsed.text === "string" ? parsed.text.trim() : undefined;

  const inboundMessageContent: Record<string, unknown> = {};
  if (typeof parsed.text === "string") {
    inboundMessageContent.text = parsed.text;
  }
  if (parsed.media) {
    inboundMessageContent.media = parsed.media;
    inboundMessageContent.mediaUrl = parsed.media.url;
    if (typeof parsed.text === "string" && parsed.text.trim().length > 0) {
      inboundMessageContent.caption = parsed.text.trim();
    }
  }
  if (!("text" in inboundMessageContent) && !("media" in inboundMessageContent)) {
    inboundMessageContent.text = parsed.text;
  }

  const messageDoc = await MessageModel.create({
    sessionId: session._id,
    channelId: session.channelId,
    channelAccountId: session.channelAccountId,
    direction: "inbound",
    actorType: "customer",
    messageType: parsed.messageType,
    externalMessageId: parsed.externalMessageId,
    content: inboundMessageContent,
    createdAt: now,
    receivedAt: now,
  });

  const geminiPrompt = extractGeminiPrompt(normalizedInputText);
  if (geminiPrompt !== undefined) {
    const userPrompt = geminiPrompt;

    if (!userPrompt) {
      const emptyPromptOutbound = await createOutboundBotMessage(
        session,
        previousStepCode,
        {
          text: "Please write a message after /ai",
        }
      );

      session.lastActivityAt = now;
      await session.save();

      return {
        sessionId: String(session._id),
        previousStepCode,
        nextStepCode: previousStepCode,
        sessionStatus: session.statusCode,
        nextStep: currentStep as unknown as Record<string, unknown>,
        nextContent: "Please write a message after /ai",
        createdInboundMessageId: String(messageDoc._id),
        createdStepResponseId: "",
        createdOutboundMessages: emptyPromptOutbound ? [emptyPromptOutbound] : [],
        createdServiceRequestId: undefined,
      };
    }

    let geminiReply: string;
    try {
      geminiReply = await generateGeminiReply(userPrompt);
    } catch (error) {
      console.error("[bot-engine] gemini reply failed:", error);

      const unavailableReply = "AI assistant is unavailable right now. Please try again shortly.";
      const failureOutbound = await createOutboundBotMessage(
        session,
        previousStepCode,
        {
          text: unavailableReply,
        }
      );

      session.lastActivityAt = now;
      await session.save();

      return {
        sessionId: String(session._id),
        previousStepCode,
        nextStepCode: previousStepCode,
        sessionStatus: session.statusCode,
        nextStep: currentStep as unknown as Record<string, unknown>,
        nextContent: unavailableReply,
        createdInboundMessageId: String(messageDoc._id),
        createdStepResponseId: "",
        createdOutboundMessages: failureOutbound ? [failureOutbound] : [],
        createdServiceRequestId: undefined,
      };
    }

    const aiOutbound = await createOutboundBotMessage(
      session,
      previousStepCode,
      {
        text: geminiReply,
      }
    );

    session.lastActivityAt = now;
    await session.save();

    return {
      sessionId: String(session._id),
      previousStepCode,
      nextStepCode: previousStepCode,
      sessionStatus: session.statusCode,
      nextStep: currentStep as unknown as Record<string, unknown>,
      nextContent: geminiReply,
      createdInboundMessageId: String(messageDoc._id),
      createdStepResponseId: "",
      createdOutboundMessages: aiOutbound ? [aiOutbound] : [],
      createdServiceRequestId: undefined,
    };
  }

  const normalizedText = normalizedInputText ?? "";
  const stepDataKey = extractStepDataKey(currentStep);
  const choiceTransitionMatch =
    currentStep.type === "choice"
      ? await resolveChoiceNextStepCode(currentStep.transitionConfig, normalizedInputText)
      : null;
  const mappedChoiceValue =
    currentStep.type === "choice"
      ? resolveChoiceMapValue(currentStep, normalizedInputText)
      : undefined;
  const resolvedChoiceValue =
    currentStep.type === "choice"
      ? (hasUsableValue(mappedChoiceValue)
          ? mappedChoiceValue
          : choiceTransitionMatch?.normalizedValue ?? (normalizedText.length > 0 ? normalizedText : undefined))
      : undefined;

  let stepResponseNormalizedValue: unknown = normalizedInputText;
  if (!hasUsableValue(stepResponseNormalizedValue) && parsed.media?.url) {
    stepResponseNormalizedValue = parsed.media.url;
  }

  let stepResponseStructuredData: Record<string, unknown> = {
    rawText: parsed.text,
    text: normalizedInputText ?? parsed.text,
  };
  if (parsed.media) {
    stepResponseStructuredData = {
      ...stepResponseStructuredData,
      media: parsed.media,
      mediaUrl: parsed.media.url,
    };
  }
  let collectedDataValueToStore: unknown;

  if (currentStep.type === "choice" && hasUsableValue(resolvedChoiceValue)) {
    stepResponseNormalizedValue = resolvedChoiceValue;
    stepResponseStructuredData = {
      rawText: parsed.text,
      text: normalizedInputText ?? parsed.text,
      value: resolvedChoiceValue,
      selectedValue: resolvedChoiceValue,
    };
    if (isNonEmptyString(stepDataKey)) {
      collectedDataValueToStore = resolvedChoiceValue;

      if (
        stepDataKey.trim().toLowerCase() === "selected_language" &&
        hasUsableValue(mappedChoiceValue)
      ) {
        const normalizedSessionLanguage = String(mappedChoiceValue).trim();
        if (normalizedSessionLanguage.length > 0) {
          session.language = normalizedSessionLanguage;
        }
      }

      if (
        stepDataKey.trim().toLowerCase() === "selected_clinic" &&
        hasUsableValue(mappedChoiceValue)
      ) {
        const normalizedChoiceValue = String(resolvedChoiceValue).trim();
        if (normalizedChoiceValue.length > 0) {
          const mappedOrgUnitId = resolveOrgUnitIdFromChoiceValue(
            currentStep,
            normalizedChoiceValue
          );
          if (mappedOrgUnitId) {
            session.orgUnitId = mappedOrgUnitId;
          }
        }
      }
    }
  }

  if (
    currentStep.type === "input_text" &&
    isNonEmptyString(stepDataKey)
  ) {
    if (parsed.media) {
      collectedDataValueToStore = {
        provider: parsed.media.provider,
        assetId: parsed.media.assetId,
        url: parsed.media.url,
        thumbnailUrl: parsed.media.thumbnailUrl,
        mimeType: parsed.media.mimeType,
        fileName: parsed.media.fileName,
        caption: normalizedText.length > 0 ? normalizedText : undefined,
        messageType: parsed.messageType,
      };
    } else if (normalizedText.length > 0) {
      collectedDataValueToStore = normalizedText;
    }
  }

  const stepResponseDoc = await SessionStepResponseModel.create({
    sessionId: session._id,
    flowId: session.flowId,
    flowVersion: session.flowVersion,
    stepCode: previousStepCode,
    stepType: currentStep.type,
    inputType: parsed.messageType,
    rawInput: parsed.text,
    normalizedValue: stepResponseNormalizedValue,
    structuredData: stepResponseStructuredData,
    validationResult: { valid: true, errors: [] },
    createdAt: now,
  });

  if (isNonEmptyString(stepDataKey) && hasUsableValue(collectedDataValueToStore)) {
    const currentCollectedData = isPlainObject(session.collectedData)
      ? session.collectedData
      : {};

    session.collectedData = {
      ...currentCollectedData,
      [stepDataKey]: collectedDataValueToStore,
    };
  }

  const templateValues = await buildTemplateValuesForSession(session);
  const createdOutboundMessages: CreatedOutboundMessage[] = [];
  let createdServiceRequestId: string | undefined;

  if (currentStep.type === "end") {
    session.statusCode = "completed";
    session.endedAt = now;
    session.lastActivityAt = now;
    await session.save();
    createdServiceRequestId = await createServiceRequestOnSessionCompletion(session);

    const resolvedEndTemplatePayload = await resolveTemplatePayloadByContentKey(
      currentStep.contentKey,
      session.language
    );
    const endContent = renderTemplateContent(
      resolvedEndTemplatePayload.text,
      templateValues
    );

    return {
      sessionId: String(session._id),
      previousStepCode,
      nextStepCode: previousStepCode,
      sessionStatus: session.statusCode,
      nextStep: currentStep as unknown as Record<string, unknown>,
      nextContent: endContent,
      createdInboundMessageId: String(messageDoc._id),
      createdStepResponseId: String(stepResponseDoc._id),
      createdOutboundMessages,
      createdServiceRequestId,
    };
  }

  let resolvedNextStepCode = previousStepCode;
  let transitionResolved = false;

  if (currentStep.type === "choice") {
    if (choiceTransitionMatch?.nextStepCode) {
      resolvedNextStepCode = choiceTransitionMatch.nextStepCode;
      transitionResolved = true;
    } else {
      session.lastActivityAt = now;
      await session.save();

      return {
        sessionId: String(session._id),
        previousStepCode,
        nextStepCode: previousStepCode,
        sessionStatus: session.statusCode,
        nextStep: currentStep as unknown as Record<string, unknown>,
        nextContent: "No matching transition",
        createdInboundMessageId: String(messageDoc._id),
        createdStepResponseId: String(stepResponseDoc._id),
        createdOutboundMessages,
        createdServiceRequestId,
      };
    }
  } else if (currentStep.type === "message") {
    const alwaysStepCode = await resolveMessageNextStepCode(currentStep.transitionConfig);
    if (alwaysStepCode) {
      resolvedNextStepCode = alwaysStepCode;
      transitionResolved = true;
    }
  } else if (currentStep.type === "input_text") {
    const alwaysStepCode = await resolveMessageNextStepCode(currentStep.transitionConfig);
    if (alwaysStepCode) {
      resolvedNextStepCode = alwaysStepCode;
      transitionResolved = true;
    }
  }

  let nextStep = currentStep;
  let nextStepCode = previousStepCode;
  let nextContent = "";

  if (transitionResolved) {
    const resolvedStep = await loadFlowStep(session.flowId, resolvedNextStepCode);
    if (!resolvedStep) {
      throw new BotEngineError(`Next flow step '${resolvedNextStepCode}' could not be found.`, 404);
    }
    nextStep = resolvedStep;
    nextStepCode = normalizeStepCode(resolvedStep.code);
  }

  session.currentStepCode = nextStepCode;
  session.lastActivityAt = now;
  const resolvedNextTemplatePayload = await resolveTemplatePayloadByContentKey(
    nextStep.contentKey,
    session.language
  );
  const firstOutboundPayload = buildOutboundTemplatePayload(
    resolvedNextTemplatePayload,
    templateValues
  );
  nextContent = firstOutboundPayload.text;
  const firstOutbound = await createOutboundBotMessage(
    session,
    nextStepCode,
    firstOutboundPayload
  );
  if (firstOutbound) {
    createdOutboundMessages.push(firstOutbound);
  }

  if (nextStep.type === "end") {
    session.statusCode = "completed";
    session.endedAt = now;
  }

  while (nextStep.type === "message") {
    const autoNextStepCode = await resolveMessageNextStepCode(nextStep.transitionConfig);
    if (!autoNextStepCode) {
      break;
    }

    const autoNextStep = await loadFlowStep(session.flowId, autoNextStepCode);
    if (!autoNextStep) {
      throw new BotEngineError(`Next flow step '${autoNextStepCode}' could not be found.`, 404);
    }

    nextStep = autoNextStep;
    nextStepCode = normalizeStepCode(autoNextStep.code);
    session.currentStepCode = nextStepCode;

    const resolvedAutoTemplatePayload = await resolveTemplatePayloadByContentKey(
      nextStep.contentKey,
      session.language
    );
    const autoOutboundPayload = buildOutboundTemplatePayload(
      resolvedAutoTemplatePayload,
      templateValues
    );
    nextContent = autoOutboundPayload.text;
    const autoOutbound = await createOutboundBotMessage(
      session,
      nextStepCode,
      autoOutboundPayload
    );
    if (autoOutbound) {
      createdOutboundMessages.push(autoOutbound);
    }

    if (nextStep.type === "end") {
      session.statusCode = "completed";
      session.endedAt = now;
      break;
    }

    if (nextStep.type === "choice") {
      break;
    }

    if (nextStep.type !== "message") {
      break;
    }
  }

  await session.save();

  if (session.statusCode === "completed") {
    createdServiceRequestId = await createServiceRequestOnSessionCompletion(session);
  }

  return {
    sessionId: String(session._id),
    previousStepCode,
    nextStepCode,
    sessionStatus: session.statusCode,
    nextStep: nextStep as unknown as Record<string, unknown>,
    nextContent,
    createdInboundMessageId: String(messageDoc._id),
    createdStepResponseId: String(stepResponseDoc._id),
    createdOutboundMessages,
    createdServiceRequestId,
  };
}

export function isBotEngineError(error: unknown): error is BotEngineError {
  return error instanceof BotEngineError;
}
