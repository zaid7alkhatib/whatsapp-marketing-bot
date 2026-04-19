import { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import { BusinessPartnerModel } from "../business-partners/business-partner.model";
import { ChannelAccountModel } from "../channel-accounts/channel-account.model";
import { ChannelModel } from "../channels/channel.model";
import { FlowModel } from "../flows/flow.model";
import { OrgUnitModel } from "../org-units/org-unit.model";
import { BotSessionModel } from "./bot-session.model";
import {
  BOT_SESSION_STATUSES,
  BotSessionStatus,
  CreateBotSessionBody,
} from "./bot-session.types";

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

function parseCreateBody(body: CreateBotSessionBody): {
  isValid: boolean;
  message?: string;
  data?: {
    orgUnitId?: mongoose.Types.ObjectId;
    channelId: mongoose.Types.ObjectId;
    channelAccountId: mongoose.Types.ObjectId;
    businessPartnerId?: mongoose.Types.ObjectId;
    flowId: mongoose.Types.ObjectId;
    flowVersion: number;
    statusCode: BotSessionStatus;
    language: string;
    channelUserRef: string;
    currentStepCode?: string;
    startedAt: Date;
    endedAt?: Date;
    lastActivityAt: Date;
    collectedData?: Record<string, unknown>;
    contextSnapshot?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  };
} {
  if (body.orgUnitId !== undefined) {
    if (!isNonEmptyString(body.orgUnitId) || !mongoose.isValidObjectId(body.orgUnitId)) {
      return { isValid: false, message: "Field 'orgUnitId' must be a valid ObjectId." };
    }
  }

  if (!isNonEmptyString(body.channelId) || !mongoose.isValidObjectId(body.channelId)) {
    return { isValid: false, message: "Field 'channelId' must be a valid ObjectId." };
  }

  if (!isNonEmptyString(body.channelAccountId) || !mongoose.isValidObjectId(body.channelAccountId)) {
    return { isValid: false, message: "Field 'channelAccountId' must be a valid ObjectId." };
  }

  if (body.businessPartnerId !== undefined) {
    if (
      !isNonEmptyString(body.businessPartnerId) ||
      !mongoose.isValidObjectId(body.businessPartnerId)
    ) {
      return { isValid: false, message: "Field 'businessPartnerId' must be a valid ObjectId." };
    }
  }

  if (!isNonEmptyString(body.flowId) || !mongoose.isValidObjectId(body.flowId)) {
    return { isValid: false, message: "Field 'flowId' must be a valid ObjectId." };
  }

  if (!isPositiveNumber(body.flowVersion)) {
    return { isValid: false, message: "Field 'flowVersion' must be a positive number." };
  }

  if (
    !isNonEmptyString(body.statusCode) ||
    !BOT_SESSION_STATUSES.includes(body.statusCode as BotSessionStatus)
  ) {
    return {
      isValid: false,
      message: `Field 'statusCode' must be one of: ${BOT_SESSION_STATUSES.join(", ")}.`,
    };
  }

  if (!isNonEmptyString(body.language)) {
    return { isValid: false, message: "Field 'language' is required." };
  }

  if (!isNonEmptyString(body.channelUserRef)) {
    return { isValid: false, message: "Field 'channelUserRef' is required." };
  }

  if (body.currentStepCode !== undefined && !isNonEmptyString(body.currentStepCode)) {
    return { isValid: false, message: "Field 'currentStepCode' must be a non-empty string." };
  }

  const startedAtResult = parseDateField(body.startedAt, "startedAt", true);
  if (!startedAtResult.isValid || !startedAtResult.date) {
    return { isValid: false, message: startedAtResult.message };
  }

  const endedAtResult = parseDateField(body.endedAt, "endedAt", false);
  if (!endedAtResult.isValid) {
    return { isValid: false, message: endedAtResult.message };
  }

  const lastActivityAtResult = parseDateField(body.lastActivityAt, "lastActivityAt", true);
  if (!lastActivityAtResult.isValid || !lastActivityAtResult.date) {
    return { isValid: false, message: lastActivityAtResult.message };
  }

  if (body.collectedData !== undefined && !isPlainObject(body.collectedData)) {
    return { isValid: false, message: "Field 'collectedData' must be an object." };
  }

  if (body.contextSnapshot !== undefined && !isPlainObject(body.contextSnapshot)) {
    return { isValid: false, message: "Field 'contextSnapshot' must be an object." };
  }

  if (body.metadata !== undefined && !isPlainObject(body.metadata)) {
    return { isValid: false, message: "Field 'metadata' must be an object." };
  }

  return {
    isValid: true,
    data: {
      orgUnitId: body.orgUnitId ? new mongoose.Types.ObjectId(body.orgUnitId) : undefined,
      channelId: new mongoose.Types.ObjectId(body.channelId),
      channelAccountId: new mongoose.Types.ObjectId(body.channelAccountId),
      businessPartnerId: body.businessPartnerId
        ? new mongoose.Types.ObjectId(body.businessPartnerId)
        : undefined,
      flowId: new mongoose.Types.ObjectId(body.flowId),
      flowVersion: body.flowVersion,
      statusCode: body.statusCode as BotSessionStatus,
      language: body.language.trim(),
      channelUserRef: body.channelUserRef.trim(),
      currentStepCode: body.currentStepCode?.trim(),
      startedAt: startedAtResult.date,
      endedAt: endedAtResult.date,
      lastActivityAt: lastActivityAtResult.date,
      collectedData: body.collectedData as Record<string, unknown> | undefined,
      contextSnapshot: body.contextSnapshot as Record<string, unknown> | undefined,
      metadata: body.metadata as Record<string, unknown> | undefined,
    },
  };
}

export async function getBotSessions(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const sessions = await BotSessionModel.find().sort({ createdAt: -1 }).lean();

    res.status(200).json({
      success: true,
      data: sessions,
    });
  } catch (error) {
    next(error);
  }
}

