"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChannelAccountModel = void 0;
const mongoose_1 = require("mongoose");
const channel_account_types_1 = require("./channel-account.types");
const channelAccountSchema = new mongoose_1.Schema({
    channelId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Channel",
        required: true,
    },
    orgUnitId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "OrgUnit",
        default: null,
    },
    code: {
        type: String,
        required: true,
        trim: true,
        uppercase: true,
        minlength: 2,
        maxlength: 100,
        unique: true,
    },
    displayName: {
        type: String,
        required: true,
        trim: true,
        minlength: 2,
        maxlength: 150,
    },
    phoneNumber: {
        type: String,
        trim: true,
        required: false,
    },
    status: {
        type: String,
        enum: channel_account_types_1.CHANNEL_ACCOUNT_STATUSES,
        default: "pending",
        required: true,
    },
    providerConfig: {
        type: mongoose_1.Schema.Types.Mixed,
        default: {},
        required: true,
    },
    lastConnectedAt: {
        type: Date,
        default: null,
    },
    lastDisconnectedAt: {
        type: Date,
        default: null,
    },
}, {
    timestamps: true,
    versionKey: false,
});
channelAccountSchema.index({ channelId: 1, status: 1 });
exports.ChannelAccountModel = (0, mongoose_1.model)("ChannelAccount", channelAccountSchema);
