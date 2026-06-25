"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getContactSections = getContactSections;
exports.getContactSectionById = getContactSectionById;
exports.createContactSection = createContactSection;
exports.updateContactSection = updateContactSection;
exports.deleteContactSection = deleteContactSection;
const mongoose_1 = __importDefault(require("mongoose"));
const auth_scope_1 = require("../auth/auth.scope");
const channel_account_model_1 = require("../channel-accounts/channel-account.model");
const apiResponse_1 = require("../../shared/utils/apiResponse");
const contact_section_model_1 = require("./contact-section.model");
const contact_section_service_1 = require("./contact-section.service");
function isNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
}
function parseName(value) {
    if (!isNonEmptyString(value)) {
        return null;
    }
    const name = value.trim().slice(0, 120);
    return name.length >= 2 ? name : null;
}
function parseDescription(value) {
    if (!isNonEmptyString(value)) {
        return undefined;
    }
    return value.trim().slice(0, 500);
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
async function getSectionFilterForRequest(req) {
    if (!(0, auth_scope_1.isClientUserRole)(req.authUser?.role)) {
        return { isValid: true, filter: {} };
    }
    const scopedChannelAccount = await (0, auth_scope_1.resolveScopedChannelAccount)(req.authUser);
    if (!scopedChannelAccount) {
        return {
            isValid: false,
            statusCode: 403,
            message: "Client channel account scope is not configured.",
        };
    }
    return {
        isValid: true,
        filter: { channelAccountId: scopedChannelAccount._id },
    };
}
async function canAccessSection(req, section) {
    if (!(0, auth_scope_1.isClientUserRole)(req.authUser?.role)) {
        return true;
    }
    const scopedChannelAccount = await (0, auth_scope_1.resolveScopedChannelAccount)(req.authUser);
    return Boolean(scopedChannelAccount && (0, auth_scope_1.idsMatch)(scopedChannelAccount._id, section.channelAccountId));
}
function preserveExistingContactState(contacts, existingContacts) {
    const existingByRef = new Map(existingContacts.map((contact) => [contact.channelUserRef, contact]));
    return contacts.map((contact) => {
        const existingContact = existingByRef.get(contact.channelUserRef);
        if (!existingContact) {
            return contact;
        }
        return {
            ...contact,
            lastDeliveryStatus: existingContact.lastDeliveryStatus,
            lastCampaignId: existingContact.lastCampaignId,
            lastAttemptAt: existingContact.lastAttemptAt,
            lastSentAt: existingContact.lastSentAt,
            lastErrorMessage: existingContact.lastErrorMessage,
            sendCount: existingContact.sendCount,
        };
    });
}
async function serializeSection(section) {
    return {
        _id: String(section._id),
        channelAccountId: String(section.channelAccountId),
        name: section.name,
        description: section.description ?? null,
        contacts: section.contacts.map((contact) => ({
            _id: String(contact._id),
            phoneNumber: contact.phoneNumber,
            displayName: contact.displayName ?? null,
            channelUserRef: contact.channelUserRef,
            approved: contact.approved,
            lastDeliveryStatus: contact.lastDeliveryStatus,
            lastCampaignId: contact.lastCampaignId ? String(contact.lastCampaignId) : null,
            lastAttemptAt: contact.lastAttemptAt?.toISOString() ?? null,
            lastSentAt: contact.lastSentAt?.toISOString() ?? null,
            lastErrorMessage: contact.lastErrorMessage ?? null,
            sendCount: contact.sendCount,
        })),
        totalContacts: section.totalContacts,
        approvedContacts: section.approvedContacts,
        pendingContacts: section.pendingContacts,
        sentContacts: section.sentContacts,
        failedContacts: section.failedContacts,
        createdAt: section.createdAt?.toISOString(),
        updatedAt: section.updatedAt?.toISOString(),
    };
}
async function getContactSections(req, res, next) {
    try {
        const scopedFilter = await getSectionFilterForRequest(req);
        if (!scopedFilter.isValid || !scopedFilter.filter) {
            (0, apiResponse_1.sendError)(res, scopedFilter.message ?? "Unable to resolve contact section scope.", scopedFilter.statusCode ?? 403);
            return;
        }
        const sections = await contact_section_model_1.ContactSectionModel.find(scopedFilter.filter)
            .sort({ updatedAt: -1 })
            .limit(100)
            .exec();
        (0, apiResponse_1.sendSuccess)(res, { data: await Promise.all(sections.map(serializeSection)) });
    }
    catch (error) {
        next(error);
    }
}
async function getContactSectionById(req, res, next) {
    try {
        if (!mongoose_1.default.isValidObjectId(req.params.id)) {
            (0, apiResponse_1.sendError)(res, "Invalid contact section id.", 400);
            return;
        }
        const section = await contact_section_model_1.ContactSectionModel.findById(req.params.id).exec();
        if (!section || !(await canAccessSection(req, section))) {
            (0, apiResponse_1.sendError)(res, "Contact section not found.", 404);
            return;
        }
        (0, apiResponse_1.sendSuccess)(res, { data: await serializeSection(section) });
    }
    catch (error) {
        next(error);
    }
}
async function createContactSection(req, res, next) {
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
        const name = parseName(req.body.name);
        if (!name) {
            (0, apiResponse_1.sendError)(res, "Field 'name' is required and must be at least 2 characters.", 400);
            return;
        }
        const normalizedContacts = (0, contact_section_service_1.normalizeContactSectionContacts)(req.body.contacts);
        if (!normalizedContacts.isValid || !normalizedContacts.contacts) {
            (0, apiResponse_1.sendError)(res, normalizedContacts.message ?? "Invalid contacts.", 400);
            return;
        }
        const section = new contact_section_model_1.ContactSectionModel({
            channelAccountId: new mongoose_1.default.Types.ObjectId(scopedChannelAccount.channelAccountId),
            name,
            description: parseDescription(req.body.description),
            contacts: normalizedContacts.contacts,
            createdBy: req.authUser
                ? {
                    username: req.authUser.username,
                    role: req.authUser.role,
                }
                : undefined,
        });
        (0, contact_section_service_1.recalculateContactSectionMetrics)(section);
        await section.save();
        (0, apiResponse_1.sendSuccess)(res, {
            data: await serializeSection(section),
            statusCode: 201,
            message: "Contact section saved. / تم حفظ قسم جهات الاتصال.",
        });
    }
    catch (error) {
        const dbError = error;
        if (dbError.code === 11000) {
            (0, apiResponse_1.sendError)(res, "A contact section with this name already exists for this account.", 409);
            return;
        }
        next(error);
    }
}
async function updateContactSection(req, res, next) {
    try {
        if (!mongoose_1.default.isValidObjectId(req.params.id)) {
            (0, apiResponse_1.sendError)(res, "Invalid contact section id.", 400);
            return;
        }
        const section = await contact_section_model_1.ContactSectionModel.findById(req.params.id).exec();
        if (!section || !(await canAccessSection(req, section))) {
            (0, apiResponse_1.sendError)(res, "Contact section not found.", 404);
            return;
        }
        const name = parseName(req.body.name);
        if (name) {
            section.name = name;
        }
        section.description = parseDescription(req.body.description);
        if (req.body.contacts !== undefined) {
            const normalizedContacts = (0, contact_section_service_1.normalizeContactSectionContacts)(req.body.contacts);
            if (!normalizedContacts.isValid || !normalizedContacts.contacts) {
                (0, apiResponse_1.sendError)(res, normalizedContacts.message ?? "Invalid contacts.", 400);
                return;
            }
            const mergedContacts = preserveExistingContactState(normalizedContacts.contacts, section.contacts);
            section.set("contacts", mergedContacts);
        }
        (0, contact_section_service_1.recalculateContactSectionMetrics)(section);
        await section.save();
        (0, apiResponse_1.sendSuccess)(res, {
            data: await serializeSection(section),
            message: "Contact section updated. / تم تحديث قسم جهات الاتصال.",
        });
    }
    catch (error) {
        const dbError = error;
        if (dbError.code === 11000) {
            (0, apiResponse_1.sendError)(res, "A contact section with this name already exists for this account.", 409);
            return;
        }
        next(error);
    }
}
async function deleteContactSection(req, res, next) {
    try {
        if (!mongoose_1.default.isValidObjectId(req.params.id)) {
            (0, apiResponse_1.sendError)(res, "Invalid contact section id.", 400);
            return;
        }
        const section = await contact_section_model_1.ContactSectionModel.findById(req.params.id).exec();
        if (!section || !(await canAccessSection(req, section))) {
            (0, apiResponse_1.sendError)(res, "Contact section not found.", 404);
            return;
        }
        await section.deleteOne();
        (0, apiResponse_1.sendSuccess)(res, { message: "Contact section deleted. / تم حذف قسم جهات الاتصال." });
    }
    catch (error) {
        next(error);
    }
}
