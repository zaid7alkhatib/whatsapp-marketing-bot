export interface CloudflareDirectUploadBody {
  requireSignedURLs?: unknown;
  metadata?: unknown;
}

export interface CloudflareDirectUploadResult {
  id: string;
  uploadURL: string;
}

export interface CloudflareImageDetails {
  id: string;
  filename?: string;
  uploaded?: string;
  draft?: boolean;
  requireSignedURLs?: boolean;
  variants: string[];
}

export interface CloudflareUploadedImageResult {
  id: string;
  variants: string[];
  preferredUrl: string;
  filename?: string;
  mimeType?: string;
}

export interface CloudflareUploadedObjectResult {
  key: string;
  url: string;
  filename?: string;
  mimeType?: string;
}

export interface CloudflareMediaStatus {
  uploadConfigured: boolean;
  accountIdConfigured: boolean;
  apiTokenConfigured: boolean;
  accountHashConfigured: boolean;
  defaultVariant: string;
  deliveryUrlFallbackConfigured: boolean;
  r2UploadConfigured: boolean;
  r2AccountIdConfigured: boolean;
  r2AccessKeyConfigured: boolean;
  r2SecretKeyConfigured: boolean;
  r2BucketConfigured: boolean;
  r2PublicBaseUrlConfigured: boolean;
}

export interface LocalStoredMediaResult {
  assetId: string;
  url: string;
  fileName: string;
  mimeType?: string;
  filePath: string;
}
