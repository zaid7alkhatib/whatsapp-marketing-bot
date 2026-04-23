import type { NextFunction, Request, Response } from "express";
import {
  createCloudflareDirectUpload,
  getCloudflareImageDetails,
  resolveLocalMediaFilePath,
  resolveCloudflarePreferredVariantUrl,
} from "./media-cloudflare.service";
import type { CloudflareDirectUploadBody } from "./media.types";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseDirectUploadBody(body: CloudflareDirectUploadBody): {
  requireSignedURLs: boolean;
  metadata: Record<string, unknown>;
} {
  const requireSignedURLs =
    typeof body.requireSignedURLs === "boolean" ? body.requireSignedURLs : false;

  const metadata = isPlainObject(body.metadata) ? body.metadata : {};

  return {
    requireSignedURLs,
    metadata,
  };
}

export async function createCloudflareDirectUploadController(
  req: Request<unknown, unknown, CloudflareDirectUploadBody>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parsedBody = parseDirectUploadBody(req.body);
    const result = await createCloudflareDirectUpload(parsedBody);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function getCloudflareImageDetailsController(
  req: Request<{ imageId: string }>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { imageId } = req.params;
    const details = await getCloudflareImageDetails(imageId);
    const preferredUrl = resolveCloudflarePreferredVariantUrl(details.variants);

    res.status(200).json({
      success: true,
      data: {
        ...details,
        preferredUrl: preferredUrl ?? null,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getLocalMediaAssetController(
  req: Request<{ assetId: string }>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const filePath = await resolveLocalMediaFilePath(req.params.assetId);
    res.sendFile(filePath);
  } catch (error) {
    next(error);
  }
}
