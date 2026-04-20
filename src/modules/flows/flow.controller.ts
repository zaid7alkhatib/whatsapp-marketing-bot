import { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import { isClientUserRole, resolveScopedFlow } from "../auth/auth.scope";
import { RequestTypeModel } from "../request-types/request-type.model";
import { ServiceModel } from "../services/service.model";
import { FlowModel } from "./flow.model";
import { CreateFlowBody, FLOW_STATUSES, FlowStatus } from "./flow.types";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isBooleanOrUndefined(value: unknown): value is boolean | undefined {
  return value === undefined || typeof value === "boolean";
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function parseStringArray(
  value: unknown,
  fieldName: string
): { isValid: boolean; data?: string[]; message?: string } {
  if (value === undefined) {
    return { isValid: true };
  }

  if (!Array.isArray(value)) {
    return {
      isValid: false,
      message: `Field '${fieldName}' must be an array of non-empty strings.`,
    };
  }

  const invalidEntry = value.find((item) => !isNonEmptyString(item));
  if (invalidEntry !== undefined) {
    return {
      isValid: false,
      message: `Field '${fieldName}' must be an array of non-empty strings.`,
    };
  }

  const cleaned = value
    .map((item) => item.trim())
    .filter((item, index, arr) => arr.indexOf(item) === index);

  return { isValid: true, data: cleaned };
}

function parseOptionalObjectId(
  value: unknown,
  fieldName: string
): { isValid: boolean; data?: mongoose.Types.ObjectId; message?: string } {
  if (value === undefined) {
    return { isValid: true };
  }

  if (!isNonEmptyString(value) || !mongoose.isValidObjectId(value)) {
    return {
      isValid: false,
      message: `Field '${fieldName}' must be a valid ObjectId.`,
    };
  }

  return { isValid: true, data: new mongoose.Types.ObjectId(value) };
}

function parseCreateBody(body: CreateFlowBody): {
  isValid: boolean;
  message?: string;
  data?: {
    code: string;
    name: string;
    version: number;
    status: FlowStatus;
    startStepCode: string;
    appliesTo?: {
      channelCodes?: string[];
      orgUnitTypes?: string[];
    };
    settings?: {
      allowResume?: boolean;
      sessionTimeoutMinutes?: number;
      createServiceRequestOnCompletion?: boolean;
      serviceId?: mongoose.Types.ObjectId;
      requestTypeId?: mongoose.Types.ObjectId;
    };
  };
} {
  if (!isNonEmptyString(body.code)) {
    return { isValid: false, message: "Field 'code' is required." };
  }

  if (!isNonEmptyString(body.name)) {
    return { isValid: false, message: "Field 'name' is required." };
  }

  if (!isPositiveNumber(body.version)) {
    return { isValid: false, message: "Field 'version' is required and must be a positive number." };
  }

  if (!isNonEmptyString(body.startStepCode)) {
    return { isValid: false, message: "Field 'startStepCode' is required." };
  }

  if (!isNonEmptyString(body.status) || !FLOW_STATUSES.includes(body.status as FlowStatus)) {
    return {
      isValid: false,
      message: `Field 'status' must be one of: ${FLOW_STATUSES.join(", ")}.`,
    };
  }

  if (body.appliesTo !== undefined && !isPlainObject(body.appliesTo)) {
    return { isValid: false, message: "Field 'appliesTo' must be an object." };
  }

  const channelCodesResult = parseStringArray(body.appliesTo?.channelCodes, "appliesTo.channelCodes");
  if (!channelCodesResult.isValid) {
    return { isValid: false, message: channelCodesResult.message };
  }

  const orgUnitTypesResult = parseStringArray(body.appliesTo?.orgUnitTypes, "appliesTo.orgUnitTypes");
  if (!orgUnitTypesResult.isValid) {
    return { isValid: false, message: orgUnitTypesResult.message };
  }

  if (body.settings !== undefined && !isPlainObject(body.settings)) {
    return { isValid: false, message: "Field 'settings' must be an object." };
  }

  if (!isBooleanOrUndefined(body.settings?.allowResume)) {
    return { isValid: false, message: "Field 'settings.allowResume' must be boolean." };
  }

  if (
    body.settings?.sessionTimeoutMinutes !== undefined &&
    !isPositiveNumber(body.settings.sessionTimeoutMinutes)
  ) {
    return {
      isValid: false,
      message: "Field 'settings.sessionTimeoutMinutes' must be a positive number.",
    };
  }

  if (!isBooleanOrUndefined(body.settings?.createServiceRequestOnCompletion)) {
    return {
      isValid: false,
      message: "Field 'settings.createServiceRequestOnCompletion' must be boolean.",
    };
  }

  const serviceIdResult = parseOptionalObjectId(body.settings?.serviceId, "settings.serviceId");
  if (!serviceIdResult.isValid) {
    return { isValid: false, message: serviceIdResult.message };
  }

  const requestTypeIdResult = parseOptionalObjectId(
    body.settings?.requestTypeId,
    "settings.requestTypeId"
  );
  if (!requestTypeIdResult.isValid) {
    return { isValid: false, message: requestTypeIdResult.message };
  }

  if (body.settings?.createServiceRequestOnCompletion === true) {
    if (!serviceIdResult.data) {
      return {
        isValid: false,
        message: "Field 'settings.serviceId' is required when createServiceRequestOnCompletion is true.",
      };
    }

    if (!requestTypeIdResult.data) {
      return {
        isValid: false,
        message: "Field 'settings.requestTypeId' is required when createServiceRequestOnCompletion is true.",
      };
    }
  }

  const appliesTo =
    body.appliesTo && (channelCodesResult.data || orgUnitTypesResult.data)
      ? {
          channelCodes: channelCodesResult.data,
          orgUnitTypes: orgUnitTypesResult.data,
        }
      : undefined;

  const settings =
    body.settings &&
    (body.settings.allowResume !== undefined ||
      body.settings.sessionTimeoutMinutes !== undefined ||
      body.settings.createServiceRequestOnCompletion !== undefined ||
      serviceIdResult.data !== undefined ||
      requestTypeIdResult.data !== undefined)
      ? {
          allowResume: body.settings.allowResume,
          sessionTimeoutMinutes: body.settings.sessionTimeoutMinutes as number | undefined,
          createServiceRequestOnCompletion: body.settings.createServiceRequestOnCompletion,
          serviceId: serviceIdResult.data,
          requestTypeId: requestTypeIdResult.data,
        }
      : undefined;

  return {
    isValid: true,
    data: {
      code: body.code.trim().toUpperCase(),
      name: body.name.trim(),
      version: body.version,
      status: body.status as FlowStatus,
      startStepCode: body.startStepCode.trim(),
      appliesTo,
      settings,
    },
  };
}

export async function getFlows(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (isClientUserRole(req.authUser?.role)) {
      const scopedFlow = await resolveScopedFlow(req.authUser);
      if (!scopedFlow) {
        res.status(403).json({
          success: false,
          message: "Client flow scope is not configured.",
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: [
          {
            _id: scopedFlow._id,
            code: scopedFlow.code,
            version: scopedFlow.version,
          },
        ],
      });
      return;
    }

    const flows = await FlowModel.find().sort({ createdAt: -1 }).lean();

    res.status(200).json({
      success: true,
      data: flows,
    });
  } catch (error) {
    next(error);
  }
}

export async function getFlowById(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({
        success: false,
        message: "Invalid flow id.",
      });
      return;
    }

    if (isClientUserRole(req.authUser?.role)) {
      const scopedFlow = await resolveScopedFlow(req.authUser);
      if (!scopedFlow) {
        res.status(403).json({
          success: false,
          message: "Client flow scope is not configured.",
        });
        return;
      }

      if (String(scopedFlow._id) !== id) {
        res.status(404).json({
          success: false,
          message: "Flow not found.",
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          _id: scopedFlow._id,
          code: scopedFlow.code,
          version: scopedFlow.version,
        },
      });
      return;
    }

    const flow = await FlowModel.findById(id).lean();

    if (!flow) {
      res.status(404).json({
        success: false,
        message: "Flow not found.",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: flow,
    });
  } catch (error) {
    next(error);
  }
}

export async function createFlow(
  req: Request<unknown, unknown, CreateFlowBody>,
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

    if (parsed.data.settings?.createServiceRequestOnCompletion === true) {
      const { serviceId, requestTypeId } = parsed.data.settings;

      if (!serviceId || !requestTypeId) {
        res.status(400).json({
          success: false,
          message:
            "settings.serviceId and settings.requestTypeId are required when createServiceRequestOnCompletion is true.",
        });
        return;
      }

      const [serviceExists, requestTypeExists] = await Promise.all([
        ServiceModel.exists({ _id: serviceId }),
        RequestTypeModel.exists({ _id: requestTypeId }),
      ]);

      if (!serviceExists) {
        res.status(400).json({
          success: false,
          message: "settings.serviceId does not reference an existing service.",
        });
        return;
      }

      if (!requestTypeExists) {
        res.status(400).json({
          success: false,
          message: "settings.requestTypeId does not reference an existing request type.",
        });
        return;
      }
    }

    const existingFlow = await FlowModel.findOne({
      code: parsed.data.code,
      version: parsed.data.version,
    })
      .select("_id")
      .lean();

    if (existingFlow) {
      res.status(409).json({
        success: false,
        message: "Flow with this code and version already exists.",
      });
      return;
    }

    const flow = await FlowModel.create(parsed.data);

    res.status(201).json({
      success: true,
      data: flow,
    });
  } catch (error) {
    const dbError = error as { code?: number };
    if (dbError.code === 11000) {
      res.status(409).json({
        success: false,
        message: "Flow with this code and version already exists.",
      });
      return;
    }

    next(error);
  }
}

