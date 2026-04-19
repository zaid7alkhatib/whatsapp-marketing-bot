import { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import { BotSessionModel } from "../bot-sessions/bot-session.model";
import { ChannelAccountModel } from "../channel-accounts/channel-account.model";
import { ChannelModel } from "../channels/channel.model";
import { MessageModel } from "./message.model";
import {
  CreateMessageBody,
  MESSAGE_ACTOR_TYPES,
  MESSAGE_DIRECTIONS,
  MESSAGE_TYPES,
  MessageActorType,
  MessageDirection,
  MessageType,
} from "./message.types";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
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

function parseCreateBody(body: CreateMessageBody): {
  isValid: boolean;
  message?: string;
  data?: {
    sessionId: mongoose.Types.ObjectId;
    channelId: mongoose.Types.ObjectId;
    channelAccountId: mongoose.Types.ObjectId;
    direction: MessageDirection;
    actorType: MessageActorType;
    actorId?: string;
    messageType: MessageType;
    externalMessageId?: string;
    content: Record<string, unknown>;
    normalizedContent?: Record<string, unknown>;
    deliveryStatus?: string;
    providerPayload?: Record<string, unknown>;
    sentAt?: Date;
    receivedAt?: Date;
    createdAt: Date;
  };
} {
  if (!isNonEmptyString(body.sessionId) || !mongoose.isValidObjectId(body.sessionId)) {
    return { isValid: false, message: "Field 'sessionId' must be a valid ObjectId." };
  }

  if (!isNonEmptyString(body.channelId) || !mongoose.isValidObjectId(body.channelId)) {
    return { isValid: false, message: "Field 'channelId' must be a valid ObjectId." };
  }

  if (!isNonEmptyString(body.channelAccountId) || !mongoose.isValidObjectId(body.channelAccountId)) {
    return { isValid: false, message: "Field 'channelAccountId' must be a valid ObjectId." };
  }

  if (
    !isNonEmptyString(body.direction) ||
    !MESSAGE_DIRECTIONS.includes(body.direction as MessageDirection)
  ) {
    return {
      isValid: false,
      message: `Field 'direction' must be one of: ${MESSAGE_DIRECTIONS.join(", ")}.`,
    };
  }

  if (
    !isNonEmptyString(body.actorType) ||
    !MESSAGE_ACTOR_TYPES.includes(body.actorType as MessageActorType)
  ) {
    return {
      isValid: false,
      message: `Field 'actorType' must be one of: ${MESSAGE_ACTOR_TYPES.join(", ")}.`,
    };
  }

  if (body.actorId !== undefined && !isNonEmptyString(body.actorId)) {
    return { isValid: false, message: "Field 'actorId' must be a non-empty string." };
  }

  if (
    !isNonEmptyString(body.messageType) ||
    !MESSAGE_TYPES.includes(body.messageType as MessageType)
  ) {
    return {
      isValid: false,
      message: `Field 'messageType' must be one of: ${MESSAGE_TYPES.join(", ")}.`,
    };
  }

  if (body.externalMessageId !== undefined && !isNonEmptyString(body.externalMessageId)) {
    return { isValid: false, message: "Field 'externalMessageId' must be a non-empty string." };
  }

  if (!isPlainObject(body.content)) {
    return { isValid: false, message: "Field 'content' is required and must be a non-null object." };
  }

  if (body.normalizedContent !== undefined && !isPlainObject(body.normalizedContent)) {
    return { isValid: false, message: "Field 'normalizedContent' must be an object." };
  }

  if (body.deliveryStatus !== undefined && !isNonEmptyString(body.deliveryStatus)) {
    return { isValid: false, message: "Field 'deliveryStatus' must be a non-empty string." };
  }

  if (body.providerPayload !== undefined && !isPlainObject(body.providerPayload)) {
    return { isValid: false, message: "Field 'providerPayload' must be an object." };
  }

  const sentAtResult = parseDateField(body.sentAt, "sentAt", false);
  if (!sentAtResult.isValid) {
    return { isValid: false, message: sentAtResult.message };
  }

  const receivedAtResult = parseDateField(body.receivedAt, "receivedAt", false);
  if (!receivedAtResult.isValid) {
    return { isValid: false, message: receivedAtResult.message };
  }

  const createdAtResult = parseDateField(body.createdAt, "createdAt", true);
  if (!createdAtResult.isValid || !createdAtResult.date) {
    return { isValid: false, message: createdAtResult.message };
  }

  return {
    isValid: true,
    data: {
      sessionId: new mongoose.Types.ObjectId(body.sessionId),
      channelId: new mongoose.Types.ObjectId(body.channelId),
      channelAccountId: new mongoose.Types.ObjectId(body.channelAccountId),
      direction: body.direction as MessageDirection,
      actorType: body.actorType as MessageActorType,
      actorId: body.actorId?.trim(),
      messageType: body.messageType as MessageType,
      externalMessageId: body.externalMessageId?.trim(),
      content: body.content as Record<string, unknown>,
      normalizedContent: body.normalizedContent as Record<string, unknown> | undefined,
      deliveryStatus: body.deliveryStatus?.trim(),
      providerPayload: body.providerPayload as Record<string, unknown> | undefined,
      sentAt: sentAtResult.date,
      receivedAt: receivedAtResult.date,
      createdAt: createdAtResult.date,
    },
  };
}

export async function getMessages(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const messages = await MessageModel.find().sort({ createdAt: -1 }).lean();

    res.status(200).json({
      success: true,
      data: messages,
    });
  } catch (error) {
    next(error);
  }
}

export async function getMessageById(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({
        success: false,
        message: "Invalid message id.",
      });
      return;
    }

    const message = await MessageModel.findById(id).lean();
    if (!message) {
      res.status(404).json({
        success: false,
        message: "Message not found.",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: message,
    });
  } catch (error) {
    next(error);
  }
}

export async function createMessage(
  req: Request<unknown, unknown, CreateMessageBody>,
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

    const message = await MessageModel.create(parsed.data);
    res.status(201).json({
      success: true,
      data: message,
    });
  } catch (error) {
    next(error);
  }
}
