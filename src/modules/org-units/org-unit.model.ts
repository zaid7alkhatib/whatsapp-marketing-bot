import { Document, Schema, model } from "mongoose";
import {
  ORG_UNIT_STATUSES,
  ORG_UNIT_TYPES,
  OrgUnit,
  OrgUnitContactInfo,
  OrgUnitSettings,
} from "./org-unit.types";

export interface OrgUnitDocument extends OrgUnit, Document {}

const localizedNameSchema = new Schema<OrgUnit["name"]>(
  {
    ar: { type: String, required: true, trim: true },
    en: { type: String, required: true, trim: true },
    de: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const contactInfoSchema = new Schema<OrgUnitContactInfo>(
  {
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    address: { type: String, trim: true },
  },
  { _id: false }
);

const settingsSchema = new Schema<OrgUnitSettings>(
  {
    registeredUsersOnly: { type: Boolean, default: false },
    insuranceQuarterValidation: { type: Boolean, default: false },
  },
  { _id: false }
);

const orgUnitSchema = new Schema<OrgUnitDocument>(
  {
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 50,
      unique: true,
    },
    type: {
      type: String,
      enum: ORG_UNIT_TYPES,
      required: true,
    },
    status: {
      type: String,
      enum: ORG_UNIT_STATUSES,
      default: "active",
      required: true,
    },
    name: {
      type: localizedNameSchema,
      required: true,
    },
    parentOrgUnitId: {
      type: Schema.Types.ObjectId,
      ref: "OrgUnit",
      default: null,
    },
    contactInfo: {
      type: contactInfoSchema,
      required: false,
    },
    settings: {
      type: settingsSchema,
      default: () => ({
        registeredUsersOnly: false,
        insuranceQuarterValidation: false,
      }),
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

orgUnitSchema.index({ type: 1, status: 1 });

export const OrgUnitModel = model<OrgUnitDocument>("OrgUnit", orgUnitSchema);
