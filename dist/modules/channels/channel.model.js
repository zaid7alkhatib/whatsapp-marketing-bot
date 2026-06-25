"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChannelModel = void 0;
const mongoose_1 = require("mongoose");
const channel_types_1 = require("./channel.types");
const channelCapabilitiesSchema = new mongoose_1.Schema({
    text: { type: Boolean, default: false },
    image: { type: Boolean, default: false },
    document: { type: Boolean, default: false },
    audio: { type: Boolean, default: false },
    buttons: { type: Boolean, default: false },
    lists: { type: Boolean, default: false },
}, { _id: false });
const channelSchema = new mongoose_1.Schema({
    code: {
        type: String,
        enum: channel_types_1.CHANNEL_CODES,
        required: true,
        lowercase: true,
        trim: true,
        unique: true,
    },
    name: {
        type: String,
        required: true,
        trim: true,
        minlength: 2,
        maxlength: 100,
    },
    provider: {
        type: String,
        enum: channel_types_1.CHANNEL_PROVIDERS,
        required: true,
    },
    status: {
        type: String,
        enum: channel_types_1.CHANNEL_STATUSES,
        default: "active",
        required: true,
    },
    capabilities: {
        type: channelCapabilitiesSchema,
        default: () => ({
            text: false,
            image: false,
            document: false,
            audio: false,
            buttons: false,
            lists: false,
        }),
    },
}, {
    timestamps: true,
    versionKey: false,
});
channelSchema.index({ provider: 1, status: 1 });
exports.ChannelModel = (0, mongoose_1.model)("Channel", channelSchema);
