import { Types } from "mongoose";

export const BOT_SESSION_STATUSES = [
  "active",
  "paused",
  "completed",
  "cancelled",
  "expired",
] as const;
export type BotSessionStatus = (typeof BOT_SESSION_STATUSES)[number];

export interface BotSession {
  orgUnitId?: Types.ObjectId | null;
  channelId: Types.ObjectId;
  channelAccountId: Types.ObjectId;
  businessPartnerId?: Types.ObjectId | null;
  flowId: Types.ObjectId;
  flowVersion: number;
  statusCode: BotSessionStatus;
  language: string;
  channelUserRef: string;
  currentStepCode?: string;
  startedAt: Date;
  endedAt?: Date | null;
  lastActivityAt: Date;
  collectedData?: Record<string, unknown>;
  contextSnapshot?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface CreateBotSessionBody {
  orgUnitId?: unknown;
  channelId?: unknown;
  channelAccountId?: unknown;
  businessPartnerId?: unknown;
  flowId?: unknown;
  flowVersion?: unknown;
  statusCode?: unknown;
  language?: unknown;
  channelUserRef?: unknown;
  currentStepCode?: unknown;
  startedAt?: unknown;
  endedAt?: unknown;
  lastActivityAt?: unknown;
  collectedData?: unknown;
  contextSnapshot?: unknown;
  metadata?: unknown;
}
