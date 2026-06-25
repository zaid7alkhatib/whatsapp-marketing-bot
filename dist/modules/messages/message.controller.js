"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMessages = getMessages;
exports.getMessageById = getMessageById;
exports.createMessage = createMessage;
const mongoose_1 = __importDefault(require("mongoose"));
const bot_session_model_1 = require("../bot-sessions/bot-session.model");
const channel_account_model_1 = require("../channel-accounts/channel-account.model");
const channel_model_1 = require("../channels/channel.model");
const message_model_1 = require("./message.model");
const message_types_1 = require("./message.types");
function isPlainObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
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
    if (!isNonEmptyString(body.sessionId) || !mongoose_1.default.isValidObjectId(body.sessionId)) {
        return { isValid: false, message: "Field 'sessionId' must be a valid ObjectId." };
    }
    if (!isNonEmptyString(body.channelId) || !mongoose_1.default.isValidObjectId(body.channelId)) {
        return { isValid: false, message: "Field 'channelId' must be a valid ObjectId." };
    }
    if (!isNonEmptyString(body.channelAccountId) || !mongoose_1.default.isValidObjectId(body.channelAccountId)) {
        return { isValid: false, message: "Field 'channelAccountId' must be a valid ObjectId." };
    }
    if (!isNonEmptyString(body.direction) ||
        !message_types_1.MESSAGE_DIRECTIONS.includes(body.direction)) {
        return {
            isValid: false,
            message: `Field 'direction' must be one of: ${message_types_1.MESSAGE_DIRECTIONS.join(", ")}.`,
        };
    }
    if (!isNonEmptyString(body.actorType) ||
        !message_types_1.MESSAGE_ACTOR_TYPES.includes(body.actorType)) {
        return {
            isValid: false,
            message: `Field 'actorType' must be one of: ${message_types_1.MESSAGE_ACTOR_TYPES.join(", ")}.`,
        };
    }
    if (body.actorId !== undefined && !isNonEmptyString(body.actorId)) {
        return { isValid: false, message: "Field 'actorId' must be a non-empty string." };
    }
    if (!isNonEmptyString(body.messageType) ||
        !message_types_1.MESSAGE_TYPES.includes(body.messageType)) {
        return {
            isValid: false,
            message: `Field 'messageType' must be one of: ${message_types_1.MESSAGE_TYPES.join(", ")}.`,
        };
    }
    if (body.externalMessageId !== undefined && !isNonEmptyString(body.externalMessageId)) {
        return { isValid: false, message: "Field 'externalMessageId' must be a non-empty string." };
    }
    if (!isPlainObject(body.content)) {
        return { isValid: false, message: "Field 'content' is required and must be a non-null object." };
    }
    if (body.normalizedContent !== undefined && !isPlainObject(body.normalizedContent)) {
        return { isValid: false, message: "Field 'normalizedContent' must be an object." };
    }
    if (body.deliveryStatus !== undefined && !isNonEmptyString(body.deliveryStatus)) {
        return { isValid: false, message: "Field 'deliveryStatus' must be a non-empty string." };
    }
    if (body.providerPayload !== undefined && !isPlainObject(body.providerPayload)) {
        return { isValid: false, message: "Field 'providerPayload' must be an object." };
    }
    const sentAtResult = parseDateField(body.sentAt, "sentAt", false);
    if (!sentAtResult.isValid) {
        return { isValid: false, message: sentAtResult.message };
    }
    const receivedAtResult = parseDateField(body.receivedAt, "receivedAt", false);
    if (!receivedAtResult.isValid) {
        return { isValid: false, message: receivedAtResult.message };
    }
    const createdAtResult = parseDateField(body.createdAt, "createdAt", true);
    if (!createdAtResult.isValid || !createdAtResult.date) {
        return { isValid: false, message: createdAtResult.message };
    }
    return {
        isValid: true,
        data: {
            sessionId: new mongoose_1.default.Types.ObjectId(body.sessionId),
            channelId: new mongoose_1.default.Types.ObjectId(body.channelId),
            channelAccountId: new mongoose_1.default.Types.ObjectId(body.channelAccountId),
            direction: body.direction,
            actorType: body.actorType,
            actorId: body.actorId?.trim(),
            messageType: body.messageType,
            externalMessageId: body.externalMessageId?.trim(),
            content: body.content,
            normalizedContent: body.normalizedContent,
            deliveryStatus: body.deliveryStatus?.trim(),
            providerPayload: body.providerPayload,
            sentAt: sentAtResult.date,
            receivedAt: receivedAtResult.date,
            createdAt: createdAtResult.date,
        },
    };
}
async function getMessages(_req, res, next) {
    try {
        const messages = await message_model_1.MessageModel.find().sort({ createdAt: -1 }).lean();
        res.status(200).json({
            success: true,
            data: messages,
        });
    }
    catch (error) {
        next(error);
    }
}
async function getMessageById(req, res, next) {
    try {
        const { id } = req.params;
        if (!mongoose_1.default.isValidObjectId(id)) {
            res.status(400).json({
                success: false,
                message: "Invalid message id.",
            });
            return;
        }
        const message = await message_model_1.MessageModel.findById(id).lean();
        if (!message) {
            res.status(404).json({
                success: false,
                message: "Message not found.",
            });
            return;
        }
        res.status(200).json({
            success: true,
            data: message,
        });
    }
    catch (error) {
        next(error);
    }
}
async function createMessage(req, res, next) {
    try {
        const parsed = parseCreateBody(req.body);
        if (!parsed.isValid || !parsed.data) {
            res.status(400).json({
                success: false,
                message: parsed.message,
            });
            return;
        }
        const sessionExists = await bot_session_model_1.BotSessionModel.exists({ _id: parsed.data.sessionId });
        if (!sessionExists) {
            res.status(400).json({
                success: false,
                message: "sessionId does not reference an existing bot session.",
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
        const message = await message_model_1.MessageModel.create(parsed.data);
        res.status(201).json({
            success: true,
            data: message,
        });
    }
    catch (error) {
        next(error);
    }
}
