import { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import { ChannelModel } from "./channel.model";
import {
  CHANNEL_CODES,
  CHANNEL_PROVIDERS,
  CHANNEL_STATUSES,
  ChannelCode,
  ChannelProvider,
  ChannelStatus,
  CreateChannelBody,
} from "./channel.types";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isBooleanOrUndefined(value: unknown): value is boolean | undefined {
  return value === undefined || typeof value === "boolean";
}

function parseCreateBody(body: CreateChannelBody): {
  isValid: boolean;
  message?: string;
  data?: {
    code: ChannelCode;
    name: string;
    provider: ChannelProvider;
    status: ChannelStatus;
    capabilities: {
      text: boolean;
      image: boolean;
      document: boolean;
      audio: boolean;
      buttons: boolean;
      lists: boolean;
    };
  };
} {
  if (!isNonEmptyString(body.code) || !CHANNEL_CODES.includes(body.code as ChannelCode)) {
    return {
      isValid: false,
      message: `Field 'code' must be one of: ${CHANNEL_CODES.join(", ")}.`,
    };
  }

  if (!isNonEmptyString(body.name)) {
    return { isValid: false, message: "Field 'name' is required." };
  }

  if (
    !isNonEmptyString(body.provider) ||
    !CHANNEL_PROVIDERS.includes(body.provider as ChannelProvider)
  ) {
    return {
      isValid: false,
      message: `Field 'provider' must be one of: ${CHANNEL_PROVIDERS.join(", ")}.`,
    };
  }

  const status = body.status ?? "active";
  if (!isNonEmptyString(status) || !CHANNEL_STATUSES.includes(status as ChannelStatus)) {
    return {
      isValid: false,
      message: `Field 'status' must be one of: ${CHANNEL_STATUSES.join(", ")}.`,
    };
  }

  if (body.capabilities !== undefined && typeof body.capabilities !== "object") {
    return { isValid: false, message: "Field 'capabilities' must be an object." };
  }

  if (!isBooleanOrUndefined(body.capabilities?.text)) {
    return { isValid: false, message: "Field 'capabilities.text' must be boolean." };
  }

  if (!isBooleanOrUndefined(body.capabilities?.image)) {
    return { isValid: false, message: "Field 'capabilities.image' must be boolean." };
  }

  if (!isBooleanOrUndefined(body.capabilities?.document)) {
    return { isValid: false, message: "Field 'capabilities.document' must be boolean." };
  }

  if (!isBooleanOrUndefined(body.capabilities?.audio)) {
    return { isValid: false, message: "Field 'capabilities.audio' must be boolean." };
  }

  if (!isBooleanOrUndefined(body.capabilities?.buttons)) {
    return { isValid: false, message: "Field 'capabilities.buttons' must be boolean." };
  }

  if (!isBooleanOrUndefined(body.capabilities?.lists)) {
    return { isValid: false, message: "Field 'capabilities.lists' must be boolean." };
  }

  return {
    isValid: true,
    data: {
      code: body.code.trim().toLowerCase() as ChannelCode,
      name: body.name.trim(),
      provider: body.provider.trim().toLowerCase() as ChannelProvider,
      status: status as ChannelStatus,
      capabilities: {
        text: body.capabilities?.text ?? false,
        image: body.capabilities?.image ?? false,
        document: body.capabilities?.document ?? false,
        audio: body.capabilities?.audio ?? false,
        buttons: body.capabilities?.buttons ?? false,
        lists: body.capabilities?.lists ?? false,
      },
    },
  };
}

export async function getChannels(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const channels = await ChannelModel.find().sort({ createdAt: -1 }).lean();

    res.status(200).json({
      success: true,
      data: channels,
    });
  } catch (error) {
    next(error);
  }
}

export async function getChannelById(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({
        success: false,
        message: "Invalid channel id.",
      });
      return;
    }

    const channel = await ChannelModel.findById(id).lean();

    if (!channel) {
      res.status(404).json({
        success: false,
        message: "Channel not found.",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: channel,
    });
  } catch (error) {
    next(error);
  }
}

export async function createChannel(
  req: Request<unknown, unknown, CreateChannelBody>,
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

    const existingChannel = await ChannelModel.findOne({ code: parsed.data.code })
      .select("_id")
      .lean();

    if (existingChannel) {
      res.status(409).json({
        success: false,
        message: "Channel code already exists.",
      });
      return;
    }

    const channel = await ChannelModel.create(parsed.data);

    res.status(201).json({
      success: true,
      data: channel,
    });
  } catch (error) {
    const dbError = error as { code?: number };
    if (dbError.code === 11000) {
      res.status(409).json({
        success: false,
        message: "Channel code already exists.",
      });
      return;
    }

    next(error);
  }
}

export async function updateChannel(
  req: Request<{ id: string }, unknown, CreateChannelBody>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({
        success: false,
        message: "Invalid channel id.",
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

    const existingChannel = await ChannelModel.findById(id);
    if (!existingChannel) {
      res.status(404).json({
        success: false,
        message: "Channel not found.",
      });
      return;
    }

    const duplicateByCode = await ChannelModel.findOne({
      code: parsed.data.code,
      _id: { $ne: existingChannel._id },
    })
      .select("_id")
      .lean();

    if (duplicateByCode) {
      res.status(409).json({
        success: false,
        message: "Channel code already exists.",
      });
      return;
    }

    existingChannel.code = parsed.data.code;
    existingChannel.name = parsed.data.name;
    existingChannel.provider = parsed.data.provider;
    existingChannel.status = parsed.data.status;
    existingChannel.capabilities = parsed.data.capabilities;

    const updatedChannel = await existingChannel.save();

    res.status(200).json({
      success: true,
      data: updatedChannel,
    });
  } catch (error) {
    const dbError = error as { code?: number };
    if (dbError.code === 11000) {
      res.status(409).json({
        success: false,
        message: "Channel code already exists.",
      });
      return;
    }

    next(error);
  }
}
