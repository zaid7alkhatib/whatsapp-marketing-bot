"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServiceModel = void 0;
const mongoose_1 = require("mongoose");
const service_types_1 = require("./service.types");
const serviceNameSchema = new mongoose_1.Schema({
    ar: { type: String, trim: true, required: false },
    en: { type: String, trim: true, required: false },
    de: { type: String, trim: true, required: false },
}, { _id: false });
const serviceConfigSchema = new mongoose_1.Schema({
    requiresHumanReview: { type: Boolean, required: false },
    aiEnabled: { type: Boolean, required: false },
}, { _id: false });
const serviceSchema = new mongoose_1.Schema({
    code: {
        type: String,
        required: true,
        trim: true,
        uppercase: true,
        minlength: 1,
        maxlength: 100,
        unique: true,
    },
    category: {
        type: String,
        trim: true,
        required: false,
    },
    status: {
        type: String,
        enum: service_types_1.SERVICE_STATUSES,
        default: "active",
        required: true,
    },
    name: {
        type: serviceNameSchema,
        required: false,
    },
    config: {
        type: serviceConfigSchema,
        required: false,
    },
}, {
    timestamps: true,
    versionKey: false,
});
serviceSchema.index({ status: 1 });
exports.ServiceModel = (0, mongoose_1.model)("Service", serviceSchema);
