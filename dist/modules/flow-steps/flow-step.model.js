"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FlowStepModel = void 0;
const mongoose_1 = require("mongoose");
const flow_step_types_1 = require("./flow-step.types");
const flowStepSchema = new mongoose_1.Schema({
    flowId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Flow",
        required: true,
    },
    code: {
        type: String,
        required: true,
        trim: true,
        uppercase: true,
        minlength: 1,
        maxlength: 100,
    },
    type: {
        type: String,
        enum: flow_step_types_1.FLOW_STEP_TYPES,
        required: true,
    },
    sequence: {
        type: Number,
        required: true,
        min: 1,
    },
    status: {
        type: String,
        enum: flow_step_types_1.FLOW_STEP_STATUSES,
        required: true,
    },
    contentKey: {
        type: String,
        trim: true,
        required: false,
    },
    stepConfig: {
        type: mongoose_1.Schema.Types.Mixed,
        required: false,
    },
    validationConfig: {
        type: mongoose_1.Schema.Types.Mixed,
        required: false,
    },
    transitionConfig: {
        type: [mongoose_1.Schema.Types.Mixed],
        required: false,
    },
    aiConfig: {
        type: mongoose_1.Schema.Types.Mixed,
        required: false,
    },
    actionConfig: {
        type: mongoose_1.Schema.Types.Mixed,
        required: false,
    },
    metadata: {
        type: mongoose_1.Schema.Types.Mixed,
        required: false,
    },
}, {
    timestamps: true,
    versionKey: false,
});
flowStepSchema.index({ flowId: 1, code: 1 }, { unique: true });
flowStepSchema.index({ flowId: 1, sequence: 1 });
exports.FlowStepModel = (0, mongoose_1.model)("FlowStep", flowStepSchema);
