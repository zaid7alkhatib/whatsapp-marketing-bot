import { Types } from "mongoose";

export const FLOW_STEP_TYPES = [
  "message",
  "choice",
  "input_text",
  "input_number",
  "input_date",
  "input_phone",
  "multi_field_form",
  "condition",
  "api_action",
  "ai_extract",
  "handoff",
  "end",
] as const;
export type FlowStepType = (typeof FLOW_STEP_TYPES)[number];

export const FLOW_STEP_STATUSES = ["active", "inactive"] as const;
export type FlowStepStatus = (typeof FLOW_STEP_STATUSES)[number];

export interface FlowStepConfig {
  dataKey?: string;
  [key: string]: unknown;
}

export interface FlowStep {
  flowId: Types.ObjectId;
  code: string;
  type: FlowStepType;
  sequence: number;
  status: FlowStepStatus;
  contentKey?: string;
  stepConfig?: FlowStepConfig;
  validationConfig?: Record<string, unknown>;
  transitionConfig?: unknown[];
  aiConfig?: Record<string, unknown>;
  actionConfig?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface CreateFlowStepBody {
  flowId?: unknown;
  code?: unknown;
  type?: unknown;
  sequence?: unknown;
  status?: unknown;
  contentKey?: unknown;
  stepConfig?: unknown;
  validationConfig?: unknown;
  transitionConfig?: unknown;
  aiConfig?: unknown;
  actionConfig?: unknown;
  metadata?: unknown;
}
