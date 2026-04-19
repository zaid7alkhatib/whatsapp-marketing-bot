import { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import { BotSessionModel } from "../bot-sessions/bot-session.model";
import { BusinessPartnerModel } from "../business-partners/business-partner.model";
import { OrgUnitModel } from "../org-units/org-unit.model";
import { RequestTypeModel } from "../request-types/request-type.model";
import { ServiceModel } from "../services/service.model";
import { ServiceRequestModel } from "./service-request.model";
import {
  CreateServiceRequestBody,
  ServiceRequestSnapshots,
} from "./service-request.types";

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
      return {
        isValid: false,
        message: `Field '${fieldName}' is required and must be a valid date.`,
      };
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

function parseCreateBody(body: CreateServiceRequestBody): {
  isValid: boolean;
  message?: string;
  data?: {
    orgUnitId?: mongoose.Types.ObjectId;
    businessPartnerId?: mongoose.Types.ObjectId;
    sessionId?: mongoose.Types.ObjectId;
    serviceId: mongoose.Types.ObjectId;
    requestTypeId: mongoose.Types.ObjectId;
    statusCode: string;
    priorityCode?: string;
    sourceChannelCode?: string;
    language?: string;
    submittedAt: Date;
    assignedToUserId?: mongoose.Types.ObjectId;
    requestData: Record<string, unknown>;
    aiSummary?: Record<string, unknown>;
    snapshots?: ServiceRequestSnapshots;
  };
} {
  if (body.orgUnitId !== undefined) {
    if (!isNonEmptyString(body.orgUnitId) || !mongoose.isValidObjectId(body.orgUnitId)) {
      return { isValid: false, message: "Field 'orgUnitId' must be a valid ObjectId." };
    }
  }

  if (body.businessPartnerId !== undefined) {
    if (
      !isNonEmptyString(body.businessPartnerId) ||
      !mongoose.isValidObjectId(body.businessPartnerId)
    ) {
      return { isValid: false, message: "Field 'businessPartnerId' must be a valid ObjectId." };
    }
  }

  if (body.sessionId !== undefined) {
    if (!isNonEmptyString(body.sessionId) || !mongoose.isValidObjectId(body.sessionId)) {
      return { isValid: false, message: "Field 'sessionId' must be a valid ObjectId." };
    }
  }

  if (!isNonEmptyString(body.serviceId) || !mongoose.isValidObjectId(body.serviceId)) {
    return { isValid: false, message: "Field 'serviceId' must be a valid ObjectId." };
  }

  if (!isNonEmptyString(body.requestTypeId) || !mongoose.isValidObjectId(body.requestTypeId)) {
    return { isValid: false, message: "Field 'requestTypeId' must be a valid ObjectId." };
  }

  if (!isNonEmptyString(body.statusCode)) {
    return { isValid: false, message: "Field 'statusCode' is required." };
  }

  if (body.priorityCode !== undefined && !isNonEmptyString(body.priorityCode)) {
    return { isValid: false, message: "Field 'priorityCode' must be a non-empty string." };
  }

  if (body.sourceChannelCode !== undefined && !isNonEmptyString(body.sourceChannelCode)) {
    return { isValid: false, message: "Field 'sourceChannelCode' must be a non-empty string." };
  }

  if (body.language !== undefined && !isNonEmptyString(body.language)) {
    return { isValid: false, message: "Field 'language' must be a non-empty string." };
  }

  const submittedAtResult = parseDateField(body.submittedAt, "submittedAt", true);
  if (!submittedAtResult.isValid || !submittedAtResult.date) {
    return { isValid: false, message: submittedAtResult.message };
  }

  if (body.assignedToUserId !== undefined) {
    if (
      !isNonEmptyString(body.assignedToUserId) ||
      !mongoose.isValidObjectId(body.assignedToUserId)
    ) {
      return { isValid: false, message: "Field 'assignedToUserId' must be a valid ObjectId." };
    }
  }

  if (!isPlainObject(body.requestData)) {
    return { isValid: false, message: "Field 'requestData' is required and must be an object." };
  }

  if (body.aiSummary !== undefined && !isPlainObject(body.aiSummary)) {
    return { isValid: false, message: "Field 'aiSummary' must be an object." };
  }

  if (body.snapshots !== undefined && !isPlainObject(body.snapshots)) {
    return { isValid: false, message: "Field 'snapshots' must be an object." };
  }

  return {
    isValid: true,
    data: {
      orgUnitId: body.orgUnitId ? new mongoose.Types.ObjectId(body.orgUnitId) : undefined,
      businessPartnerId: body.businessPartnerId
        ? new mongoose.Types.ObjectId(body.businessPartnerId)
        : undefined,
      sessionId: body.sessionId ? new mongoose.Types.ObjectId(body.sessionId) : undefined,
      serviceId: new mongoose.Types.ObjectId(body.serviceId),
      requestTypeId: new mongoose.Types.ObjectId(body.requestTypeId),
      statusCode: body.statusCode.trim(),
      priorityCode: body.priorityCode?.trim(),
      sourceChannelCode: body.sourceChannelCode?.trim(),
      language: body.language?.trim(),
      submittedAt: submittedAtResult.date,
      assignedToUserId: body.assignedToUserId
        ? new mongoose.Types.ObjectId(body.assignedToUserId)
        : undefined,
      requestData: body.requestData as Record<string, unknown>,
      aiSummary: body.aiSummary as Record<string, unknown> | undefined,
      snapshots: body.snapshots as ServiceRequestSnapshots | undefined,
    },
  };
}

export async function getServiceRequests(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const serviceRequests = await ServiceRequestModel.find().sort({ createdAt: -1 }).lean();

    res.status(200).json({
      success: true,
      data: serviceRequests,
    });
  } catch (error) {
    next(error);
  }
}

