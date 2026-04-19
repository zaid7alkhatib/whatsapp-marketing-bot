import { Types } from "mongoose";

export const MESSAGE_DIRECTIONS = ["inbound", "outbound"] as const;
export type MessageDirection = (typeof MESSAGE_DIRECTIONS)[number];

export const MESSAGE_ACTOR_TYPES = ["customer", "bot", "staff", "system"] as const;
export type MessageActorType = (typeof MESSAGE_ACTOR_TYPES)[number];

export const MESSAGE_TYPES = [
  "text",
  "image",
  "audio",
  "video",
  "document",
  "location",
  "contact",
  "button_reply",
  "list_reply",
  "interactive_reply",
] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];

export interface Message {
  sessionId: Types.ObjectId;
  channelId: Types.ObjectId;
  channelAccountId: Types.ObjectId;
  direction: MessageDirection;
  actorType: MessageActorType;
  actorId?: string;
  messageType: MessageType;
  externalMessageId?: string;
  content: Record<string, unknown>;
  normalizedContent?: Record<string, unknown>;
  deliveryStatus?: string;
  providerPayload?: Record<string, unknown>;
  sentAt?: Date;
  receivedAt?: Date;
  createdAt: Date;
}

export interface CreateMessageBody {
  sessionId?: unknown;
  channelId?: unknown;
  channelAccountId?: unknown;
  direction?: unknown;
  actorType?: unknown;
  actorId?: unknown;
  messageType?: unknown;
  externalMessageId?: unknown;
  content?: unknown;
  normalizedContent?: unknown;
  deliveryStatus?: unknown;
  providerPayload?: unknown;
  sentAt?: unknown;
  receivedAt?: unknown;
  createdAt?: unknown;
}
