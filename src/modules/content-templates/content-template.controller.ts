import { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import { ContentTemplateModel } from "./content-template.model";
import {
  CONTENT_TEMPLATE_SCOPES,
  CONTENT_TEMPLATE_STATUSES,
  CONTENT_TEMPLATE_TYPES,
  ContentTemplateMedia,
  ContentTemplateScope,
  ContentTemplateStatus,
  ContentTemplateType,
  CreateContentTemplateBody,
} from "./content-template.types";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasAtLeastOneTranslation(translations: {
  ar?: unknown;
  en?: unknown;
  de?: unknown;
}): boolean {
  return (
    isNonEmptyString(translations.ar) ||
    isNonEmptyString(translations.en) ||
    isNonEmptyString(translations.de)
  );
}

function isValidUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function parseCreateBody(body: CreateContentTemplateBody): {
  isValid: boolean;
  message?: string;
  data?: {
    key: string;
    contentType: ContentTemplateType;
    scope: ContentTemplateScope;
    translations: {
      ar?: string;
      en?: string;
      de?: string;
    };
    media?: ContentTemplateMedia;
    placeholders?: string[];
    status: ContentTemplateStatus;
  };
} {
  if (!isNonEmptyString(body.key)) {
    return { isValid: false, message: "Field 'key' is required." };
  }

  if (
    !isNonEmptyString(body.contentType) ||
    !CONTENT_TEMPLATE_TYPES.includes(body.contentType as ContentTemplateType)
  ) {
    return {
      isValid: false,
      message: `Field 'contentType' must be one of: ${CONTENT_TEMPLATE_TYPES.join(", ")}.`,
    };
  }

  if (
    !isNonEmptyString(body.scope) ||
    !CONTENT_TEMPLATE_SCOPES.includes(body.scope as ContentTemplateScope)
  ) {
    return {
      isValid: false,
      message: `Field 'scope' must be one of: ${CONTENT_TEMPLATE_SCOPES.join(", ")}.`,
    };
  }

  const status = body.status ?? "active";
  if (
    !isNonEmptyString(status) ||
    !CONTENT_TEMPLATE_STATUSES.includes(status as ContentTemplateStatus)
  ) {
    return {
      isValid: false,
      message: `Field 'status' must be one of: ${CONTENT_TEMPLATE_STATUSES.join(", ")}.`,
    };
  }

  if (!isPlainObject(body.translations)) {
    return { isValid: false, message: "Field 'translations' is required." };
  }

  if (body.translations.ar !== undefined && !isNonEmptyString(body.translations.ar)) {
    return { isValid: false, message: "Field 'translations.ar' must be a non-empty string." };
  }

  if (body.translations.en !== undefined && !isNonEmptyString(body.translations.en)) {
    return { isValid: false, message: "Field 'translations.en' must be a non-empty string." };
  }

  if (body.translations.de !== undefined && !isNonEmptyString(body.translations.de)) {
    return { isValid: false, message: "Field 'translations.de' must be a non-empty string." };
  }

  if (!hasAtLeastOneTranslation(body.translations)) {
    return {
      isValid: false,
      message: "At least one translation is required and must be non-empty.",
    };
  }

  if (body.media !== undefined) {
    if (!isPlainObject(body.media)) {
      return {
        isValid: false,
        message: "Field 'media' must be an object.",
      };
    }

    if (!isNonEmptyString(body.media.provider) || body.media.provider.trim() !== "cloudflare") {
      return {
        isValid: false,
        message: "Field 'media.provider' must be 'cloudflare'.",
      };
    }

    if (!isNonEmptyString(body.media.assetId)) {
      return {
        isValid: false,
        message: "Field 'media.assetId' must be a non-empty string.",
      };
    }

    if (!isNonEmptyString(body.media.url) || !isValidUrl(body.media.url)) {
      return {
        isValid: false,
        message: "Field 'media.url' must be a valid http/https URL.",
      };
    }

    if (body.media.thumbnailUrl !== undefined) {
      if (!isNonEmptyString(body.media.thumbnailUrl) || !isValidUrl(body.media.thumbnailUrl)) {
        return {
          isValid: false,
          message: "Field 'media.thumbnailUrl' must be a valid http/https URL when provided.",
        };
      }
    }

    if (body.media.mimeType !== undefined && !isNonEmptyString(body.media.mimeType)) {
      return {
        isValid: false,
        message: "Field 'media.mimeType' must be a non-empty string when provided.",
      };
    }

    if (body.media.fileName !== undefined && !isNonEmptyString(body.media.fileName)) {
      return {
        isValid: false,
        message: "Field 'media.fileName' must be a non-empty string when provided.",
      };
    }
  }

  if (
    body.contentType === "media_caption" &&
    (!isPlainObject(body.media) || !isNonEmptyString(body.media.url) || !isNonEmptyString(body.media.assetId))
  ) {
    return {
      isValid: false,
      message:
        "Fields 'media.assetId' and 'media.url' are required when contentType is 'media_caption'.",
    };
  }

  if (body.placeholders !== undefined && !Array.isArray(body.placeholders)) {
    return {
      isValid: false,
      message: "Field 'placeholders' must be an array of non-empty strings.",
    };
  }

  if (Array.isArray(body.placeholders)) {
    const invalidPlaceholder = body.placeholders.find(
      (placeholder) => !isNonEmptyString(placeholder)
    );
    if (invalidPlaceholder !== undefined) {
      return {
        isValid: false,
        message: "Field 'placeholders' must be an array of non-empty strings.",
      };
    }
  }

  const cleanedPlaceholders = Array.isArray(body.placeholders)
    ? body.placeholders
        .map((placeholder) => placeholder.trim())
        .filter((placeholder, index, arr) => arr.indexOf(placeholder) === index)
    : undefined;

  return {
    isValid: true,
    data: {
      key: body.key.trim(),
      contentType: body.contentType as ContentTemplateType,
      scope: body.scope as ContentTemplateScope,
      translations: {
        ar: body.translations.ar?.toString().trim(),
        en: body.translations.en?.toString().trim(),
        de: body.translations.de?.toString().trim(),
      },
      media: isPlainObject(body.media)
        ? {
            provider: "cloudflare",
            assetId: String(body.media.assetId).trim(),
            url: String(body.media.url).trim(),
            thumbnailUrl: isNonEmptyString(body.media.thumbnailUrl)
              ? body.media.thumbnailUrl.trim()
              : undefined,
            mimeType: isNonEmptyString(body.media.mimeType)
              ? body.media.mimeType.trim()
              : undefined,
            fileName: isNonEmptyString(body.media.fileName)
              ? body.media.fileName.trim()
              : undefined,
          }
        : undefined,
      placeholders: cleanedPlaceholders,
      status: status as ContentTemplateStatus,
    },
  };
}

export async function getContentTemplates(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const contentTemplates = await ContentTemplateModel.find()
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      data: contentTemplates,
    });
  } catch (error) {
    next(error);
  }
}

