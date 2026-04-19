import { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import { OrgUnitModel } from "./org-unit.model";
import {
  CreateOrgUnitBody,
  ORG_UNIT_STATUSES,
  ORG_UNIT_TYPES,
  OrgUnitStatus,
  OrgUnitType,
} from "./org-unit.types";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isBooleanOrUndefined(value: unknown): value is boolean | undefined {
  return value === undefined || typeof value === "boolean";
}

function parseCreateBody(body: CreateOrgUnitBody): {
  isValid: boolean;
  message?: string;
  data?: {
    code: string;
    type: OrgUnitType;
    status: OrgUnitStatus;
    name: { ar: string; en: string; de: string };
    parentOrgUnitId?: mongoose.Types.ObjectId;
    contactInfo?: { phone?: string; email?: string; address?: string };
    settings: {
      registeredUsersOnly: boolean;
      insuranceQuarterValidation: boolean;
    };
  };
} {
  if (!isNonEmptyString(body.code)) {
    return { isValid: false, message: "Field 'code' is required." };
  }

  if (!isNonEmptyString(body.type) || !ORG_UNIT_TYPES.includes(body.type as OrgUnitType)) {
    return {
      isValid: false,
      message: `Field 'type' must be one of: ${ORG_UNIT_TYPES.join(", ")}.`,
    };
  }

  const status = body.status ?? "active";
  if (!isNonEmptyString(status) || !ORG_UNIT_STATUSES.includes(status as OrgUnitStatus)) {
    return {
      isValid: false,
      message: `Field 'status' must be one of: ${ORG_UNIT_STATUSES.join(", ")}.`,
    };
  }

  if (!body.name || typeof body.name !== "object") {
    return { isValid: false, message: "Field 'name' is required." };
  }

  if (!isNonEmptyString(body.name.ar)) {
    return { isValid: false, message: "Field 'name.ar' is required." };
  }

  if (!isNonEmptyString(body.name.en)) {
    return { isValid: false, message: "Field 'name.en' is required." };
  }

  if (!isNonEmptyString(body.name.de)) {
    return { isValid: false, message: "Field 'name.de' is required." };
  }

  if (body.parentOrgUnitId !== undefined) {
    if (!isNonEmptyString(body.parentOrgUnitId) || !mongoose.isValidObjectId(body.parentOrgUnitId)) {
      return { isValid: false, message: "Field 'parentOrgUnitId' must be a valid ObjectId." };
    }
  }

  if (body.contactInfo !== undefined && typeof body.contactInfo !== "object") {
    return { isValid: false, message: "Field 'contactInfo' must be an object." };
  }

  if (body.contactInfo?.phone !== undefined && !isNonEmptyString(body.contactInfo.phone)) {
    return { isValid: false, message: "Field 'contactInfo.phone' must be a non-empty string." };
  }

  if (body.contactInfo?.email !== undefined && !isNonEmptyString(body.contactInfo.email)) {
    return { isValid: false, message: "Field 'contactInfo.email' must be a non-empty string." };
  }

  if (body.contactInfo?.address !== undefined && !isNonEmptyString(body.contactInfo.address)) {
    return { isValid: false, message: "Field 'contactInfo.address' must be a non-empty string." };
  }

  if (body.settings !== undefined && typeof body.settings !== "object") {
    return { isValid: false, message: "Field 'settings' must be an object." };
  }

  if (!isBooleanOrUndefined(body.settings?.registeredUsersOnly)) {
    return {
      isValid: false,
      message: "Field 'settings.registeredUsersOnly' must be boolean.",
    };
  }

  if (!isBooleanOrUndefined(body.settings?.insuranceQuarterValidation)) {
    return {
      isValid: false,
      message: "Field 'settings.insuranceQuarterValidation' must be boolean.",
    };
  }

  return {
    isValid: true,
    data: {
      code: body.code.trim().toUpperCase(),
      type: body.type as OrgUnitType,
      status: status as OrgUnitStatus,
      name: {
        ar: body.name.ar.trim(),
        en: body.name.en.trim(),
        de: body.name.de.trim(),
      },
      parentOrgUnitId: body.parentOrgUnitId
        ? new mongoose.Types.ObjectId(body.parentOrgUnitId)
        : undefined,
      contactInfo: body.contactInfo
        ? {
            phone: body.contactInfo.phone?.trim(),
            email: body.contactInfo.email?.trim().toLowerCase(),
            address: body.contactInfo.address?.trim(),
          }
        : undefined,
      settings: {
        registeredUsersOnly: body.settings?.registeredUsersOnly ?? false,
        insuranceQuarterValidation: body.settings?.insuranceQuarterValidation ?? false,
      },
    },
  };
}

export async function getOrgUnits(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const orgUnits = await OrgUnitModel.find().sort({ createdAt: -1 }).lean();

    res.status(200).json({
      success: true,
      data: orgUnits,
    });
  } catch (error) {
    next(error);
  }
}

