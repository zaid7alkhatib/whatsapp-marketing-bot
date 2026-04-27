import { NextFunction, Request, Response } from "express";
import { normalizeMessageTextFormatting } from "../../shared/utils/messageFormatting";
import { resolveScopedFlow } from "../auth/auth.scope";
import { ContentTemplateModel } from "../content-templates/content-template.model";
import { FlowStepModel } from "../flow-steps/flow-step.model";

interface MessageTranslationPayload {
  ar?: unknown;
  en?: unknown;
  de?: unknown;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeTemplateKey(value: string): string {
  return value.trim();
}

function toDisplayTemplateMessage(template: {
  key: string;
  contentType?: string;
  status?: string;
  translations?: {
    ar?: string;
    en?: string;
    de?: string;
  };
}) {
  return {
    key: template.key,
    contentType: template.contentType ?? "text",
    status: template.status ?? "active",
    translations: {
      ar: normalizeMessageTextFormatting(template.translations?.ar ?? ""),
      en: normalizeMessageTextFormatting(template.translations?.en ?? ""),
      de: normalizeMessageTextFormatting(template.translations?.de ?? ""),
    },
  };
}

function normalizeIncomingTranslationValue(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalizeMessageTextFormatting(normalized) : "";
}

async function getScopedContentKeys(
  authUser?: Request["authUser"]
) {
  const scopedFlow = await resolveScopedFlow(authUser);
  if (!scopedFlow) {
    return null;
  }

  const flowSteps = await FlowStepModel.find({ flowId: scopedFlow._id })
    .select("code contentKey sequence")
    .sort({ sequence: 1 })
    .lean<Array<{ code: string; contentKey?: string; sequence: number }>>();

  const contentKeyRows = flowSteps
    .filter((step) => isNonEmptyString(step.contentKey))
    .map((step) => ({
      key: normalizeTemplateKey(step.contentKey as string),
      stepCode: step.code,
      sequence: step.sequence,
    }));

  const uniqueKeys = Array.from(new Set(contentKeyRows.map((row) => row.key)));

  return {
    scopedFlow,
    flowSteps: contentKeyRows,
    contentKeys: uniqueKeys,
  };
}

export async function getClientFlowMessages(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const scopedContentState = await getScopedContentKeys(req.authUser);
    if (!scopedContentState) {
      res.status(403).json({
        success: false,
        message: "Client flow scope is not configured.",
      });
      return;
    }

    if (scopedContentState.contentKeys.length === 0) {
      res.status(200).json({
        success: true,
        data: {
          flow: scopedContentState.scopedFlow,
          messages: [],
        },
      });
      return;
    }

    const templates = await ContentTemplateModel.find({
      key: { $in: scopedContentState.contentKeys },
    })
      .select("key contentType status translations")
      .lean<Array<{ key: string; contentType?: string; status?: string; translations?: { ar?: string; en?: string; de?: string } }>>();

    const templatesByKey = new Map(templates.map((template) => [template.key, template] as const));

    const messages = scopedContentState.contentKeys.map((key) => {
      const linkedSteps = scopedContentState.flowSteps
        .filter((row) => row.key === key)
        .map((row) => row.stepCode);

      const template = templatesByKey.get(key);
      return {
        key,
        linkedStepCodes: linkedSteps,
        usedInSteps: linkedSteps.length,
        configured: Boolean(template),
        ...(template
          ? toDisplayTemplateMessage(template)
          : {
              contentType: "text",
              status: "active",
              translations: { ar: "", en: "", de: "" },
            }),
      };
    });

    res.status(200).json({
      success: true,
      data: {
        flow: scopedContentState.scopedFlow,
        messages,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function updateClientFlowMessage(
  req: Request<{ key: string }, unknown, { translations?: MessageTranslationPayload }>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const scopedContentState = await getScopedContentKeys(req.authUser);
    if (!scopedContentState) {
      res.status(403).json({
        success: false,
        message: "Client flow scope is not configured.",
      });
      return;
    }

    const routeKey = normalizeTemplateKey(req.params.key);
    if (!isNonEmptyString(routeKey)) {
      res.status(400).json({
        success: false,
        message: "Template key is required.",
      });
      return;
    }

    if (!scopedContentState.contentKeys.includes(routeKey)) {
      res.status(403).json({
        success: false,
        message: "This template key is outside the allowed flow scope.",
      });
      return;
    }

    const bodyTranslations = req.body?.translations;
    if (!bodyTranslations || typeof bodyTranslations !== "object" || Array.isArray(bodyTranslations)) {
      res.status(400).json({
        success: false,
        message: "Field 'translations' is required.",
      });
      return;
    }

    const existingTemplate = await ContentTemplateModel.findOne({ key: routeKey });

    const nextTranslations = {
      ar: normalizeIncomingTranslationValue(bodyTranslations.ar) ?? existingTemplate?.translations?.ar ?? "",
      en: normalizeIncomingTranslationValue(bodyTranslations.en) ?? existingTemplate?.translations?.en ?? "",
      de: normalizeIncomingTranslationValue(bodyTranslations.de) ?? existingTemplate?.translations?.de ?? "",
    };

    const cleanedTranslations = {
      ar: isNonEmptyString(nextTranslations.ar) ? nextTranslations.ar : undefined,
      en: isNonEmptyString(nextTranslations.en) ? nextTranslations.en : undefined,
      de: isNonEmptyString(nextTranslations.de) ? nextTranslations.de : undefined,
    };

    if (!cleanedTranslations.ar && !cleanedTranslations.en && !cleanedTranslations.de) {
      res.status(400).json({
        success: false,
        message: "At least one translation is required.",
      });
      return;
    }

    let savedTemplate = existingTemplate;

    if (!savedTemplate) {
      savedTemplate = await ContentTemplateModel.create({
        key: routeKey,
        contentType: "text",
        scope: "global",
        status: "active",
        translations: cleanedTranslations,
      });
    } else {
      savedTemplate.translations = cleanedTranslations;
      await savedTemplate.save();
    }

    res.status(200).json({
      success: true,
      data: toDisplayTemplateMessage({
        key: savedTemplate.key,
        contentType: savedTemplate.contentType,
        status: savedTemplate.status,
        translations: savedTemplate.translations,
      }),
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteClientFlowMessage(
  req: Request<{ key: string }>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const scopedContentState = await getScopedContentKeys(req.authUser);
    if (!scopedContentState) {
      res.status(403).json({
        success: false,
        message: "Client flow scope is not configured.",
      });
      return;
    }

    const routeKey = normalizeTemplateKey(req.params.key);
    if (!isNonEmptyString(routeKey)) {
      res.status(400).json({
        success: false,
        message: "Template key is required.",
      });
      return;
    }

    if (!scopedContentState.contentKeys.includes(routeKey)) {
      res.status(403).json({
        success: false,
        message: "This template key is outside the allowed flow scope.",
      });
      return;
    }

    const sharedUsageOutsideScopedFlow = await FlowStepModel.exists({
      contentKey: routeKey,
      flowId: { $ne: scopedContentState.scopedFlow._id },
    });

    if (sharedUsageOutsideScopedFlow) {
      res.status(409).json({
        success: false,
        message:
          "This message key is also used outside the scoped client flow and cannot be deleted here.",
      });
      return;
    }

    const deletedTemplate = await ContentTemplateModel.findOneAndDelete({ key: routeKey })
      .select("key")
      .lean<{ key: string } | null>();

    if (!deletedTemplate) {
      res.status(404).json({
        success: false,
        message: "No saved text exists for this message key.",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        key: routeKey,
      },
      message: "Flow message deleted successfully.",
    });
  } catch (error) {
    next(error);
  }
}
