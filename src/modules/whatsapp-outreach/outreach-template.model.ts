import { Document, Schema, Types, model } from "mongoose";
import { MarketingMessageTemplate } from "./message-personalization";

export interface OutreachTemplate {
  channelAccountId: Types.ObjectId;
  name: string;
  personalizationTemplate: MarketingMessageTemplate;
  interestTriggers: string[];
  createdBy?: {
    username: string;
    role: string;
  };
}

export interface OutreachTemplateDocument extends OutreachTemplate, Document {
  createdAt?: Date;
  updatedAt?: Date;
}

const personalizationTemplateSchema = new Schema<MarketingMessageTemplate>(
  {
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
  {
    _id: false,
    versionKey: false,
  }
);

const outreachTemplateSchema = new Schema<OutreachTemplateDocument>(
  {
    channelAccountId: {
      type: Schema.Types.ObjectId,
      ref: "ChannelAccount",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 120,
    },
    personalizationTemplate: {
      type: personalizationTemplateSchema,
      required: true,
    },
    interestTriggers: {
      type: [String],
      required: true,
      default: [],
      validate: {
        validator(value: string[]): boolean {
          return Array.isArray(value) && value.length <= 30;
        },
        message: "A template can include up to 30 interested reply triggers.",
      },
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
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

outreachTemplateSchema.index({ channelAccountId: 1, name: 1 }, { unique: true });
outreachTemplateSchema.index({ channelAccountId: 1, updatedAt: -1 });

export const OutreachTemplateModel = model<OutreachTemplateDocument>(
  "OutreachTemplate",
  outreachTemplateSchema
);