export async function getOrgUnitById(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({
        success: false,
        message: "Invalid org unit id.",
      });
      return;
    }

    const orgUnit = await OrgUnitModel.findById(id).lean();

    if (!orgUnit) {
      res.status(404).json({
        success: false,
        message: "Org unit not found.",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: orgUnit,
    });
  } catch (error) {
    next(error);
  }
}

export async function createOrgUnit(
  req: Request<unknown, unknown, CreateOrgUnitBody>,
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

    const { code, parentOrgUnitId } = parsed.data;

    const existingOrgUnit = await OrgUnitModel.findOne({ code }).select("_id").lean();
    if (existingOrgUnit) {
      res.status(409).json({
        success: false,
        message: "Org unit code already exists.",
      });
      return;
    }

    if (parentOrgUnitId) {
      const parentOrgUnitExists = await OrgUnitModel.exists({ _id: parentOrgUnitId });
      if (!parentOrgUnitExists) {
        res.status(400).json({
          success: false,
          message: "parentOrgUnitId does not reference an existing org unit.",
        });
        return;
      }
    }

    const orgUnit = await OrgUnitModel.create(parsed.data);

    res.status(201).json({
      success: true,
      data: orgUnit,
    });
  } catch (error) {
    const dbError = error as { code?: number };
    if (dbError.code === 11000) {
      res.status(409).json({
        success: false,
        message: "Org unit code already exists.",
      });
      return;
    }

    next(error);
  }
}

export async function updateOrgUnit(
  req: Request<{ id: string }, unknown, CreateOrgUnitBody>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({
        success: false,
        message: "Invalid org unit id.",
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

    if (parsed.data.parentOrgUnitId && parsed.data.parentOrgUnitId.toString() === id) {
      res.status(400).json({
        success: false,
        message: "parentOrgUnitId cannot reference the same org unit.",
      });
      return;
    }

    const existingOrgUnit = await OrgUnitModel.findById(id);
    if (!existingOrgUnit) {
      res.status(404).json({
        success: false,
        message: "Org unit not found.",
      });
      return;
    }

    const duplicateByCode = await OrgUnitModel.findOne({
      code: parsed.data.code,
      _id: { $ne: existingOrgUnit._id },
    })
      .select("_id")
      .lean();

    if (duplicateByCode) {
      res.status(409).json({
        success: false,
        message: "Org unit code already exists.",
      });
      return;
    }

    if (parsed.data.parentOrgUnitId) {
      const parentOrgUnitExists = await OrgUnitModel.exists({ _id: parsed.data.parentOrgUnitId });
      if (!parentOrgUnitExists) {
        res.status(400).json({
          success: false,
          message: "parentOrgUnitId does not reference an existing org unit.",
        });
        return;
      }
    }

    existingOrgUnit.code = parsed.data.code;
    existingOrgUnit.type = parsed.data.type;
    existingOrgUnit.status = parsed.data.status;
    existingOrgUnit.name = parsed.data.name;
    existingOrgUnit.parentOrgUnitId = parsed.data.parentOrgUnitId ?? null;
    existingOrgUnit.contactInfo = parsed.data.contactInfo;
    existingOrgUnit.settings = parsed.data.settings;

    const updatedOrgUnit = await existingOrgUnit.save();

    res.status(200).json({
      success: true,
      data: updatedOrgUnit,
    });
  } catch (error) {
    const dbError = error as { code?: number };
    if (dbError.code === 11000) {
      res.status(409).json({
        success: false,
        message: "Org unit code already exists.",
      });
      return;
    }

    next(error);
  }
}
