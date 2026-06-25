import { Types } from "mongoose";
import type { AuthRole } from "../auth/auth.types";
import type { MarketingMessageTemplate } from "./message-personalization";

export const OUTREACH_CONSENT_STATUSES = [
  "opted_in",
  "not_confirmed",
  "opted_out",
] as const;
export type OutreachConsentStatus = (typeof OUTREACH_CONSENT_STATUSES)[number];

export const OUTREACH_RECIPIENT_STATUSES = [
  "queued",
  "sending",
  "sent",
  "failed",
  "skipped",
  "cancelled",
] as const;
export type OutreachRecipientStatus = (typeof OUTREACH_RECIPIENT_STATUSES)[number];

export const OUTREACH_CAMPAIGN_STATUSES = [
  "queued",
  "sending",
  "completed",
  "completed_with_errors",
  "failed",
  "cancelled",
] as const;
export type OutreachCampaignStatus = (typeof OUTREACH_CAMPAIGN_STATUSES)[number];

export interface OutreachCampaignRecipient {
  phoneNumber: string;
  displayName?: string;
  channelUserRef: string;
  contactSectionId?: Types.ObjectId;
  contactId?: Types.ObjectId;
  personalizedMessage?: string;
  consentStatus: OutreachConsentStatus;
  status: OutreachRecipientStatus;
  skippedReason?: string;
  errorMessage?: string;
  sentAt?: Date;
}

export interface OutreachCampaign {
  channelAccountId: Types.ObjectId;
  title: string;
  message: string;
  messageWithOptOut: string;
  personalizationTemplate?: MarketingMessageTemplate;
  interestTriggers?: string[];
  status: OutreachCampaignStatus;
  recipients: OutreachCampaignRecipient[];
  totalRecipients: number;
  eligibleRecipients: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  consentConfirmed: boolean;
  createdBy?: {
    username: string;
    role: AuthRole;
  };
  errorMessage?: string;
  startedAt?: Date;
  completedAt?: Date;
  cancelledAt?: Date;
}

export interface CreateOutreachCampaignBody {
  channelAccountId?: unknown;
  title?: unknown;
  message?: unknown;
  personalizationTemplate?: unknown;
  interestTriggers?: unknown;
  consentConfirmed?: unknown;
  recipients?: unknown;
}

export interface CreateOutreachRecipientBody {
  phoneNumber?: unknown;
  displayName?: unknown;
  contactSectionId?: unknown;
  contactId?: unknown;
  consentStatus?: unknown;
  selected?: unknown;
}