export async function getContentTemplateById(
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({
        success: false,
        message: "Invalid content template id.",
      });
      return;
    }

    const contentTemplate = await ContentTemplateModel.findById(id).lean();

    if (!contentTemplate) {
      res.status(404).json({
        success: false,
        message: "Content template not found.",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: contentTemplate,
    });
  } catch (error) {
    next(error);
  }
}

export async function createContentTemplate(
  req: Request<unknown, unknown, CreateContentTemplateBody>,
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

    const existingTemplate = await ContentTemplateModel.findOne({ key: parsed.data.key })
      .select("_id")
      .lean();

    if (existingTemplate) {
      res.status(409).json({
        success: false,
        message: "Content template key already exists.",
      });
      return;
    }

    const contentTemplate = await ContentTemplateModel.create(parsed.data);

    res.status(201).json({
      success: true,
      data: contentTemplate,
    });
  } catch (error) {
    const dbError = error as { code?: number };
    if (dbError.code === 11000) {
      res.status(409).json({
        success: false,
        message: "Content template key already exists.",
      });
      return;
    }

    next(error);
  }
}

export async function updateContentTemplate(
  req: Request<{ id: string }, unknown, CreateContentTemplateBody>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({
        success: false,
        message: "Invalid content template id.",
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

    const existingTemplate = await ContentTemplateModel.findById(id);
    if (!existingTemplate) {
      res.status(404).json({
        success: false,
        message: "Content template not found.",
      });
      return;
    }

    const duplicateByKey = await ContentTemplateModel.findOne({
      key: parsed.data.key,
      _id: { $ne: existingTemplate._id },
    })
      .select("_id")
      .lean();

    if (duplicateByKey) {
      res.status(409).json({
        success: false,
        message: "Content template key already exists.",
      });
      return;
    }

    existingTemplate.key = parsed.data.key;
    existingTemplate.contentType = parsed.data.contentType;
    existingTemplate.scope = parsed.data.scope;
    existingTemplate.translations = parsed.data.translations;
    existingTemplate.media = parsed.data.media;
    existingTemplate.placeholders = parsed.data.placeholders;
    existingTemplate.status = parsed.data.status;

    const updatedTemplate = await existingTemplate.save();

    res.status(200).json({
      success: true,
      data: updatedTemplate,
    });
  } catch (error) {
    const dbError = error as { code?: number };
    if (dbError.code === 11000) {
      res.status(409).json({
        success: false,
        message: "Content template key already exists.",
      });
      return;
    }

    next(error);
  }
}