export async function getServiceRequestById(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({
        success: false,
        message: "Invalid service request id.",
      });
      return;
    }

    const serviceRequest = await ServiceRequestModel.findById(id).lean();
    if (!serviceRequest) {
      res.status(404).json({
        success: false,
        message: "Service request not found.",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: serviceRequest,
    });
  } catch (error) {
    next(error);
  }
}

export async function createServiceRequest(
  req: Request<unknown, unknown, CreateServiceRequestBody>,
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

    const service = await ServiceModel.findById(parsed.data.serviceId).lean();
    if (!service) {
      res.status(400).json({
        success: false,
        message: "serviceId does not reference an existing service.",
      });
      return;
    }

    const requestType = await RequestTypeModel.findById(parsed.data.requestTypeId).lean();
    if (!requestType) {
      res.status(400).json({
        success: false,
        message: "requestTypeId does not reference an existing request type.",
      });
      return;
    }

    let orgUnitSnapshot: ServiceRequestSnapshots["orgUnit"];
    if (parsed.data.orgUnitId) {
      const orgUnit = await OrgUnitModel.findById(parsed.data.orgUnitId).lean();
      if (!orgUnit) {
        res.status(400).json({
          success: false,
          message: "orgUnitId does not reference an existing org unit.",
        });
        return;
      }
      orgUnitSnapshot = {
        code: orgUnit.code,
        name: orgUnit.name
          ? {
              ar: orgUnit.name.ar,
              en: orgUnit.name.en,
              de: orgUnit.name.de,
            }
          : undefined,
      };
    }

    if (parsed.data.businessPartnerId) {
      const businessPartnerExists = await BusinessPartnerModel.exists({
        _id: parsed.data.businessPartnerId,
      });
      if (!businessPartnerExists) {
        res.status(400).json({
          success: false,
          message: "businessPartnerId does not reference an existing business partner.",
        });
        return;
      }
    }

    if (parsed.data.sessionId) {
      const sessionExists = await BotSessionModel.exists({ _id: parsed.data.sessionId });
      if (!sessionExists) {
        res.status(400).json({
          success: false,
          message: "sessionId does not reference an existing bot session.",
        });
        return;
      }
    }

    const snapshots: ServiceRequestSnapshots = {
      ...(parsed.data.snapshots ?? {}),
      service: {
        code: service.code,
        name: service.name
          ? {
              ar: service.name.ar,
              en: service.name.en,
              de: service.name.de,
            }
          : undefined,
      },
      requestType: {
        code: requestType.code,
        name: requestType.name
          ? {
              ar: requestType.name.ar,
              en: requestType.name.en,
              de: requestType.name.de,
            }
          : undefined,
      },
      orgUnit: orgUnitSnapshot ?? parsed.data.snapshots?.orgUnit,
    };

    const serviceRequest = await ServiceRequestModel.create({
      ...parsed.data,
      snapshots,
    });

    res.status(201).json({
      success: true,
      data: serviceRequest,
    });
  } catch (error) {
    next(error);
  }
}
