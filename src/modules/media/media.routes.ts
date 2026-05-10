import { Router } from "express";
import {
  createCloudflareDirectUploadController,
  getCloudflareImageDetailsController,
  getCloudflareMediaStatusController,
  getLocalMediaAssetController,
} from "./media.controller";
import { allowRoles } from "../../shared/middlewares/auth";

const mediaRouter = Router();

mediaRouter.get("/local/:assetId", getLocalMediaAssetController);
mediaRouter.get(
  "/cloudflare/status",
  allowRoles(["admin"]),
  getCloudflareMediaStatusController
);
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
