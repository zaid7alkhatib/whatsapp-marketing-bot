export const CONTENT_TEMPLATE_TYPES = ["text", "markdown", "media_caption"] as const;
export type ContentTemplateType = (typeof CONTENT_TEMPLATE_TYPES)[number];

export const CONTENT_TEMPLATE_SCOPES = ["global", "org_unit", "flow"] as const;
export type ContentTemplateScope = (typeof CONTENT_TEMPLATE_SCOPES)[number];

export const CONTENT_TEMPLATE_STATUSES = ["active", "inactive"] as const;
export type ContentTemplateStatus = (typeof CONTENT_TEMPLATE_STATUSES)[number];

export interface ContentTemplateTranslations {
  ar?: string;
  en?: string;
  de?: string;
}

export interface ContentTemplateMedia {
  provider: "cloudflare";
  assetId: string;
  url: string;
  thumbnailUrl?: string;
  mimeType?: string;
  fileName?: string;
}

export interface ContentTemplate {
  key: string;
  contentType: ContentTemplateType;
  scope: ContentTemplateScope;
  translations: ContentTemplateTranslations;
  media?: ContentTemplateMedia;
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
  media?: {
    provider?: unknown;
    assetId?: unknown;
    url?: unknown;
    thumbnailUrl?: unknown;
    mimeType?: unknown;
    fileName?: unknown;
  };
  placeholders?: unknown;
  status?: unknown;
}
