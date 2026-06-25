"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServiceRequestModel = void 0;
const mongoose_1 = require("mongoose");
const localizedNameSnapshotSchema = new mongoose_1.Schema({
    ar: { type: String, trim: true, required: false },
    en: { type: String, trim: true, required: false },
    de: { type: String, trim: true, required: false },
}, { _id: false });
const serviceRequestEntitySnapshotSchema = new mongoose_1.Schema({
    code: { type: String, trim: true, required: true },
    name: { type: localizedNameSnapshotSchema, required: false },
}, { _id: false });
const serviceRequestSnapshotsSchema = new mongoose_1.Schema({
    service: { type: serviceRequestEntitySnapshotSchema, required: false },
    requestType: { type: serviceRequestEntitySnapshotSchema, required: false },
    orgUnit: { type: serviceRequestEntitySnapshotSchema, required: false },
}, { _id: false });
const serviceRequestSchema = new mongoose_1.Schema({
    orgUnitId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "OrgUnit",
        default: null,
    },
    businessPartnerId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "BusinessPartner",
        default: null,
    },
    sessionId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "BotSession",
        default: null,
    },
    serviceId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Service",
        required: true,
    },
    requestTypeId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "RequestType",
        required: true,
    },
    statusCode: {
        type: String,
        required: true,
        trim: true,
        minlength: 1,
        maxlength: 100,
    },
    priorityCode: {
        type: String,
        trim: true,
        required: false,
    },
    sourceChannelCode: {
        type: String,
        trim: true,
        required: false,
    },
    language: {
        type: String,
        trim: true,
        required: false,
    },
    submittedAt: {
        type: Date,
        required: true,
    },
    assignedToUserId: {
        type: mongoose_1.Schema.Types.ObjectId,
        required: false,
        default: null,
    },
    requestData: {
        type: mongoose_1.Schema.Types.Mixed,
        required: true,
    },
    aiSummary: {
        type: mongoose_1.Schema.Types.Mixed,
        required: false,
    },
    resolutionData: {
        type: mongoose_1.Schema.Types.Mixed,
        required: false,
    },
    snapshots: {
        type: serviceRequestSnapshotsSchema,
        required: false,
    },
}, {
    timestamps: true,
    versionKey: false,
});
serviceRequestSchema.index({ statusCode: 1, createdAt: 1 });
serviceRequestSchema.index({ orgUnitId: 1, statusCode: 1 });
serviceRequestSchema.index({ requestTypeId: 1, createdAt: 1 });
serviceRequestSchema.index({ businessPartnerId: 1, createdAt: 1 });
exports.ServiceRequestModel = (0, mongoose_1.model)("ServiceRequest", serviceRequestSchema);
