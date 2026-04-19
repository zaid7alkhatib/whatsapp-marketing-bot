import { Document, Schema, model } from "mongoose";
import {
  REQUEST_TYPE_STATUSES,
  RequestType,
  RequestTypeConfig,
  RequestTypeName,
} from "./request-type.types";

export interface RequestTypeDocument extends RequestType, Document {}

const requestTypeNameSchema = new Schema<RequestTypeName>(
  {
    ar: { type: String, trim: true, required: false },
    en: { type: String, trim: true, required: false },
    de: { type: String, trim: true, required: false },
  },
  { _id: false }
);

const requestTypeConfigSchema = new Schema<RequestTypeConfig>(
  {
    requiresHumanReview: { type: Boolean, required: false },
    aiTaskCodes: { type: [String], required: false },
    formDefinitionCode: { type: String, trim: true, required: false },
  },
  { _id: false }
);

const requestTypeSchema = new Schema<RequestTypeDocument>(
  {
    serviceId: {
      type: Schema.Types.ObjectId,
      ref: "Service",
      required: true,
    },
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 1,
      maxlength: 100,
      unique: true,
    },
    status: {
      type: String,
      enum: REQUEST_TYPE_STATUSES,
      default: "active",
      required: true,
    },
    name: {
      type: requestTypeNameSchema,
      required: false,
    },
    config: {
      type: requestTypeConfigSchema,
      required: false,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

requestTypeSchema.index({ serviceId: 1 });

export const RequestTypeModel = model<RequestTypeDocument>(
  "RequestType",
  requestTypeSchema
);
