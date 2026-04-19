import { Document, Schema, model } from "mongoose";
import { SessionStepResponse } from "./session-step-response.types";

export interface SessionStepResponseDocument extends SessionStepResponse, Document {}

const sessionStepResponseSchema = new Schema<SessionStepResponseDocument>(
  {
    sessionId: {
      type: Schema.Types.ObjectId,
      ref: "BotSession",
      required: true,
    },
    flowId: {
      type: Schema.Types.ObjectId,
      ref: "Flow",
      required: true,
    },
    flowVersion: {
      type: Number,
      required: true,
      min: 1,
    },
    stepCode: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 100,
    },
    stepType: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 100,
    },
    inputType: {
      type: String,
      required: false,
      trim: true,
    },
    rawInput: {
      type: Schema.Types.Mixed,
      required: false,
    },
    normalizedValue: {
      type: Schema.Types.Mixed,
      required: false,
    },
    structuredData: {
      type: Schema.Types.Mixed,
      required: false,
    },
    validationResult: {
      type: Schema.Types.Mixed,
      required: false,
    },
    aiExecutionId: {
      type: Schema.Types.ObjectId,
      required: false,
    },
    createdAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  {
    versionKey: false,
  }
);

sessionStepResponseSchema.index({ sessionId: 1, createdAt: 1 });
sessionStepResponseSchema.index({ sessionId: 1, stepCode: 1 });

export const SessionStepResponseModel = model<SessionStepResponseDocument>(
  "SessionStepResponse",
  sessionStepResponseSchema
);
