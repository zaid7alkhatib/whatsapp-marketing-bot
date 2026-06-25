"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FlowModel = void 0;
const mongoose_1 = require("mongoose");
const flow_types_1 = require("./flow.types");
const flowAppliesToSchema = new mongoose_1.Schema({
    channelCodes: { type: [String], required: false },
    orgUnitTypes: { type: [String], required: false },
}, { _id: false });
const flowSettingsSchema = new mongoose_1.Schema({
    allowResume: { type: Boolean, required: false },
    sessionTimeoutMinutes: { type: Number, required: false },
    createServiceRequestOnCompletion: { type: Boolean, required: false },
    serviceId: { type: mongoose_1.Schema.Types.ObjectId, ref: "Service", required: false },
    requestTypeId: { type: mongoose_1.Schema.Types.ObjectId, ref: "RequestType", required: false },
    serviceRequestRouting: {
        type: [
            new mongoose_1.Schema({
                whenDataKey: { type: String, required: false, trim: true },
                equals: { type: String, required: false, trim: true },
                serviceId: { type: mongoose_1.Schema.Types.ObjectId, ref: "Service", required: false },
                requestTypeId: { type: mongoose_1.Schema.Types.ObjectId, ref: "RequestType", required: false },
            }, { _id: false }),
        ],
        required: false,
    },
}, { _id: false });
const flowSchema = new mongoose_1.Schema({
    code: {
        type: String,
        required: true,
        trim: true,
        uppercase: true,
        minlength: 1,
        maxlength: 100,
    },
    name: {
        type: String,
        required: true,
        trim: true,
        minlength: 1,
        maxlength: 200,
    },
    version: {
        type: Number,
        required: true,
        min: 1,
    },
    status: {
        type: String,
        enum: flow_types_1.FLOW_STATUSES,
        required: true,
    },
    startStepCode: {
        type: String,
        required: true,
        trim: true,
        minlength: 1,
        maxlength: 100,
    },
    appliesTo: {
        type: flowAppliesToSchema,
        required: false,
    },
    settings: {
        type: flowSettingsSchema,
        required: false,
    },
}, {
    timestamps: true,
    versionKey: false,
});
flowSchema.index({ code: 1, version: 1 }, { unique: true });
flowSchema.index({ status: 1 });
exports.FlowModel = (0, mongoose_1.model)("Flow", flowSchema);
