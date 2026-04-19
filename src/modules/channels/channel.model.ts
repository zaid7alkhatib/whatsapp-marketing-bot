import { Document, Schema, model } from "mongoose";
import {
  CHANNEL_CODES,
  CHANNEL_PROVIDERS,
  CHANNEL_STATUSES,
  Channel,
  ChannelCapabilities,
} from "./channel.types";

export interface ChannelDocument extends Channel, Document {}

const channelCapabilitiesSchema = new Schema<ChannelCapabilities>(
  {
    text: { type: Boolean, default: false },
    image: { type: Boolean, default: false },
    document: { type: Boolean, default: false },
    audio: { type: Boolean, default: false },
    buttons: { type: Boolean, default: false },
    lists: { type: Boolean, default: false },
  },
  { _id: false }
);

const channelSchema = new Schema<ChannelDocument>(
  {
    code: {
      type: String,
      enum: CHANNEL_CODES,
      required: true,
      lowercase: true,
      trim: true,
      unique: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },
    provider: {
      type: String,
      enum: CHANNEL_PROVIDERS,
      required: true,
    },
    status: {
      type: String,
      enum: CHANNEL_STATUSES,
      default: "active",
      required: true,
    },
    capabilities: {
      type: channelCapabilitiesSchema,
      default: () => ({
        text: false,
        image: false,
        document: false,
        audio: false,
        buttons: false,
        lists: false,
      }),
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

channelSchema.index({ provider: 1, status: 1 });

export const ChannelModel = model<ChannelDocument>("Channel", channelSchema);
