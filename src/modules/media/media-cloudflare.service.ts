import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "../../config/env";
import { mkdir, access, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import type {
  CloudflareDirectUploadResult,
  CloudflareImageDetails,
  CloudflareMediaStatus,
  CloudflareUploadedObjectResult,
  CloudflareUploadedImageResult,
  LocalStoredMediaResult,
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

interface CloudflareUploadApiResult {
  id?: string;
  filename?: string;
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
      "Cloudflare media integration is not configured. Set CLOUDFLARE_IMAGES_ACCOUNT_ID and CLOUDFLARE_IMAGES_API_TOKEN, or CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN.",
      500
    );
  }

  return {
    accountId: env.cloudflareImagesAccountId,
    apiToken: env.cloudflareImagesApiToken,
  };
}

export function isCloudflareMediaConfigured(): boolean {
  return hasText(env.cloudflareImagesAccountId) && hasText(env.cloudflareImagesApiToken);
}

function isCloudflareR2Configured(): boolean {
  return (
    hasText(env.cloudflareR2AccountId) &&
    hasText(env.cloudflareR2AccessKeyId) &&
    hasText(env.cloudflareR2SecretAccessKey) &&
    hasText(env.cloudflareR2BucketName) &&
    hasText(env.cloudflareR2PublicBaseUrl)
  );
}

