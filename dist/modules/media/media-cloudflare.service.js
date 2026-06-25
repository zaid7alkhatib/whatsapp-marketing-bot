"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isCloudflareMediaConfigured = isCloudflareMediaConfigured;
exports.getCloudflareMediaStatus = getCloudflareMediaStatus;
exports.createCloudflareDirectUpload = createCloudflareDirectUpload;
exports.getCloudflareImageDetails = getCloudflareImageDetails;
exports.saveIncomingMediaLocally = saveIncomingMediaLocally;
exports.resolveLocalMediaFilePath = resolveLocalMediaFilePath;
exports.uploadCloudflareImageBuffer = uploadCloudflareImageBuffer;
exports.uploadCloudflareR2ObjectBuffer = uploadCloudflareR2ObjectBuffer;
exports.resolveCloudflarePreferredVariantUrl = resolveCloudflarePreferredVariantUrl;
exports.isMediaIntegrationError = isMediaIntegrationError;
const client_s3_1 = require("@aws-sdk/client-s3");
const env_1 = require("../../config/env");
const promises_1 = require("fs/promises");
const path_1 = __importDefault(require("path"));
const crypto_1 = require("crypto");
class MediaIntegrationError extends Error {
    constructor(message, statusCode = 400) {
        super(message);
        this.name = "MediaIntegrationError";
        this.statusCode = statusCode;
    }
}
function hasText(value) {
    return typeof value === "string" && value.trim().length > 0;
}
function assertCloudflareMediaConfigured() {
    if (!hasText(env_1.env.cloudflareImagesAccountId) || !hasText(env_1.env.cloudflareImagesApiToken)) {
        throw new MediaIntegrationError("Cloudflare media integration is not configured. Set CLOUDFLARE_IMAGES_ACCOUNT_ID and CLOUDFLARE_IMAGES_API_TOKEN, or CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN.", 500);
    }
    return {
        accountId: env_1.env.cloudflareImagesAccountId,
        apiToken: env_1.env.cloudflareImagesApiToken,
    };
}
function isCloudflareMediaConfigured() {
    return hasText(env_1.env.cloudflareImagesAccountId) && hasText(env_1.env.cloudflareImagesApiToken);
}
function isCloudflareR2Configured() {
    return (hasText(env_1.env.cloudflareR2AccountId) &&
        hasText(env_1.env.cloudflareR2AccessKeyId) &&
        hasText(env_1.env.cloudflareR2SecretAccessKey) &&
        hasText(env_1.env.cloudflareR2BucketName) &&
        hasText(env_1.env.cloudflareR2PublicBaseUrl));
}
function getCloudflareMediaStatus() {
    return {
        uploadConfigured: isCloudflareMediaConfigured(),
        accountIdConfigured: hasText(env_1.env.cloudflareImagesAccountId),
        apiTokenConfigured: hasText(env_1.env.cloudflareImagesApiToken),
        accountHashConfigured: hasText(env_1.env.cloudflareImagesAccountHash),
        defaultVariant: env_1.env.cloudflareImagesDefaultVariant,
        deliveryUrlFallbackConfigured: hasText(env_1.env.cloudflareImagesAccountHash),
        r2UploadConfigured: isCloudflareR2Configured(),
        r2AccountIdConfigured: hasText(env_1.env.cloudflareR2AccountId),
        r2AccessKeyConfigured: hasText(env_1.env.cloudflareR2AccessKeyId),
        r2SecretKeyConfigured: hasText(env_1.env.cloudflareR2SecretAccessKey),
        r2BucketConfigured: hasText(env_1.env.cloudflareR2BucketName),
        r2PublicBaseUrlConfigured: hasText(env_1.env.cloudflareR2PublicBaseUrl),
    };
}
function getCloudflareApiErrorMessage(payload, fallback) {
    const firstError = payload?.errors?.find((entry) => hasText(entry.message));
    if (firstError?.message) {
        return firstError.message.trim();
    }
    return fallback;
}
async function createCloudflareDirectUpload(options) {
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
    let payload;
    try {
        payload = (await response.json());
    }
    catch {
        throw new MediaIntegrationError("Cloudflare direct upload response is invalid.", 502);
    }
    if (!response.ok || !payload?.success || !payload.result) {
        throw new MediaIntegrationError(getCloudflareApiErrorMessage(payload, "Cloudflare direct upload request failed."), response.status >= 400 && response.status < 600 ? response.status : 502);
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
async function getCloudflareImageDetails(imageId) {
    const normalizedImageId = imageId.trim();
    if (!normalizedImageId) {
        throw new MediaIntegrationError("Field 'imageId' is required.");
    }
    const { accountId, apiToken } = assertCloudflareMediaConfigured();
    const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1/${encodeURIComponent(normalizedImageId)}`;
    const response = await fetch(endpoint, {
        method: "GET",
        headers: {
            Authorization: `Bearer ${apiToken}`,
        },
    });
    let payload;
    try {
        payload = (await response.json());
    }
    catch {
        throw new MediaIntegrationError("Cloudflare image details response is invalid.", 502);
    }
    if (!response.ok || !payload?.success || !payload.result) {
        throw new MediaIntegrationError(getCloudflareApiErrorMessage(payload, "Cloudflare image details request failed."), response.status >= 400 && response.status < 600 ? response.status : 502);
    }
    const variants = Array.isArray(payload.result.variants)
        ? payload.result.variants.filter(hasText).map((entry) => entry.trim())
        : [];
    return {
        id: hasText(payload.result.id) ? payload.result.id.trim() : normalizedImageId,
        filename: hasText(payload.result.filename) ? payload.result.filename.trim() : undefined,
        uploaded: hasText(payload.result.uploaded) ? payload.result.uploaded.trim() : undefined,
        draft: Boolean(payload.result.draft),
        requireSignedURLs: typeof payload.result.requireSignedURLs === "boolean"
            ? payload.result.requireSignedURLs
            : undefined,
        variants,
    };
}
function normalizeVariants(variants) {
    return Array.isArray(variants)
        ? variants.filter(hasText).map((entry) => entry.trim())
        : [];
}
function detectMimeTypeFromFileName(fileName) {
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
function buildUploadFileName(fileName, mimeType) {
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
    if (normalizedMimeType ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
        return "incoming-media.docx";
    }
    return "incoming-media.jpg";
}
function sanitizeFileName(fileName) {
    const normalized = fileName.trim().replace(/[^a-zA-Z0-9._-]/g, "_");
    return normalized.length > 0 ? normalized : "incoming-media.bin";
}
function buildLocalMediaBaseUrl() {
    const configuredBaseUrl = env_1.env.appBaseUrl?.trim();
    if (configuredBaseUrl) {
        return configuredBaseUrl.replace(/\/+$/, "");
    }
    return `http://localhost:${env_1.env.port}`;
}
function getIncomingMediaDirectory() {
    return path_1.default.resolve(process.cwd(), "uploads", "incoming-media");
}
async function saveIncomingMediaLocally(options) {
    if (!Buffer.isBuffer(options.fileBuffer) || options.fileBuffer.length === 0) {
        throw new MediaIntegrationError("Field 'fileBuffer' is required.");
    }
    const uploadFileName = sanitizeFileName(buildUploadFileName(options.fileName, options.mimeType));
    const extension = path_1.default.extname(uploadFileName);
    const assetId = `${(0, crypto_1.randomUUID)()}${extension}`;
    const directoryPath = getIncomingMediaDirectory();
    const filePath = path_1.default.join(directoryPath, assetId);
    await (0, promises_1.mkdir)(directoryPath, { recursive: true });
    await (0, promises_1.writeFile)(filePath, options.fileBuffer);
    return {
        assetId,
        url: `${buildLocalMediaBaseUrl()}/api/v1/media/local/${encodeURIComponent(assetId)}`,
        fileName: uploadFileName,
        mimeType: hasText(options.mimeType) ? options.mimeType.trim() : undefined,
        filePath,
    };
}
async function resolveLocalMediaFilePath(assetId) {
    const normalizedAssetId = assetId.trim();
    if (!normalizedAssetId) {
        throw new MediaIntegrationError("Field 'assetId' is required.");
    }
    if (!/^[a-zA-Z0-9._-]+$/.test(normalizedAssetId)) {
        throw new MediaIntegrationError("Invalid local media asset id.", 400);
    }
    const filePath = path_1.default.join(getIncomingMediaDirectory(), normalizedAssetId);
    try {
        await (0, promises_1.access)(filePath);
        return filePath;
    }
    catch {
        throw new MediaIntegrationError("Local media file not found.", 404);
    }
}
async function uploadCloudflareImageBuffer(options) {
    if (!Buffer.isBuffer(options.fileBuffer) || options.fileBuffer.length === 0) {
        throw new MediaIntegrationError("Field 'fileBuffer' is required.");
    }
    const { accountId, apiToken } = assertCloudflareMediaConfigured();
    const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1`;
    const uploadFileName = buildUploadFileName(options.fileName, options.mimeType);
    const uploadMimeType = hasText(options.mimeType) ? options.mimeType.trim() : detectMimeTypeFromFileName(uploadFileName);
    const formData = new FormData();
    formData.set("file", new Blob([Uint8Array.from(options.fileBuffer)], {
        type: uploadMimeType ?? "application/octet-stream",
    }), uploadFileName);
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
    let payload;
    try {
        payload = (await response.json());
    }
    catch {
        throw new MediaIntegrationError("Cloudflare image upload response is invalid.", 502);
    }
    if (!response.ok || !payload?.success || !payload.result) {
        throw new MediaIntegrationError(getCloudflareApiErrorMessage(payload, "Cloudflare image upload failed."), response.status >= 400 && response.status < 600 ? response.status : 502);
    }
    const id = hasText(payload.result.id) ? payload.result.id.trim() : "";
    if (!id) {
        throw new MediaIntegrationError("Cloudflare image upload response is missing id.", 502);
    }
    const variants = normalizeVariants(payload.result.variants);
    const preferredUrl = resolveCloudflarePreferredVariantUrl(variants, id);
    if (!preferredUrl) {
        throw new MediaIntegrationError("Cloudflare image upload response did not include a usable image URL.", 502);
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
function assertCloudflareR2Configured() {
    if (!isCloudflareR2Configured()) {
        throw new MediaIntegrationError("Cloudflare R2 media integration is not configured. Set CLOUDFLARE_R2_ACCOUNT_ID, CLOUDFLARE_R2_ACCESS_KEY_ID, CLOUDFLARE_R2_SECRET_ACCESS_KEY, CLOUDFLARE_R2_BUCKET_NAME, and CLOUDFLARE_R2_PUBLIC_BASE_URL.", 500);
    }
    return {
        accountId: env_1.env.cloudflareR2AccountId,
        accessKeyId: env_1.env.cloudflareR2AccessKeyId,
        secretAccessKey: env_1.env.cloudflareR2SecretAccessKey,
        bucketName: env_1.env.cloudflareR2BucketName,
        publicBaseUrl: env_1.env.cloudflareR2PublicBaseUrl,
    };
}
function buildR2ObjectKey(fileName) {
    const extension = path_1.default.extname(fileName);
    const baseName = path_1.default.basename(fileName, extension);
    const safeBaseName = sanitizeFileName(baseName).replace(/\.+$/g, "") || "incoming-media";
    return `incoming-media/${new Date().toISOString().slice(0, 10)}/${(0, crypto_1.randomUUID)()}-${safeBaseName}${extension}`;
}
function encodeR2ObjectKey(key) {
    return key
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/");
}
function buildR2PublicUrl(publicBaseUrl, objectKey) {
    return `${publicBaseUrl.replace(/\/+$/, "")}/${encodeR2ObjectKey(objectKey)}`;
}
function createR2Client(options) {
    return new client_s3_1.S3Client({
        region: "auto",
        endpoint: `https://${options.accountId}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId: options.accessKeyId,
            secretAccessKey: options.secretAccessKey,
        },
    });
}
async function uploadCloudflareR2ObjectBuffer(options) {
    if (!Buffer.isBuffer(options.fileBuffer) || options.fileBuffer.length === 0) {
        throw new MediaIntegrationError("Field 'fileBuffer' is required.");
    }
    const { accountId, accessKeyId, secretAccessKey, bucketName, publicBaseUrl } = assertCloudflareR2Configured();
    const uploadFileName = sanitizeFileName(buildUploadFileName(options.fileName, options.mimeType));
    const mimeType = hasText(options.mimeType) ? options.mimeType.trim() : detectMimeTypeFromFileName(uploadFileName);
    const objectKey = buildR2ObjectKey(uploadFileName);
    const contentType = mimeType ?? "application/octet-stream";
    const client = createR2Client({ accountId, accessKeyId, secretAccessKey });
    try {
        await client.send(new client_s3_1.PutObjectCommand({
            Bucket: bucketName,
            Key: objectKey,
            Body: options.fileBuffer,
            ContentType: contentType,
        }));
    }
    catch (error) {
        throw new MediaIntegrationError(error instanceof Error ? error.message : "Cloudflare R2 object upload failed.", 502);
    }
    return {
        key: objectKey,
        url: buildR2PublicUrl(publicBaseUrl, objectKey),
        filename: uploadFileName,
        mimeType,
    };
}
function resolveCloudflarePreferredVariantUrl(variants, imageId) {
    const preferredVariant = env_1.env.cloudflareImagesDefaultVariant.trim();
    if (variants.length > 0 && preferredVariant) {
        const matchedVariant = variants.find((variant) => variant.toLowerCase().endsWith(`/${preferredVariant.toLowerCase()}`));
        if (matchedVariant) {
            return matchedVariant;
        }
    }
    if (variants.length > 0) {
        return variants[0];
    }
    if (hasText(env_1.env.cloudflareImagesAccountHash) && hasText(imageId) && preferredVariant) {
        return `https://imagedelivery.net/${encodeURIComponent(env_1.env.cloudflareImagesAccountHash.trim())}/${encodeURIComponent(imageId.trim())}/${encodeURIComponent(preferredVariant)}`;
    }
    return undefined;
}
function isMediaIntegrationError(error) {
    return error instanceof MediaIntegrationError;
}
