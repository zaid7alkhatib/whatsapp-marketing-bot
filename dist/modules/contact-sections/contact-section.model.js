"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContactSectionModel = void 0;
const mongoose_1 = require("mongoose");
const contact_section_types_1 = require("./contact-section.types");
const contactSectionContactSchema = new mongoose_1.Schema({
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
    channelUserRef: {
        type: String,
        required: true,
        trim: true,
    },
    approved: {
        type: Boolean,
        required: true,
        default: true,
    },
    lastDeliveryStatus: {
        type: String,
        enum: contact_section_types_1.CONTACT_DELIVERY_STATUSES,
        required: true,
        default: "ready",
    },
    lastCampaignId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "OutreachCampaign",
        required: false,
    },
    lastAttemptAt: {
        type: Date,
        required: false,
    },
    lastSentAt: {
        type: Date,
        required: false,
    },
    lastErrorMessage: {
        type: String,
        trim: true,
        required: false,
        maxlength: 1000,
    },
    sendCount: {
        type: Number,
        required: true,
        default: 0,
        min: 0,
    },
}, {
    _id: true,
    versionKey: false,
});
const contactSectionSchema = new mongoose_1.Schema({
    channelAccountId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "ChannelAccount",
        required: true,
        index: true,
    },
    name: {
        type: String,
        required: true,
        trim: true,
        minlength: 2,
        maxlength: 120,
    },
    description: {
        type: String,
        trim: true,
        required: false,
        maxlength: 500,
    },
    contacts: {
        type: [contactSectionContactSchema],
        required: true,
        default: [],
    },
    totalContacts: {
        type: Number,
        required: true,
        default: 0,
        min: 0,
    },
    approvedContacts: {
        type: Number,
        required: true,
        default: 0,
        min: 0,
    },
    pendingContacts: {
        type: Number,
        required: true,
        default: 0,
        min: 0,
    },
    sentContacts: {
        type: Number,
        required: true,
        default: 0,
        min: 0,
    },
    failedContacts: {
        type: Number,
        required: true,
        default: 0,
        min: 0,
    },
    createdBy: {
        username: {
            type: String,
            trim: true,
            required: false,
        },
        role: {
            type: String,
            trim: true,
            required: false,
        },
    },
}, {
    timestamps: true,
    versionKey: false,
});
contactSectionSchema.index({ channelAccountId: 1, name: 1 }, { unique: true });
contactSectionSchema.index({ channelAccountId: 1, updatedAt: -1 });
exports.ContactSectionModel = (0, mongoose_1.model)("ContactSection", contactSectionSchema);
