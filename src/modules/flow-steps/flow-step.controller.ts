import { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import { FlowModel } from "../flows/flow.model";
import { FlowStepModel } from "./flow-step.model";
import {
  CreateFlowStepBody,
  FLOW_STEP_STATUSES,
  FLOW_STEP_TYPES,
  FlowStepConfig,
  FlowStepStatus,
  FlowStepType,
} from "./flow-step.types";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function parseCreateBody(body: CreateFlowStepBody): {
  isValid: boolean;
  message?: string;
  data?: {
    flowId: mongoose.Types.ObjectId;
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
  };
} {
  if (!isNonEmptyString(body.flowId) || !mongoose.isValidObjectId(body.flowId)) {
    return { isValid: false, message: "Field 'flowId' must be a valid ObjectId." };
  }

  if (!isNonEmptyString(body.code)) {
    return { isValid: false, message: "Field 'code' is required." };
  }

  if (!isNonEmptyString(body.type) || !FLOW_STEP_TYPES.includes(body.type as FlowStepType)) {
    return {
      isValid: false,
      message: `Field 'type' must be one of: ${FLOW_STEP_TYPES.join(", ")}.`,
    };
  }

  if (!isPositiveNumber(body.sequence)) {
    return { isValid: false, message: "Field 'sequence' is required and must be a positive number." };
  }

  if (!isNonEmptyString(body.status) || !FLOW_STEP_STATUSES.includes(body.status as FlowStepStatus)) {
    return {
      isValid: false,
      message: `Field 'status' must be one of: ${FLOW_STEP_STATUSES.join(", ")}.`,
    };
  }

  if (body.contentKey !== undefined && !isNonEmptyString(body.contentKey)) {
    return { isValid: false, message: "Field 'contentKey' must be a non-empty string." };
  }

  if (body.stepConfig !== undefined && !isPlainObject(body.stepConfig)) {
    return { isValid: false, message: "Field 'stepConfig' must be an object." };
  }

  if (
    isPlainObject(body.stepConfig) &&
    body.stepConfig.dataKey !== undefined &&
    !isNonEmptyString(body.stepConfig.dataKey)
  ) {
    return { isValid: false, message: "Field 'stepConfig.dataKey' must be a non-empty string." };
  }

  if (body.validationConfig !== undefined && !isPlainObject(body.validationConfig)) {
    return { isValid: false, message: "Field 'validationConfig' must be an object." };
  }

  if (body.transitionConfig !== undefined && !Array.isArray(body.transitionConfig)) {
    return { isValid: false, message: "Field 'transitionConfig' must be an array." };
  }

  if (body.aiConfig !== undefined && !isPlainObject(body.aiConfig)) {
    return { isValid: false, message: "Field 'aiConfig' must be an object." };
  }

  if (body.actionConfig !== undefined && !isPlainObject(body.actionConfig)) {
    return { isValid: false, message: "Field 'actionConfig' must be an object." };
  }

  if (body.metadata !== undefined && !isPlainObject(body.metadata)) {
    return { isValid: false, message: "Field 'metadata' must be an object." };
  }

  return {
    isValid: true,
    data: {
      flowId: new mongoose.Types.ObjectId(body.flowId),
      code: body.code.trim().toUpperCase(),
      type: body.type as FlowStepType,
      sequence: body.sequence,
      status: body.status as FlowStepStatus,
      contentKey: body.contentKey?.trim(),
      stepConfig: body.stepConfig
        ? {
            ...(body.stepConfig as Record<string, unknown>),
            dataKey: isNonEmptyString((body.stepConfig as Record<string, unknown>).dataKey)
              ? ((body.stepConfig as Record<string, unknown>).dataKey as string).trim()
              : undefined,
          }
        : undefined,
      validationConfig: body.validationConfig as Record<string, unknown> | undefined,
      transitionConfig: body.transitionConfig as unknown[] | undefined,
      aiConfig: body.aiConfig as Record<string, unknown> | undefined,
      actionConfig: body.actionConfig as Record<string, unknown> | undefined,
      metadata: body.metadata as Record<string, unknown> | undefined,
    },
  };
}

export async function getFlowSteps(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const flowSteps = await FlowStepModel.find().sort({ createdAt: -1 }).lean();

    res.status(200).json({
      success: true,
      data: flowSteps,
    });
  } catch (error) {
    next(error);
  }
}

