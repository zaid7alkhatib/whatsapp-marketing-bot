import { Document, Schema, model } from "mongoose";
import {
  BUSINESS_PARTNER_STATUSES,
  BUSINESS_PARTNER_SUBTYPES,
  BUSINESS_PARTNER_TYPES,
  BusinessPartner,
  BusinessPartnerContactInfo,
  BusinessPartnerIdentifiers,
  BusinessPartnerNames,
  BusinessPartnerPersonalInfo,
} from "./business-partner.types";

export interface BusinessPartnerDocument extends BusinessPartner, Document {}

const namesSchema = new Schema<BusinessPartnerNames>(
  {
    fullName: { type: String, required: true, trim: true, minlength: 1, maxlength: 200 },
    firstName: { type: String, trim: true, maxlength: 100 },
    lastName: { type: String, trim: true, maxlength: 100 },
  },
  { _id: false }
);

const personalInfoSchema = new Schema<BusinessPartnerPersonalInfo>(
  {
    dateOfBirth: { type: Date, required: false },
    gender: { type: String, trim: true, required: false },
  },
  { _id: false }
);

const contactInfoSchema = new Schema<BusinessPartnerContactInfo>(
  {
    phone: { type: String, trim: true, required: false },
    email: { type: String, trim: true, lowercase: true, required: false },
  },
  { _id: false }
);

const identifiersSchema = new Schema<BusinessPartnerIdentifiers>(
  {
    externalRef: { type: String, trim: true, required: false },
    insuranceNumber: { type: String, trim: true, required: false },
    patientNumber: { type: String, trim: true, required: false },
  },
  { _id: false }
);

const businessPartnerSchema = new Schema<BusinessPartnerDocument>(
  {
    type: {
      type: String,
      enum: BUSINESS_PARTNER_TYPES,
      required: true,
    },
    subtype: {
      type: String,
      enum: BUSINESS_PARTNER_SUBTYPES,
      required: true,
    },
    status: {
      type: String,
      enum: BUSINESS_PARTNER_STATUSES,
      default: "active",
      required: true,
    },
    names: {
      type: namesSchema,
      required: true,
    },
    personalInfo: {
      type: personalInfoSchema,
      required: false,
    },
    contactInfo: {
      type: contactInfoSchema,
      required: false,
    },
    preferredLanguage: {
      type: String,
      trim: true,
      required: false,
    },
    identifiers: {
      type: identifiersSchema,
      required: false,
    },
    tags: {
      type: [String],
      default: undefined,
      required: false,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

businessPartnerSchema.index({ "contactInfo.phone": 1 });
businessPartnerSchema.index({ "contactInfo.email": 1 });
businessPartnerSchema.index({ "identifiers.patientNumber": 1 }, { sparse: true });
businessPartnerSchema.index({ type: 1, subtype: 1, status: 1 });

export const BusinessPartnerModel = model<BusinessPartnerDocument>(
  "BusinessPartner",
  businessPartnerSchema
);
