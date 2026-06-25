"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRequestTypes = getRequestTypes;
exports.getRequestTypeById = getRequestTypeById;
exports.createRequestType = createRequestType;
exports.updateRequestType = updateRequestType;
const mongoose_1 = __importDefault(require("mongoose"));
const service_model_1 = require("../services/service.model");
const request_type_model_1 = require("./request-type.model");
const request_type_types_1 = require("./request-type.types");
function isPlainObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
}
function isBooleanOrUndefined(value) {
    return value === undefined || typeof value === "boolean";
}
function hasAtLeastOneLocalizedName(name) {
    return (isNonEmptyString(name.ar) ||
        isNonEmptyString(name.en) ||
        isNonEmptyString(name.de));
}
function parseCreateBody(body) {
    if (!isNonEmptyString(body.serviceId) || !mongoose_1.default.isValidObjectId(body.serviceId)) {
        return { isValid: false, message: "Field 'serviceId' must be a valid ObjectId." };
    }
    if (!isNonEmptyString(body.code)) {
        return { isValid: false, message: "Field 'code' is required." };
    }
    const status = body.status ?? "active";
    if (!isNonEmptyString(status) || !request_type_types_1.REQUEST_TYPE_STATUSES.includes(status)) {
        return {
            isValid: false,
            message: `Field 'status' must be one of: ${request_type_types_1.REQUEST_TYPE_STATUSES.join(", ")}.`,
        };
    }
    if (body.name !== undefined && !isPlainObject(body.name)) {
        return { isValid: false, message: "Field 'name' must be an object." };
    }
    if (body.name?.ar !== undefined && !isNonEmptyString(body.name.ar)) {
        return { isValid: false, message: "Field 'name.ar' must be a non-empty string." };
    }
    if (body.name?.en !== undefined && !isNonEmptyString(body.name.en)) {
        return { isValid: false, message: "Field 'name.en' must be a non-empty string." };
    }
    if (body.name?.de !== undefined && !isNonEmptyString(body.name.de)) {
        return { isValid: false, message: "Field 'name.de' must be a non-empty string." };
    }
    if (body.name && !hasAtLeastOneLocalizedName(body.name)) {
        return {
            isValid: false,
            message: "At least one localized name is required when 'name' is provided.",
        };
    }
    if (body.config !== undefined && !isPlainObject(body.config)) {
        return { isValid: false, message: "Field 'config' must be an object." };
    }
    if (!isBooleanOrUndefined(body.config?.requiresHumanReview)) {
        return {
            isValid: false,
            message: "Field 'config.requiresHumanReview' must be boolean.",
        };
    }
    if (body.config?.formDefinitionCode !== undefined &&
        !isNonEmptyString(body.config.formDefinitionCode)) {
        return {
            isValid: false,
            message: "Field 'config.formDefinitionCode' must be a non-empty string.",
        };
    }
    if (body.config?.aiTaskCodes !== undefined && !Array.isArray(body.config.aiTaskCodes)) {
        return {
            isValid: false,
            message: "Field 'config.aiTaskCodes' must be an array of non-empty strings.",
        };
    }
    if (Array.isArray(body.config?.aiTaskCodes)) {
        const invalidCode = body.config.aiTaskCodes.find((code) => !isNonEmptyString(code));
        if (invalidCode !== undefined) {
            return {
                isValid: false,
                message: "Field 'config.aiTaskCodes' must be an array of non-empty strings.",
            };
        }
    }
    const cleanedAiTaskCodes = Array.isArray(body.config?.aiTaskCodes)
        ? body.config.aiTaskCodes
            .map((code) => code.trim())
            .filter((code, index, arr) => arr.indexOf(code) === index)
        : undefined;
    return {
        isValid: true,
        data: {
            serviceId: new mongoose_1.default.Types.ObjectId(body.serviceId),
            code: body.code.trim().toUpperCase(),
            status: status,
            name: body.name
                ? {
                    ar: body.name.ar?.toString().trim(),
                    en: body.name.en?.toString().trim(),
                    de: body.name.de?.toString().trim(),
                }
                : undefined,
            config: body.config
                ? {
                    requiresHumanReview: body.config.requiresHumanReview,
                    aiTaskCodes: cleanedAiTaskCodes,
                    formDefinitionCode: body.config.formDefinitionCode?.trim(),
                }
                : undefined,
        },
    };
}
async function getRequestTypes(_req, res, next) {
    try {
        const requestTypes = await request_type_model_1.RequestTypeModel.find().sort({ createdAt: -1 }).lean();
        res.status(200).json({
            success: true,
            data: requestTypes,
        });
    }
    catch (error) {
        next(error);
    }
}
async function getRequestTypeById(req, res, next) {
    try {
        const { id } = req.params;
        if (!mongoose_1.default.isValidObjectId(id)) {
            res.status(400).json({
                success: false,
                message: "Invalid request type id.",
            });
            return;
        }
        const requestType = await request_type_model_1.RequestTypeModel.findById(id).lean();
        if (!requestType) {
            res.status(404).json({
                success: false,
                message: "Request type not found.",
            });
            return;
        }
        res.status(200).json({
            success: true,
            data: requestType,
        });
    }
    catch (error) {
        next(error);
    }
}
async function createRequestType(req, res, next) {
    try {
        const parsed = parseCreateBody(req.body);
        if (!parsed.isValid || !parsed.data) {
            res.status(400).json({
                success: false,
                message: parsed.message,
            });
            return;
        }
        const existingRequestType = await request_type_model_1.RequestTypeModel.findOne({ code: parsed.data.code })
            .select("_id")
            .lean();
        if (existingRequestType) {
            res.status(409).json({
                success: false,
                message: "Request type code already exists.",
            });
            return;
        }
        const serviceExists = await service_model_1.ServiceModel.exists({ _id: parsed.data.serviceId });
        if (!serviceExists) {
            res.status(400).json({
                success: false,
                message: "serviceId does not reference an existing service.",
            });
            return;
        }
        const requestType = await request_type_model_1.RequestTypeModel.create(parsed.data);
        res.status(201).json({
            success: true,
            data: requestType,
        });
    }
    catch (error) {
        const dbError = error;
        if (dbError.code === 11000) {
            res.status(409).json({
                success: false,
                message: "Request type code already exists.",
            });
            return;
        }
        next(error);
    }
}
async function updateRequestType(req, res, next) {
    try {
        const { id } = req.params;
        if (!mongoose_1.default.isValidObjectId(id)) {
            res.status(400).json({
                success: false,
                message: "Invalid request type id.",
            });
            return;
        }
        const parsed = parseCreateBody(req.body);
        if (!parsed.isValid || !parsed.data) {
            res.status(400).json({
                success: false,
                message: parsed.message,
            });
            return;
        }
        const existingRequestType = await request_type_model_1.RequestTypeModel.findById(id);
        if (!existingRequestType) {
            res.status(404).json({
                success: false,
                message: "Request type not found.",
            });
            return;
        }
        const duplicateByCode = await request_type_model_1.RequestTypeModel.findOne({
            code: parsed.data.code,
            _id: { $ne: existingRequestType._id },
        })
            .select("_id")
            .lean();
        if (duplicateByCode) {
            res.status(409).json({
                success: false,
                message: "Request type code already exists.",
            });
            return;
        }
        const serviceExists = await service_model_1.ServiceModel.exists({ _id: parsed.data.serviceId });
        if (!serviceExists) {
            res.status(400).json({
                success: false,
                message: "serviceId does not reference an existing service.",
            });
            return;
        }
        existingRequestType.serviceId = parsed.data.serviceId;
        existingRequestType.code = parsed.data.code;
        existingRequestType.status = parsed.data.status;
        existingRequestType.name = parsed.data.name;
        existingRequestType.config = parsed.data.config;
        const updatedRequestType = await existingRequestType.save();
        res.status(200).json({
            success: true,
            data: updatedRequestType,
        });
    }
    catch (error) {
        const dbError = error;
        if (dbError.code === 11000) {
            res.status(409).json({
                success: false,
                message: "Request type code already exists.",
            });
            return;
        }
        next(error);
    }
}
