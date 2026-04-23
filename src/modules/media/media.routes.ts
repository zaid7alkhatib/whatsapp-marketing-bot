import { Router } from "express";
import {
  createCloudflareDirectUploadController,
  getCloudflareImageDetailsController,
  getLocalMediaAssetController,
} from "./media.controller";
import { allowRoles } from "../../shared/middlewares/auth";

const mediaRouter = Router();

mediaRouter.get("/local/:assetId", getLocalMediaAssetController);
mediaRouter.post(
  "/cloudflare/direct-upload",
  allowRoles(["admin"]),
  createCloudflareDirectUploadController
);
mediaRouter.get(
  "/cloudflare/details/:imageId",
  allowRoles(["admin"]),
  getCloudflareImageDetailsController
);

export default mediaRouter;
