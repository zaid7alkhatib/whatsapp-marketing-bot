import { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import { ServiceModel } from "../services/service.model";
import { RequestTypeModel } from "./request-type.model";
import {
  CreateRequestTypeBody,
  REQUEST_TYPE_STATUSES,
  RequestTypeStatus,
} from "./request-type.types";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isBooleanOrUndefined(value: unknown): value is boolean | undefined {
  return value === undefined || typeof value === "boolean";
}

function hasAtLeastOneLocalizedName(name: {
  ar?: unknown;
  en?: unknown;
  de?: unknown;
}): boolean {
  return (
    isNonEmptyString(name.ar) ||
    isNonEmptyString(name.en) ||
    isNonEmptyString(name.de)
  );
}

function parseCreateBody(body: CreateRequestTypeBody): {
  isValid: boolean;
  message?: string;
  data?: {
    serviceId: mongoose.Types.ObjectId;
    code: string;
    status: RequestTypeStatus;
    name?: {
      ar?: string;
      en?: string;
      de?: string;
    };
    config?: {
      requiresHumanReview?: boolean;
      aiTaskCodes?: string[];
      formDefinitionCode?: string;
    };
  };
} {
  if (!isNonEmptyString(body.serviceId) || !mongoose.isValidObjectId(body.serviceId)) {
    return { isValid: false, message: "Field 'serviceId' must be a valid ObjectId." };
  }

  if (!isNonEmptyString(body.code)) {
    return { isValid: false, message: "Field 'code' is required." };
  }

  const status = body.status ?? "active";
  if (!isNonEmptyString(status) || !REQUEST_TYPE_STATUSES.includes(status as RequestTypeStatus)) {
    return {
      isValid: false,
      message: `Field 'status' must be one of: ${REQUEST_TYPE_STATUSES.join(", ")}.`,
    };
  }

  if (body.name !== undefined && !isPlainObject(body.name)) {
    return { isValid: false, message: "Field 'name' must be an object." };
  }

  if (body.name?.ar !== undefined && !isNonEmptyString(body.name.ar)) {
    return { isValid: false, message: "Field 'name.ar' must be a non-empty string." };
  }

  if (body.name?.en !== undefined && !isNonEmptyString(body.name.en)) {
    return { isValid: false, message: "Field 'name.en' must be a non-empty string." };
  }

  if (body.name?.de !== undefined && !isNonEmptyString(body.name.de)) {
    return { isValid: false, message: "Field 'name.de' must be a non-empty string." };
  }

  if (body.name && !hasAtLeastOneLocalizedName(body.name)) {
    return {
      isValid: false,
      message: "At least one localized name is required when 'name' is provided.",
    };
  }

  if (body.config !== undefined && !isPlainObject(body.config)) {
    return { isValid: false, message: "Field 'config' must be an object." };
  }

  if (!isBooleanOrUndefined(body.config?.requiresHumanReview)) {
    return {
      isValid: false,
      message: "Field 'config.requiresHumanReview' must be boolean.",
    };
  }

  if (
    body.config?.formDefinitionCode !== undefined &&
    !isNonEmptyString(body.config.formDefinitionCode)
  ) {
    return {
      isValid: false,
      message: "Field 'config.formDefinitionCode' must be a non-empty string.",
    };
  }

  if (body.config?.aiTaskCodes !== undefined && !Array.isArray(body.config.aiTaskCodes)) {
    return {
      isValid: false,
      message: "Field 'config.aiTaskCodes' must be an array of non-empty strings.",
    };
  }

  if (Array.isArray(body.config?.aiTaskCodes)) {
    const invalidCode = body.config.aiTaskCodes.find((code) => !isNonEmptyString(code));
    if (invalidCode !== undefined) {
      return {
        isValid: false,
        message: "Field 'config.aiTaskCodes' must be an array of non-empty strings.",
      };
    }
  }

  const cleanedAiTaskCodes = Array.isArray(body.config?.aiTaskCodes)
    ? body.config.aiTaskCodes
        .map((code) => code.trim())
        .filter((code, index, arr) => arr.indexOf(code) === index)
    : undefined;

  return {
    isValid: true,
    data: {
      serviceId: new mongoose.Types.ObjectId(body.serviceId),
      code: body.code.trim().toUpperCase(),
      status: status as RequestTypeStatus,
      name: body.name
        ? {
            ar: body.name.ar?.toString().trim(),
            en: body.name.en?.toString().trim(),
            de: body.name.de?.toString().trim(),
          }
        : undefined,
      config: body.config
        ? {
            requiresHumanReview: body.config.requiresHumanReview,
            aiTaskCodes: cleanedAiTaskCodes,
            formDefinitionCode: body.config.formDefinitionCode?.trim(),
          }
        : undefined,
    },
  };
}

export async function getRequestTypes(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const requestTypes = await RequestTypeModel.find().sort({ createdAt: -1 }).lean();

    res.status(200).json({
      success: true,
      data: requestTypes,
    });
  } catch (error) {
    next(error);
  }
}

