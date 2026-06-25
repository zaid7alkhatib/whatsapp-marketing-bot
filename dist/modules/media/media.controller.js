"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCloudflareDirectUploadController = createCloudflareDirectUploadController;
exports.getCloudflareImageDetailsController = getCloudflareImageDetailsController;
exports.getCloudflareMediaStatusController = getCloudflareMediaStatusController;
exports.getLocalMediaAssetController = getLocalMediaAssetController;
const media_cloudflare_service_1 = require("./media-cloudflare.service");
function isPlainObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function parseDirectUploadBody(body) {
    const requireSignedURLs = typeof body.requireSignedURLs === "boolean" ? body.requireSignedURLs : false;
    const metadata = isPlainObject(body.metadata) ? body.metadata : {};
    return {
        requireSignedURLs,
        metadata,
    };
}
async function createCloudflareDirectUploadController(req, res, next) {
    try {
        const parsedBody = parseDirectUploadBody(req.body);
        const result = await (0, media_cloudflare_service_1.createCloudflareDirectUpload)(parsedBody);
        res.status(200).json({
            success: true,
            data: result,
        });
    }
    catch (error) {
        next(error);
    }
}
async function getCloudflareImageDetailsController(req, res, next) {
    try {
        const { imageId } = req.params;
        const details = await (0, media_cloudflare_service_1.getCloudflareImageDetails)(imageId);
        const preferredUrl = (0, media_cloudflare_service_1.resolveCloudflarePreferredVariantUrl)(details.variants, details.id);
        res.status(200).json({
            success: true,
            data: {
                ...details,
                preferredUrl: preferredUrl ?? null,
            },
        });
    }
    catch (error) {
        next(error);
    }
}
function getCloudflareMediaStatusController(_req, res) {
    res.status(200).json({
        success: true,
        data: (0, media_cloudflare_service_1.getCloudflareMediaStatus)(),
    });
}
async function getLocalMediaAssetController(req, res, next) {
    try {
        const filePath = await (0, media_cloudflare_service_1.resolveLocalMediaFilePath)(req.params.assetId);
        res.sendFile(filePath);
    }
    catch (error) {
        next(error);
    }
}
