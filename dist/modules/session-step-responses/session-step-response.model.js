"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionStepResponseModel = void 0;
const mongoose_1 = require("mongoose");
const sessionStepResponseSchema = new mongoose_1.Schema({
    sessionId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "BotSession",
        required: true,
    },
    flowId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Flow",
        required: true,
    },
    flowVersion: {
        type: Number,
        required: true,
        min: 1,
    },
    stepCode: {
        type: String,
        required: true,
        trim: true,
        minlength: 1,
        maxlength: 100,
    },
    stepType: {
        type: String,
        required: true,
        trim: true,
        minlength: 1,
        maxlength: 100,
    },
    inputType: {
        type: String,
        required: false,
        trim: true,
    },
    rawInput: {
        type: mongoose_1.Schema.Types.Mixed,
        required: false,
    },
    normalizedValue: {
        type: mongoose_1.Schema.Types.Mixed,
        required: false,
    },
    structuredData: {
        type: mongoose_1.Schema.Types.Mixed,
        required: false,
    },
    validationResult: {
        type: mongoose_1.Schema.Types.Mixed,
        required: false,
    },
    aiExecutionId: {
        type: mongoose_1.Schema.Types.ObjectId,
        required: false,
    },
    createdAt: {
        type: Date,
        required: true,
        default: Date.now,
    },
}, {
    versionKey: false,
});
sessionStepResponseSchema.index({ sessionId: 1, createdAt: 1 });
sessionStepResponseSchema.index({ sessionId: 1, stepCode: 1 });
exports.SessionStepResponseModel = (0, mongoose_1.model)("SessionStepResponse", sessionStepResponseSchema);
