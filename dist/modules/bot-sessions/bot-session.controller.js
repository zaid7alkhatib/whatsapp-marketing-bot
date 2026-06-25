"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBotSessions = getBotSessions;
exports.getBotSessionById = getBotSessionById;
exports.createBotSession = createBotSession;
const mongoose_1 = __importDefault(require("mongoose"));
const business_partner_model_1 = require("../business-partners/business-partner.model");
const channel_account_model_1 = require("../channel-accounts/channel-account.model");
const channel_model_1 = require("../channels/channel.model");
const flow_model_1 = require("../flows/flow.model");
const org_unit_model_1 = require("../org-units/org-unit.model");
const bot_session_model_1 = require("./bot-session.model");
const bot_session_types_1 = require("./bot-session.types");
function isPlainObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
}
function isPositiveNumber(value) {
    return typeof value === "number" && Number.isFinite(value) && value > 0;
}
function parseDateField(value, fieldName, required) {
    if (value === undefined || value === null) {
        if (required) {
            return { isValid: false, message: `Field '${fieldName}' is required and must be a valid date.` };
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
function parseCreateBody(body) {
    if (body.orgUnitId !== undefined) {
        if (!isNonEmptyString(body.orgUnitId) || !mongoose_1.default.isValidObjectId(body.orgUnitId)) {
            return { isValid: false, message: "Field 'orgUnitId' must be a valid ObjectId." };
        }
    }
    if (!isNonEmptyString(body.channelId) || !mongoose_1.default.isValidObjectId(body.channelId)) {
        return { isValid: false, message: "Field 'channelId' must be a valid ObjectId." };
    }
    if (!isNonEmptyString(body.channelAccountId) || !mongoose_1.default.isValidObjectId(body.channelAccountId)) {
        return { isValid: false, message: "Field 'channelAccountId' must be a valid ObjectId." };
    }
    if (body.businessPartnerId !== undefined) {
        if (!isNonEmptyString(body.businessPartnerId) ||
            !mongoose_1.default.isValidObjectId(body.businessPartnerId)) {
            return { isValid: false, message: "Field 'businessPartnerId' must be a valid ObjectId." };
        }
    }
    if (!isNonEmptyString(body.flowId) || !mongoose_1.default.isValidObjectId(body.flowId)) {
        return { isValid: false, message: "Field 'flowId' must be a valid ObjectId." };
    }
    if (!isPositiveNumber(body.flowVersion)) {
        return { isValid: false, message: "Field 'flowVersion' must be a positive number." };
    }
    if (!isNonEmptyString(body.statusCode) ||
        !bot_session_types_1.BOT_SESSION_STATUSES.includes(body.statusCode)) {
        return {
            isValid: false,
            message: `Field 'statusCode' must be one of: ${bot_session_types_1.BOT_SESSION_STATUSES.join(", ")}.`,
        };
    }
    if (!isNonEmptyString(body.language)) {
        return { isValid: false, message: "Field 'language' is required." };
    }
    if (!isNonEmptyString(body.channelUserRef)) {
        return { isValid: false, message: "Field 'channelUserRef' is required." };
    }
    if (body.currentStepCode !== undefined && !isNonEmptyString(body.currentStepCode)) {
        return { isValid: false, message: "Field 'currentStepCode' must be a non-empty string." };
    }
    const startedAtResult = parseDateField(body.startedAt, "startedAt", true);
    if (!startedAtResult.isValid || !startedAtResult.date) {
        return { isValid: false, message: startedAtResult.message };
    }
    const endedAtResult = parseDateField(body.endedAt, "endedAt", false);
    if (!endedAtResult.isValid) {
        return { isValid: false, message: endedAtResult.message };
    }
    const lastActivityAtResult = parseDateField(body.lastActivityAt, "lastActivityAt", true);
    if (!lastActivityAtResult.isValid || !lastActivityAtResult.date) {
        return { isValid: false, message: lastActivityAtResult.message };
    }
    if (body.collectedData !== undefined && !isPlainObject(body.collectedData)) {
        return { isValid: false, message: "Field 'collectedData' must be an object." };
    }
    if (body.contextSnapshot !== undefined && !isPlainObject(body.contextSnapshot)) {
        return { isValid: false, message: "Field 'contextSnapshot' must be an object." };
    }
    if (body.metadata !== undefined && !isPlainObject(body.metadata)) {
        return { isValid: false, message: "Field 'metadata' must be an object." };
    }
    return {
        isValid: true,
        data: {
            orgUnitId: body.orgUnitId ? new mongoose_1.default.Types.ObjectId(body.orgUnitId) : undefined,
            channelId: new mongoose_1.default.Types.ObjectId(body.channelId),
            channelAccountId: new mongoose_1.default.Types.ObjectId(body.channelAccountId),
            businessPartnerId: body.businessPartnerId
                ? new mongoose_1.default.Types.ObjectId(body.businessPartnerId)
                : undefined,
            flowId: new mongoose_1.default.Types.ObjectId(body.flowId),
            flowVersion: body.flowVersion,
            statusCode: body.statusCode,
            language: body.language.trim(),
            channelUserRef: body.channelUserRef.trim(),
            currentStepCode: body.currentStepCode?.trim(),
            startedAt: startedAtResult.date,
            endedAt: endedAtResult.date,
            lastActivityAt: lastActivityAtResult.date,
            collectedData: body.collectedData,
            contextSnapshot: body.contextSnapshot,
            metadata: body.metadata,
        },
    };
}
async function getBotSessions(_req, res, next) {
    try {
        const sessions = await bot_session_model_1.BotSessionModel.find().sort({ createdAt: -1 }).lean();
        res.status(200).json({
            success: true,
            data: sessions,
        });
    }
    catch (error) {
        next(error);
    }
}
async function getBotSessionById(req, res, next) {
    try {
        const { id } = req.params;
        if (!mongoose_1.default.isValidObjectId(id)) {
            res.status(400).json({
                success: false,
                message: "Invalid bot session id.",
            });
            return;
        }
        const session = await bot_session_model_1.BotSessionModel.findById(id).lean();
        if (!session) {
            res.status(404).json({
                success: false,
                message: "Bot session not found.",
            });
            return;
        }
        res.status(200).json({
            success: true,
            data: session,
        });
    }
    catch (error) {
        next(error);
    }
}
async function createBotSession(req, res, next) {
    try {
        const parsed = parseCreateBody(req.body);
        if (!parsed.isValid || !parsed.data) {
            res.status(400).json({
                success: false,
                message: parsed.message,
            });
            return;
        }
        const channelExists = await channel_model_1.ChannelModel.exists({ _id: parsed.data.channelId });
        if (!channelExists) {
            res.status(400).json({
                success: false,
                message: "channelId does not reference an existing channel.",
            });
            return;
        }
        const channelAccountExists = await channel_account_model_1.ChannelAccountModel.exists({ _id: parsed.data.channelAccountId });
        if (!channelAccountExists) {
            res.status(400).json({
                success: false,
                message: "channelAccountId does not reference an existing channel account.",
            });
            return;
        }
        if (parsed.data.orgUnitId) {
            const orgUnitExists = await org_unit_model_1.OrgUnitModel.exists({ _id: parsed.data.orgUnitId });
            if (!orgUnitExists) {
                res.status(400).json({
                    success: false,
                    message: "orgUnitId does not reference an existing org unit.",
                });
                return;
            }
        }
        if (parsed.data.businessPartnerId) {
            const partnerExists = await business_partner_model_1.BusinessPartnerModel.exists({ _id: parsed.data.businessPartnerId });
            if (!partnerExists) {
                res.status(400).json({
                    success: false,
                    message: "businessPartnerId does not reference an existing business partner.",
                });
                return;
            }
        }
        const flowExists = await flow_model_1.FlowModel.exists({ _id: parsed.data.flowId });
        if (!flowExists) {
            res.status(400).json({
                success: false,
                message: "flowId does not reference an existing flow.",
            });
            return;
        }
        const session = await bot_session_model_1.BotSessionModel.create(parsed.data);
        res.status(201).json({
            success: true,
            data: session,
        });
    }
    catch (error) {
        next(error);
    }
}
