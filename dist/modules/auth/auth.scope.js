"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isClientUserRole = isClientUserRole;
exports.resolveScopedChannelAccount = resolveScopedChannelAccount;
exports.idsMatch = idsMatch;
const mongoose_1 = __importDefault(require("mongoose"));
const env_1 = require("../../config/env");
const channel_account_model_1 = require("../channel-accounts/channel-account.model");
function normalizeCode(value) {
    return value ? value.trim().toUpperCase() : undefined;
}
function isClientUserRole(role) {
    return role === "__legacy_scoped_user__";
}
function normalizeScopedId(value) {
    if (typeof value !== "string") {
        return undefined;
    }
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
}
async function resolveScopedChannelAccount(authUser) {
    const tokenScopedChannelAccountId = isClientUserRole(authUser?.role)
        ? normalizeScopedId(authUser?.scopedChannelAccountId)
        : undefined;
    if (tokenScopedChannelAccountId && mongoose_1.default.isValidObjectId(tokenScopedChannelAccountId)) {
        return channel_account_model_1.ChannelAccountModel.findById(tokenScopedChannelAccountId)
            .select("_id code displayName phoneNumber")
            .lean()
            .exec();
    }
    if (env_1.env.dashboardUserChannelAccountId &&
        mongoose_1.default.isValidObjectId(env_1.env.dashboardUserChannelAccountId)) {
        return channel_account_model_1.ChannelAccountModel.findById(env_1.env.dashboardUserChannelAccountId)
            .select("_id code displayName phoneNumber")
            .lean()
            .exec();
    }
    const normalizedChannelAccountCode = normalizeCode(env_1.env.dashboardUserChannelAccountCode);
    if (normalizedChannelAccountCode) {
        return channel_account_model_1.ChannelAccountModel.findOne({ code: normalizedChannelAccountCode })
            .select("_id code displayName phoneNumber")
            .lean()
            .exec();
    }
    return null;
}
function idsMatch(left, right) {
    if (!left || !right) {
        return false;
    }
    return String(left) === String(right);
}
