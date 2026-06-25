import { Types } from "mongoose";
import type { AuthRole } from "../auth/auth.types";

export const CONTACT_DELIVERY_STATUSES = [
  "ready",
  "sent",
  "failed",
  "cancelled",
] as const;

export type ContactDeliveryStatus = (typeof CONTACT_DELIVERY_STATUSES)[number];

export interface ContactSectionContact {
  phoneNumber: string;
  displayName?: string;
  channelUserRef: string;
  approved: boolean;
  lastDeliveryStatus: ContactDeliveryStatus;
  lastCampaignId?: Types.ObjectId;
  lastAttemptAt?: Date;
  lastSentAt?: Date;
  lastErrorMessage?: string;
  sendCount: number;
}

export interface ContactSection {
  channelAccountId: Types.ObjectId;
  name: string;
  description?: string;
  contacts: ContactSectionContact[];
  totalContacts: number;
  approvedContacts: number;
  pendingContacts: number;
  sentContacts: number;
  failedContacts: number;
  createdBy?: {
    username: string;
    role: AuthRole;
  };
}

export interface ContactSectionContactBody {
  phoneNumber?: unknown;
  displayName?: unknown;
  approved?: unknown;
}

export interface CreateContactSectionBody {
  channelAccountId?: unknown;
  name?: unknown;
  description?: unknown;
  contacts?: unknown;
}

export interface UpdateContactSectionBody {
  name?: unknown;
  description?: unknown;
  contacts?: unknown;
}

