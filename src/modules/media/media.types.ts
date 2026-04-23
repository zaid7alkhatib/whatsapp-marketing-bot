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

export interface LocalStoredMediaResult {
  assetId: string;
  url: string;
  fileName: string;
  mimeType?: string;
  filePath: string;
}
