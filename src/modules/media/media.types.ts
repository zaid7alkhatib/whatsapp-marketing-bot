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
