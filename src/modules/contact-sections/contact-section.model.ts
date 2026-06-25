import { Document, Schema, Types, model } from "mongoose";
import {
  CONTACT_DELIVERY_STATUSES,
  ContactSection,
  ContactSectionContact,
} from "./contact-section.types";

export interface ContactSectionContactDocument
  extends ContactSectionContact,
    Types.Subdocument {
  _id: Types.ObjectId;
}

export interface ContactSectionDocument
  extends Omit<ContactSection, "contacts">,
    Document {
  contacts: Types.DocumentArray<ContactSectionContactDocument>;
  createdAt?: Date;
  updatedAt?: Date;
}

const contactSectionContactSchema = new Schema<ContactSectionContactDocument>(
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
    approved: {
      type: Boolean,
      required: true,
      default: true,
    },
    lastDeliveryStatus: {
      type: String,
      enum: CONTACT_DELIVERY_STATUSES,
      required: true,
      default: "ready",
    },
    lastCampaignId: {
      type: Schema.Types.ObjectId,
      ref: "OutreachCampaign",
      required: false,
    },
    lastAttemptAt: {
      type: Date,
      required: false,
    },
    lastSentAt: {
      type: Date,
      required: false,
    },
    lastErrorMessage: {
      type: String,
      trim: true,
      required: false,
      maxlength: 1000,
    },
    sendCount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
  },
  {
    _id: true,
    versionKey: false,
  }
);

const contactSectionSchema = new Schema<ContactSectionDocument>(
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
    description: {
      type: String,
      trim: true,
      required: false,
      maxlength: 500,
    },
    contacts: {
      type: [contactSectionContactSchema],
      required: true,
      default: [],
    },
    totalContacts: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    approvedContacts: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    pendingContacts: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    sentContacts: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    failedContacts: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
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

contactSectionSchema.index({ channelAccountId: 1, name: 1 }, { unique: true });
contactSectionSchema.index({ channelAccountId: 1, updatedAt: -1 });

export const ContactSectionModel = model<ContactSectionDocument>(
  "ContactSection",
  contactSectionSchema
);
