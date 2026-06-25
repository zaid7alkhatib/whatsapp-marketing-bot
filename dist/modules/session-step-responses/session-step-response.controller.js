"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSessionStepResponses = getSessionStepResponses;
exports.getSessionStepResponseById = getSessionStepResponseById;
exports.createSessionStepResponse = createSessionStepResponse;
const mongoose_1 = __importDefault(require("mongoose"));
const bot_session_model_1 = require("../bot-sessions/bot-session.model");
const flow_model_1 = require("../flows/flow.model");
const session_step_response_model_1 = require("./session-step-response.model");
function isPlainObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
}
function isPositiveNumber(value) {
    return typeof value === "number" && Number.isFinite(value) && value > 0;
}
function parseDateField(value, fieldName, required) {
    if (value === undefined || value === null) {
        if (required) {
            return { isValid: false, message: `Field '${fieldName}' is required and must be a valid date.` };
        }
        return { isValid: true };
    }
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return { isValid: true, date: value };
    }
    if (typeof value === "string" && value.trim().length > 0) {
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.getTime())) {
            return { isValid: true, date: parsed };
        }
    }
    return { isValid: false, message: `Field '${fieldName}' must be a valid date.` };
}
function parseCreateBody(body) {
    if (!isNonEmptyString(body.sessionId) || !mongoose_1.default.isValidObjectId(body.sessionId)) {
        return { isValid: false, message: "Field 'sessionId' must be a valid ObjectId." };
    }
    if (!isNonEmptyString(body.flowId) || !mongoose_1.default.isValidObjectId(body.flowId)) {
        return { isValid: false, message: "Field 'flowId' must be a valid ObjectId." };
    }
    if (!isPositiveNumber(body.flowVersion)) {
        return { isValid: false, message: "Field 'flowVersion' must be a positive number." };
    }
    if (!isNonEmptyString(body.stepCode)) {
        return { isValid: false, message: "Field 'stepCode' is required." };
    }
    if (!isNonEmptyString(body.stepType)) {
        return { isValid: false, message: "Field 'stepType' is required." };
    }
    if (body.inputType !== undefined && !isNonEmptyString(body.inputType)) {
        return { isValid: false, message: "Field 'inputType' must be a non-empty string." };
    }
    if (body.structuredData !== undefined && !isPlainObject(body.structuredData)) {
        return { isValid: false, message: "Field 'structuredData' must be an object." };
    }
    if (body.validationResult !== undefined && !isPlainObject(body.validationResult)) {
        return { isValid: false, message: "Field 'validationResult' must be an object." };
    }
    if (body.aiExecutionId !== undefined) {
        if (!isNonEmptyString(body.aiExecutionId) || !mongoose_1.default.isValidObjectId(body.aiExecutionId)) {
            return { isValid: false, message: "Field 'aiExecutionId' must be a valid ObjectId." };
        }
    }
    const createdAtResult = parseDateField(body.createdAt, "createdAt", true);
    if (!createdAtResult.isValid || !createdAtResult.date) {
        return { isValid: false, message: createdAtResult.message };
    }
    return {
        isValid: true,
        data: {
            sessionId: new mongoose_1.default.Types.ObjectId(body.sessionId),
            flowId: new mongoose_1.default.Types.ObjectId(body.flowId),
            flowVersion: body.flowVersion,
            stepCode: body.stepCode.trim(),
            stepType: body.stepType.trim(),
            inputType: body.inputType?.trim(),
            rawInput: body.rawInput,
            normalizedValue: body.normalizedValue,
            structuredData: body.structuredData,
            validationResult: body.validationResult,
            aiExecutionId: body.aiExecutionId ? new mongoose_1.default.Types.ObjectId(body.aiExecutionId) : undefined,
            createdAt: createdAtResult.date,
        },
    };
}
async function getSessionStepResponses(_req, res, next) {
    try {
        const responses = await session_step_response_model_1.SessionStepResponseModel.find().sort({ createdAt: -1 }).lean();
        res.status(200).json({
            success: true,
            data: responses,
        });
    }
    catch (error) {
        next(error);
    }
}
async function getSessionStepResponseById(req, res, next) {
    try {
        const { id } = req.params;
        if (!mongoose_1.default.isValidObjectId(id)) {
            res.status(400).json({
                success: false,
                message: "Invalid session step response id.",
            });
            return;
        }
        const response = await session_step_response_model_1.SessionStepResponseModel.findById(id).lean();
        if (!response) {
            res.status(404).json({
                success: false,
                message: "Session step response not found.",
            });
            return;
        }
        res.status(200).json({
            success: true,
            data: response,
        });
    }
    catch (error) {
        next(error);
    }
}
async function createSessionStepResponse(req, res, next) {
    try {
        const parsed = parseCreateBody(req.body);
        if (!parsed.isValid || !parsed.data) {
            res.status(400).json({
                success: false,
                message: parsed.message,
            });
            return;
        }
        const sessionExists = await bot_session_model_1.BotSessionModel.exists({ _id: parsed.data.sessionId });
        if (!sessionExists) {
            res.status(400).json({
                success: false,
                message: "sessionId does not reference an existing bot session.",
            });
            return;
        }
        const flowExists = await flow_model_1.FlowModel.exists({ _id: parsed.data.flowId });
        if (!flowExists) {
            res.status(400).json({
                success: false,
                message: "flowId does not reference an existing flow.",
            });
            return;
        }
        const responseDoc = await session_step_response_model_1.SessionStepResponseModel.create(parsed.data);
        res.status(201).json({
            success: true,
            data: responseDoc,
        });
    }
    catch (error) {
        next(error);
    }
}
