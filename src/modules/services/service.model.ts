import { Document, Schema, model } from "mongoose";
import { SERVICE_STATUSES, Service, ServiceConfig, ServiceName } from "./service.types";

export interface ServiceDocument extends Service, Document {}

const serviceNameSchema = new Schema<ServiceName>(
  {
    ar: { type: String, trim: true, required: false },
    en: { type: String, trim: true, required: false },
    de: { type: String, trim: true, required: false },
  },
  { _id: false }
);

const serviceConfigSchema = new Schema<ServiceConfig>(
  {
    requiresHumanReview: { type: Boolean, required: false },
    aiEnabled: { type: Boolean, required: false },
  },
  { _id: false }
);

const serviceSchema = new Schema<ServiceDocument>(
  {
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 1,
      maxlength: 100,
      unique: true,
    },
    category: {
      type: String,
      trim: true,
      required: false,
    },
    status: {
      type: String,
      enum: SERVICE_STATUSES,
      default: "active",
      required: true,
    },
    name: {
      type: serviceNameSchema,
      required: false,
    },
    config: {
      type: serviceConfigSchema,
      required: false,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

serviceSchema.index({ status: 1 });

export const ServiceModel = model<ServiceDocument>("Service", serviceSchema);
