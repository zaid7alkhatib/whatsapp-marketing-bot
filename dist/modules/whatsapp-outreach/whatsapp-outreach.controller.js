"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOutreachCampaigns = getOutreachCampaigns;
exports.getOutreachCampaignById = getOutreachCampaignById;
exports.createOutreachCampaign = createOutreachCampaign;
exports.cancelOutreachCampaign = cancelOutreachCampaign;
const mongoose_1 = __importDefault(require("mongoose"));
const baileys_service_1 = require("../../integrations/baileys/baileys.service");
const auth_scope_1 = require("../auth/auth.scope");
const channel_account_model_1 = require("../channel-accounts/channel-account.model");
const contact_section_model_1 = require("../contact-sections/contact-section.model");
const contact_section_service_1 = require("../contact-sections/contact-section.service");
const apiResponse_1 = require("../../shared/utils/apiResponse");
const whatsapp_outreach_model_1 = require("./whatsapp-outreach.model");
const whatsapp_outreach_types_1 = require("./whatsapp-outreach.types");
const message_personalization_1 = require("./message-personalization");
const MAX_RECIPIENTS_PER_CAMPAIGN = 250;
const MAX_PERSONALIZED_MESSAGE_LENGTH = 4200;
const MAX_TEMPLATE_LINE_LENGTH = 500;
const DEFAULT_INTEREST_TRIGGERS = [
    "1",
    "interested",
    "interest",
    "مهتم",
    "مهتمة",
    "نعم",
];
const DELIVERY_DELAY_MS = 2500;
const activeCampaignIds = new Set();
const cancelledCampaignIds = new Set();
function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
function isNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
}
function isPlainObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function getErrorMessage(error) {
    return error instanceof Error && error.message ? error.message : "Unknown delivery error.";
}
function normalizePhoneNumber(value) {
    if (!isNonEmptyString(value)) {
        return { message: "Every selected recipient needs a phone number." };
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
function parseConsentStatus(value) {
    if (isNonEmptyString(value)) {
        const normalizedValue = value.trim().toLowerCase();
        if (normalizedValue === "approved") {
            return "opted_in";
        }
        if (normalizedValue === "needs_review" || normalizedValue === "pending") {
            return "not_confirmed";
        }
        if (normalizedValue === "blocked" || normalizedValue === "do_not_send") {
            return "opted_out";
        }
    }
    if (isNonEmptyString(value) &&
        whatsapp_outreach_types_1.OUTREACH_CONSENT_STATUSES.includes(value)) {
        return value;
    }
    return "not_confirmed";
}
function parseTitle(value) {
    if (isNonEmptyString(value)) {
        return value.trim().slice(0, 160);
    }
    return `WhatsApp marketing ${new Date().toISOString().slice(0, 10)}`;
}
function parseMessage(value) {
    if (!isNonEmptyString(value)) {
        return { isValid: false, message: "Field 'message' is required." };
    }
    const message = value.trim();
    if (message.length > 4000) {
        return { isValid: false, message: "Field 'message' must be 4000 characters or less." };
    }
    return { isValid: true, data: message };
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
function parseRecipientBody(value) {
    if (!isPlainObject(value)) {
        return null;
    }
    return value;
}
function parseOptionalObjectId(value) {
    if (!isNonEmptyString(value)) {
        return undefined;
    }
    const normalizedValue = value.trim();
    return mongoose_1.default.isValidObjectId(normalizedValue)
        ? new mongoose_1.default.Types.ObjectId(normalizedValue)
        : undefined;
}
function normalizeRecipients(value) {
    if (!Array.isArray(value)) {
        return { isValid: false, message: "Field 'recipients' must be an array." };
    }
    const selectedRecipientBodies = value
        .map(parseRecipientBody)
        .filter((recipient) => {
        return Boolean(recipient) && recipient?.selected !== false;
    });
    if (selectedRecipientBodies.length === 0) {
        return { isValid: false, message: "Select at least one recipient." };
    }
    if (selectedRecipientBodies.length > MAX_RECIPIENTS_PER_CAMPAIGN) {
        return {
            isValid: false,
            message: `A single campaign can include up to ${MAX_RECIPIENTS_PER_CAMPAIGN} selected recipients.`,
        };
    }
    const seenChannelRefs = new Set();
    const recipients = [];
    for (const recipientBody of selectedRecipientBodies) {
        const normalizedPhoneNumber = normalizePhoneNumber(recipientBody.phoneNumber);
        if (!normalizedPhoneNumber.phoneNumber || !normalizedPhoneNumber.channelUserRef) {
            return {
                isValid: false,
                message: normalizedPhoneNumber.message,
            };
        }
        const displayName = isNonEmptyString(recipientBody.displayName)
            ? recipientBody.displayName.trim().slice(0, 140)
            : undefined;
        const consentStatus = parseConsentStatus(recipientBody.consentStatus);
        const contactSectionId = parseOptionalObjectId(recipientBody.contactSectionId);
        const contactId = parseOptionalObjectId(recipientBody.contactId);
        if ((recipientBody.contactSectionId !== undefined && !contactSectionId) ||
            (recipientBody.contactId !== undefined && !contactId)) {
            return {
                isValid: false,
                message: "Contact section references must be valid ObjectIds.",
            };
        }
        if (seenChannelRefs.has(normalizedPhoneNumber.channelUserRef)) {
            recipients.push({
                phoneNumber: normalizedPhoneNumber.phoneNumber,
                displayName,
                channelUserRef: normalizedPhoneNumber.channelUserRef,
                contactSectionId,
                contactId,
                consentStatus,
                status: "skipped",
                skippedReason: "Duplicate recipient in this campaign.",
            });
            continue;
        }
        seenChannelRefs.add(normalizedPhoneNumber.channelUserRef);
        if (consentStatus !== "opted_in") {
            recipients.push({
                phoneNumber: normalizedPhoneNumber.phoneNumber,
                displayName,
                channelUserRef: normalizedPhoneNumber.channelUserRef,
                contactSectionId,
                contactId,
                consentStatus,
                status: "skipped",
                skippedReason: "Recipient is not approved for this campaign.",
            });
            continue;
        }
        recipients.push({
            phoneNumber: normalizedPhoneNumber.phoneNumber,
            displayName,
            channelUserRef: normalizedPhoneNumber.channelUserRef,
            contactSectionId,
            contactId,
            consentStatus,
            status: "queued",
        });
    }
    return { isValid: true, recipients };
}
function attachPersonalizedMessages(recipients, message, template) {
    const personalizedRecipients = [];
    for (const recipient of recipients) {
        const personalizedMessage = (0, message_personalization_1.buildPersonalizedMarketingMessage)({
            message,
            displayName: recipient.displayName,
            template,
        });
        if (recipient.status === "queued" && personalizedMessage.length > MAX_PERSONALIZED_MESSAGE_LENGTH) {
            return {
                isValid: false,
                message: `The final message for ${recipient.displayName || recipient.phoneNumber} is too long after adding the greeting and reply instructions. Shorten the campaign message.`,
            };
        }
        personalizedRecipients.push({
            ...recipient,
            personalizedMessage,
        });
    }
    return { isValid: true, recipients: personalizedRecipients };
}
function recalculateCampaignMetrics(campaign) {
    const recipients = campaign.recipients ?? [];
    campaign.totalRecipients = recipients.length;
    campaign.eligibleRecipients = recipients.filter((recipient) => recipient.consentStatus === "opted_in" && !recipient.skippedReason).length;
    campaign.sentCount = recipients.filter((recipient) => recipient.status === "sent").length;
    campaign.failedCount = recipients.filter((recipient) => recipient.status === "failed").length;
    campaign.skippedCount = recipients.filter((recipient) => recipient.status === "skipped").length;
}
async function validateContactSectionReferences(options) {
    const sectionIds = Array.from(new Set(options.recipients
        .map((recipient) => recipient.contactSectionId)
        .filter((value) => Boolean(value))
        .map((value) => String(value))));
    if (sectionIds.length === 0) {
        return { isValid: true };
    }
    const sections = await contact_section_model_1.ContactSectionModel.find({
        _id: { $in: sectionIds },
        channelAccountId: options.channelAccountId,
    }).exec();
    if (sections.length !== sectionIds.length) {
        return {
            isValid: false,
            message: "One or more selected contact sections were not found for this WhatsApp account.",
        };
    }
    const sectionsById = new Map(sections.map((section) => [String(section._id), section]));
    for (const recipient of options.recipients) {
        if (!recipient.contactSectionId || !recipient.contactId) {
            continue;
        }
        const section = sectionsById.get(String(recipient.contactSectionId));
        const contact = section?.contacts.id(String(recipient.contactId));
        if (!contact) {
            return {
                isValid: false,
                message: "One or more selected contacts were not found in their contact section.",
            };
        }
    }
    return { isValid: true };
}
async function markRecipientSectionDelivery(campaign, recipient, status, errorMessage) {
    await (0, contact_section_service_1.markSectionContactDelivery)({
        sectionId: recipient.contactSectionId,
        contactId: recipient.contactId,
        campaignId: campaign._id,
        status,
        errorMessage,
        sentAt: recipient.sentAt,
    });
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
async function getCampaignFilterForRequest(req) {
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
async function canAccessCampaign(req, campaign) {
    if (!(0, auth_scope_1.isClientUserRole)(req.authUser?.role)) {
        return true;
    }
    const scopedChannelAccount = await (0, auth_scope_1.resolveScopedChannelAccount)(req.authUser);
    return Boolean(scopedChannelAccount && (0, auth_scope_1.idsMatch)(scopedChannelAccount._id, campaign.channelAccountId));
}
async function processOutreachCampaign(campaignId) {
    if (activeCampaignIds.has(campaignId)) {
        return;
    }
    activeCampaignIds.add(campaignId);
    try {
        const campaign = await whatsapp_outreach_model_1.OutreachCampaignModel.findById(campaignId).exec();
        if (!campaign) {
            return;
        }
        if (cancelledCampaignIds.has(campaignId) || campaign.status === "cancelled") {
            return;
        }
        campaign.status = "sending";
        campaign.startedAt = campaign.startedAt ?? new Date();
        campaign.errorMessage = undefined;
        await campaign.save();
        for (const recipient of campaign.recipients) {
            if (cancelledCampaignIds.has(campaignId)) {
                if (recipient.status === "queued" || recipient.status === "sending") {
                    recipient.status = "cancelled";
                    await markRecipientSectionDelivery(campaign, recipient, "cancelled");
                }
                continue;
            }
            if (recipient.status !== "queued") {
                continue;
            }
            recipient.status = "sending";
            recalculateCampaignMetrics(campaign);
            await campaign.save();
            try {
                const personalizedMessage = recipient.personalizedMessage ??
                    (0, message_personalization_1.buildPersonalizedMarketingMessage)({
                        message: campaign.message,
                        displayName: recipient.displayName,
                        template: campaign.personalizationTemplate,
                    });
                await (0, baileys_service_1.sendBaileysTextMessage)(String(campaign.channelAccountId), recipient.channelUserRef, personalizedMessage);
                recipient.status = "sent";
                recipient.sentAt = new Date();
                recipient.errorMessage = undefined;
                await markRecipientSectionDelivery(campaign, recipient, "sent");
            }
            catch (error) {
                recipient.status = "failed";
                recipient.errorMessage = getErrorMessage(error);
                await markRecipientSectionDelivery(campaign, recipient, "failed", recipient.errorMessage);
            }
            recalculateCampaignMetrics(campaign);
            await campaign.save();
            await sleep(DELIVERY_DELAY_MS);
        }
        recalculateCampaignMetrics(campaign);
        if (cancelledCampaignIds.has(campaignId)) {
            campaign.status = "cancelled";
            campaign.cancelledAt = campaign.cancelledAt ?? new Date();
        }
        else {
            campaign.status = campaign.failedCount > 0 ? "completed_with_errors" : "completed";
        }
        campaign.completedAt = new Date();
        await campaign.save();
    }
    catch (error) {
        await whatsapp_outreach_model_1.OutreachCampaignModel.updateOne({ _id: campaignId }, {
            status: "failed",
            errorMessage: getErrorMessage(error),
            completedAt: new Date(),
        }).exec();
    }
    finally {
        activeCampaignIds.delete(campaignId);
        cancelledCampaignIds.delete(campaignId);
    }
}
async function getOutreachCampaigns(req, res, next) {
    try {
        const scopedFilter = await getCampaignFilterForRequest(req);
        if (!scopedFilter.isValid || !scopedFilter.filter) {
            (0, apiResponse_1.sendError)(res, scopedFilter.message ?? "Unable to resolve campaign scope.", scopedFilter.statusCode ?? 403);
            return;
        }
        const campaigns = await whatsapp_outreach_model_1.OutreachCampaignModel.find(scopedFilter.filter)
            .sort({ createdAt: -1 })
            .limit(50)
            .lean();
        (0, apiResponse_1.sendSuccess)(res, { data: campaigns });
    }
    catch (error) {
        next(error);
    }
}
async function getOutreachCampaignById(req, res, next) {
    try {
        if (!mongoose_1.default.isValidObjectId(req.params.id)) {
            (0, apiResponse_1.sendError)(res, "Invalid campaign id.", 400);
            return;
        }
        const campaign = await whatsapp_outreach_model_1.OutreachCampaignModel.findById(req.params.id).exec();
        if (!campaign || !(await canAccessCampaign(req, campaign))) {
            (0, apiResponse_1.sendError)(res, "Campaign not found.", 404);
            return;
        }
        (0, apiResponse_1.sendSuccess)(res, { data: campaign });
    }
    catch (error) {
        next(error);
    }
}
async function createOutreachCampaign(req, res, next) {
    try {
        if (req.body.consentConfirmed !== true) {
            (0, apiResponse_1.sendError)(res, "Confirm this is a one-time approved marketing message before sending. / أكد أن هذه رسالة تسويقية معتمدة لمرة واحدة قبل الإرسال.", 400);
            return;
        }
        const scopedChannelAccount = await resolveWritableChannelAccountId(req, req.body.channelAccountId);
        if (!scopedChannelAccount.isValid || !scopedChannelAccount.channelAccountId) {
            (0, apiResponse_1.sendError)(res, scopedChannelAccount.message ?? "Unable to resolve channel account.", scopedChannelAccount.statusCode ?? 400);
            return;
        }
        const channelAccount = await channel_account_model_1.ChannelAccountModel.findById(scopedChannelAccount.channelAccountId)
            .select("_id displayName code status")
            .lean();
        if (!channelAccount) {
            (0, apiResponse_1.sendError)(res, "Channel account not found.", 404);
            return;
        }
        const baileysStatus = (0, baileys_service_1.getBaileysStatus)(scopedChannelAccount.channelAccountId);
        if (!baileysStatus.connected) {
            (0, apiResponse_1.sendError)(res, "WhatsApp is not connected for this channel account. Pair it before sending a marketing campaign.", 409);
            return;
        }
        const parsedMessage = parseMessage(req.body.message);
        if (!parsedMessage.isValid || !parsedMessage.data) {
            (0, apiResponse_1.sendError)(res, parsedMessage.message ?? "Invalid message.", 400);
            return;
        }
        const personalizationTemplate = parsePersonalizationTemplate(req.body.personalizationTemplate);
        const interestTriggers = parseInterestTriggers(req.body.interestTriggers);
        const normalizedRecipients = normalizeRecipients(req.body.recipients);
        if (!normalizedRecipients.isValid || !normalizedRecipients.recipients) {
            (0, apiResponse_1.sendError)(res, normalizedRecipients.message ?? "Invalid recipients.", 400);
            return;
        }
        const personalizedRecipients = attachPersonalizedMessages(normalizedRecipients.recipients, parsedMessage.data, personalizationTemplate);
        if (!personalizedRecipients.isValid || !personalizedRecipients.recipients) {
            (0, apiResponse_1.sendError)(res, personalizedRecipients.message ?? "Invalid personalized messages.", 400);
            return;
        }
        const eligibleRecipients = personalizedRecipients.recipients.filter((recipient) => recipient.status === "queued").length;
        if (eligibleRecipients === 0) {
            (0, apiResponse_1.sendError)(res, "No selected recipients are approved for this campaign.", 400);
            return;
        }
        const channelAccountObjectId = new mongoose_1.default.Types.ObjectId(scopedChannelAccount.channelAccountId);
        const referencedSections = await validateContactSectionReferences({
            channelAccountId: channelAccountObjectId,
            recipients: personalizedRecipients.recipients,
        });
        if (!referencedSections.isValid) {
            (0, apiResponse_1.sendError)(res, referencedSections.message ?? "Invalid contact section references.", 400);
            return;
        }
        const activeCampaign = await whatsapp_outreach_model_1.OutreachCampaignModel.exists({
            channelAccountId: channelAccountObjectId,
            status: { $in: ["queued", "sending"] },
        });
        if (activeCampaign) {
            (0, apiResponse_1.sendError)(res, "Finish or cancel the active marketing campaign before sending another one.", 409);
            return;
        }
        const campaign = await whatsapp_outreach_model_1.OutreachCampaignModel.create({
            channelAccountId: channelAccountObjectId,
            title: parseTitle(req.body.title),
            message: parsedMessage.data,
            messageWithOptOut: (0, message_personalization_1.buildPersonalizedMarketingMessage)({
                message: parsedMessage.data,
                template: personalizationTemplate,
            }),
            personalizationTemplate,
            interestTriggers,
            status: "queued",
            recipients: personalizedRecipients.recipients,
            totalRecipients: personalizedRecipients.recipients.length,
            eligibleRecipients,
            sentCount: 0,
            failedCount: 0,
            skippedCount: personalizedRecipients.recipients.filter((recipient) => recipient.status === "skipped").length,
            consentConfirmed: true,
            createdBy: req.authUser
                ? {
                    username: req.authUser.username,
                    role: req.authUser.role,
                }
                : undefined,
        });
        void processOutreachCampaign(String(campaign._id));
        (0, apiResponse_1.sendSuccess)(res, {
            data: campaign,
            statusCode: 201,
            message: "Marketing campaign queued. / تم وضع الحملة التسويقية في قائمة الإرسال.",
        });
    }
    catch (error) {
        next(error);
    }
}
async function cancelOutreachCampaign(req, res, next) {
    try {
        if (!mongoose_1.default.isValidObjectId(req.params.id)) {
            (0, apiResponse_1.sendError)(res, "Invalid campaign id.", 400);
            return;
        }
        const campaign = await whatsapp_outreach_model_1.OutreachCampaignModel.findById(req.params.id).exec();
        if (!campaign || !(await canAccessCampaign(req, campaign))) {
            (0, apiResponse_1.sendError)(res, "Campaign not found.", 404);
            return;
        }
        if (!["queued", "sending"].includes(campaign.status)) {
            (0, apiResponse_1.sendError)(res, "Only queued or sending campaigns can be cancelled.", 409);
            return;
        }
        cancelledCampaignIds.add(String(campaign._id));
        for (const recipient of campaign.recipients) {
            if (recipient.status === "queued" || recipient.status === "sending") {
                recipient.status = "cancelled";
                await markRecipientSectionDelivery(campaign, recipient, "cancelled");
            }
        }
        campaign.status = "cancelled";
        campaign.cancelledAt = new Date();
        campaign.completedAt = new Date();
        recalculateCampaignMetrics(campaign);
        await campaign.save();
        (0, apiResponse_1.sendSuccess)(res, {
            data: campaign,
            message: "Marketing campaign cancelled. / تم إلغاء الحملة التسويقية.",
        });
    }
    catch (error) {
        next(error);
    }
}
