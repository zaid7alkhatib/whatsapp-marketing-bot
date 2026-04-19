import { Document, Schema, model } from "mongoose";
import { BOT_SESSION_STATUSES, BotSession } from "./bot-session.types";

export interface BotSessionDocument extends BotSession, Document {}

const botSessionSchema = new Schema<BotSessionDocument>(
  {
    orgUnitId: {
      type: Schema.Types.ObjectId,
      ref: "OrgUnit",
      default: null,
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
    businessPartnerId: {
      type: Schema.Types.ObjectId,
      ref: "BusinessPartner",
      default: null,
    },
    flowId: {
      type: Schema.Types.ObjectId,
      ref: "Flow",
      required: true,
    },
    flowVersion: {
      type: Number,
      required: true,
      min: 1,
    },
    statusCode: {
      type: String,
      enum: BOT_SESSION_STATUSES,
      required: true,
    },
    language: {
      type: String,
      required: true,
      trim: true,
    },
    channelUserRef: {
      type: String,
      required: true,
      trim: true,
    },
    currentStepCode: {
      type: String,
      trim: true,
      required: false,
    },
    startedAt: {
      type: Date,
      required: true,
    },
    endedAt: {
      type: Date,
      required: false,
      default: null,
    },
    lastActivityAt: {
      type: Date,
      required: true,
    },
    collectedData: {
      type: Schema.Types.Mixed,
      required: false,
    },
    contextSnapshot: {
      type: Schema.Types.Mixed,
      required: false,
    },
    metadata: {
      type: Schema.Types.Mixed,
      required: false,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

botSessionSchema.index({ channelAccountId: 1, channelUserRef: 1, statusCode: 1 });
botSessionSchema.index({ businessPartnerId: 1, startedAt: 1 });
botSessionSchema.index({ lastActivityAt: 1 });

export const BotSessionModel = model<BotSessionDocument>("BotSession", botSessionSchema);
