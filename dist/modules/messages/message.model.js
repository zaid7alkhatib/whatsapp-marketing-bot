"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageModel = void 0;
const mongoose_1 = require("mongoose");
const message_types_1 = require("./message.types");
const messageSchema = new mongoose_1.Schema({
    sessionId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "BotSession",
        required: true,
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
    direction: {
        type: String,
        enum: message_types_1.MESSAGE_DIRECTIONS,
        required: true,
    },
    actorType: {
        type: String,
        enum: message_types_1.MESSAGE_ACTOR_TYPES,
        required: true,
    },
    actorId: {
        type: String,
        trim: true,
        required: false,
    },
    messageType: {
        type: String,
        enum: message_types_1.MESSAGE_TYPES,
        required: true,
    },
    externalMessageId: {
        type: String,
        trim: true,
        required: false,
    },
    content: {
        type: mongoose_1.Schema.Types.Mixed,
        required: true,
    },
    normalizedContent: {
        type: mongoose_1.Schema.Types.Mixed,
        required: false,
    },
    deliveryStatus: {
        type: String,
        trim: true,
        required: false,
    },
    providerPayload: {
        type: mongoose_1.Schema.Types.Mixed,
        required: false,
    },
    sentAt: {
        type: Date,
        required: false,
    },
    receivedAt: {
        type: Date,
        required: false,
    },
    createdAt: {
        type: Date,
        required: true,
        default: Date.now,
    },
}, {
    versionKey: false,
});
messageSchema.index({ sessionId: 1, createdAt: 1 });
messageSchema.index({ externalMessageId: 1 });
exports.MessageModel = (0, mongoose_1.model)("Message", messageSchema);
