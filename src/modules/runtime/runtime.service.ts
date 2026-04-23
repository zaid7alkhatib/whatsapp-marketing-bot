import mongoose from "mongoose";
import {
  ProcessMessageBody,
  StartSessionBody,
  StartSessionResult,
} from "../bot-engine/bot-engine.types";
import { processMessage, startSession } from "../bot-engine/bot-engine.service";
import { BotSessionModel } from "../bot-sessions/bot-session.model";
import { ChannelAccountModel } from "../channel-accounts/channel-account.model";
import {
  RuntimeInboundMessageBody,
  RuntimeInboundMessageResult,
} from "./runtime.types";

class RuntimeError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "RuntimeError";
    this.statusCode = statusCode;
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRequiredObjectIdString(value: unknown, fieldName: string): string {
  if (!isNonEmptyString(value)) {
    throw new RuntimeError(`Field '${fieldName}' is required.`);
  }

  const normalizedValue = value.trim();
  if (!mongoose.isValidObjectId(normalizedValue)) {
    throw new RuntimeError(`Field '${fieldName}' must be a valid ObjectId.`);
  }

  return normalizedValue;
}

function parseOptionalObjectIdString(value: unknown, fieldName: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!isNonEmptyString(value)) {
    throw new RuntimeError(`Field '${fieldName}' must be a valid ObjectId.`);
  }

  const normalizedValue = value.trim();
  if (!mongoose.isValidObjectId(normalizedValue)) {
    throw new RuntimeError(`Field '${fieldName}' must be a valid ObjectId.`);
  }

  return normalizedValue;
}

function parseBody(body: RuntimeInboundMessageBody): {
  channelAccountId: mongoose.Types.ObjectId;
  channelAccountIdString: string;
  channelUserRef: string;
  messageType: string;
  text?: string;
  media?: Record<string, unknown>;
  externalMessageId?: string;
  flowId?: string;
  language?: string;
  orgUnitId?: string;
  businessPartnerId?: string;
} {
  const channelAccountIdString = parseRequiredObjectIdString(body.channelAccountId, "channelAccountId");

  if (!isNonEmptyString(body.channelUserRef)) {
    throw new RuntimeError("Field 'channelUserRef' is required.");
  }

  if (!isNonEmptyString(body.messageType)) {
    throw new RuntimeError("Field 'messageType' is required.");
  }

  if (body.text !== undefined && body.text !== null && typeof body.text !== "string") {
    throw new RuntimeError("Field 'text' must be a string when provided.");
  }

  if (body.media !== undefined && body.media !== null && !isPlainObject(body.media)) {
    throw new RuntimeError("Field 'media' must be an object when provided.");
  }

  if (body.externalMessageId !== undefined && !isNonEmptyString(body.externalMessageId)) {
    throw new RuntimeError("Field 'externalMessageId' must be a non-empty string when provided.");
  }

  if (body.language !== undefined && !isNonEmptyString(body.language)) {
    throw new RuntimeError("Field 'language' must be a non-empty string when provided.");
  }

  return {
    channelAccountId: new mongoose.Types.ObjectId(channelAccountIdString),
    channelAccountIdString,
    channelUserRef: body.channelUserRef.trim(),
    messageType: body.messageType.trim(),
    text: typeof body.text === "string" ? body.text : undefined,
    media: isPlainObject(body.media) ? body.media : undefined,
    externalMessageId: body.externalMessageId?.trim(),
    flowId: parseOptionalObjectIdString(body.flowId, "flowId"),
    language: body.language?.trim(),
    orgUnitId: parseOptionalObjectIdString(body.orgUnitId, "orgUnitId"),
    businessPartnerId: parseOptionalObjectIdString(body.businessPartnerId, "businessPartnerId"),
  };
}

function extractSessionIdFromStartResult(startResult: StartSessionResult): string {
  const sessionData = startResult.session;
  if (!sessionData || typeof sessionData !== "object") {
    throw new RuntimeError("Unable to resolve created session id from start-session response.", 500);
  }

  const maybeSessionId = (sessionData as { _id?: unknown })._id;
  if (isNonEmptyString(maybeSessionId) && mongoose.isValidObjectId(maybeSessionId)) {
    return maybeSessionId;
  }

  if (maybeSessionId instanceof mongoose.Types.ObjectId) {
    return maybeSessionId.toString();
  }

  throw new RuntimeError("Unable to resolve created session id from start-session response.", 500);
}

function extractSessionStatusFromStartResult(startResult: StartSessionResult): string {
  const sessionData = startResult.session;
  if (!sessionData || typeof sessionData !== "object") {
    throw new RuntimeError("Unable to resolve created session status from start-session response.", 500);
  }

  const maybeStatus = (sessionData as { statusCode?: unknown }).statusCode;
  if (!isNonEmptyString(maybeStatus)) {
    throw new RuntimeError("Unable to resolve created session status from start-session response.", 500);
  }

  return maybeStatus;
}

export async function inboundMessage(
  body: RuntimeInboundMessageBody
): Promise<RuntimeInboundMessageResult> {
  const parsed = parseBody(body);

  const channelAccountExists = await ChannelAccountModel.exists({
    _id: parsed.channelAccountId,
  });
  if (!channelAccountExists) {
    throw new RuntimeError("channelAccountId does not reference an existing channel account.");
  }

  const activeSession = await BotSessionModel.findOne({
    channelAccountId: parsed.channelAccountId,
    channelUserRef: parsed.channelUserRef,
    statusCode: "active",
  })
    .sort({ lastActivityAt: -1 })
    .lean();

  if (activeSession?._id) {
    const processBody: ProcessMessageBody = {
      sessionId: String(activeSession._id),
      messageType: parsed.messageType,
      text: parsed.text,
      media: parsed.media,
      externalMessageId: parsed.externalMessageId,
    };

    const processResult = await processMessage(processBody);

    return {
      sessionId: String(activeSession._id),
      sessionCreated: false,
      sessionStatus: processResult.sessionStatus,
      startSession: null,
      processResult,
    };
  }

  if (!parsed.flowId) {
    throw new RuntimeError("Field 'flowId' is required when no active session exists.");
  }

  if (!parsed.language) {
    throw new RuntimeError("Field 'language' is required when no active session exists.");
  }

  const startBody: StartSessionBody = {
    channelAccountId: parsed.channelAccountIdString,
    channelUserRef: parsed.channelUserRef,
    flowId: parsed.flowId,
    language: parsed.language,
    orgUnitId: parsed.orgUnitId,
    businessPartnerId: parsed.businessPartnerId,
  };

  const startResult = await startSession(startBody);
  const sessionId = extractSessionIdFromStartResult(startResult);
  const sessionStatus = extractSessionStatusFromStartResult(startResult);

  return {
    sessionId,
    sessionCreated: true,
    sessionStatus,
    startSession: startResult,
    processResult: null,
  };
}

export function isRuntimeError(error: unknown): error is RuntimeError {
  return error instanceof RuntimeError;
}
