"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getInterestedLeads = getInterestedLeads;
const mongoose_1 = __importDefault(require("mongoose"));
const auth_scope_1 = require("../auth/auth.scope");
const channel_account_model_1 = require("../channel-accounts/channel-account.model");
const apiResponse_1 = require("../../shared/utils/apiResponse");
const interested_lead_model_1 = require("./interested-lead.model");
function getQueryString(value) {
    if (typeof value !== "string") {
        return undefined;
    }
    const normalizedValue = value.trim();
    return normalizedValue || undefined;
}
function serializeDate(value) {
    return value ? value.toISOString() : undefined;
}
async function getInterestedLeads(req, res, next) {
    try {
        const filter = {};
        if ((0, auth_scope_1.isClientUserRole)(req.authUser?.role)) {
            const scopedChannelAccount = await (0, auth_scope_1.resolveScopedChannelAccount)(req.authUser);
            if (!scopedChannelAccount) {
                (0, apiResponse_1.sendError)(res, "Client channel account scope is not configured.", 403);
                return;
            }
            filter.channelAccountId = scopedChannelAccount._id;
        }
        else {
            const queryChannelAccountId = getQueryString(req.query.channelAccountId);
            if (queryChannelAccountId) {
                if (!mongoose_1.default.isValidObjectId(queryChannelAccountId)) {
                    (0, apiResponse_1.sendError)(res, "Field 'channelAccountId' must be a valid ObjectId.", 400);
                    return;
                }
                filter.channelAccountId = new mongoose_1.default.Types.ObjectId(queryChannelAccountId);
            }
        }
        const leads = await interested_lead_model_1.InterestedLeadModel.find(filter)
            .sort({ lastInterestedAt: -1 })
            .limit(200)
            .lean()
            .exec();
        const accountIds = Array.from(new Set(leads.map((lead) => String(lead.channelAccountId)))).filter((id) => mongoose_1.default.isValidObjectId(id));
        const channelAccounts = await channel_account_model_1.ChannelAccountModel.find({ _id: { $in: accountIds } })
            .select("_id code displayName phoneNumber")
            .lean()
            .exec();
        const channelAccountMap = new Map(channelAccounts.map((account) => [String(account._id), account]));
        (0, apiResponse_1.sendSuccess)(res, {
            data: leads.map((lead) => {
                const channelAccount = channelAccountMap.get(String(lead.channelAccountId));
                const channelAccountName = channelAccount?.displayName || channelAccount?.code || String(lead.channelAccountId);
                return {
                    _id: String(lead._id),
                    channelAccountId: String(lead.channelAccountId),
                    channelAccountName,
                    channelAccountPhoneNumber: channelAccount?.phoneNumber ?? null,
                    channelUserRef: lead.channelUserRef,
                    phoneNumber: lead.phoneNumber,
                    displayName: lead.displayName ?? null,
                    lastMessage: lead.lastMessage,
                    trigger: lead.trigger,
                    status: lead.status,
                    acknowledgementMessage: lead.acknowledgementMessage,
                    acknowledgementSentAt: serializeDate(lead.acknowledgementSentAt),
                    acknowledgementError: lead.acknowledgementError ?? null,
                    firstInterestedAt: lead.firstInterestedAt.toISOString(),
                    lastInterestedAt: lead.lastInterestedAt.toISOString(),
                    messageCount: lead.messageCount,
                    createdAt: serializeDate(lead.createdAt),
                    updatedAt: serializeDate(lead.updatedAt),
                };
            }),
        });
    }
    catch (error) {
        next(error);
    }
}
