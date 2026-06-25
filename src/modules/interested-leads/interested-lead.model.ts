import { Document, Schema, model } from "mongoose";
import {
  INTERESTED_LEAD_STATUSES,
  InterestedLead,
} from "./interested-lead.types";

export interface InterestedLeadDocument extends InterestedLead, Document {}

const interestedLeadSchema = new Schema<InterestedLeadDocument>(
  {
    channelAccountId: {
      type: Schema.Types.ObjectId,
      ref: "ChannelAccount",
      required: true,
      index: true,
    },
    channelUserRef: {
      type: String,
      required: true,
      trim: true,
    },
    phoneNumber: {
      type: String,
      required: true,
      trim: true,
    },
    displayName: {
      type: String,
      trim: true,
      required: false,
    },
    lastMessage: {
      type: String,
      required: true,
      trim: true,
      maxlength: 4000,
    },
    trigger: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    status: {
      type: String,
      enum: INTERESTED_LEAD_STATUSES,
      required: true,
      default: "new",
      index: true,
    },
    acknowledgementMessage: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    acknowledgementSentAt: {
      type: Date,
      required: false,
    },
    acknowledgementError: {
      type: String,
      trim: true,
      required: false,
      maxlength: 1000,
    },
    firstInterestedAt: {
      type: Date,
      required: true,
    },
    lastInterestedAt: {
      type: Date,
      required: true,
      index: true,
    },
    messageCount: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

interestedLeadSchema.index({ channelAccountId: 1, channelUserRef: 1 }, { unique: true });
interestedLeadSchema.index({ channelAccountId: 1, lastInterestedAt: -1 });

export const InterestedLeadModel = model<InterestedLeadDocument>(
  "InterestedLead",
  interestedLeadSchema
);

