"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BotSessionModel = void 0;
const mongoose_1 = require("mongoose");
const bot_session_types_1 = require("./bot-session.types");
const botSessionSchema = new mongoose_1.Schema({
    orgUnitId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "OrgUnit",
        default: null,
    },
    channelId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Channel",
        required: true,
    },
    channelAccountId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "ChannelAccount",
        required: true,
    },
    businessPartnerId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "BusinessPartner",
        default: null,
    },
    flowId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Flow",
        required: true,
    },
    flowVersion: {
        type: Number,
        required: true,
        min: 1,
    },
    statusCode: {
        type: String,
        enum: bot_session_types_1.BOT_SESSION_STATUSES,
        required: true,
    },
    language: {
        type: String,
        required: true,
        trim: true,
    },
    channelUserRef: {
        type: String,
        required: true,
        trim: true,
    },
    currentStepCode: {
        type: String,
        trim: true,
        required: false,
    },
    startedAt: {
        type: Date,
        required: true,
    },
    endedAt: {
        type: Date,
        required: false,
        default: null,
    },
    lastActivityAt: {
        type: Date,
        required: true,
    },
    collectedData: {
        type: mongoose_1.Schema.Types.Mixed,
        required: false,
    },
    contextSnapshot: {
        type: mongoose_1.Schema.Types.Mixed,
        required: false,
    },
    metadata: {
        type: mongoose_1.Schema.Types.Mixed,
        required: false,
    },
}, {
    timestamps: true,
    versionKey: false,
});
botSessionSchema.index({ channelAccountId: 1, channelUserRef: 1, statusCode: 1 });
botSessionSchema.index({ businessPartnerId: 1, startedAt: 1 });
botSessionSchema.index({ lastActivityAt: 1 });
exports.BotSessionModel = (0, mongoose_1.model)("BotSession", botSessionSchema);
