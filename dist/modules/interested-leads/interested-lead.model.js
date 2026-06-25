"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InterestedLeadModel = void 0;
const mongoose_1 = require("mongoose");
const interested_lead_types_1 = require("./interested-lead.types");
const interestedLeadSchema = new mongoose_1.Schema({
    channelAccountId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "ChannelAccount",
        required: true,
        index: true,
    },
    channelUserRef: {
        type: String,
        required: true,
        trim: true,
    },
    phoneNumber: {
        type: String,
        required: true,
        trim: true,
    },
    displayName: {
        type: String,
        trim: true,
        required: false,
    },
    lastMessage: {
        type: String,
        required: true,
        trim: true,
        maxlength: 4000,
    },
    trigger: {
        type: String,
        required: true,
        trim: true,
        maxlength: 120,
    },
    status: {
        type: String,
        enum: interested_lead_types_1.INTERESTED_LEAD_STATUSES,
        required: true,
        default: "new",
        index: true,
    },
    acknowledgementMessage: {
        type: String,
        required: true,
        trim: true,
        maxlength: 1000,
    },
    acknowledgementSentAt: {
        type: Date,
        required: false,
    },
    acknowledgementError: {
        type: String,
        trim: true,
        required: false,
        maxlength: 1000,
    },
    firstInterestedAt: {
        type: Date,
        required: true,
    },
    lastInterestedAt: {
        type: Date,
        required: true,
        index: true,
    },
    messageCount: {
        type: Number,
        required: true,
        default: 1,
        min: 1,
    },
}, {
    timestamps: true,
    versionKey: false,
});
interestedLeadSchema.index({ channelAccountId: 1, channelUserRef: 1 }, { unique: true });
interestedLeadSchema.index({ channelAccountId: 1, lastInterestedAt: -1 });
exports.InterestedLeadModel = (0, mongoose_1.model)("InterestedLead", interestedLeadSchema);