export async function getFlowStepById(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({
        success: false,
        message: "Invalid flow step id.",
      });
      return;
    }

    const flowStep = await FlowStepModel.findById(id).lean();

    if (!flowStep) {
      res.status(404).json({
        success: false,
        message: "Flow step not found.",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: flowStep,
    });
  } catch (error) {
    next(error);
  }
}

export async function createFlowStep(
  req: Request<unknown, unknown, CreateFlowStepBody>,
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

    const flowExists = await FlowModel.exists({ _id: parsed.data.flowId });
    if (!flowExists) {
      res.status(400).json({
        success: false,
        message: "flowId does not reference an existing flow.",
      });
      return;
    }

    const existingByCode = await FlowStepModel.findOne({
      flowId: parsed.data.flowId,
      code: parsed.data.code,
    })
      .select("_id")
      .lean();

    if (existingByCode) {
      res.status(409).json({
        success: false,
        message: "Flow step code already exists in this flow.",
      });
      return;
    }

    const existingBySequence = await FlowStepModel.findOne({
      flowId: parsed.data.flowId,
      sequence: parsed.data.sequence,
    })
      .select("_id")
      .lean();

    if (existingBySequence) {
      res.status(409).json({
        success: false,
        message: "Flow step sequence already exists in this flow.",
      });
      return;
    }

    const flowStep = await FlowStepModel.create(parsed.data);

    res.status(201).json({
      success: true,
      data: flowStep,
    });
  } catch (error) {
    const dbError = error as { code?: number };
    if (dbError.code === 11000) {
      res.status(409).json({
        success: false,
        message: "Flow step with this code or sequence already exists in this flow.",
      });
      return;
    }

    next(error);
  }
}

export async function updateFlowStep(
  req: Request<{ id: string }, unknown, CreateFlowStepBody>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({
        success: false,
        message: "Invalid flow step id.",
      });
      return;
    }

    const parsed = parseCreateBody(req.body);

    if (!parsed.isValid || !parsed.data) {
      res.status(400).json({
        success: false,
        message: parsed.message,
      });
      return;
    }

    const existingFlowStep = await FlowStepModel.findById(id);
    if (!existingFlowStep) {
      res.status(404).json({
        success: false,
        message: "Flow step not found.",
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

    const duplicateByCode = await FlowStepModel.findOne({
      flowId: parsed.data.flowId,
      code: parsed.data.code,
      _id: { $ne: existingFlowStep._id },
    })
      .select("_id")
      .lean();

    if (duplicateByCode) {
      res.status(409).json({
        success: false,
        message: "Flow step code already exists in this flow.",
      });
      return;
    }

    const duplicateBySequence = await FlowStepModel.findOne({
      flowId: parsed.data.flowId,
      sequence: parsed.data.sequence,
      _id: { $ne: existingFlowStep._id },
    })
      .select("_id")
      .lean();

    if (duplicateBySequence) {
      res.status(409).json({
        success: false,
        message: "Flow step sequence already exists in this flow.",
      });
      return;
    }

    existingFlowStep.flowId = parsed.data.flowId;
    existingFlowStep.code = parsed.data.code;
    existingFlowStep.type = parsed.data.type;
    existingFlowStep.sequence = parsed.data.sequence;
    existingFlowStep.status = parsed.data.status;
    existingFlowStep.contentKey = parsed.data.contentKey;
    existingFlowStep.stepConfig = parsed.data.stepConfig;
    existingFlowStep.validationConfig = parsed.data.validationConfig;
    existingFlowStep.transitionConfig = parsed.data.transitionConfig;
    existingFlowStep.aiConfig = parsed.data.aiConfig;
    existingFlowStep.actionConfig = parsed.data.actionConfig;
    existingFlowStep.metadata = parsed.data.metadata;

    const updatedFlowStep = await existingFlowStep.save();

    res.status(200).json({
      success: true,
      data: updatedFlowStep,
    });
  } catch (error) {
    const dbError = error as { code?: number };
    if (dbError.code === 11000) {
      res.status(409).json({
        success: false,
        message: "Flow step with this code or sequence already exists in this flow.",
      });
      return;
    }

    next(error);
  }
}
