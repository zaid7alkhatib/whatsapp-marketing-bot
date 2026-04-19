import { Types } from "mongoose";

export interface SessionStepResponse {
  sessionId: Types.ObjectId;
  flowId: Types.ObjectId;
  flowVersion: number;
  stepCode: string;
  stepType: string;
  inputType?: string;
  rawInput?: unknown;
  normalizedValue?: unknown;
  structuredData?: Record<string, unknown>;
  validationResult?: Record<string, unknown>;
  aiExecutionId?: Types.ObjectId;
  createdAt: Date;
}

export interface CreateSessionStepResponseBody {
  sessionId?: unknown;
  flowId?: unknown;
  flowVersion?: unknown;
  stepCode?: unknown;
  stepType?: unknown;
  inputType?: unknown;
  rawInput?: unknown;
  normalizedValue?: unknown;
  structuredData?: unknown;
  validationResult?: unknown;
  aiExecutionId?: unknown;
  createdAt?: unknown;
}
