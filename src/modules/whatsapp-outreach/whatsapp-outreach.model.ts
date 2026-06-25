import { Document, Schema, model } from "mongoose";
import {
  OUTREACH_CAMPAIGN_STATUSES,
  OUTREACH_CONSENT_STATUSES,
  OUTREACH_RECIPIENT_STATUSES,
  OutreachCampaign,
  OutreachCampaignRecipient,
} from "./whatsapp-outreach.types";

export interface OutreachCampaignRecipientDocument
  extends OutreachCampaignRecipient,
    Document {}

export interface OutreachCampaignDocument extends OutreachCampaign, Document {}

const outreachCampaignRecipientSchema = new Schema<OutreachCampaignRecipientDocument>(
  {
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
    channelUserRef: {
      type: String,
      required: true,
      trim: true,
    },
    contactSectionId: {
      type: Schema.Types.ObjectId,
      ref: "ContactSection",
      required: false,
    },
    contactId: {
      type: Schema.Types.ObjectId,
      required: false,
    },
    personalizedMessage: {
      type: String,
      trim: true,
      required: false,
      maxlength: 4200,
    },
    consentStatus: {
      type: String,
      enum: OUTREACH_CONSENT_STATUSES,
      required: true,
    },
    status: {
      type: String,
      enum: OUTREACH_RECIPIENT_STATUSES,
      required: true,
      default: "queued",
    },
    skippedReason: {
      type: String,
      trim: true,
      required: false,
    },
    errorMessage: {
      type: String,
      trim: true,
      required: false,
    },
    sentAt: {
      type: Date,
      required: false,
    },
  },
  {
    _id: true,
    versionKey: false,
  }
);

const outreachCampaignSchema = new Schema<OutreachCampaignDocument>(
  {
    channelAccountId: {
      type: Schema.Types.ObjectId,
      ref: "ChannelAccount",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 160,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 4000,
    },
    messageWithOptOut: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 4200,
    },
    personalizationTemplate: {
      englishGreeting: {
        type: String,
        trim: true,
        required: false,
        maxlength: 300,
      },
      arabicGreeting: {
        type: String,
        trim: true,
        required: false,
        maxlength: 300,
      },
      englishResponseInstruction: {
        type: String,
        trim: true,
        required: false,
        maxlength: 500,
      },
      arabicResponseInstruction: {
        type: String,
        trim: true,
        required: false,
        maxlength: 500,
      },
    },
    interestTriggers: {
      type: [String],
      required: false,
      default: undefined,
      validate: {
        validator(value: string[] | undefined): boolean {
          return !Array.isArray(value) || value.length <= 30;
        },
        message: "A campaign can include up to 30 interested reply triggers.",
      },
    },
    status: {
      type: String,
      enum: OUTREACH_CAMPAIGN_STATUSES,
      required: true,
      default: "queued",
      index: true,
    },
    recipients: {
      type: [outreachCampaignRecipientSchema],
      required: true,
      default: [],
    },
    totalRecipients: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    eligibleRecipients: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    sentCount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    failedCount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    skippedCount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    consentConfirmed: {
      type: Boolean,
      required: true,
      default: false,
    },
    createdBy: {
      username: {
        type: String,
        trim: true,
        required: false,
      },
      role: {
        type: String,
        trim: true,
        required: false,
      },
    },
    errorMessage: {
      type: String,
      trim: true,
      required: false,
    },
    startedAt: {
      type: Date,
      required: false,
    },
    completedAt: {
      type: Date,
      required: false,
    },
    cancelledAt: {
      type: Date,
      required: false,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

outreachCampaignSchema.index({ channelAccountId: 1, createdAt: -1 });
outreachCampaignSchema.index({ status: 1, createdAt: -1 });

export const OutreachCampaignModel = model<OutreachCampaignDocument>(
  "OutreachCampaign",
  outreachCampaignSchema
);
