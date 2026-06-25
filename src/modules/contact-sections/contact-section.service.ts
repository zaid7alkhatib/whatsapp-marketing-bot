import mongoose from "mongoose";
import {
  ContactSectionContactDocument,
  ContactSectionDocument,
  ContactSectionModel,
} from "./contact-section.model";
import { ContactSectionContact, ContactSectionContactBody } from "./contact-section.types";

export function normalizeContactPhone(value: unknown): {
  phoneNumber?: string;
  channelUserRef?: string;
  message?: string;
} {
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getOptionalString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalizedValue = value.trim();
  return normalizedValue ? normalizedValue.slice(0, maxLength) : undefined;
}

function getBoolean(value: unknown, defaultValue: boolean): boolean {
  return typeof value === "boolean" ? value : defaultValue;
}

function parseContactBody(value: unknown): ContactSectionContactBody | null {
  return isPlainObject(value) ? (value as ContactSectionContactBody) : null;
}

export function normalizeContactSectionContacts(value: unknown): {
  isValid: boolean;
  message?: string;
  contacts?: ContactSectionContact[];
} {
  if (!Array.isArray(value)) {
    return { isValid: false, message: "Field 'contacts' must be an array." };
  }

  if (value.length === 0) {
    return { isValid: false, message: "Import at least one contact." };
  }

  if (value.length > 5000) {
    return { isValid: false, message: "A contact section can include up to 5000 contacts." };
  }

  const seenRefs = new Set<string>();
  const contacts: ContactSectionContact[] = [];

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

export function recalculateContactSectionMetrics(section: ContactSectionDocument): void {
  const contacts = section.contacts ?? [];

  section.totalContacts = contacts.length;
  section.approvedContacts = contacts.filter((contact) => contact.approved).length;
  section.sentContacts = contacts.filter(
    (contact) => contact.lastDeliveryStatus === "sent"
  ).length;
  section.failedContacts = contacts.filter(
    (contact) => contact.lastDeliveryStatus === "failed"
  ).length;
  section.pendingContacts = contacts.filter(
    (contact) => contact.approved && contact.lastDeliveryStatus !== "sent"
  ).length;
}

export async function markSectionContactDelivery(options: {
  sectionId?: mongoose.Types.ObjectId | string;
  contactId?: mongoose.Types.ObjectId | string;
  campaignId: mongoose.Types.ObjectId | string;
  status: "sent" | "failed" | "cancelled";
  errorMessage?: string;
  sentAt?: Date;
}): Promise<void> {
  if (!options.sectionId || !options.contactId) {
    return;
  }

  if (!mongoose.isValidObjectId(options.sectionId) || !mongoose.isValidObjectId(options.contactId)) {
    return;
  }

  const section = await ContactSectionModel.findById(options.sectionId).exec();
  if (!section) {
    return;
  }

  const contact = section.contacts.id(String(options.contactId)) as
    | ContactSectionContactDocument
    | null;
  if (!contact) {
    return;
  }

  const now = new Date();
  contact.lastDeliveryStatus = options.status;
  contact.lastCampaignId = new mongoose.Types.ObjectId(options.campaignId);
  contact.lastAttemptAt = now;

  if (options.status === "sent") {
    contact.lastSentAt = options.sentAt ?? now;
    contact.sendCount += 1;
    contact.lastErrorMessage = undefined;
  } else {
    contact.lastErrorMessage = options.errorMessage;
  }

  recalculateContactSectionMetrics(section);
  await section.save();
}

