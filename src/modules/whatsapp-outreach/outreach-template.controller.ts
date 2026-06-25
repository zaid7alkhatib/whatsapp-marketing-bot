import { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import { idsMatch, isClientUserRole, resolveScopedChannelAccount } from "../auth/auth.scope";
import { ChannelAccountModel } from "../channel-accounts/channel-account.model";
import { sendError, sendSuccess } from "../../shared/utils/apiResponse";
import {
  DEFAULT_MARKETING_MESSAGE_TEMPLATE,
  MarketingMessageTemplate,
} from "./message-personalization";
import { OutreachTemplateDocument, OutreachTemplateModel } from "./outreach-template.model";

const MAX_TEMPLATE_LINE_LENGTH = 500;
const DEFAULT_INTEREST_TRIGGERS = ["1", "interested", "مهتم", "مهتمة", "نعم"];

type AuthScopedRequest = Pick<Request, "authUser">;

interface TemplateBody {
  channelAccountId?: unknown;
  name?: unknown;
  personalizationTemplate?: unknown;
  interestTriggers?: unknown;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseTemplateName(value: unknown): string | null {
  if (!isNonEmptyString(value)) {
    return null;
  }

  const name = value.trim().slice(0, 120);
  return name.length >= 2 ? name : null;
}

function parseTemplateLine(value: unknown, fallback: string, maxLength: number): string {
  if (typeof value !== "string") {
    return fallback;
  }

  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function parsePersonalizationTemplate(value: unknown): MarketingMessageTemplate {
  if (!isPlainObject(value)) {
    return DEFAULT_MARKETING_MESSAGE_TEMPLATE;
  }

  return {
    englishGreeting: parseTemplateLine(
      value.englishGreeting,
      DEFAULT_MARKETING_MESSAGE_TEMPLATE.englishGreeting,
      300
    ),
    arabicGreeting: parseTemplateLine(
      value.arabicGreeting,
      DEFAULT_MARKETING_MESSAGE_TEMPLATE.arabicGreeting,
      300
    ),
    englishResponseInstruction: parseTemplateLine(
      value.englishResponseInstruction,
      DEFAULT_MARKETING_MESSAGE_TEMPLATE.englishResponseInstruction,
      MAX_TEMPLATE_LINE_LENGTH
    ),
    arabicResponseInstruction: parseTemplateLine(
      value.arabicResponseInstruction,
      DEFAULT_MARKETING_MESSAGE_TEMPLATE.arabicResponseInstruction,
      MAX_TEMPLATE_LINE_LENGTH
    ),
  };
}

function parseInterestTriggers(value: unknown): string[] {
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === "string"
    ? value.split(/[\n,؛;]+/)
    : DEFAULT_INTEREST_TRIGGERS;

  const seenTriggers = new Set<string>();
  const triggers: string[] = [];

  for (const rawValue of rawValues) {
    if (typeof rawValue !== "string") {
      continue;
    }

    const trigger = rawValue.replace(/\s+/g, " ").trim().slice(0, 80);
    const triggerKey = trigger.toLocaleLowerCase();
    if (!trigger || seenTriggers.has(triggerKey)) {
      continue;
    }

    seenTriggers.add(triggerKey);
    triggers.push(trigger);
  }

  return triggers.slice(0, 30);
}

async function resolveWritableChannelAccountId(
  req: AuthScopedRequest,
  channelAccountIdValue: unknown
): Promise<{ isValid: boolean; statusCode?: number; message?: string; channelAccountId?: string }> {
  if (isClientUserRole(req.authUser?.role)) {
    const scopedChannelAccount = await resolveScopedChannelAccount(req.authUser);
    if (!scopedChannelAccount) {
      return {
        isValid: false,
        statusCode: 403,
        message: "Client channel account scope is not configured.",
      };
    }

    if (
      isNonEmptyString(channelAccountIdValue) &&
      !idsMatch(scopedChannelAccount._id, channelAccountIdValue.trim())
    ) {
      return {
        isValid: false,
        statusCode: 404,
        message: "Channel account not found.",
      };
    }

    return {
      isValid: true,
      channelAccountId: String(scopedChannelAccount._id),
    };
  }

  if (!isNonEmptyString(channelAccountIdValue) || !mongoose.isValidObjectId(channelAccountIdValue)) {
    return {
      isValid: false,
      statusCode: 400,
      message: "Field 'channelAccountId' must be a valid ObjectId.",
    };
  }

  return {
    isValid: true,
    channelAccountId: channelAccountIdValue.trim(),
  };
}

async function getTemplateFilterForRequest(
  req: Request
): Promise<{ isValid: boolean; statusCode?: number; message?: string; filter?: Record<string, unknown> }> {
  if (isClientUserRole(req.authUser?.role)) {
    const scopedChannelAccount = await resolveScopedChannelAccount(req.authUser);
    if (!scopedChannelAccount) {
      return {
        isValid: false,
        statusCode: 403,
        message: "Client channel account scope is not configured.",
      };
    }

    return { isValid: true, filter: { channelAccountId: scopedChannelAccount._id } };
  }

  const queryChannelAccountId =
    typeof req.query.channelAccountId === "string" ? req.query.channelAccountId.trim() : "";
  if (queryChannelAccountId) {
    if (!mongoose.isValidObjectId(queryChannelAccountId)) {
      return {
        isValid: false,
        statusCode: 400,
        message: "Field 'channelAccountId' must be a valid ObjectId.",
      };
    }

    return {
      isValid: true,
      filter: { channelAccountId: new mongoose.Types.ObjectId(queryChannelAccountId) },
    };
  }

  return { isValid: true, filter: {} };
}

async function canAccessTemplate(
  req: AuthScopedRequest,
  template: OutreachTemplateDocument
): Promise<boolean> {
  if (!isClientUserRole(req.authUser?.role)) {
    return true;
  }

  const scopedChannelAccount = await resolveScopedChannelAccount(req.authUser);
  return Boolean(scopedChannelAccount && idsMatch(scopedChannelAccount._id, template.channelAccountId));
}

function serializeTemplate(template: OutreachTemplateDocument) {
  return {
    _id: String(template._id),
    channelAccountId: String(template.channelAccountId),
    name: template.name,
    personalizationTemplate: template.personalizationTemplate,
    interestTriggers: template.interestTriggers ?? [],
    createdAt: template.createdAt?.toISOString(),
    updatedAt: template.updatedAt?.toISOString(),
  };
}

export async function getOutreachTemplates(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const scopedFilter = await getTemplateFilterForRequest(req);
    if (!scopedFilter.isValid || !scopedFilter.filter) {
      sendError(res, scopedFilter.message ?? "Unable to resolve template scope.", scopedFilter.statusCode ?? 403);
      return;
    }

    const templates = await OutreachTemplateModel.find(scopedFilter.filter)
      .sort({ updatedAt: -1 })
      .limit(200)
      .exec();

    sendSuccess(res, { data: templates.map(serializeTemplate) });
  } catch (error) {
    next(error);
  }
}

export async function createOutreachTemplate(
  req: Request<unknown, unknown, TemplateBody>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const scopedChannelAccount = await resolveWritableChannelAccountId(req, req.body.channelAccountId);
    if (!scopedChannelAccount.isValid || !scopedChannelAccount.channelAccountId) {
      sendError(
        res,
        scopedChannelAccount.message ?? "Unable to resolve channel account.",
        scopedChannelAccount.statusCode ?? 400
      );
      return;
    }

    const channelAccount = await ChannelAccountModel.findById(scopedChannelAccount.channelAccountId)
      .select("_id")
      .lean();
    if (!channelAccount) {
      sendError(res, "Channel account not found.", 404);
      return;
    }

    const name = parseTemplateName(req.body.name);
    if (!name) {
      sendError(res, "Field 'name' is required and must be at least 2 characters.", 400);
      return;
    }

    const template = await OutreachTemplateModel.create({
      channelAccountId: new mongoose.Types.ObjectId(scopedChannelAccount.channelAccountId),
      name,
      personalizationTemplate: parsePersonalizationTemplate(req.body.personalizationTemplate),
      interestTriggers: parseInterestTriggers(req.body.interestTriggers),
      createdBy: req.authUser
        ? {
            username: req.authUser.username,
            role: req.authUser.role,
          }
        : undefined,
    });

    sendSuccess(res, {
      data: serializeTemplate(template),
      statusCode: 201,
      message: "Template saved. / تم حفظ القالب.",
    });
  } catch (error) {
    const dbError = error as { code?: number };
    if (dbError.code === 11000) {
      sendError(res, "A template with this name already exists for this account.", 409);
      return;
    }

    next(error);
  }
}

export async function updateOutreachTemplate(
  req: Request<{ id: string }, unknown, TemplateBody>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      sendError(res, "Invalid template id.", 400);
      return;
    }

    const template = await OutreachTemplateModel.findById(req.params.id).exec();
    if (!template || !(await canAccessTemplate(req, template))) {
      sendError(res, "Template not found.", 404);
      return;
    }

    const name = parseTemplateName(req.body.name);
    if (!name) {
      sendError(res, "Field 'name' is required and must be at least 2 characters.", 400);
      return;
    }

    template.name = name;
    template.personalizationTemplate = parsePersonalizationTemplate(req.body.personalizationTemplate);
    template.interestTriggers = parseInterestTriggers(req.body.interestTriggers);
    await template.save();

    sendSuccess(res, {
      data: serializeTemplate(template),
      message: "Template updated. / تم تحديث القالب.",
    });
  } catch (error) {
    const dbError = error as { code?: number };
    if (dbError.code === 11000) {
      sendError(res, "A template with this name already exists for this account.", 409);
      return;
    }

    next(error);
  }
}

export async function deleteOutreachTemplate(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      sendError(res, "Invalid template id.", 400);
      return;
    }

    const template = await OutreachTemplateModel.findById(req.params.id).exec();
    if (!template || !(await canAccessTemplate(req, template))) {
      sendError(res, "Template not found.", 404);
      return;
    }

    await template.deleteOne();
    sendSuccess(res, { message: "Template deleted. / تم حذف القالب." });
  } catch (error) {
    next(error);
  }
}

