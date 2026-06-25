import mongoose from "mongoose";
import { ContactSectionModel } from "../contact-sections/contact-section.model";
import { OutreachCampaignModel } from "../whatsapp-outreach/whatsapp-outreach.model";
import {
  InterestedLeadDocument,
  InterestedLeadModel,
} from "./interested-lead.model";

export const INTEREST_ACKNOWLEDGEMENT_MESSAGE =
  "Thank you for your interest. One of our agents will contact you shortly.\n\nشكراً لاهتمامك. سيتواصل معك أحد ممثلينا قريباً.";

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

type IdentityCandidate = {
  channelUserRef?: string;
  displayName?: string;
  phoneNumber?: string;
};

function getOptionalDisplayName(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const displayName = value.replace(/\s+/g, " ").trim();
  return displayName ? displayName.slice(0, 140) : undefined;
}

function normalizeReplyText(value: string): string {
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

function normalizeIdentityName(value: unknown): string | undefined {
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

function isLidChannelUserRef(channelUserRef: string): boolean {
  return channelUserRef.toLowerCase().endsWith("@lid");
}

function normalizePhoneFromChannelUserRef(channelUserRef: string): string {
  if (isLidChannelUserRef(channelUserRef)) {
    return HIDDEN_PHONE_LABEL;
  }

  const rawUser = channelUserRef.split("@")[0]?.split(":")[0] ?? channelUserRef;
  const digits = rawUser.replace(/\D/g, "");
  return digits ? `+${digits}` : HIDDEN_PHONE_LABEL;
}

function toIdentityCandidate(value: {
  channelUserRef?: string;
  displayName?: string;
  phoneNumber?: string;
}): IdentityCandidate {
  return {
    channelUserRef: value.channelUserRef,
    displayName: getOptionalDisplayName(value.displayName),
    phoneNumber:
      typeof value.phoneNumber === "string" && value.phoneNumber.trim()
        ? value.phoneNumber.trim()
        : undefined,
  };
}

async function resolveKnownContactIdentity(options: {
  channelAccountId: mongoose.Types.ObjectId;
  channelUserRef: string;
  displayName?: string;
}): Promise<IdentityCandidate> {
  const campaign = await OutreachCampaignModel.findOne({
    channelAccountId: options.channelAccountId,
    recipients: {
      $elemMatch: {
        channelUserRef: options.channelUserRef,
      },
    },
  })
    .sort({ createdAt: -1 })
    .select("recipients.channelUserRef recipients.displayName recipients.phoneNumber")
    .lean<{
      recipients?: Array<{
        channelUserRef?: string;
        displayName?: string;
        phoneNumber?: string;
      }>;
    }>()
    .exec();

  const campaignRecipient = campaign?.recipients?.find(
    (recipient) => recipient.channelUserRef === options.channelUserRef
  );
  if (campaignRecipient) {
    return toIdentityCandidate(campaignRecipient);
  }

  const section = await ContactSectionModel.findOne({
    channelAccountId: options.channelAccountId,
    contacts: {
      $elemMatch: {
        channelUserRef: options.channelUserRef,
      },
    },
  })
    .sort({ updatedAt: -1 })
    .select("contacts.channelUserRef contacts.displayName contacts.phoneNumber")
    .lean<{
      contacts?: Array<{
        channelUserRef?: string;
        displayName?: string;
        phoneNumber?: string;
      }>;
    }>()
    .exec();

  const sectionContact = section?.contacts?.find(
    (contact) => contact.channelUserRef === options.channelUserRef
  );
  if (sectionContact) {
    return toIdentityCandidate(sectionContact);
  }

  const normalizedIncomingName = normalizeIdentityName(options.displayName);
  if (!normalizedIncomingName) {
    return {};
  }

  const recentCampaigns = await OutreachCampaignModel.find({
    channelAccountId: options.channelAccountId,
    "recipients.displayName": { $exists: true, $ne: "" },
  })
    .sort({ createdAt: -1 })
    .limit(20)
    .select("recipients.channelUserRef recipients.displayName recipients.phoneNumber")
    .lean<
      Array<{
        recipients?: Array<{
          channelUserRef?: string;
          displayName?: string;
          phoneNumber?: string;
        }>;
      }>
    >()
    .exec();

  for (const recentCampaign of recentCampaigns) {
    const matchedRecipient = recentCampaign.recipients?.find(
      (recipient) =>
        normalizeIdentityName(recipient.displayName) === normalizedIncomingName
    );
    if (matchedRecipient) {
      return toIdentityCandidate(matchedRecipient);
    }
  }

  const recentSections = await ContactSectionModel.find({
    channelAccountId: options.channelAccountId,
    "contacts.displayName": { $exists: true, $ne: "" },
  })
    .sort({ updatedAt: -1 })
    .limit(100)
    .select("contacts.channelUserRef contacts.displayName contacts.phoneNumber")
    .lean<
      Array<{
        contacts?: Array<{
          channelUserRef?: string;
          displayName?: string;
          phoneNumber?: string;
        }>;
      }>
    >()
    .exec();

  for (const recentSection of recentSections) {
    const matchedContact = recentSection.contacts?.find(
      (contact) => normalizeIdentityName(contact.displayName) === normalizedIncomingName
    );
    if (matchedContact) {
      return toIdentityCandidate(matchedContact);
    }
  }

  return {};
}

async function resolveCampaignInterestTriggers(options: {
  channelAccountId: mongoose.Types.ObjectId;
  channelUserRef: string;
  displayName?: string;
}): Promise<string[]> {
  const campaign = await OutreachCampaignModel.findOne({
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
    .lean<{ interestTriggers?: string[] }>()
    .exec();

  if (Array.isArray(campaign?.interestTriggers) && campaign.interestTriggers.length > 0) {
    return campaign.interestTriggers;
  }

  const normalizedIncomingName = normalizeIdentityName(options.displayName);
  if (!normalizedIncomingName) {
    return DEFAULT_INTEREST_TRIGGERS;
  }

  const recentCampaigns = await OutreachCampaignModel.find({
    channelAccountId: options.channelAccountId,
    interestTriggers: { $exists: true, $ne: [] },
    "recipients.displayName": { $exists: true, $ne: "" },
  })
    .sort({ createdAt: -1 })
    .limit(20)
    .select("interestTriggers recipients.displayName")
    .lean<
      Array<{
        interestTriggers?: string[];
        recipients?: Array<{ displayName?: string }>;
      }>
    >()
    .exec();

  const matchedCampaign = recentCampaigns.find((recentCampaign) =>
    recentCampaign.recipients?.some(
      (recipient) =>
        normalizeIdentityName(recipient.displayName) === normalizedIncomingName
    )
  );

  return Array.isArray(matchedCampaign?.interestTriggers) &&
    matchedCampaign.interestTriggers.length > 0
    ? matchedCampaign.interestTriggers
    : DEFAULT_INTEREST_TRIGGERS;
}

export function detectInterestedReply(
  value: string,
  triggers = DEFAULT_INTEREST_TRIGGERS
): string | null {
  const normalizedText = normalizeReplyText(value);
  if (!normalizedText) {
    return null;
  }

  if (
    normalizedText.includes("not interested") ||
    normalizedText.includes("no interest") ||
    normalizedText.includes("not interst") ||
    normalizedText.includes("غير مهتم") ||
    normalizedText.includes("غير مهتمة") ||
    normalizedText.includes("لا اريد") ||
    normalizedText.includes("لست مهتم")
  ) {
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

export async function detectInterestedReplyForContact(options: {
  channelAccountId: string;
  channelUserRef: string;
  displayName?: string;
  message: string;
}): Promise<string | null> {
  const channelAccountObjectId = new mongoose.Types.ObjectId(options.channelAccountId);
  const triggers = await resolveCampaignInterestTriggers({
    channelAccountId: channelAccountObjectId,
    channelUserRef: options.channelUserRef,
    displayName: options.displayName,
  });

  return detectInterestedReply(options.message, triggers);
}

export async function recordInterestedLead(options: {
  channelAccountId: string;
  channelUserRef: string;
  displayName?: string;
  message: string;
  trigger: string;
}): Promise<{
  lead: InterestedLeadDocument;
  shouldSendAcknowledgement: boolean;
}> {
  const now = new Date();
  const channelAccountObjectId = new mongoose.Types.ObjectId(options.channelAccountId);
  const knownIdentity = await resolveKnownContactIdentity({
    channelAccountId: channelAccountObjectId,
    channelUserRef: options.channelUserRef,
    displayName: options.displayName,
  });
  const displayName =
    getOptionalDisplayName(options.displayName) ?? knownIdentity.displayName;
  const phoneNumber =
    knownIdentity.phoneNumber ?? normalizePhoneFromChannelUserRef(options.channelUserRef);

  const existingLead = await InterestedLeadModel.findOne({
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

  const lead = await InterestedLeadModel.create({
    channelAccountId: channelAccountObjectId,
    channelUserRef: options.channelUserRef,
    phoneNumber,
    displayName,
    lastMessage: options.message,
    trigger: options.trigger,
    status: "new",
    acknowledgementMessage: INTEREST_ACKNOWLEDGEMENT_MESSAGE,
    firstInterestedAt: now,
    lastInterestedAt: now,
    messageCount: 1,
  });

  return {
    lead,
    shouldSendAcknowledgement: true,
  };
}

export async function markInterestedLeadAcknowledged(options: {
  channelAccountId: string;
  channelUserRef: string;
  sentAt?: Date;
}): Promise<void> {
  await InterestedLeadModel.updateOne(
    {
      channelAccountId: new mongoose.Types.ObjectId(options.channelAccountId),
      channelUserRef: options.channelUserRef,
    },
    {
      $set: {
        status: "acknowledged",
        acknowledgementMessage: INTEREST_ACKNOWLEDGEMENT_MESSAGE,
        acknowledgementSentAt: options.sentAt ?? new Date(),
      },
      $unset: {
        acknowledgementError: "",
      },
    }
  ).exec();
}

export async function markInterestedLeadAcknowledgementFailed(options: {
  channelAccountId: string;
  channelUserRef: string;
  errorMessage: string;
}): Promise<void> {
  await InterestedLeadModel.updateOne(
    {
      channelAccountId: new mongoose.Types.ObjectId(options.channelAccountId),
      channelUserRef: options.channelUserRef,
    },
    {
      $set: {
        status: "ack_failed",
        acknowledgementError: options.errorMessage,
      },
    }
  ).exec();
}
