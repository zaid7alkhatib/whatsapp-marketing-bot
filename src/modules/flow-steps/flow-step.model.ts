import { Document, Schema, model } from "mongoose";
import { FLOW_STEP_STATUSES, FLOW_STEP_TYPES, FlowStep } from "./flow-step.types";

export interface FlowStepDocument extends FlowStep, Document {}

const flowStepSchema = new Schema<FlowStepDocument>(
  {
    flowId: {
      type: Schema.Types.ObjectId,
      ref: "Flow",
      required: true,
    },
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 1,
      maxlength: 100,
    },
    type: {
      type: String,
      enum: FLOW_STEP_TYPES,
      required: true,
    },
    sequence: {
      type: Number,
      required: true,
      min: 1,
    },
    status: {
      type: String,
      enum: FLOW_STEP_STATUSES,
      required: true,
    },
    contentKey: {
      type: String,
      trim: true,
      required: false,
    },
    stepConfig: {
      type: Schema.Types.Mixed,
      required: false,
    },
    validationConfig: {
      type: Schema.Types.Mixed,
      required: false,
    },
    transitionConfig: {
      type: [Schema.Types.Mixed],
      required: false,
    },
    aiConfig: {
      type: Schema.Types.Mixed,
      required: false,
    },
    actionConfig: {
      type: Schema.Types.Mixed,
      required: false,
    },
    metadata: {
      type: Schema.Types.Mixed,
      required: false,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

flowStepSchema.index({ flowId: 1, code: 1 }, { unique: true });
flowStepSchema.index({ flowId: 1, sequence: 1 });

export const FlowStepModel = model<FlowStepDocument>("FlowStep", flowStepSchema);
