import { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import { idsMatch, isClientUserRole, resolveScopedChannelAccount } from "../auth/auth.scope";
import { ChannelModel } from "../channels/channel.model";
import { OrgUnitModel } from "../org-units/org-unit.model";
import { ChannelAccountModel } from "./channel-account.model";
import {
  CHANNEL_ACCOUNT_STATUSES,
  ChannelAccountStatus,
  CreateChannelAccountBody,
} from "./channel-account.types";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseDateField(value: unknown): { isValid: boolean; date?: Date; message?: string } {
  if (value === undefined || value === null) {
    return { isValid: true };
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return { isValid: true, date: value };
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsedDate = new Date(value);
    if (!Number.isNaN(parsedDate.getTime())) {
      return { isValid: true, date: parsedDate };
    }
  }

  return { isValid: false, message: "must be a valid ISO date string." };
}

function parseCreateBody(body: CreateChannelAccountBody): {
  isValid: boolean;
  message?: string;
  data?: {
    channelId: mongoose.Types.ObjectId;
    orgUnitId?: mongoose.Types.ObjectId;
    code: string;
    displayName: string;
    phoneNumber?: string;
    status: ChannelAccountStatus;
    providerConfig: Record<string, unknown>;
    lastConnectedAt?: Date;
    lastDisconnectedAt?: Date;
  };
} {
  if (!isNonEmptyString(body.channelId) || !mongoose.isValidObjectId(body.channelId)) {
    return { isValid: false, message: "Field 'channelId' must be a valid ObjectId." };
  }

  if (body.orgUnitId !== undefined) {
    if (!isNonEmptyString(body.orgUnitId) || !mongoose.isValidObjectId(body.orgUnitId)) {
      return { isValid: false, message: "Field 'orgUnitId' must be a valid ObjectId." };
    }
  }

  if (!isNonEmptyString(body.code)) {
    return { isValid: false, message: "Field 'code' is required." };
  }

  if (!isNonEmptyString(body.displayName)) {
    return { isValid: false, message: "Field 'displayName' is required." };
  }

  if (body.phoneNumber !== undefined && !isNonEmptyString(body.phoneNumber)) {
    return { isValid: false, message: "Field 'phoneNumber' must be a non-empty string." };
  }

  const status = body.status ?? "pending";
  if (
    !isNonEmptyString(status) ||
    !CHANNEL_ACCOUNT_STATUSES.includes(status as ChannelAccountStatus)
  ) {
    return {
      isValid: false,
      message: `Field 'status' must be one of: ${CHANNEL_ACCOUNT_STATUSES.join(", ")}.`,
    };
  }

  if (body.providerConfig !== undefined && !isPlainObject(body.providerConfig)) {
    return { isValid: false, message: "Field 'providerConfig' must be an object." };
  }

  const parsedLastConnectedAt = parseDateField(body.lastConnectedAt);
  if (!parsedLastConnectedAt.isValid) {
    return {
      isValid: false,
      message: `Field 'lastConnectedAt' ${parsedLastConnectedAt.message}`,
    };
  }

  const parsedLastDisconnectedAt = parseDateField(body.lastDisconnectedAt);
  if (!parsedLastDisconnectedAt.isValid) {
    return {
      isValid: false,
      message: `Field 'lastDisconnectedAt' ${parsedLastDisconnectedAt.message}`,
    };
  }

  return {
    isValid: true,
    data: {
      channelId: new mongoose.Types.ObjectId(body.channelId),
      orgUnitId: body.orgUnitId ? new mongoose.Types.ObjectId(body.orgUnitId) : undefined,
      code: body.code.trim().toUpperCase(),
      displayName: body.displayName.trim(),
      phoneNumber: body.phoneNumber?.trim(),
      status: status as ChannelAccountStatus,
      providerConfig: (body.providerConfig as Record<string, unknown>) ?? {},
      lastConnectedAt: parsedLastConnectedAt.date,
      lastDisconnectedAt: parsedLastDisconnectedAt.date,
    },
  };
}

export async function getChannelAccounts(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (isClientUserRole(req.authUser?.role)) {
      const scopedChannelAccount = await resolveScopedChannelAccount(req.authUser);
      if (!scopedChannelAccount) {
        res.status(403).json({
          success: false,
          message: "Client channel account scope is not configured.",
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: [
          {
            _id: scopedChannelAccount._id,
            code: scopedChannelAccount.code,
            displayName: scopedChannelAccount.displayName,
            phoneNumber: scopedChannelAccount.phoneNumber ?? null,
          },
        ],
      });
      return;
    }

    const channelAccounts = await ChannelAccountModel.find().sort({ createdAt: -1 }).lean();

    res.status(200).json({
      success: true,
      data: channelAccounts,
    });
  } catch (error) {
    next(error);
  }
}

export async function getChannelAccountById(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({
        success: false,
        message: "Invalid channel account id.",
      });
      return;
    }

    if (isClientUserRole(req.authUser?.role)) {
      const scopedChannelAccount = await resolveScopedChannelAccount(req.authUser);
      if (!scopedChannelAccount) {
        res.status(403).json({
          success: false,
          message: "Client channel account scope is not configured.",
        });
        return;
      }

      if (!idsMatch(scopedChannelAccount._id, id)) {
        res.status(404).json({
          success: false,
          message: "Channel account not found.",
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          _id: scopedChannelAccount._id,
          code: scopedChannelAccount.code,
          displayName: scopedChannelAccount.displayName,
          phoneNumber: scopedChannelAccount.phoneNumber ?? null,
        },
      });
      return;
    }

    const channelAccount = await ChannelAccountModel.findById(id).lean();

    if (!channelAccount) {
      res.status(404).json({
        success: false,
        message: "Channel account not found.",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: channelAccount,
    });
  } catch (error) {
    next(error);
  }
}

