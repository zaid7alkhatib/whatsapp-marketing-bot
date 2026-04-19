import { Document, Schema, model } from "mongoose";
import {
  LocalizedNameSnapshot,
  ServiceRequest,
  ServiceRequestEntitySnapshot,
  ServiceRequestSnapshots,
} from "./service-request.types";

export interface ServiceRequestDocument extends ServiceRequest, Document {}

const localizedNameSnapshotSchema = new Schema<LocalizedNameSnapshot>(
  {
    ar: { type: String, trim: true, required: false },
    en: { type: String, trim: true, required: false },
    de: { type: String, trim: true, required: false },
  },
  { _id: false }
);

const serviceRequestEntitySnapshotSchema = new Schema<ServiceRequestEntitySnapshot>(
  {
    code: { type: String, trim: true, required: true },
    name: { type: localizedNameSnapshotSchema, required: false },
  },
  { _id: false }
);

const serviceRequestSnapshotsSchema = new Schema<ServiceRequestSnapshots>(
  {
    service: { type: serviceRequestEntitySnapshotSchema, required: false },
    requestType: { type: serviceRequestEntitySnapshotSchema, required: false },
    orgUnit: { type: serviceRequestEntitySnapshotSchema, required: false },
  },
  { _id: false }
);

const serviceRequestSchema = new Schema<ServiceRequestDocument>(
  {
    orgUnitId: {
      type: Schema.Types.ObjectId,
      ref: "OrgUnit",
      default: null,
    },
    businessPartnerId: {
      type: Schema.Types.ObjectId,
      ref: "BusinessPartner",
      default: null,
    },
    sessionId: {
      type: Schema.Types.ObjectId,
      ref: "BotSession",
      default: null,
    },
    serviceId: {
      type: Schema.Types.ObjectId,
      ref: "Service",
      required: true,
    },
    requestTypeId: {
      type: Schema.Types.ObjectId,
      ref: "RequestType",
      required: true,
    },
    statusCode: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 100,
    },
    priorityCode: {
      type: String,
      trim: true,
      required: false,
    },
    sourceChannelCode: {
      type: String,
      trim: true,
      required: false,
    },
    language: {
      type: String,
      trim: true,
      required: false,
    },
    submittedAt: {
      type: Date,
      required: true,
    },
    assignedToUserId: {
      type: Schema.Types.ObjectId,
      required: false,
      default: null,
    },
    requestData: {
      type: Schema.Types.Mixed,
      required: true,
    },
    aiSummary: {
      type: Schema.Types.Mixed,
      required: false,
    },
    snapshots: {
      type: serviceRequestSnapshotsSchema,
      required: false,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

serviceRequestSchema.index({ statusCode: 1, createdAt: 1 });
serviceRequestSchema.index({ orgUnitId: 1, statusCode: 1 });
serviceRequestSchema.index({ requestTypeId: 1, createdAt: 1 });
serviceRequestSchema.index({ businessPartnerId: 1, createdAt: 1 });

export const ServiceRequestModel = model<ServiceRequestDocument>(
  "ServiceRequest",
  serviceRequestSchema
);
