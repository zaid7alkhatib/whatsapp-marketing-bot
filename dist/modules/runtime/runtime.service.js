"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.inboundMessage = inboundMessage;
exports.isRuntimeError = isRuntimeError;
const mongoose_1 = __importDefault(require("mongoose"));
const bot_engine_service_1 = require("../bot-engine/bot-engine.service");
const bot_session_model_1 = require("../bot-sessions/bot-session.model");
const channel_account_model_1 = require("../channel-accounts/channel-account.model");
const service_request_model_1 = require("../service-requests/service-request.model");
class RuntimeError extends Error {
    constructor(message, statusCode = 400) {
        super(message);
        this.name = "RuntimeError";
        this.statusCode = statusCode;
    }
}
function isNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
}
function isPlainObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function parseRequiredObjectIdString(value, fieldName) {
    if (!isNonEmptyString(value)) {
        throw new RuntimeError(`Field '${fieldName}' is required.`);
    }
    const normalizedValue = value.trim();
    if (!mongoose_1.default.isValidObjectId(normalizedValue)) {
        throw new RuntimeError(`Field '${fieldName}' must be a valid ObjectId.`);
    }
    return normalizedValue;
}
function parseOptionalObjectIdString(value, fieldName) {
    if (value === undefined || value === null) {
        return undefined;
    }
    if (!isNonEmptyString(value)) {
        throw new RuntimeError(`Field '${fieldName}' must be a valid ObjectId.`);
    }
    const normalizedValue = value.trim();
    if (!mongoose_1.default.isValidObjectId(normalizedValue)) {
        throw new RuntimeError(`Field '${fieldName}' must be a valid ObjectId.`);
    }
    return normalizedValue;
}
function parseBody(body) {
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
        channelAccountId: new mongoose_1.default.Types.ObjectId(channelAccountIdString),
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
function extractSessionIdFromStartResult(startResult) {
    const sessionData = startResult.session;
    if (!sessionData || typeof sessionData !== "object") {
        throw new RuntimeError("Unable to resolve created session id from start-session response.", 500);
    }
    const maybeSessionId = sessionData._id;
    if (isNonEmptyString(maybeSessionId) && mongoose_1.default.isValidObjectId(maybeSessionId)) {
        return maybeSessionId;
    }
    if (maybeSessionId instanceof mongoose_1.default.Types.ObjectId) {
        return maybeSessionId.toString();
    }
    throw new RuntimeError("Unable to resolve created session id from start-session response.", 500);
}
function extractSessionStatusFromStartResult(startResult) {
    const sessionData = startResult.session;
    if (!sessionData || typeof sessionData !== "object") {
        throw new RuntimeError("Unable to resolve created session status from start-session response.", 500);
    }
    const maybeStatus = sessionData.statusCode;
    if (!isNonEmptyString(maybeStatus)) {
        throw new RuntimeError("Unable to resolve created session status from start-session response.", 500);
    }
    return maybeStatus;
}
async function inboundMessage(body) {
    const parsed = parseBody(body);
    const channelAccountExists = await channel_account_model_1.ChannelAccountModel.exists({
        _id: parsed.channelAccountId,
    });
    if (!channelAccountExists) {
        throw new RuntimeError("channelAccountId does not reference an existing channel account.");
    }
    const recentSessions = await bot_session_model_1.BotSessionModel.find({
        channelAccountId: parsed.channelAccountId,
        channelUserRef: parsed.channelUserRef,
    })
        .sort({ lastActivityAt: -1, updatedAt: -1 })
        .select("_id")
        .limit(10)
        .lean();
    if (recentSessions.length > 0) {
        const recentSessionIds = recentSessions.map((session) => session._id);
        const pendingAlternateOffer = await service_request_model_1.ServiceRequestModel.findOne({
            sessionId: { $in: recentSessionIds },
            statusCode: "alternate_offered",
            "resolutionData.awaitingPatientDecision": true,
        })
            .sort({ updatedAt: -1 })
            .select("sessionId")
            .lean();
        if (pendingAlternateOffer?.sessionId) {
            const processBody = {
                sessionId: String(pendingAlternateOffer.sessionId),
                messageType: parsed.messageType,
                text: parsed.text,
                media: parsed.media,
                externalMessageId: parsed.externalMessageId,
            };
            const processResult = await (0, bot_engine_service_1.processMessage)(processBody);
            return {
                sessionId: String(pendingAlternateOffer.sessionId),
                sessionCreated: false,
                sessionStatus: processResult.sessionStatus,
                startSession: null,
                processResult,
            };
        }
    }
    const activeSession = await bot_session_model_1.BotSessionModel.findOne({
        channelAccountId: parsed.channelAccountId,
        channelUserRef: parsed.channelUserRef,
        statusCode: "active",
    })
        .sort({ lastActivityAt: -1 })
        .lean();
    if (activeSession?._id) {
        const processBody = {
            sessionId: String(activeSession._id),
            messageType: parsed.messageType,
            text: parsed.text,
            media: parsed.media,
            externalMessageId: parsed.externalMessageId,
        };
        const processResult = await (0, bot_engine_service_1.processMessage)(processBody);
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
    const startBody = {
        channelAccountId: parsed.channelAccountIdString,
        channelUserRef: parsed.channelUserRef,
        flowId: parsed.flowId,
        language: parsed.language,
        orgUnitId: parsed.orgUnitId,
        businessPartnerId: parsed.businessPartnerId,
    };
    const startResult = await (0, bot_engine_service_1.startSession)(startBody);
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
function isRuntimeError(error) {
    return error instanceof RuntimeError;
}
