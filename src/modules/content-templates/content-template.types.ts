export const CONTENT_TEMPLATE_TYPES = ["text", "markdown", "media_caption"] as const;
export type ContentTemplateType = (typeof CONTENT_TEMPLATE_TYPES)[number];

export const CONTENT_TEMPLATE_SCOPES = ["global", "org_unit"] as const;
export type ContentTemplateScope = (typeof CONTENT_TEMPLATE_SCOPES)[number];

export const CONTENT_TEMPLATE_STATUSES = ["active", "inactive"] as const;
export type ContentTemplateStatus = (typeof CONTENT_TEMPLATE_STATUSES)[number];

export interface ContentTemplateTranslations {
  ar?: string;
  en?: string;
  de?: string;
}

export interface ContentTemplate {
  key: string;
  contentType: ContentTemplateType;
  scope: ContentTemplateScope;
  translations: ContentTemplateTranslations;
  placeholders?: string[];
  status: ContentTemplateStatus;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface CreateContentTemplateBody {
  key?: unknown;
  contentType?: unknown;
  scope?: unknown;
  translations?: {
    ar?: unknown;
    en?: unknown;
    de?: unknown;
  };
  placeholders?: unknown;
  status?: unknown;
}
