"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeContactPhone = normalizeContactPhone;
exports.normalizeContactSectionContacts = normalizeContactSectionContacts;
exports.recalculateContactSectionMetrics = recalculateContactSectionMetrics;
exports.markSectionContactDelivery = markSectionContactDelivery;
const mongoose_1 = __importDefault(require("mongoose"));
const contact_section_model_1 = require("./contact-section.model");
function normalizeContactPhone(value) {
    if (typeof value !== "string" || value.trim().length === 0) {
        return { message: "Every contact needs a phone number." };
    }
    let digits = value.trim().replace(/[^\d+]/g, "");
    if (digits.startsWith("+")) {
        digits = digits.slice(1);
    }
    if (digits.startsWith("00")) {
        digits = digits.slice(2);
    }
    digits = digits.replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) {
        return {
            message: "Phone numbers must include a country code and contain 8 to 15 digits.",
        };
    }
    return {
        phoneNumber: `+${digits}`,
        channelUserRef: `${digits}@s.whatsapp.net`,
    };
}
function isPlainObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function getOptionalString(value, maxLength) {
    if (typeof value !== "string") {
        return undefined;
    }
    const normalizedValue = value.trim();
    return normalizedValue ? normalizedValue.slice(0, maxLength) : undefined;
}
function getBoolean(value, defaultValue) {
    return typeof value === "boolean" ? value : defaultValue;
}
function parseContactBody(value) {
    return isPlainObject(value) ? value : null;
}
function normalizeContactSectionContacts(value) {
    if (!Array.isArray(value)) {
        return { isValid: false, message: "Field 'contacts' must be an array." };
    }
    if (value.length === 0) {
        return { isValid: false, message: "Import at least one contact." };
    }
    if (value.length > 5000) {
        return { isValid: false, message: "A contact section can include up to 5000 contacts." };
    }
    const seenRefs = new Set();
    const contacts = [];
    for (const item of value) {
        const contactBody = parseContactBody(item);
        if (!contactBody) {
            return { isValid: false, message: "Every contact must be an object." };
        }
        const normalizedPhone = normalizeContactPhone(contactBody.phoneNumber);
        if (!normalizedPhone.phoneNumber || !normalizedPhone.channelUserRef) {
            return { isValid: false, message: normalizedPhone.message };
        }
        if (seenRefs.has(normalizedPhone.channelUserRef)) {
            continue;
        }
        seenRefs.add(normalizedPhone.channelUserRef);
        contacts.push({
            phoneNumber: normalizedPhone.phoneNumber,
            displayName: getOptionalString(contactBody.displayName, 140),
            channelUserRef: normalizedPhone.channelUserRef,
            approved: getBoolean(contactBody.approved, true),
            lastDeliveryStatus: "ready",
            sendCount: 0,
        });
    }
    if (contacts.length === 0) {
        return { isValid: false, message: "No valid contacts were found after removing duplicates." };
    }
    return { isValid: true, contacts };
}
function recalculateContactSectionMetrics(section) {
    const contacts = section.contacts ?? [];
    section.totalContacts = contacts.length;
    section.approvedContacts = contacts.filter((contact) => contact.approved).length;
    section.sentContacts = contacts.filter((contact) => contact.lastDeliveryStatus === "sent").length;
    section.failedContacts = contacts.filter((contact) => contact.lastDeliveryStatus === "failed").length;
    section.pendingContacts = contacts.filter((contact) => contact.approved && contact.lastDeliveryStatus !== "sent").length;
}
async function markSectionContactDelivery(options) {
    if (!options.sectionId || !options.contactId) {
        return;
    }
    if (!mongoose_1.default.isValidObjectId(options.sectionId) || !mongoose_1.default.isValidObjectId(options.contactId)) {
        return;
    }
    const section = await contact_section_model_1.ContactSectionModel.findById(options.sectionId).exec();
    if (!section) {
        return;
    }
    const contact = section.contacts.id(String(options.contactId));
    if (!contact) {
        return;
    }
    const now = new Date();
    contact.lastDeliveryStatus = options.status;
    contact.lastCampaignId = new mongoose_1.default.Types.ObjectId(options.campaignId);
    contact.lastAttemptAt = now;
    if (options.status === "sent") {
        contact.lastSentAt = options.sentAt ?? now;
        contact.sendCount += 1;
        contact.lastErrorMessage = undefined;
    }
    else {
        contact.lastErrorMessage = options.errorMessage;
    }
    recalculateContactSectionMetrics(section);
    await section.save();
}
