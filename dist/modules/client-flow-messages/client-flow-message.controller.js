"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getClientFlowMessages = getClientFlowMessages;
exports.updateClientFlowMessage = updateClientFlowMessage;
exports.deleteClientFlowMessage = deleteClientFlowMessage;
const messageFormatting_1 = require("../../shared/utils/messageFormatting");
const auth_scope_1 = require("../auth/auth.scope");
const content_template_model_1 = require("../content-templates/content-template.model");
const flow_step_model_1 = require("../flow-steps/flow-step.model");
function isNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
}
function normalizeTemplateKey(value) {
    return value.trim();
}
function toDisplayTemplateMessage(template) {
    return {
        key: template.key,
        contentType: template.contentType ?? "text",
        status: template.status ?? "active",
        translations: {
            ar: (0, messageFormatting_1.normalizeMessageTextFormatting)(template.translations?.ar ?? ""),
            en: (0, messageFormatting_1.normalizeMessageTextFormatting)(template.translations?.en ?? ""),
            de: (0, messageFormatting_1.normalizeMessageTextFormatting)(template.translations?.de ?? ""),
        },
    };
}
function normalizeIncomingTranslationValue(value) {
    if (value === undefined || value === null) {
        return undefined;
    }
    if (typeof value !== "string") {
        return undefined;
    }
    const normalized = value.trim();
    return normalized.length > 0 ? (0, messageFormatting_1.normalizeMessageTextFormatting)(normalized) : "";
}
async function getScopedContentKeys(authUser) {
    const scopedFlow = await (0, auth_scope_1.resolveScopedFlow)(authUser);
    if (!scopedFlow) {
        return null;
    }
    const flowSteps = await flow_step_model_1.FlowStepModel.find({ flowId: scopedFlow._id })
        .select("code contentKey sequence")
        .sort({ sequence: 1 })
        .lean();
    const contentKeyRows = flowSteps
        .filter((step) => isNonEmptyString(step.contentKey))
        .map((step) => ({
        key: normalizeTemplateKey(step.contentKey),
        stepCode: step.code,
        sequence: step.sequence,
    }));
    const uniqueKeys = Array.from(new Set(contentKeyRows.map((row) => row.key)));
    return {
        scopedFlow,
        flowSteps: contentKeyRows,
        contentKeys: uniqueKeys,
    };
}
async function getClientFlowMessages(req, res, next) {
    try {
        const scopedContentState = await getScopedContentKeys(req.authUser);
        if (!scopedContentState) {
            res.status(403).json({
                success: false,
                message: "Client flow scope is not configured.",
            });
            return;
        }
        if (scopedContentState.contentKeys.length === 0) {
            res.status(200).json({
                success: true,
                data: {
                    flow: scopedContentState.scopedFlow,
                    messages: [],
                },
            });
            return;
        }
        const templates = await content_template_model_1.ContentTemplateModel.find({
            key: { $in: scopedContentState.contentKeys },
        })
            .select("key contentType status translations")
            .lean();
        const templatesByKey = new Map(templates.map((template) => [template.key, template]));
        const messages = scopedContentState.contentKeys.map((key) => {
            const linkedSteps = scopedContentState.flowSteps
                .filter((row) => row.key === key)
                .map((row) => row.stepCode);
            const template = templatesByKey.get(key);
            return {
                key,
                linkedStepCodes: linkedSteps,
                usedInSteps: linkedSteps.length,
                configured: Boolean(template),
                ...(template
                    ? toDisplayTemplateMessage(template)
                    : {
                        contentType: "text",
                        status: "active",
                        translations: { ar: "", en: "", de: "" },
                    }),
            };
        });
        res.status(200).json({
            success: true,
            data: {
                flow: scopedContentState.scopedFlow,
                messages,
            },
        });
    }
    catch (error) {
        next(error);
    }
}
async function updateClientFlowMessage(req, res, next) {
    try {
        const scopedContentState = await getScopedContentKeys(req.authUser);
        if (!scopedContentState) {
            res.status(403).json({
                success: false,
                message: "Client flow scope is not configured.",
            });
            return;
        }
        const routeKey = normalizeTemplateKey(req.params.key);
        if (!isNonEmptyString(routeKey)) {
            res.status(400).json({
                success: false,
                message: "Template key is required.",
            });
            return;
        }
        if (!scopedContentState.contentKeys.includes(routeKey)) {
            res.status(403).json({
                success: false,
                message: "This template key is outside the allowed flow scope.",
            });
            return;
        }
        const bodyTranslations = req.body?.translations;
        if (!bodyTranslations || typeof bodyTranslations !== "object" || Array.isArray(bodyTranslations)) {
            res.status(400).json({
                success: false,
                message: "Field 'translations' is required.",
            });
            return;
        }
        const existingTemplate = await content_template_model_1.ContentTemplateModel.findOne({ key: routeKey });
        const nextTranslations = {
            ar: normalizeIncomingTranslationValue(bodyTranslations.ar) ?? existingTemplate?.translations?.ar ?? "",
            en: normalizeIncomingTranslationValue(bodyTranslations.en) ?? existingTemplate?.translations?.en ?? "",
            de: normalizeIncomingTranslationValue(bodyTranslations.de) ?? existingTemplate?.translations?.de ?? "",
        };
        const cleanedTranslations = {
            ar: isNonEmptyString(nextTranslations.ar) ? nextTranslations.ar : undefined,
            en: isNonEmptyString(nextTranslations.en) ? nextTranslations.en : undefined,
            de: isNonEmptyString(nextTranslations.de) ? nextTranslations.de : undefined,
        };
        if (!cleanedTranslations.ar && !cleanedTranslations.en && !cleanedTranslations.de) {
            res.status(400).json({
                success: false,
                message: "At least one translation is required.",
            });
            return;
        }
        let savedTemplate = existingTemplate;
        if (!savedTemplate) {
            savedTemplate = await content_template_model_1.ContentTemplateModel.create({
                key: routeKey,
                contentType: "text",
                scope: "global",
                status: "active",
                translations: cleanedTranslations,
            });
        }
        else {
            savedTemplate.translations = cleanedTranslations;
            await savedTemplate.save();
        }
        res.status(200).json({
            success: true,
            data: toDisplayTemplateMessage({
                key: savedTemplate.key,
                contentType: savedTemplate.contentType,
                status: savedTemplate.status,
                translations: savedTemplate.translations,
            }),
        });
    }
    catch (error) {
        next(error);
    }
}
async function deleteClientFlowMessage(req, res, next) {
    try {
        const scopedContentState = await getScopedContentKeys(req.authUser);
        if (!scopedContentState) {
            res.status(403).json({
                success: false,
                message: "Client flow scope is not configured.",
            });
            return;
        }
        const routeKey = normalizeTemplateKey(req.params.key);
        if (!isNonEmptyString(routeKey)) {
            res.status(400).json({
                success: false,
                message: "Template key is required.",
            });
            return;
        }
        if (!scopedContentState.contentKeys.includes(routeKey)) {
            res.status(403).json({
                success: false,
                message: "This template key is outside the allowed flow scope.",
            });
            return;
        }
        const sharedUsageOutsideScopedFlow = await flow_step_model_1.FlowStepModel.exists({
            contentKey: routeKey,
            flowId: { $ne: scopedContentState.scopedFlow._id },
        });
        if (sharedUsageOutsideScopedFlow) {
            res.status(409).json({
                success: false,
                message: "This message key is also used outside the scoped client flow and cannot be deleted here.",
            });
            return;
        }
        const deletedTemplate = await content_template_model_1.ContentTemplateModel.findOneAndDelete({ key: routeKey })
            .select("key")
            .lean();
        if (!deletedTemplate) {
            res.status(404).json({
                success: false,
                message: "No saved text exists for this message key.",
            });
            return;
        }
        res.status(200).json({
            success: true,
            data: {
                key: routeKey,
            },
            message: "Flow message deleted successfully.",
        });
    }
    catch (error) {
        next(error);
    }
}
