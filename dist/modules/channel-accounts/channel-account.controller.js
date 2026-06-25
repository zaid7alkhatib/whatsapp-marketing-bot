"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getChannelAccounts = getChannelAccounts;
exports.getChannelAccountById = getChannelAccountById;
exports.createChannelAccount = createChannelAccount;
exports.updateChannelAccount = updateChannelAccount;
const mongoose_1 = __importDefault(require("mongoose"));
const auth_scope_1 = require("../auth/auth.scope");
const channel_model_1 = require("../channels/channel.model");
const channel_account_model_1 = require("./channel-account.model");
const channel_account_types_1 = require("./channel-account.types");
function isNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
}
function isPlainObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function parseDateField(value) {
    if (value === undefined || value === null) {
        return { isValid: true };
    }
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return { isValid: true, date: value };
    }
    if (typeof value === "string" && value.trim().length > 0) {
        const parsedDate = new Date(value);
        if (!Number.isNaN(parsedDate.getTime())) {
            return { isValid: true, date: parsedDate };
        }
    }
    return { isValid: false, message: "must be a valid ISO date string." };
}
function parseCreateBody(body) {
    if (!isNonEmptyString(body.channelId) || !mongoose_1.default.isValidObjectId(body.channelId)) {
        return { isValid: false, message: "Field 'channelId' must be a valid ObjectId." };
    }
    if (!isNonEmptyString(body.code)) {
        return { isValid: false, message: "Field 'code' is required." };
    }
    if (!isNonEmptyString(body.displayName)) {
        return { isValid: false, message: "Field 'displayName' is required." };
    }
    if (body.phoneNumber !== undefined && !isNonEmptyString(body.phoneNumber)) {
        return { isValid: false, message: "Field 'phoneNumber' must be a non-empty string." };
    }
    const status = body.status ?? "pending";
    if (!isNonEmptyString(status) ||
        !channel_account_types_1.CHANNEL_ACCOUNT_STATUSES.includes(status)) {
        return {
            isValid: false,
            message: `Field 'status' must be one of: ${channel_account_types_1.CHANNEL_ACCOUNT_STATUSES.join(", ")}.`,
        };
    }
    if (body.providerConfig !== undefined && !isPlainObject(body.providerConfig)) {
        return { isValid: false, message: "Field 'providerConfig' must be an object." };
    }
    const parsedLastConnectedAt = parseDateField(body.lastConnectedAt);
    if (!parsedLastConnectedAt.isValid) {
        return {
            isValid: false,
            message: `Field 'lastConnectedAt' ${parsedLastConnectedAt.message}`,
        };
    }
    const parsedLastDisconnectedAt = parseDateField(body.lastDisconnectedAt);
    if (!parsedLastDisconnectedAt.isValid) {
        return {
            isValid: false,
            message: `Field 'lastDisconnectedAt' ${parsedLastDisconnectedAt.message}`,
        };
    }
    return {
        isValid: true,
        data: {
            channelId: new mongoose_1.default.Types.ObjectId(body.channelId),
            code: body.code.trim().toUpperCase(),
            displayName: body.displayName.trim(),
            phoneNumber: body.phoneNumber?.trim(),
            status: status,
            providerConfig: body.providerConfig ?? {},
            lastConnectedAt: parsedLastConnectedAt.date,
            lastDisconnectedAt: parsedLastDisconnectedAt.date,
        },
    };
}
async function getChannelAccounts(req, res, next) {
    try {
        if ((0, auth_scope_1.isClientUserRole)(req.authUser?.role)) {
            const scopedChannelAccount = await (0, auth_scope_1.resolveScopedChannelAccount)(req.authUser);
            if (!scopedChannelAccount) {
                res.status(403).json({
                    success: false,
                    message: "Client channel account scope is not configured.",
                });
                return;
            }
            res.status(200).json({
                success: true,
                data: [
                    {
                        _id: scopedChannelAccount._id,
                        code: scopedChannelAccount.code,
                        displayName: scopedChannelAccount.displayName,
                        phoneNumber: scopedChannelAccount.phoneNumber ?? null,
                    },
                ],
            });
            return;
        }
        const channelAccounts = await channel_account_model_1.ChannelAccountModel.find().sort({ createdAt: -1 }).lean();
        res.status(200).json({
            success: true,
            data: channelAccounts,
        });
    }
    catch (error) {
        next(error);
    }
}
async function getChannelAccountById(req, res, next) {
    try {
        const { id } = req.params;
        if (!mongoose_1.default.isValidObjectId(id)) {
            res.status(400).json({
                success: false,
                message: "Invalid channel account id.",
            });
            return;
        }
        if ((0, auth_scope_1.isClientUserRole)(req.authUser?.role)) {
            const scopedChannelAccount = await (0, auth_scope_1.resolveScopedChannelAccount)(req.authUser);
            if (!scopedChannelAccount) {
                res.status(403).json({
                    success: false,
                    message: "Client channel account scope is not configured.",
                });
                return;
            }
            if (!(0, auth_scope_1.idsMatch)(scopedChannelAccount._id, id)) {
                res.status(404).json({
                    success: false,
                    message: "Channel account not found.",
                });
                return;
            }
            res.status(200).json({
                success: true,
                data: {
                    _id: scopedChannelAccount._id,
                    code: scopedChannelAccount.code,
                    displayName: scopedChannelAccount.displayName,
                    phoneNumber: scopedChannelAccount.phoneNumber ?? null,
                },
            });
            return;
        }
        const channelAccount = await channel_account_model_1.ChannelAccountModel.findById(id).lean();
        if (!channelAccount) {
            res.status(404).json({
                success: false,
                message: "Channel account not found.",
            });
            return;
        }
        res.status(200).json({
            success: true,
            data: channelAccount,
        });
    }
    catch (error) {
        next(error);
    }
}
async function createChannelAccount(req, res, next) {
    try {
        const parsed = parseCreateBody(req.body);
        if (!parsed.isValid || !parsed.data) {
            res.status(400).json({
                success: false,
                message: parsed.message,
            });
            return;
        }
        const existingChannelAccount = await channel_account_model_1.ChannelAccountModel.findOne({ code: parsed.data.code })
            .select("_id")
            .lean();
        if (existingChannelAccount) {
            res.status(409).json({
                success: false,
                message: "Channel account code already exists.",
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
        const channelAccount = await channel_account_model_1.ChannelAccountModel.create(parsed.data);
        res.status(201).json({
            success: true,
            data: channelAccount,
        });
    }
    catch (error) {
        const dbError = error;
        if (dbError.code === 11000) {
            res.status(409).json({
                success: false,
                message: "Channel account code already exists.",
            });
            return;
        }
        next(error);
    }
}
async function updateChannelAccount(req, res, next) {
    try {
        const { id } = req.params;
        if (!mongoose_1.default.isValidObjectId(id)) {
            res.status(400).json({
                success: false,
                message: "Invalid channel account id.",
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
        const existingChannelAccount = await channel_account_model_1.ChannelAccountModel.findById(id);
        if (!existingChannelAccount) {
            res.status(404).json({
                success: false,
                message: "Channel account not found.",
            });
            return;
        }
        const duplicateByCode = await channel_account_model_1.ChannelAccountModel.findOne({
            code: parsed.data.code,
            _id: { $ne: existingChannelAccount._id },
        })
            .select("_id")
            .lean();
        if (duplicateByCode) {
            res.status(409).json({
                success: false,
                message: "Channel account code already exists.",
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
        existingChannelAccount.channelId = parsed.data.channelId;
        existingChannelAccount.orgUnitId = null;
        existingChannelAccount.code = parsed.data.code;
        existingChannelAccount.displayName = parsed.data.displayName;
        existingChannelAccount.phoneNumber = parsed.data.phoneNumber;
        existingChannelAccount.status = parsed.data.status;
        existingChannelAccount.providerConfig = parsed.data.providerConfig;
        existingChannelAccount.lastConnectedAt = parsed.data.lastConnectedAt ?? null;
        existingChannelAccount.lastDisconnectedAt = parsed.data.lastDisconnectedAt ?? null;
        const updatedChannelAccount = await existingChannelAccount.save();
        res.status(200).json({
            success: true,
            data: updatedChannelAccount,
        });
    }
    catch (error) {
        const dbError = error;
        if (dbError.code === 11000) {
            res.status(409).json({
                success: false,
                message: "Channel account code already exists.",
            });
            return;
        }
        next(error);
    }
}