export async function updateFlow(
  req: Request<{ id: string }, unknown, CreateFlowBody>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({
        success: false,
        message: "Invalid flow id.",
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

    const existingFlow = await FlowModel.findById(id);
    if (!existingFlow) {
      res.status(404).json({
        success: false,
        message: "Flow not found.",
      });
      return;
    }

    if (parsed.data.settings?.createServiceRequestOnCompletion === true) {
      const { serviceId, requestTypeId } = parsed.data.settings;

      if (!serviceId || !requestTypeId) {
        res.status(400).json({
          success: false,
          message:
            "settings.serviceId and settings.requestTypeId are required when createServiceRequestOnCompletion is true.",
        });
        return;
      }

      const [serviceExists, requestTypeExists] = await Promise.all([
        ServiceModel.exists({ _id: serviceId }),
        RequestTypeModel.exists({ _id: requestTypeId }),
      ]);

      if (!serviceExists) {
        res.status(400).json({
          success: false,
          message: "settings.serviceId does not reference an existing service.",
        });
        return;
      }

      if (!requestTypeExists) {
        res.status(400).json({
          success: false,
          message: "settings.requestTypeId does not reference an existing request type.",
        });
        return;
      }
    }

    const duplicateByCodeVersion = await FlowModel.findOne({
      code: parsed.data.code,
      version: parsed.data.version,
      _id: { $ne: existingFlow._id },
    })
      .select("_id")
      .lean();

    if (duplicateByCodeVersion) {
      res.status(409).json({
        success: false,
        message: "Flow with this code and version already exists.",
      });
      return;
    }

    existingFlow.code = parsed.data.code;
    existingFlow.name = parsed.data.name;
    existingFlow.version = parsed.data.version;
    existingFlow.status = parsed.data.status;
    existingFlow.startStepCode = parsed.data.startStepCode;
    existingFlow.appliesTo = parsed.data.appliesTo;
    existingFlow.settings = parsed.data.settings;

    const updatedFlow = await existingFlow.save();

    res.status(200).json({
      success: true,
      data: updatedFlow,
    });
  } catch (error) {
    const dbError = error as { code?: number };
    if (dbError.code === 11000) {
      res.status(409).json({
        success: false,
        message: "Flow with this code and version already exists.",
      });
      return;
    }

    next(error);
  }
}
