"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getContentTemplates = getContentTemplates;
exports.getContentTemplateById = getContentTemplateById;
exports.createContentTemplate = createContentTemplate;
exports.updateContentTemplate = updateContentTemplate;
const mongoose_1 = __importDefault(require("mongoose"));
const content_template_model_1 = require("./content-template.model");
const content_template_types_1 = require("./content-template.types");
function isPlainObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
}
function hasAtLeastOneTranslation(translations) {
    return (isNonEmptyString(translations.ar) ||
        isNonEmptyString(translations.en) ||
        isNonEmptyString(translations.de));
}
function isValidUrl(value) {
    try {
        const parsed = new URL(value);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
    }
    catch {
        return false;
    }
}
function parseCreateBody(body) {
    if (!isNonEmptyString(body.key)) {
        return { isValid: false, message: "Field 'key' is required." };
    }
    if (!isNonEmptyString(body.contentType) ||
        !content_template_types_1.CONTENT_TEMPLATE_TYPES.includes(body.contentType)) {
        return {
            isValid: false,
            message: `Field 'contentType' must be one of: ${content_template_types_1.CONTENT_TEMPLATE_TYPES.join(", ")}.`,
        };
    }
    if (!isNonEmptyString(body.scope) ||
        !content_template_types_1.CONTENT_TEMPLATE_SCOPES.includes(body.scope)) {
        return {
            isValid: false,
            message: `Field 'scope' must be one of: ${content_template_types_1.CONTENT_TEMPLATE_SCOPES.join(", ")}.`,
        };
    }
    const status = body.status ?? "active";
    if (!isNonEmptyString(status) ||
        !content_template_types_1.CONTENT_TEMPLATE_STATUSES.includes(status)) {
        return {
            isValid: false,
            message: `Field 'status' must be one of: ${content_template_types_1.CONTENT_TEMPLATE_STATUSES.join(", ")}.`,
        };
    }
    if (!isPlainObject(body.translations)) {
        return { isValid: false, message: "Field 'translations' is required." };
    }
    if (body.translations.ar !== undefined && !isNonEmptyString(body.translations.ar)) {
        return { isValid: false, message: "Field 'translations.ar' must be a non-empty string." };
    }
    if (body.translations.en !== undefined && !isNonEmptyString(body.translations.en)) {
        return { isValid: false, message: "Field 'translations.en' must be a non-empty string." };
    }
    if (body.translations.de !== undefined && !isNonEmptyString(body.translations.de)) {
        return { isValid: false, message: "Field 'translations.de' must be a non-empty string." };
    }
    if (!hasAtLeastOneTranslation(body.translations)) {
        return {
            isValid: false,
            message: "At least one translation is required and must be non-empty.",
        };
    }
    if (body.media !== undefined) {
        if (!isPlainObject(body.media)) {
            return {
                isValid: false,
                message: "Field 'media' must be an object.",
            };
        }
        if (!isNonEmptyString(body.media.provider) || body.media.provider.trim() !== "cloudflare") {
            return {
                isValid: false,
                message: "Field 'media.provider' must be 'cloudflare'.",
            };
        }
        if (!isNonEmptyString(body.media.assetId)) {
            return {
                isValid: false,
                message: "Field 'media.assetId' must be a non-empty string.",
            };
        }
        if (!isNonEmptyString(body.media.url) || !isValidUrl(body.media.url)) {
            return {
                isValid: false,
                message: "Field 'media.url' must be a valid http/https URL.",
            };
        }
        if (body.media.thumbnailUrl !== undefined) {
            if (!isNonEmptyString(body.media.thumbnailUrl) || !isValidUrl(body.media.thumbnailUrl)) {
                return {
                    isValid: false,
                    message: "Field 'media.thumbnailUrl' must be a valid http/https URL when provided.",
                };
            }
        }
        if (body.media.mimeType !== undefined && !isNonEmptyString(body.media.mimeType)) {
            return {
                isValid: false,
                message: "Field 'media.mimeType' must be a non-empty string when provided.",
            };
        }
        if (body.media.fileName !== undefined && !isNonEmptyString(body.media.fileName)) {
            return {
                isValid: false,
                message: "Field 'media.fileName' must be a non-empty string when provided.",
            };
        }
    }
    if (body.contentType === "media_caption" &&
        (!isPlainObject(body.media) || !isNonEmptyString(body.media.url) || !isNonEmptyString(body.media.assetId))) {
        return {
            isValid: false,
            message: "Fields 'media.assetId' and 'media.url' are required when contentType is 'media_caption'.",
        };
    }
    if (body.placeholders !== undefined && !Array.isArray(body.placeholders)) {
        return {
            isValid: false,
            message: "Field 'placeholders' must be an array of non-empty strings.",
        };
    }
    if (Array.isArray(body.placeholders)) {
        const invalidPlaceholder = body.placeholders.find((placeholder) => !isNonEmptyString(placeholder));
        if (invalidPlaceholder !== undefined) {
            return {
                isValid: false,
                message: "Field 'placeholders' must be an array of non-empty strings.",
            };
        }
    }
    const cleanedPlaceholders = Array.isArray(body.placeholders)
        ? body.placeholders
            .map((placeholder) => placeholder.trim())
            .filter((placeholder, index, arr) => arr.indexOf(placeholder) === index)
        : undefined;
    return {
        isValid: true,
        data: {
            key: body.key.trim(),
            contentType: body.contentType,
            scope: body.scope,
            translations: {
                ar: body.translations.ar?.toString().trim(),
                en: body.translations.en?.toString().trim(),
                de: body.translations.de?.toString().trim(),
            },
            media: isPlainObject(body.media)
                ? {
                    provider: "cloudflare",
                    assetId: String(body.media.assetId).trim(),
                    url: String(body.media.url).trim(),
                    thumbnailUrl: isNonEmptyString(body.media.thumbnailUrl)
                        ? body.media.thumbnailUrl.trim()
                        : undefined,
                    mimeType: isNonEmptyString(body.media.mimeType)
                        ? body.media.mimeType.trim()
                        : undefined,
                    fileName: isNonEmptyString(body.media.fileName)
                        ? body.media.fileName.trim()
                        : undefined,
                }
                : undefined,
            placeholders: cleanedPlaceholders,
            status: status,
        },
    };
}
async function getContentTemplates(_req, res, next) {
    try {
        const contentTemplates = await content_template_model_1.ContentTemplateModel.find()
            .sort({ createdAt: -1 })
            .lean();
        res.status(200).json({
            success: true,
            data: contentTemplates,
        });
    }
    catch (error) {
        next(error);
    }
}
async function getContentTemplateById(req, res, next) {
    try {
        const { id } = req.params;
        if (!mongoose_1.default.isValidObjectId(id)) {
            res.status(400).json({
                success: false,
                message: "Invalid content template id.",
            });
            return;
        }
        const contentTemplate = await content_template_model_1.ContentTemplateModel.findById(id).lean();
        if (!contentTemplate) {
            res.status(404).json({
                success: false,
                message: "Content template not found.",
            });
            return;
        }
        res.status(200).json({
            success: true,
            data: contentTemplate,
        });
    }
    catch (error) {
        next(error);
    }
}
async function createContentTemplate(req, res, next) {
    try {
        const parsed = parseCreateBody(req.body);
        if (!parsed.isValid || !parsed.data) {
            res.status(400).json({
                success: false,
                message: parsed.message,
            });
            return;
        }
        const existingTemplate = await content_template_model_1.ContentTemplateModel.findOne({ key: parsed.data.key })
            .select("_id")
            .lean();
        if (existingTemplate) {
            res.status(409).json({
                success: false,
                message: "Content template key already exists.",
            });
            return;
        }
        const contentTemplate = await content_template_model_1.ContentTemplateModel.create(parsed.data);
        res.status(201).json({
            success: true,
            data: contentTemplate,
        });
    }
    catch (error) {
        const dbError = error;
        if (dbError.code === 11000) {
            res.status(409).json({
                success: false,
                message: "Content template key already exists.",
            });
            return;
        }
        next(error);
    }
}
async function updateContentTemplate(req, res, next) {
    try {
        const { id } = req.params;
        if (!mongoose_1.default.isValidObjectId(id)) {
            res.status(400).json({
                success: false,
                message: "Invalid content template id.",
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
        const existingTemplate = await content_template_model_1.ContentTemplateModel.findById(id);
        if (!existingTemplate) {
            res.status(404).json({
                success: false,
                message: "Content template not found.",
            });
            return;
        }
        const duplicateByKey = await content_template_model_1.ContentTemplateModel.findOne({
            key: parsed.data.key,
            _id: { $ne: existingTemplate._id },
        })
            .select("_id")
            .lean();
        if (duplicateByKey) {
            res.status(409).json({
                success: false,
                message: "Content template key already exists.",
            });
            return;
        }
        existingTemplate.key = parsed.data.key;
        existingTemplate.contentType = parsed.data.contentType;
        existingTemplate.scope = parsed.data.scope;
        existingTemplate.translations = parsed.data.translations;
        existingTemplate.media = parsed.data.media;
        existingTemplate.placeholders = parsed.data.placeholders;
        existingTemplate.status = parsed.data.status;
        const updatedTemplate = await existingTemplate.save();
        res.status(200).json({
            success: true,
            data: updatedTemplate,
        });
    }
    catch (error) {
        const dbError = error;
        if (dbError.code === 11000) {
            res.status(409).json({
                success: false,
                message: "Content template key already exists.",
            });
            return;
        }
        next(error);
    }
}
