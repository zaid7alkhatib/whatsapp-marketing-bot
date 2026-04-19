import { Document, Schema, model } from "mongoose";
import { FLOW_STATUSES, Flow, FlowAppliesTo, FlowSettings } from "./flow.types";

export interface FlowDocument extends Flow, Document {}

const flowAppliesToSchema = new Schema<FlowAppliesTo>(
  {
    channelCodes: { type: [String], required: false },
    orgUnitTypes: { type: [String], required: false },
  },
  { _id: false }
);

const flowSettingsSchema = new Schema<FlowSettings>(
  {
    allowResume: { type: Boolean, required: false },
    sessionTimeoutMinutes: { type: Number, required: false },
    createServiceRequestOnCompletion: { type: Boolean, required: false },
    serviceId: { type: Schema.Types.ObjectId, ref: "Service", required: false },
    requestTypeId: { type: Schema.Types.ObjectId, ref: "RequestType", required: false },
  },
  { _id: false }
);

const flowSchema = new Schema<FlowDocument>(
  {
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 1,
      maxlength: 100,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 200,
    },
    version: {
      type: Number,
      required: true,
      min: 1,
    },
    status: {
      type: String,
      enum: FLOW_STATUSES,
      required: true,
    },
    startStepCode: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 100,
    },
    appliesTo: {
      type: flowAppliesToSchema,
      required: false,
    },
    settings: {
      type: flowSettingsSchema,
      required: false,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

flowSchema.index({ code: 1, version: 1 }, { unique: true });
flowSchema.index({ status: 1 });

export const FlowModel = model<FlowDocument>("Flow", flowSchema);
