import { Types } from "mongoose";

export const CHANNEL_ACCOUNT_STATUSES = [
  "pending",
  "connected",
  "disconnected",
  "blocked",
] as const;
export type ChannelAccountStatus = (typeof CHANNEL_ACCOUNT_STATUSES)[number];

export interface ChannelAccount {
  channelId: Types.ObjectId;
  orgUnitId?: Types.ObjectId | null;
  code: string;
  displayName: string;
  phoneNumber?: string;
  status: ChannelAccountStatus;
  providerConfig: Record<string, unknown>;
  lastConnectedAt?: Date | null;
  lastDisconnectedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface CreateChannelAccountBody {
  channelId?: unknown;
  orgUnitId?: unknown;
  code?: unknown;
  displayName?: unknown;
  phoneNumber?: unknown;
  status?: unknown;
  providerConfig?: unknown;
  lastConnectedAt?: unknown;
  lastDisconnectedAt?: unknown;
}
