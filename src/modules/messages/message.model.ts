import { Document, Schema, model } from "mongoose";
import {
  MESSAGE_ACTOR_TYPES,
  MESSAGE_DIRECTIONS,
  MESSAGE_TYPES,
  Message,
} from "./message.types";

export interface MessageDocument extends Message, Document {}

const messageSchema = new Schema<MessageDocument>(
  {
    sessionId: {
      type: Schema.Types.ObjectId,
      ref: "BotSession",
      required: true,
    },
    channelId: {
      type: Schema.Types.ObjectId,
      ref: "Channel",
      required: true,
    },
    channelAccountId: {
      type: Schema.Types.ObjectId,
      ref: "ChannelAccount",
      required: true,
    },
    direction: {
      type: String,
      enum: MESSAGE_DIRECTIONS,
      required: true,
    },
    actorType: {
      type: String,
      enum: MESSAGE_ACTOR_TYPES,
      required: true,
    },
    actorId: {
      type: String,
      trim: true,
      required: false,
    },
    messageType: {
      type: String,
      enum: MESSAGE_TYPES,
      required: true,
    },
    externalMessageId: {
      type: String,
      trim: true,
      required: false,
    },
    content: {
      type: Schema.Types.Mixed,
      required: true,
    },
    normalizedContent: {
      type: Schema.Types.Mixed,
      required: false,
    },
    deliveryStatus: {
      type: String,
      trim: true,
      required: false,
    },
    providerPayload: {
      type: Schema.Types.Mixed,
      required: false,
    },
    sentAt: {
      type: Date,
      required: false,
    },
    receivedAt: {
      type: Date,
      required: false,
    },
    createdAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  {
    versionKey: false,
  }
);

messageSchema.index({ sessionId: 1, createdAt: 1 });
messageSchema.index({ externalMessageId: 1 });

export const MessageModel = model<MessageDocument>("Message", messageSchema);
