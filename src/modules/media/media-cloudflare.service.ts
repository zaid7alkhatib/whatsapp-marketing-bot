import { env } from "../../config/env";
import type {
  CloudflareDirectUploadResult,
  CloudflareImageDetails,
} from "./media.types";

class MediaIntegrationError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "MediaIntegrationError";
    this.statusCode = statusCode;
  }
}

interface CloudflareApiEnvelope<T> {
  success: boolean;
  errors?: Array<{ code?: number; message?: string }>;
  messages?: Array<{ code?: number; message?: string }>;
  result?: T;
}

interface CloudflareDirectUploadApiResult {
  id?: string;
  uploadURL?: string;
}

interface CloudflareImageDetailsApiResult {
  id?: string;
  filename?: string;
  uploaded?: string;
  draft?: boolean;
  requireSignedURLs?: boolean;
  variants?: unknown;
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function assertCloudflareMediaConfigured(): {
  accountId: string;
  apiToken: string;
} {
  if (!hasText(env.cloudflareImagesAccountId) || !hasText(env.cloudflareImagesApiToken)) {
    throw new MediaIntegrationError(
      "Cloudflare media integration is not configured. Set CLOUDFLARE_IMAGES_ACCOUNT_ID and CLOUDFLARE_IMAGES_API_TOKEN.",
      500
    );
  }

  return {
    accountId: env.cloudflareImagesAccountId,
    apiToken: env.cloudflareImagesApiToken,
  };
}

function getCloudflareApiErrorMessage(
  payload: CloudflareApiEnvelope<unknown> | undefined,
  fallback: string
): string {
  const firstError = payload?.errors?.find((entry) => hasText(entry.message));
  if (firstError?.message) {
    return firstError.message.trim();
  }

  return fallback;
}

export async function createCloudflareDirectUpload(options?: {
  requireSignedURLs?: boolean;
  metadata?: Record<string, unknown>;
}): Promise<CloudflareDirectUploadResult> {
  const { accountId, apiToken } = assertCloudflareMediaConfigured();
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v2/direct_upload`;

  const requestBody = {
    requireSignedURLs: options?.requireSignedURLs ?? false,
    metadata: options?.metadata ?? {},
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  let payload: CloudflareApiEnvelope<CloudflareDirectUploadApiResult> | undefined;
  try {
    payload = (await response.json()) as CloudflareApiEnvelope<CloudflareDirectUploadApiResult>;
  } catch {
    throw new MediaIntegrationError("Cloudflare direct upload response is invalid.", 502);
  }

  if (!response.ok || !payload?.success || !payload.result) {
    throw new MediaIntegrationError(
      getCloudflareApiErrorMessage(payload, "Cloudflare direct upload request failed."),
      response.status >= 400 && response.status < 600 ? response.status : 502
    );
  }

  const id = hasText(payload.result.id) ? payload.result.id.trim() : "";
  const uploadURL = hasText(payload.result.uploadURL)
    ? payload.result.uploadURL.trim()
    : "";

  if (!id || !uploadURL) {
    throw new MediaIntegrationError("Cloudflare direct upload response is missing id or uploadURL.", 502);
  }

  return { id, uploadURL };
}

export async function getCloudflareImageDetails(
  imageId: string
): Promise<CloudflareImageDetails> {
  const normalizedImageId = imageId.trim();
  if (!normalizedImageId) {
    throw new MediaIntegrationError("Field 'imageId' is required.");
  }

  const { accountId, apiToken } = assertCloudflareMediaConfigured();
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1/${encodeURIComponent(
    normalizedImageId
  )}`;

  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiToken}`,
    },
  });

  let payload: CloudflareApiEnvelope<CloudflareImageDetailsApiResult> | undefined;
  try {
    payload = (await response.json()) as CloudflareApiEnvelope<CloudflareImageDetailsApiResult>;
  } catch {
    throw new MediaIntegrationError("Cloudflare image details response is invalid.", 502);
  }

  if (!response.ok || !payload?.success || !payload.result) {
    throw new MediaIntegrationError(
      getCloudflareApiErrorMessage(payload, "Cloudflare image details request failed."),
      response.status >= 400 && response.status < 600 ? response.status : 502
    );
  }

  const variants = Array.isArray(payload.result.variants)
    ? payload.result.variants.filter(hasText).map((entry) => entry.trim())
    : [];

  return {
    id: hasText(payload.result.id) ? payload.result.id.trim() : normalizedImageId,
    filename: hasText(payload.result.filename) ? payload.result.filename.trim() : undefined,
    uploaded: hasText(payload.result.uploaded) ? payload.result.uploaded.trim() : undefined,
    draft: Boolean(payload.result.draft),
    requireSignedURLs:
      typeof payload.result.requireSignedURLs === "boolean"
        ? payload.result.requireSignedURLs
        : undefined,
    variants,
  };
}

export function resolveCloudflarePreferredVariantUrl(
  variants: string[]
): string | undefined {
  if (variants.length === 0) {
    return undefined;
  }

  const preferredVariant = env.cloudflareImagesDefaultVariant.trim();
  if (preferredVariant) {
    const matchedVariant = variants.find((variant) =>
      variant.toLowerCase().endsWith(`/${preferredVariant.toLowerCase()}`)
    );
    if (matchedVariant) {
      return matchedVariant;
    }
  }

  return variants[0];
}

export function isMediaIntegrationError(error: unknown): error is MediaIntegrationError {
  return error instanceof MediaIntegrationError;
}
