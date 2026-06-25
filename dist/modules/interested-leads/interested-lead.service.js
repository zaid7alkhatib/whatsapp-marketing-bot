"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.INTEREST_ACKNOWLEDGEMENT_MESSAGE = void 0;
exports.detectInterestedReply = detectInterestedReply;
exports.detectInterestedReplyForContact = detectInterestedReplyForContact;
exports.recordInterestedLead = recordInterestedLead;
exports.markInterestedLeadAcknowledged = markInterestedLeadAcknowledged;
exports.markInterestedLeadAcknowledgementFailed = markInterestedLeadAcknowledgementFailed;
const mongoose_1 = __importDefault(require("mongoose"));
const contact_section_model_1 = require("../contact-sections/contact-section.model");
const whatsapp_outreach_model_1 = require("../whatsapp-outreach/whatsapp-outreach.model");
const interested_lead_model_1 = require("./interested-lead.model");
exports.INTEREST_ACKNOWLEDGEMENT_MESSAGE = "Thank you for your interest. One of our agents will contact you shortly.\n\nشكراً لاهتمامك. سيتواصل معك أحد ممثلينا قريباً.";
const DEFAULT_INTEREST_TRIGGERS = [
    "1",
    "interest",
    "interested",
    "interst",
    "intersted",
    "intrest",
    "intrested",
    "yes",
    "مهتم",
    "مهتمة",
    "اهتمام",
    "اريد",
    "أريد",
    "بدي",
    "نعم",
    "عايز",
];
const HIDDEN_PHONE_LABEL = "Phone hidden by WhatsApp / الرقم مخفي من واتساب";
function getOptionalDisplayName(value) {
    if (typeof value !== "string") {
        return undefined;
    }
    const displayName = value.replace(/\s+/g, " ").trim();
    return displayName ? displayName.slice(0, 140) : undefined;
}
function normalizeReplyText(value) {
    return value
        .normalize("NFKD")
        .trim()
        .toLowerCase()
        .replace(/[\u064B-\u065F\u0670]/g, "")
        .replace(/[أإآ]/g, "ا")
        .replace(/ى/g, "ي")
        .replace(/[^\p{L}\p{N}\s']/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
}
function normalizeIdentityName(value) {
    const displayName = getOptionalDisplayName(value);
    if (!displayName) {
        return undefined;
    }
    return displayName
        .normalize("NFKD")
        .toLowerCase()
        .replace(/[\u064B-\u065F\u0670]/g, "")
        .replace(/[أإآ]/g, "ا")
        .replace(/ى/g, "ي")
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
}
function isLidChannelUserRef(channelUserRef) {
    return channelUserRef.toLowerCase().endsWith("@lid");
}
function normalizePhoneFromChannelUserRef(channelUserRef) {
    if (isLidChannelUserRef(channelUserRef)) {
        return HIDDEN_PHONE_LABEL;
    }
    const rawUser = channelUserRef.split("@")[0]?.split(":")[0] ?? channelUserRef;
    const digits = rawUser.replace(/\D/g, "");
    return digits ? `+${digits}` : HIDDEN_PHONE_LABEL;
}
function toIdentityCandidate(value) {
    return {
        channelUserRef: value.channelUserRef,
        displayName: getOptionalDisplayName(value.displayName),
        phoneNumber: typeof value.phoneNumber === "string" && value.phoneNumber.trim()
            ? value.phoneNumber.trim()
            : undefined,
    };
}
async function resolveKnownContactIdentity(options) {
    const campaign = await whatsapp_outreach_model_1.OutreachCampaignModel.findOne({
        channelAccountId: options.channelAccountId,
        recipients: {
            $elemMatch: {
                channelUserRef: options.channelUserRef,
            },
        },
    })
        .sort({ createdAt: -1 })
        .select("recipients.channelUserRef recipients.displayName recipients.phoneNumber")
        .lean()
        .exec();
    const campaignRecipient = campaign?.recipients?.find((recipient) => recipient.channelUserRef === options.channelUserRef);
    if (campaignRecipient) {
        return toIdentityCandidate(campaignRecipient);
    }
    const section = await contact_section_model_1.ContactSectionModel.findOne({
        channelAccountId: options.channelAccountId,
        contacts: {
            $elemMatch: {
                channelUserRef: options.channelUserRef,
            },
        },
    })
        .sort({ updatedAt: -1 })
        .select("contacts.channelUserRef contacts.displayName contacts.phoneNumber")
        .lean()
        .exec();
    const sectionContact = section?.contacts?.find((contact) => contact.channelUserRef === options.channelUserRef);
    if (sectionContact) {
        return toIdentityCandidate(sectionContact);
    }
    const normalizedIncomingName = normalizeIdentityName(options.displayName);
    if (!normalizedIncomingName) {
        return {};
    }
    const recentCampaigns = await whatsapp_outreach_model_1.OutreachCampaignModel.find({
        channelAccountId: options.channelAccountId,
        "recipients.displayName": { $exists: true, $ne: "" },
    })
        .sort({ createdAt: -1 })
        .limit(20)
        .select("recipients.channelUserRef recipients.displayName recipients.phoneNumber")
        .lean()
        .exec();
    for (const recentCampaign of recentCampaigns) {
        const matchedRecipient = recentCampaign.recipients?.find((recipient) => normalizeIdentityName(recipient.displayName) === normalizedIncomingName);
        if (matchedRecipient) {
            return toIdentityCandidate(matchedRecipient);
        }
    }
    const recentSections = await contact_section_model_1.ContactSectionModel.find({
        channelAccountId: options.channelAccountId,
        "contacts.displayName": { $exists: true, $ne: "" },
    })
        .sort({ updatedAt: -1 })
        .limit(100)
        .select("contacts.channelUserRef contacts.displayName contacts.phoneNumber")
        .lean()
        .exec();
    for (const recentSection of recentSections) {
        const matchedContact = recentSection.contacts?.find((contact) => normalizeIdentityName(contact.displayName) === normalizedIncomingName);
        if (matchedContact) {
            return toIdentityCandidate(matchedContact);
        }
    }
    return {};
}
async function resolveCampaignInterestTriggers(options) {
    const campaign = await whatsapp_outreach_model_1.OutreachCampaignModel.findOne({
        channelAccountId: options.channelAccountId,
        interestTriggers: { $exists: true, $ne: [] },
        recipients: {
            $elemMatch: {
                channelUserRef: options.channelUserRef,
                status: { $in: ["sent", "sending", "queued"] },
            },
        },
    })
        .sort({ createdAt: -1 })
        .select("interestTriggers")
        .lean()
        .exec();
    if (Array.isArray(campaign?.interestTriggers) && campaign.interestTriggers.length > 0) {
        return campaign.interestTriggers;
    }
    const normalizedIncomingName = normalizeIdentityName(options.displayName);
    if (!normalizedIncomingName) {
        return DEFAULT_INTEREST_TRIGGERS;
    }
    const recentCampaigns = await whatsapp_outreach_model_1.OutreachCampaignModel.find({
        channelAccountId: options.channelAccountId,
        interestTriggers: { $exists: true, $ne: [] },
        "recipients.displayName": { $exists: true, $ne: "" },
    })
        .sort({ createdAt: -1 })
        .limit(20)
        .select("interestTriggers recipients.displayName")
        .lean()
        .exec();
    const matchedCampaign = recentCampaigns.find((recentCampaign) => recentCampaign.recipients?.some((recipient) => normalizeIdentityName(recipient.displayName) === normalizedIncomingName));
    return Array.isArray(matchedCampaign?.interestTriggers) &&
        matchedCampaign.interestTriggers.length > 0
        ? matchedCampaign.interestTriggers
        : DEFAULT_INTEREST_TRIGGERS;
}
function detectInterestedReply(value, triggers = DEFAULT_INTEREST_TRIGGERS) {
    const normalizedText = normalizeReplyText(value);
    if (!normalizedText) {
        return null;
    }
    if (normalizedText.includes("not interested") ||
        normalizedText.includes("no interest") ||
        normalizedText.includes("not interst") ||
        normalizedText.includes("غير مهتم") ||
        normalizedText.includes("غير مهتمة") ||
        normalizedText.includes("لا اريد") ||
        normalizedText.includes("لست مهتم")) {
        return null;
    }
    const words = new Set(normalizedText.split(" "));
    const matchedKeyword = triggers.find((keyword) => {
        const normalizedKeyword = normalizeReplyText(keyword);
        return normalizedKeyword && words.has(normalizedKeyword);
    });
    if (matchedKeyword) {
        return matchedKeyword;
    }
    return null;
}
async function detectInterestedReplyForContact(options) {
    const channelAccountObjectId = new mongoose_1.default.Types.ObjectId(options.channelAccountId);
    const triggers = await resolveCampaignInterestTriggers({
        channelAccountId: channelAccountObjectId,
        channelUserRef: options.channelUserRef,
        displayName: options.displayName,
    });
    return detectInterestedReply(options.message, triggers);
}
async function recordInterestedLead(options) {
    const now = new Date();
    const channelAccountObjectId = new mongoose_1.default.Types.ObjectId(options.channelAccountId);
    const knownIdentity = await resolveKnownContactIdentity({
        channelAccountId: channelAccountObjectId,
        channelUserRef: options.channelUserRef,
        displayName: options.displayName,
    });
    const displayName = getOptionalDisplayName(options.displayName) ?? knownIdentity.displayName;
    const phoneNumber = knownIdentity.phoneNumber ?? normalizePhoneFromChannelUserRef(options.channelUserRef);
    const existingLead = await interested_lead_model_1.InterestedLeadModel.findOne({
        channelAccountId: channelAccountObjectId,
        channelUserRef: options.channelUserRef,
    }).exec();
    if (existingLead) {
        existingLead.phoneNumber = phoneNumber;
        existingLead.displayName = displayName ?? existingLead.displayName;
        existingLead.lastMessage = options.message;
        existingLead.trigger = options.trigger;
        existingLead.lastInterestedAt = now;
        existingLead.messageCount += 1;
        await existingLead.save();
        return {
            lead: existingLead,
            shouldSendAcknowledgement: true,
        };
    }
    const lead = await interested_lead_model_1.InterestedLeadModel.create({
        channelAccountId: channelAccountObjectId,
        channelUserRef: options.channelUserRef,
        phoneNumber,
        displayName,
        lastMessage: options.message,
        trigger: options.trigger,
        status: "new",
        acknowledgementMessage: exports.INTEREST_ACKNOWLEDGEMENT_MESSAGE,
        firstInterestedAt: now,
        lastInterestedAt: now,
        messageCount: 1,
    });
    return {
        lead,
        shouldSendAcknowledgement: true,
    };
}
async function markInterestedLeadAcknowledged(options) {
    await interested_lead_model_1.InterestedLeadModel.updateOne({
        channelAccountId: new mongoose_1.default.Types.ObjectId(options.channelAccountId),
        channelUserRef: options.channelUserRef,
    }, {
        $set: {
            status: "acknowledged",
            acknowledgementMessage: exports.INTEREST_ACKNOWLEDGEMENT_MESSAGE,
            acknowledgementSentAt: options.sentAt ?? new Date(),
        },
        $unset: {
            acknowledgementError: "",
        },
    }).exec();
}
async function markInterestedLeadAcknowledgementFailed(options) {
    await interested_lead_model_1.InterestedLeadModel.updateOne({
        channelAccountId: new mongoose_1.default.Types.ObjectId(options.channelAccountId),
        channelUserRef: options.channelUserRef,
    }, {
        $set: {
            status: "ack_failed",
            acknowledgementError: options.errorMessage,
        },
    }).exec();
}
