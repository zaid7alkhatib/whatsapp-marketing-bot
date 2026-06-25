"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getServices = getServices;
exports.getServiceById = getServiceById;
exports.createService = createService;
exports.updateService = updateService;
const mongoose_1 = __importDefault(require("mongoose"));
const service_model_1 = require("./service.model");
const service_types_1 = require("./service.types");
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
    if (!isNonEmptyString(body.code)) {
        return { isValid: false, message: "Field 'code' is required." };
    }
    if (body.category !== undefined && !isNonEmptyString(body.category)) {
        return { isValid: false, message: "Field 'category' must be a non-empty string." };
    }
    const status = body.status ?? "active";
    if (!isNonEmptyString(status) || !service_types_1.SERVICE_STATUSES.includes(status)) {
        return {
            isValid: false,
            message: `Field 'status' must be one of: ${service_types_1.SERVICE_STATUSES.join(", ")}.`,
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
    if (!isBooleanOrUndefined(body.config?.aiEnabled)) {
        return {
            isValid: false,
            message: "Field 'config.aiEnabled' must be boolean.",
        };
    }
    return {
        isValid: true,
        data: {
            code: body.code.trim().toUpperCase(),
            category: body.category?.trim(),
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
                    aiEnabled: body.config.aiEnabled,
                }
                : undefined,
        },
    };
}
async function getServices(_req, res, next) {
    try {
        const services = await service_model_1.ServiceModel.find().sort({ createdAt: -1 }).lean();
        res.status(200).json({
            success: true,
            data: services,
        });
    }
    catch (error) {
        next(error);
    }
}
async function getServiceById(req, res, next) {
    try {
        const { id } = req.params;
        if (!mongoose_1.default.isValidObjectId(id)) {
            res.status(400).json({
                success: false,
                message: "Invalid service id.",
            });
            return;
        }
        const service = await service_model_1.ServiceModel.findById(id).lean();
        if (!service) {
            res.status(404).json({
                success: false,
                message: "Service not found.",
            });
            return;
        }
        res.status(200).json({
            success: true,
            data: service,
        });
    }
    catch (error) {
        next(error);
    }
}
async function createService(req, res, next) {
    try {
        const parsed = parseCreateBody(req.body);
        if (!parsed.isValid || !parsed.data) {
            res.status(400).json({
                success: false,
                message: parsed.message,
            });
            return;
        }
        const existingService = await service_model_1.ServiceModel.findOne({ code: parsed.data.code })
            .select("_id")
            .lean();
        if (existingService) {
            res.status(409).json({
                success: false,
                message: "Service code already exists.",
            });
            return;
        }
        const service = await service_model_1.ServiceModel.create(parsed.data);
        res.status(201).json({
            success: true,
            data: service,
        });
    }
    catch (error) {
        const dbError = error;
        if (dbError.code === 11000) {
            res.status(409).json({
                success: false,
                message: "Service code already exists.",
            });
            return;
        }
        next(error);
    }
}
async function updateService(req, res, next) {
    try {
        const { id } = req.params;
        if (!mongoose_1.default.isValidObjectId(id)) {
            res.status(400).json({
                success: false,
                message: "Invalid service id.",
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
        const existingService = await service_model_1.ServiceModel.findById(id);
        if (!existingService) {
            res.status(404).json({
                success: false,
                message: "Service not found.",
            });
            return;
        }
        const duplicateByCode = await service_model_1.ServiceModel.findOne({
            code: parsed.data.code,
            _id: { $ne: existingService._id },
        })
            .select("_id")
            .lean();
        if (duplicateByCode) {
            res.status(409).json({
                success: false,
                message: "Service code already exists.",
            });
            return;
        }
        existingService.code = parsed.data.code;
        existingService.category = parsed.data.category;
        existingService.status = parsed.data.status;
        existingService.name = parsed.data.name;
        existingService.config = parsed.data.config;
        const updatedService = await existingService.save();
        res.status(200).json({
            success: true,
            data: updatedService,
        });
    }
    catch (error) {
        const dbError = error;
        if (dbError.code === 11000) {
            res.status(409).json({
                success: false,
                message: "Service code already exists.",
            });
            return;
        }
        next(error);
    }
}
