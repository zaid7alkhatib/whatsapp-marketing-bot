import { Types } from "mongoose";

export const INTERESTED_LEAD_STATUSES = [
  "new",
  "acknowledged",
  "ack_failed",
] as const;

export type InterestedLeadStatus = (typeof INTERESTED_LEAD_STATUSES)[number];

export interface InterestedLead {
  channelAccountId: Types.ObjectId;
  channelUserRef: string;
  phoneNumber: string;
  displayName?: string;
  lastMessage: string;
  trigger: string;
  status: InterestedLeadStatus;
  acknowledgementMessage: string;
  acknowledgementSentAt?: Date;
  acknowledgementError?: string;
  firstInterestedAt: Date;
  lastInterestedAt: Date;
  messageCount: number;
}