export async function getRequestTypeById(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({
        success: false,
        message: "Invalid request type id.",
      });
      return;
    }

    const requestType = await RequestTypeModel.findById(id).lean();

    if (!requestType) {
      res.status(404).json({
        success: false,
        message: "Request type not found.",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: requestType,
    });
  } catch (error) {
    next(error);
  }
}

export async function createRequestType(
  req: Request<unknown, unknown, CreateRequestTypeBody>,
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

    const existingRequestType = await RequestTypeModel.findOne({ code: parsed.data.code })
      .select("_id")
      .lean();

    if (existingRequestType) {
      res.status(409).json({
        success: false,
        message: "Request type code already exists.",
      });
      return;
    }

    const serviceExists = await ServiceModel.exists({ _id: parsed.data.serviceId });
    if (!serviceExists) {
      res.status(400).json({
        success: false,
        message: "serviceId does not reference an existing service.",
      });
      return;
    }

    const requestType = await RequestTypeModel.create(parsed.data);

    res.status(201).json({
      success: true,
      data: requestType,
    });
  } catch (error) {
    const dbError = error as { code?: number };
    if (dbError.code === 11000) {
      res.status(409).json({
        success: false,
        message: "Request type code already exists.",
      });
      return;
    }

    next(error);
  }
}

export async function updateRequestType(
  req: Request<{ id: string }, unknown, CreateRequestTypeBody>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({
        success: false,
        message: "Invalid request type id.",
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

    const existingRequestType = await RequestTypeModel.findById(id);
    if (!existingRequestType) {
      res.status(404).json({
        success: false,
        message: "Request type not found.",
      });
      return;
    }

    const duplicateByCode = await RequestTypeModel.findOne({
      code: parsed.data.code,
      _id: { $ne: existingRequestType._id },
    })
      .select("_id")
      .lean();

    if (duplicateByCode) {
      res.status(409).json({
        success: false,
        message: "Request type code already exists.",
      });
      return;
    }

    const serviceExists = await ServiceModel.exists({ _id: parsed.data.serviceId });
    if (!serviceExists) {
      res.status(400).json({
        success: false,
        message: "serviceId does not reference an existing service.",
      });
      return;
    }

    existingRequestType.serviceId = parsed.data.serviceId;
    existingRequestType.code = parsed.data.code;
    existingRequestType.status = parsed.data.status;
    existingRequestType.name = parsed.data.name;
    existingRequestType.config = parsed.data.config;

    const updatedRequestType = await existingRequestType.save();

    res.status(200).json({
      success: true,
      data: updatedRequestType,
    });
  } catch (error) {
    const dbError = error as { code?: number };
    if (dbError.code === 11000) {
      res.status(409).json({
        success: false,
        message: "Request type code already exists.",
      });
      return;
    }

    next(error);
  }
}
