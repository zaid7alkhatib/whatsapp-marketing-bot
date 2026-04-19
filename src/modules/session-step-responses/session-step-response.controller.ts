import { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import { BotSessionModel } from "../bot-sessions/bot-session.model";
import { FlowModel } from "../flows/flow.model";
import { SessionStepResponseModel } from "./session-step-response.model";
import { CreateSessionStepResponseBody } from "./session-step-response.types";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function parseDateField(
  value: unknown,
  fieldName: string,
  required: boolean
): { isValid: boolean; date?: Date; message?: string } {
  if (value === undefined || value === null) {
    if (required) {
      return { isValid: false, message: `Field '${fieldName}' is required and must be a valid date.` };
    }
    return { isValid: true };
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return { isValid: true, date: value };
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return { isValid: true, date: parsed };
    }
  }

  return { isValid: false, message: `Field '${fieldName}' must be a valid date.` };
}

function parseCreateBody(body: CreateSessionStepResponseBody): {
  isValid: boolean;
  message?: string;
  data?: {
    sessionId: mongoose.Types.ObjectId;
    flowId: mongoose.Types.ObjectId;
    flowVersion: number;
    stepCode: string;
    stepType: string;
    inputType?: string;
    rawInput?: unknown;
    normalizedValue?: unknown;
    structuredData?: Record<string, unknown>;
    validationResult?: Record<string, unknown>;
    aiExecutionId?: mongoose.Types.ObjectId;
    createdAt: Date;
  };
} {
  if (!isNonEmptyString(body.sessionId) || !mongoose.isValidObjectId(body.sessionId)) {
    return { isValid: false, message: "Field 'sessionId' must be a valid ObjectId." };
  }

  if (!isNonEmptyString(body.flowId) || !mongoose.isValidObjectId(body.flowId)) {
    return { isValid: false, message: "Field 'flowId' must be a valid ObjectId." };
  }

  if (!isPositiveNumber(body.flowVersion)) {
    return { isValid: false, message: "Field 'flowVersion' must be a positive number." };
  }

  if (!isNonEmptyString(body.stepCode)) {
    return { isValid: false, message: "Field 'stepCode' is required." };
  }

  if (!isNonEmptyString(body.stepType)) {
    return { isValid: false, message: "Field 'stepType' is required." };
  }

  if (body.inputType !== undefined && !isNonEmptyString(body.inputType)) {
    return { isValid: false, message: "Field 'inputType' must be a non-empty string." };
  }

  if (body.structuredData !== undefined && !isPlainObject(body.structuredData)) {
    return { isValid: false, message: "Field 'structuredData' must be an object." };
  }

  if (body.validationResult !== undefined && !isPlainObject(body.validationResult)) {
    return { isValid: false, message: "Field 'validationResult' must be an object." };
  }

  if (body.aiExecutionId !== undefined) {
    if (!isNonEmptyString(body.aiExecutionId) || !mongoose.isValidObjectId(body.aiExecutionId)) {
      return { isValid: false, message: "Field 'aiExecutionId' must be a valid ObjectId." };
    }
  }

  const createdAtResult = parseDateField(body.createdAt, "createdAt", true);
  if (!createdAtResult.isValid || !createdAtResult.date) {
    return { isValid: false, message: createdAtResult.message };
  }

  return {
    isValid: true,
    data: {
      sessionId: new mongoose.Types.ObjectId(body.sessionId),
      flowId: new mongoose.Types.ObjectId(body.flowId),
      flowVersion: body.flowVersion,
      stepCode: body.stepCode.trim(),
      stepType: body.stepType.trim(),
      inputType: body.inputType?.trim(),
      rawInput: body.rawInput,
      normalizedValue: body.normalizedValue,
      structuredData: body.structuredData as Record<string, unknown> | undefined,
      validationResult: body.validationResult as Record<string, unknown> | undefined,
      aiExecutionId: body.aiExecutionId ? new mongoose.Types.ObjectId(body.aiExecutionId) : undefined,
      createdAt: createdAtResult.date,
    },
  };
}

export async function getSessionStepResponses(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const responses = await SessionStepResponseModel.find().sort({ createdAt: -1 }).lean();

    res.status(200).json({
      success: true,
      data: responses,
    });
  } catch (error) {
    next(error);
  }
}

export async function getSessionStepResponseById(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({
        success: false,
        message: "Invalid session step response id.",
      });
      return;
    }

    const response = await SessionStepResponseModel.findById(id).lean();
    if (!response) {
      res.status(404).json({
        success: false,
        message: "Session step response not found.",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: response,
    });
  } catch (error) {
    next(error);
  }
}

export async function createSessionStepResponse(
  req: Request<unknown, unknown, CreateSessionStepResponseBody>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parsed = parseCreateBody(req.body);
    if (!parsed.isValid || !parsed.data) {
      res.status(400).json({
        success: false,
        message: parsed.message,
      });
      return;
    }

    const sessionExists = await BotSessionModel.exists({ _id: parsed.data.sessionId });
    if (!sessionExists) {
      res.status(400).json({
        success: false,
        message: "sessionId does not reference an existing bot session.",
      });
      return;
    }

    const flowExists = await FlowModel.exists({ _id: parsed.data.flowId });
    if (!flowExists) {
      res.status(400).json({
        success: false,
        message: "flowId does not reference an existing flow.",
      });
      return;
    }

    const responseDoc = await SessionStepResponseModel.create(parsed.data);
    res.status(201).json({
      success: true,
      data: responseDoc,
    });
  } catch (error) {
    next(error);
  }
}