export function getCloudflareMediaStatus(): CloudflareMediaStatus {
  return {
    uploadConfigured: isCloudflareMediaConfigured(),
    accountIdConfigured: hasText(env.cloudflareImagesAccountId),
    apiTokenConfigured: hasText(env.cloudflareImagesApiToken),
    accountHashConfigured: hasText(env.cloudflareImagesAccountHash),
    defaultVariant: env.cloudflareImagesDefaultVariant,
    deliveryUrlFallbackConfigured: hasText(env.cloudflareImagesAccountHash),
    r2UploadConfigured: isCloudflareR2Configured(),
    r2AccountIdConfigured: hasText(env.cloudflareR2AccountId),
    r2AccessKeyConfigured: hasText(env.cloudflareR2AccessKeyId),
    r2SecretKeyConfigured: hasText(env.cloudflareR2SecretAccessKey),
    r2BucketConfigured: hasText(env.cloudflareR2BucketName),
    r2PublicBaseUrlConfigured: hasText(env.cloudflareR2PublicBaseUrl),
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

function normalizeVariants(variants: unknown): string[] {
  return Array.isArray(variants)
    ? variants.filter(hasText).map((entry) => entry.trim())
    : [];
}

function detectMimeTypeFromFileName(fileName: string | undefined): string | undefined {
  if (!hasText(fileName)) {
    return undefined;
  }

  const normalizedName = fileName.toLowerCase();
  if (normalizedName.endsWith(".jpg") || normalizedName.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (normalizedName.endsWith(".png")) {
    return "image/png";
  }
  if (normalizedName.endsWith(".webp")) {
    return "image/webp";
  }
  if (normalizedName.endsWith(".gif")) {
    return "image/gif";
  }
  if (normalizedName.endsWith(".pdf")) {
    return "application/pdf";
  }
  if (normalizedName.endsWith(".doc")) {
    return "application/msword";
  }
  if (normalizedName.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (normalizedName.endsWith(".xls")) {
    return "application/vnd.ms-excel";
  }
  if (normalizedName.endsWith(".xlsx")) {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  if (normalizedName.endsWith(".txt")) {
    return "text/plain";
  }

  return undefined;
}

function buildUploadFileName(fileName: string | undefined, mimeType: string | undefined): string {
  if (hasText(fileName)) {
    return fileName.trim();
  }

  const normalizedMimeType = hasText(mimeType) ? mimeType.trim().toLowerCase() : "";
  if (normalizedMimeType === "image/png") {
    return "incoming-media.png";
  }
  if (normalizedMimeType === "image/webp") {
    return "incoming-media.webp";
  }
  if (normalizedMimeType === "image/gif") {
    return "incoming-media.gif";
  }
  if (normalizedMimeType === "application/pdf") {
    return "incoming-media.pdf";
  }
  if (normalizedMimeType === "application/msword") {
    return "incoming-media.doc";
  }
  if (
    normalizedMimeType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return "incoming-media.docx";
  }

  return "incoming-media.jpg";
}

function sanitizeFileName(fileName: string): string {
  const normalized = fileName.trim().replace(/[^a-zA-Z0-9._-]/g, "_");
  return normalized.length > 0 ? normalized : "incoming-media.bin";
}

function buildLocalMediaBaseUrl(): string {
  const configuredBaseUrl = env.appBaseUrl?.trim();
  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/+$/, "");
  }

  return `http://localhost:${env.port}`;
}

function getIncomingMediaDirectory(): string {
  return path.resolve(process.cwd(), "uploads", "incoming-media");
}

export async function saveIncomingMediaLocally(options: {
  fileBuffer: Buffer;
  fileName?: string;
  mimeType?: string;
}): Promise<LocalStoredMediaResult> {
  if (!Buffer.isBuffer(options.fileBuffer) || options.fileBuffer.length === 0) {
    throw new MediaIntegrationError("Field 'fileBuffer' is required.");
  }

  const uploadFileName = sanitizeFileName(
    buildUploadFileName(options.fileName, options.mimeType)
  );
  const extension = path.extname(uploadFileName);
  const assetId = `${randomUUID()}${extension}`;
  const directoryPath = getIncomingMediaDirectory();
  const filePath = path.join(directoryPath, assetId);

  await mkdir(directoryPath, { recursive: true });
  await writeFile(filePath, options.fileBuffer);

  return {
    assetId,
    url: `${buildLocalMediaBaseUrl()}/api/v1/media/local/${encodeURIComponent(assetId)}`,
    fileName: uploadFileName,
    mimeType: hasText(options.mimeType) ? options.mimeType.trim() : undefined,
    filePath,
  };
}

export async function resolveLocalMediaFilePath(assetId: string): Promise<string> {
  const normalizedAssetId = assetId.trim();
  if (!normalizedAssetId) {
    throw new MediaIntegrationError("Field 'assetId' is required.");
  }

  if (!/^[a-zA-Z0-9._-]+$/.test(normalizedAssetId)) {
    throw new MediaIntegrationError("Invalid local media asset id.", 400);
  }

  const filePath = path.join(getIncomingMediaDirectory(), normalizedAssetId);

  try {
    await access(filePath);
    return filePath;
  } catch {
    throw new MediaIntegrationError("Local media file not found.", 404);
  }
}

export async function uploadCloudflareImageBuffer(options: {
  fileBuffer: Buffer;
  fileName?: string;
  mimeType?: string;
  metadata?: Record<string, unknown>;
}): Promise<CloudflareUploadedImageResult> {
  if (!Buffer.isBuffer(options.fileBuffer) || options.fileBuffer.length === 0) {
    throw new MediaIntegrationError("Field 'fileBuffer' is required.");
  }

  const { accountId, apiToken } = assertCloudflareMediaConfigured();
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1`;

  const uploadFileName = buildUploadFileName(options.fileName, options.mimeType);
  const uploadMimeType =
    hasText(options.mimeType) ? options.mimeType.trim() : detectMimeTypeFromFileName(uploadFileName);

  const formData = new FormData();
  formData.set(
    "file",
    new Blob([Uint8Array.from(options.fileBuffer)], {
      type: uploadMimeType ?? "application/octet-stream",
    }),
    uploadFileName
  );

  if (options.metadata && Object.keys(options.metadata).length > 0) {
    formData.set("metadata", JSON.stringify(options.metadata));
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
    },
    body: formData,
  });

  let payload: CloudflareApiEnvelope<CloudflareUploadApiResult> | undefined;
  try {
    payload = (await response.json()) as CloudflareApiEnvelope<CloudflareUploadApiResult>;
  } catch {
    throw new MediaIntegrationError("Cloudflare image upload response is invalid.", 502);
  }

  if (!response.ok || !payload?.success || !payload.result) {
    throw new MediaIntegrationError(
      getCloudflareApiErrorMessage(payload, "Cloudflare image upload failed."),
      response.status >= 400 && response.status < 600 ? response.status : 502
    );
  }

  const id = hasText(payload.result.id) ? payload.result.id.trim() : "";
  if (!id) {
    throw new MediaIntegrationError("Cloudflare image upload response is missing id.", 502);
  }

  const variants = normalizeVariants(payload.result.variants);
  const preferredUrl = resolveCloudflarePreferredVariantUrl(variants, id);
  if (!preferredUrl) {
    throw new MediaIntegrationError(
      "Cloudflare image upload response did not include a usable image URL.",
      502
    );
  }

  return {
    id,
    variants,
    preferredUrl,
    filename: hasText(payload.result.filename)
      ? payload.result.filename.trim()
      : uploadFileName,
    mimeType: uploadMimeType,
  };
}

function assertCloudflareR2Configured(): {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicBaseUrl: string;
} {
  if (!isCloudflareR2Configured()) {
    throw new MediaIntegrationError(
      "Cloudflare R2 media integration is not configured. Set CLOUDFLARE_R2_ACCOUNT_ID, CLOUDFLARE_R2_ACCESS_KEY_ID, CLOUDFLARE_R2_SECRET_ACCESS_KEY, CLOUDFLARE_R2_BUCKET_NAME, and CLOUDFLARE_R2_PUBLIC_BASE_URL.",
      500
    );
  }

  return {
    accountId: env.cloudflareR2AccountId as string,
    accessKeyId: env.cloudflareR2AccessKeyId as string,
    secretAccessKey: env.cloudflareR2SecretAccessKey as string,
    bucketName: env.cloudflareR2BucketName as string,
    publicBaseUrl: env.cloudflareR2PublicBaseUrl as string,
  };
}

function buildR2ObjectKey(fileName: string): string {
  const extension = path.extname(fileName);
  const baseName = path.basename(fileName, extension);
  const safeBaseName = sanitizeFileName(baseName).replace(/\.+$/g, "") || "incoming-media";

  return `incoming-media/${new Date().toISOString().slice(0, 10)}/${randomUUID()}-${safeBaseName}${extension}`;
}

function encodeR2ObjectKey(key: string): string {
  return key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function buildR2PublicUrl(publicBaseUrl: string, objectKey: string): string {
  return `${publicBaseUrl.replace(/\/+$/, "")}/${encodeR2ObjectKey(objectKey)}`;
}

function createR2Client(options: {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
}): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${options.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: options.accessKeyId,
      secretAccessKey: options.secretAccessKey,
    },
  });
}

export async function uploadCloudflareR2ObjectBuffer(options: {
  fileBuffer: Buffer;
  fileName?: string;
  mimeType?: string;
}): Promise<CloudflareUploadedObjectResult> {
  if (!Buffer.isBuffer(options.fileBuffer) || options.fileBuffer.length === 0) {
    throw new MediaIntegrationError("Field 'fileBuffer' is required.");
  }

  const { accountId, accessKeyId, secretAccessKey, bucketName, publicBaseUrl } =
    assertCloudflareR2Configured();
  const uploadFileName = sanitizeFileName(
    buildUploadFileName(options.fileName, options.mimeType)
  );
  const mimeType =
    hasText(options.mimeType) ? options.mimeType.trim() : detectMimeTypeFromFileName(uploadFileName);
  const objectKey = buildR2ObjectKey(uploadFileName);
  const contentType = mimeType ?? "application/octet-stream";
  const client = createR2Client({ accountId, accessKeyId, secretAccessKey });

  try {
    await client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: objectKey,
        Body: options.fileBuffer,
        ContentType: contentType,
      })
    );
  } catch (error) {
    throw new MediaIntegrationError(
      error instanceof Error ? error.message : "Cloudflare R2 object upload failed.",
      502
    );
  }

  return {
    key: objectKey,
    url: buildR2PublicUrl(publicBaseUrl, objectKey),
    filename: uploadFileName,
    mimeType,
  };
}

export function resolveCloudflarePreferredVariantUrl(
  variants: string[],
  imageId?: string
): string | undefined {
  const preferredVariant = env.cloudflareImagesDefaultVariant.trim();
  if (variants.length > 0 && preferredVariant) {
    const matchedVariant = variants.find((variant) =>
      variant.toLowerCase().endsWith(`/${preferredVariant.toLowerCase()}`)
    );
    if (matchedVariant) {
      return matchedVariant;
    }
  }

  if (variants.length > 0) {
    return variants[0];
  }

  if (hasText(env.cloudflareImagesAccountHash) && hasText(imageId) && preferredVariant) {
    return `https://imagedelivery.net/${encodeURIComponent(
      env.cloudflareImagesAccountHash.trim()
    )}/${encodeURIComponent(imageId.trim())}/${encodeURIComponent(preferredVariant)}`;
  }

  return undefined;
}

export function isMediaIntegrationError(error: unknown): error is MediaIntegrationError {
  return error instanceof MediaIntegrationError;
}
