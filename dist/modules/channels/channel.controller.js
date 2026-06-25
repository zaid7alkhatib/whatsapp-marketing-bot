"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getChannels = getChannels;
exports.getChannelById = getChannelById;
exports.createChannel = createChannel;
exports.updateChannel = updateChannel;
const mongoose_1 = __importDefault(require("mongoose"));
const channel_model_1 = require("./channel.model");
const channel_types_1 = require("./channel.types");
function isNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
}
function isBooleanOrUndefined(value) {
    return value === undefined || typeof value === "boolean";
}
function parseCreateBody(body) {
    if (!isNonEmptyString(body.code) || !channel_types_1.CHANNEL_CODES.includes(body.code)) {
        return {
            isValid: false,
            message: `Field 'code' must be one of: ${channel_types_1.CHANNEL_CODES.join(", ")}.`,
        };
    }
    if (!isNonEmptyString(body.name)) {
        return { isValid: false, message: "Field 'name' is required." };
    }
    if (!isNonEmptyString(body.provider) ||
        !channel_types_1.CHANNEL_PROVIDERS.includes(body.provider)) {
        return {
            isValid: false,
            message: `Field 'provider' must be one of: ${channel_types_1.CHANNEL_PROVIDERS.join(", ")}.`,
        };
    }
    const status = body.status ?? "active";
    if (!isNonEmptyString(status) || !channel_types_1.CHANNEL_STATUSES.includes(status)) {
        return {
            isValid: false,
            message: `Field 'status' must be one of: ${channel_types_1.CHANNEL_STATUSES.join(", ")}.`,
        };
    }
    if (body.capabilities !== undefined && typeof body.capabilities !== "object") {
        return { isValid: false, message: "Field 'capabilities' must be an object." };
    }
    if (!isBooleanOrUndefined(body.capabilities?.text)) {
        return { isValid: false, message: "Field 'capabilities.text' must be boolean." };
    }
    if (!isBooleanOrUndefined(body.capabilities?.image)) {
        return { isValid: false, message: "Field 'capabilities.image' must be boolean." };
    }
    if (!isBooleanOrUndefined(body.capabilities?.document)) {
        return { isValid: false, message: "Field 'capabilities.document' must be boolean." };
    }
    if (!isBooleanOrUndefined(body.capabilities?.audio)) {
        return { isValid: false, message: "Field 'capabilities.audio' must be boolean." };
    }
    if (!isBooleanOrUndefined(body.capabilities?.buttons)) {
        return { isValid: false, message: "Field 'capabilities.buttons' must be boolean." };
    }
    if (!isBooleanOrUndefined(body.capabilities?.lists)) {
        return { isValid: false, message: "Field 'capabilities.lists' must be boolean." };
    }
    return {
        isValid: true,
        data: {
            code: body.code.trim().toLowerCase(),
            name: body.name.trim(),
            provider: body.provider.trim().toLowerCase(),
            status: status,
            capabilities: {
                text: body.capabilities?.text ?? false,
                image: body.capabilities?.image ?? false,
                document: body.capabilities?.document ?? false,
                audio: body.capabilities?.audio ?? false,
                buttons: body.capabilities?.buttons ?? false,
                lists: body.capabilities?.lists ?? false,
            },
        },
    };
}
async function getChannels(_req, res, next) {
    try {
        const channels = await channel_model_1.ChannelModel.find().sort({ createdAt: -1 }).lean();
        res.status(200).json({
            success: true,
            data: channels,
        });
    }
    catch (error) {
        next(error);
    }
}
async function getChannelById(req, res, next) {
    try {
        const { id } = req.params;
        if (!mongoose_1.default.isValidObjectId(id)) {
            res.status(400).json({
                success: false,
                message: "Invalid channel id.",
            });
            return;
        }
        const channel = await channel_model_1.ChannelModel.findById(id).lean();
        if (!channel) {
            res.status(404).json({
                success: false,
                message: "Channel not found.",
            });
            return;
        }
        res.status(200).json({
            success: true,
            data: channel,
        });
    }
    catch (error) {
        next(error);
    }
}
async function createChannel(req, res, next) {
    try {
        const parsed = parseCreateBody(req.body);
        if (!parsed.isValid || !parsed.data) {
            res.status(400).json({
                success: false,
                message: parsed.message,
            });
            return;
        }
        const existingChannel = await channel_model_1.ChannelModel.findOne({ code: parsed.data.code })
            .select("_id")
            .lean();
        if (existingChannel) {
            res.status(409).json({
                success: false,
                message: "Channel code already exists.",
            });
            return;
        }
        const channel = await channel_model_1.ChannelModel.create(parsed.data);
        res.status(201).json({
            success: true,
            data: channel,
        });
    }
    catch (error) {
        const dbError = error;
        if (dbError.code === 11000) {
            res.status(409).json({
                success: false,
                message: "Channel code already exists.",
            });
            return;
        }
        next(error);
    }
}
async function updateChannel(req, res, next) {
    try {
        const { id } = req.params;
        if (!mongoose_1.default.isValidObjectId(id)) {
            res.status(400).json({
                success: false,
                message: "Invalid channel id.",
            });
            return;
        }
        const parsed = parseCreateBody(req.body);
        if (!parsed.isValid || !parsed.data) {
            res.status(400).json({
                success: false,
                message: parsed.message,
            });
            return;
        }
        const existingChannel = await channel_model_1.ChannelModel.findById(id);
        if (!existingChannel) {
            res.status(404).json({
                success: false,
                message: "Channel not found.",
            });
            return;
        }
        const duplicateByCode = await channel_model_1.ChannelModel.findOne({
            code: parsed.data.code,
            _id: { $ne: existingChannel._id },
        })
            .select("_id")
            .lean();
        if (duplicateByCode) {
            res.status(409).json({
                success: false,
                message: "Channel code already exists.",
            });
            return;
        }
        existingChannel.code = parsed.data.code;
        existingChannel.name = parsed.data.name;
        existingChannel.provider = parsed.data.provider;
        existingChannel.status = parsed.data.status;
        existingChannel.capabilities = parsed.data.capabilities;
        const updatedChannel = await existingChannel.save();
        res.status(200).json({
            success: true,
            data: updatedChannel,
        });
    }
    catch (error) {
        const dbError = error;
        if (dbError.code === 11000) {
            res.status(409).json({
                success: false,
                message: "Channel code already exists.",
            });
            return;
        }
        next(error);
    }
}