export async function getBotSessionById(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({
        success: false,
        message: "Invalid bot session id.",
      });
      return;
    }

    const session = await BotSessionModel.findById(id).lean();
    if (!session) {
      res.status(404).json({
        success: false,
        message: "Bot session not found.",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: session,
    });
  } catch (error) {
    next(error);
  }
}

export async function createBotSession(
  req: Request<unknown, unknown, CreateBotSessionBody>,
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

    const channelExists = await ChannelModel.exists({ _id: parsed.data.channelId });
    if (!channelExists) {
      res.status(400).json({
        success: false,
        message: "channelId does not reference an existing channel.",
      });
      return;
    }

    const channelAccountExists = await ChannelAccountModel.exists({ _id: parsed.data.channelAccountId });
    if (!channelAccountExists) {
      res.status(400).json({
        success: false,
        message: "channelAccountId does not reference an existing channel account.",
      });
      return;
    }

    if (parsed.data.orgUnitId) {
      const orgUnitExists = await OrgUnitModel.exists({ _id: parsed.data.orgUnitId });
      if (!orgUnitExists) {
        res.status(400).json({
          success: false,
          message: "orgUnitId does not reference an existing org unit.",
        });
        return;
      }
    }

    if (parsed.data.businessPartnerId) {
      const partnerExists = await BusinessPartnerModel.exists({ _id: parsed.data.businessPartnerId });
      if (!partnerExists) {
        res.status(400).json({
          success: false,
          message: "businessPartnerId does not reference an existing business partner.",
        });
        return;
      }
    }

    const flowExists = await FlowModel.exists({ _id: parsed.data.flowId });
    if (!flowExists) {
      res.status(400).json({
        success: false,
        message: "flowId does not reference an existing flow.",
      });
      return;
    }

    const session = await BotSessionModel.create(parsed.data);
    res.status(201).json({
      success: true,
      data: session,
    });
  } catch (error) {
    next(error);
  }
}
