"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOutreachTemplates = getOutreachTemplates;
exports.createOutreachTemplate = createOutreachTemplate;
exports.updateOutreachTemplate = updateOutreachTemplate;
exports.deleteOutreachTemplate = deleteOutreachTemplate;
const mongoose_1 = __importDefault(require("mongoose"));
const auth_scope_1 = require("../auth/auth.scope");
const channel_account_model_1 = require("../channel-accounts/channel-account.model");
const apiResponse_1 = require("../../shared/utils/apiResponse");
const message_personalization_1 = require("./message-personalization");
const outreach_template_model_1 = require("./outreach-template.model");
const MAX_TEMPLATE_LINE_LENGTH = 500;
const DEFAULT_INTEREST_TRIGGERS = ["1", "interested", "مهتم", "مهتمة", "نعم"];
function isNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
}
function isPlainObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function parseTemplateName(value) {
    if (!isNonEmptyString(value)) {
        return null;
    }
    const name = value.trim().slice(0, 120);
    return name.length >= 2 ? name : null;
}
function parseTemplateLine(value, fallback, maxLength) {
    if (typeof value !== "string") {
        return fallback;
    }
    return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}
function parsePersonalizationTemplate(value) {
    if (!isPlainObject(value)) {
        return message_personalization_1.DEFAULT_MARKETING_MESSAGE_TEMPLATE;
    }
    return {
        englishGreeting: parseTemplateLine(value.englishGreeting, message_personalization_1.DEFAULT_MARKETING_MESSAGE_TEMPLATE.englishGreeting, 300),
        arabicGreeting: parseTemplateLine(value.arabicGreeting, message_personalization_1.DEFAULT_MARKETING_MESSAGE_TEMPLATE.arabicGreeting, 300),
        englishResponseInstruction: parseTemplateLine(value.englishResponseInstruction, message_personalization_1.DEFAULT_MARKETING_MESSAGE_TEMPLATE.englishResponseInstruction, MAX_TEMPLATE_LINE_LENGTH),
        arabicResponseInstruction: parseTemplateLine(value.arabicResponseInstruction, message_personalization_1.DEFAULT_MARKETING_MESSAGE_TEMPLATE.arabicResponseInstruction, MAX_TEMPLATE_LINE_LENGTH),
    };
}
function parseInterestTriggers(value) {
    const rawValues = Array.isArray(value)
        ? value
        : typeof value === "string"
            ? value.split(/[\n,؛;]+/)
            : DEFAULT_INTEREST_TRIGGERS;
    const seenTriggers = new Set();
    const triggers = [];
    for (const rawValue of rawValues) {
        if (typeof rawValue !== "string") {
            continue;
        }
        const trigger = rawValue.replace(/\s+/g, " ").trim().slice(0, 80);
        const triggerKey = trigger.toLocaleLowerCase();
        if (!trigger || seenTriggers.has(triggerKey)) {
            continue;
        }
        seenTriggers.add(triggerKey);
        triggers.push(trigger);
    }
    return triggers.slice(0, 30);
}
async function resolveWritableChannelAccountId(req, channelAccountIdValue) {
    if ((0, auth_scope_1.isClientUserRole)(req.authUser?.role)) {
        const scopedChannelAccount = await (0, auth_scope_1.resolveScopedChannelAccount)(req.authUser);
        if (!scopedChannelAccount) {
            return {
                isValid: false,
                statusCode: 403,
                message: "Client channel account scope is not configured.",
            };
        }
        if (isNonEmptyString(channelAccountIdValue) &&
            !(0, auth_scope_1.idsMatch)(scopedChannelAccount._id, channelAccountIdValue.trim())) {
            return {
                isValid: false,
                statusCode: 404,
                message: "Channel account not found.",
            };
        }
        return {
            isValid: true,
            channelAccountId: String(scopedChannelAccount._id),
        };
    }
    if (!isNonEmptyString(channelAccountIdValue) || !mongoose_1.default.isValidObjectId(channelAccountIdValue)) {
        return {
            isValid: false,
            statusCode: 400,
            message: "Field 'channelAccountId' must be a valid ObjectId.",
        };
    }
    return {
        isValid: true,
        channelAccountId: channelAccountIdValue.trim(),
    };
}
async function getTemplateFilterForRequest(req) {
    if ((0, auth_scope_1.isClientUserRole)(req.authUser?.role)) {
        const scopedChannelAccount = await (0, auth_scope_1.resolveScopedChannelAccount)(req.authUser);
        if (!scopedChannelAccount) {
            return {
                isValid: false,
                statusCode: 403,
                message: "Client channel account scope is not configured.",
            };
        }
        return { isValid: true, filter: { channelAccountId: scopedChannelAccount._id } };
    }
    const queryChannelAccountId = typeof req.query.channelAccountId === "string" ? req.query.channelAccountId.trim() : "";
    if (queryChannelAccountId) {
        if (!mongoose_1.default.isValidObjectId(queryChannelAccountId)) {
            return {
                isValid: false,
                statusCode: 400,
                message: "Field 'channelAccountId' must be a valid ObjectId.",
            };
        }
        return {
            isValid: true,
            filter: { channelAccountId: new mongoose_1.default.Types.ObjectId(queryChannelAccountId) },
        };
    }
    return { isValid: true, filter: {} };
}
async function canAccessTemplate(req, template) {
    if (!(0, auth_scope_1.isClientUserRole)(req.authUser?.role)) {
        return true;
    }
    const scopedChannelAccount = await (0, auth_scope_1.resolveScopedChannelAccount)(req.authUser);
    return Boolean(scopedChannelAccount && (0, auth_scope_1.idsMatch)(scopedChannelAccount._id, template.channelAccountId));
}
function serializeTemplate(template) {
    return {
        _id: String(template._id),
        channelAccountId: String(template.channelAccountId),
        name: template.name,
        personalizationTemplate: template.personalizationTemplate,
        interestTriggers: template.interestTriggers ?? [],
        createdAt: template.createdAt?.toISOString(),
        updatedAt: template.updatedAt?.toISOString(),
    };
}
async function getOutreachTemplates(req, res, next) {
    try {
        const scopedFilter = await getTemplateFilterForRequest(req);
        if (!scopedFilter.isValid || !scopedFilter.filter) {
            (0, apiResponse_1.sendError)(res, scopedFilter.message ?? "Unable to resolve template scope.", scopedFilter.statusCode ?? 403);
            return;
        }
        const templates = await outreach_template_model_1.OutreachTemplateModel.find(scopedFilter.filter)
            .sort({ updatedAt: -1 })
            .limit(200)
            .exec();
        (0, apiResponse_1.sendSuccess)(res, { data: templates.map(serializeTemplate) });
    }
    catch (error) {
        next(error);
    }
}
async function createOutreachTemplate(req, res, next) {
    try {
        const scopedChannelAccount = await resolveWritableChannelAccountId(req, req.body.channelAccountId);
        if (!scopedChannelAccount.isValid || !scopedChannelAccount.channelAccountId) {
            (0, apiResponse_1.sendError)(res, scopedChannelAccount.message ?? "Unable to resolve channel account.", scopedChannelAccount.statusCode ?? 400);
            return;
        }
        const channelAccount = await channel_account_model_1.ChannelAccountModel.findById(scopedChannelAccount.channelAccountId)
            .select("_id")
            .lean();
        if (!channelAccount) {
            (0, apiResponse_1.sendError)(res, "Channel account not found.", 404);
            return;
        }
        const name = parseTemplateName(req.body.name);
        if (!name) {
            (0, apiResponse_1.sendError)(res, "Field 'name' is required and must be at least 2 characters.", 400);
            return;
        }
        const template = await outreach_template_model_1.OutreachTemplateModel.create({
            channelAccountId: new mongoose_1.default.Types.ObjectId(scopedChannelAccount.channelAccountId),
            name,
            personalizationTemplate: parsePersonalizationTemplate(req.body.personalizationTemplate),
            interestTriggers: parseInterestTriggers(req.body.interestTriggers),
            createdBy: req.authUser
                ? {
                    username: req.authUser.username,
                    role: req.authUser.role,
                }
                : undefined,
        });
        (0, apiResponse_1.sendSuccess)(res, {
            data: serializeTemplate(template),
            statusCode: 201,
            message: "Template saved. / تم حفظ القالب.",
        });
    }
    catch (error) {
        const dbError = error;
        if (dbError.code === 11000) {
            (0, apiResponse_1.sendError)(res, "A template with this name already exists for this account.", 409);
            return;
        }
        next(error);
    }
}
async function updateOutreachTemplate(req, res, next) {
    try {
        if (!mongoose_1.default.isValidObjectId(req.params.id)) {
            (0, apiResponse_1.sendError)(res, "Invalid template id.", 400);
            return;
        }
        const template = await outreach_template_model_1.OutreachTemplateModel.findById(req.params.id).exec();
        if (!template || !(await canAccessTemplate(req, template))) {
            (0, apiResponse_1.sendError)(res, "Template not found.", 404);
            return;
        }
        const name = parseTemplateName(req.body.name);
        if (!name) {
            (0, apiResponse_1.sendError)(res, "Field 'name' is required and must be at least 2 characters.", 400);
            return;
        }
        template.name = name;
        template.personalizationTemplate = parsePersonalizationTemplate(req.body.personalizationTemplate);
        template.interestTriggers = parseInterestTriggers(req.body.interestTriggers);
        await template.save();
        (0, apiResponse_1.sendSuccess)(res, {
            data: serializeTemplate(template),
            message: "Template updated. / تم تحديث القالب.",
        });
    }
    catch (error) {
        const dbError = error;
        if (dbError.code === 11000) {
            (0, apiResponse_1.sendError)(res, "A template with this name already exists for this account.", 409);
            return;
        }
        next(error);
    }
}
async function deleteOutreachTemplate(req, res, next) {
    try {
        if (!mongoose_1.default.isValidObjectId(req.params.id)) {
            (0, apiResponse_1.sendError)(res, "Invalid template id.", 400);
            return;
        }
        const template = await outreach_template_model_1.OutreachTemplateModel.findById(req.params.id).exec();
        if (!template || !(await canAccessTemplate(req, template))) {
            (0, apiResponse_1.sendError)(res, "Template not found.", 404);
            return;
        }
        await template.deleteOne();
        (0, apiResponse_1.sendSuccess)(res, { message: "Template deleted. / تم حذف القالب." });
    }
    catch (error) {
        next(error);
    }
}
