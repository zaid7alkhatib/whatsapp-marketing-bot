"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContentTemplateModel = void 0;
const mongoose_1 = require("mongoose");
const content_template_types_1 = require("./content-template.types");
const translationsSchema = new mongoose_1.Schema({
    ar: { type: String, trim: true, required: false },
    en: { type: String, trim: true, required: false },
    de: { type: String, trim: true, required: false },
}, { _id: false });
const mediaSchema = new mongoose_1.Schema({
    provider: {
        type: String,
        enum: ["cloudflare"],
        required: true,
    },
    assetId: {
        type: String,
        required: true,
        trim: true,
    },
    url: {
        type: String,
        required: true,
        trim: true,
    },
    thumbnailUrl: {
        type: String,
        trim: true,
        required: false,
    },
    mimeType: {
        type: String,
        trim: true,
        required: false,
    },
    fileName: {
        type: String,
        trim: true,
        required: false,
    },
}, { _id: false });
const contentTemplateSchema = new mongoose_1.Schema({
    key: {
        type: String,
        required: true,
        trim: true,
        minlength: 1,
        maxlength: 200,
        unique: true,
    },
    contentType: {
        type: String,
        enum: content_template_types_1.CONTENT_TEMPLATE_TYPES,
        required: true,
    },
    scope: {
        type: String,
        enum: content_template_types_1.CONTENT_TEMPLATE_SCOPES,
        required: true,
    },
    translations: {
        type: translationsSchema,
        required: true,
    },
    media: {
        type: mediaSchema,
        required: false,
        default: undefined,
    },
    placeholders: {
        type: [String],
        default: undefined,
        required: false,
    },
    status: {
        type: String,
        enum: content_template_types_1.CONTENT_TEMPLATE_STATUSES,
        default: "active",
        required: true,
    },
}, {
    timestamps: true,
    versionKey: false,
});
contentTemplateSchema.index({ contentType: 1, scope: 1, status: 1 });
exports.ContentTemplateModel = (0, mongoose_1.model)("ContentTemplate", contentTemplateSchema);