export async function createChannelAccount(
  req: Request<unknown, unknown, CreateChannelAccountBody>,
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

    const existingChannelAccount = await ChannelAccountModel.findOne({ code: parsed.data.code })
      .select("_id")
      .lean();

    if (existingChannelAccount) {
      res.status(409).json({
        success: false,
        message: "Channel account code already exists.",
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

    const channelAccount = await ChannelAccountModel.create(parsed.data);

    res.status(201).json({
      success: true,
      data: channelAccount,
    });
  } catch (error) {
    const dbError = error as { code?: number };
    if (dbError.code === 11000) {
      res.status(409).json({
        success: false,
        message: "Channel account code already exists.",
      });
      return;
    }

    next(error);
  }
}

export async function updateChannelAccount(
  req: Request<{ id: string }, unknown, CreateChannelAccountBody>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({
        success: false,
        message: "Invalid channel account id.",
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

    const existingChannelAccount = await ChannelAccountModel.findById(id);
    if (!existingChannelAccount) {
      res.status(404).json({
        success: false,
        message: "Channel account not found.",
      });
      return;
    }

    const duplicateByCode = await ChannelAccountModel.findOne({
      code: parsed.data.code,
      _id: { $ne: existingChannelAccount._id },
    })
      .select("_id")
      .lean();

    if (duplicateByCode) {
      res.status(409).json({
        success: false,
        message: "Channel account code already exists.",
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

    existingChannelAccount.channelId = parsed.data.channelId;
    existingChannelAccount.orgUnitId = parsed.data.orgUnitId ?? null;
    existingChannelAccount.code = parsed.data.code;
    existingChannelAccount.displayName = parsed.data.displayName;
    existingChannelAccount.phoneNumber = parsed.data.phoneNumber;
    existingChannelAccount.status = parsed.data.status;
    existingChannelAccount.providerConfig = parsed.data.providerConfig;
    existingChannelAccount.lastConnectedAt = parsed.data.lastConnectedAt ?? null;
    existingChannelAccount.lastDisconnectedAt = parsed.data.lastDisconnectedAt ?? null;

    const updatedChannelAccount = await existingChannelAccount.save();

    res.status(200).json({
      success: true,
      data: updatedChannelAccount,
    });
  } catch (error) {
    const dbError = error as { code?: number };
    if (dbError.code === 11000) {
      res.status(409).json({
        success: false,
        message: "Channel account code already exists.",
      });
      return;
    }

    next(error);
  }
}
