import { Document, Schema, model } from "mongoose";
import {
  CHANNEL_ACCOUNT_STATUSES,
  ChannelAccount,
} from "./channel-account.types";

export interface ChannelAccountDocument extends ChannelAccount, Document {}

const channelAccountSchema = new Schema<ChannelAccountDocument>(
  {
    channelId: {
      type: Schema.Types.ObjectId,
      ref: "Channel",
      required: true,
    },
    orgUnitId: {
      type: Schema.Types.ObjectId,
      ref: "OrgUnit",
      default: null,
    },
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 100,
      unique: true,
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 150,
    },
    phoneNumber: {
      type: String,
      trim: true,
      required: false,
    },
    status: {
      type: String,
      enum: CHANNEL_ACCOUNT_STATUSES,
      default: "pending",
      required: true,
    },
    providerConfig: {
      type: Schema.Types.Mixed,
      default: {},
      required: true,
    },
    lastConnectedAt: {
      type: Date,
      default: null,
    },
    lastDisconnectedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

channelAccountSchema.index({ channelId: 1, status: 1 });

export const ChannelAccountModel = model<ChannelAccountDocument>(
  "ChannelAccount",
  channelAccountSchema
);
