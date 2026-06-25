"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequestTypeModel = void 0;
const mongoose_1 = require("mongoose");
const request_type_types_1 = require("./request-type.types");
const requestTypeNameSchema = new mongoose_1.Schema({
    ar: { type: String, trim: true, required: false },
    en: { type: String, trim: true, required: false },
    de: { type: String, trim: true, required: false },
}, { _id: false });
const requestTypeConfigSchema = new mongoose_1.Schema({
    requiresHumanReview: { type: Boolean, required: false },
    aiTaskCodes: { type: [String], required: false },
    formDefinitionCode: { type: String, trim: true, required: false },
}, { _id: false });
const requestTypeSchema = new mongoose_1.Schema({
    serviceId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Service",
        required: true,
    },
    code: {
        type: String,
        required: true,
        trim: true,
        uppercase: true,
        minlength: 1,
        maxlength: 100,
        unique: true,
    },
    status: {
        type: String,
        enum: request_type_types_1.REQUEST_TYPE_STATUSES,
        default: "active",
        required: true,
    },
    name: {
        type: requestTypeNameSchema,
        required: false,
    },
    config: {
        type: requestTypeConfigSchema,
        required: false,
    },
}, {
    timestamps: true,
    versionKey: false,
});
requestTypeSchema.index({ serviceId: 1 });
exports.RequestTypeModel = (0, mongoose_1.model)("RequestType", requestTypeSchema);
