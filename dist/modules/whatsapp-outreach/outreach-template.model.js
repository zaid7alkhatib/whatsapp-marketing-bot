"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OutreachTemplateModel = void 0;
const mongoose_1 = require("mongoose");
const personalizationTemplateSchema = new mongoose_1.Schema({
    englishGreeting: {
        type: String,
        trim: true,
        required: false,
        maxlength: 300,
    },
    arabicGreeting: {
        type: String,
        trim: true,
        required: false,
        maxlength: 300,
    },
    englishResponseInstruction: {
        type: String,
        trim: true,
        required: false,
        maxlength: 500,
    },
    arabicResponseInstruction: {
        type: String,
        trim: true,
        required: false,
        maxlength: 500,
    },
}, {
    _id: false,
    versionKey: false,
});
const outreachTemplateSchema = new mongoose_1.Schema({
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
    personalizationTemplate: {
        type: personalizationTemplateSchema,
        required: true,
    },
    interestTriggers: {
        type: [String],
        required: true,
        default: [],
        validate: {
            validator(value) {
                return Array.isArray(value) && value.length <= 30;
            },
            message: "A template can include up to 30 interested reply triggers.",
        },
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
outreachTemplateSchema.index({ channelAccountId: 1, name: 1 }, { unique: true });
outreachTemplateSchema.index({ channelAccountId: 1, updatedAt: -1 });
exports.OutreachTemplateModel = (0, mongoose_1.model)("OutreachTemplate", outreachTemplateSchema);
