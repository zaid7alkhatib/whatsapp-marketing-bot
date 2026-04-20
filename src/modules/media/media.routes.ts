import { Router } from "express";
import {
  createCloudflareDirectUploadController,
  getCloudflareImageDetailsController,
} from "./media.controller";

const mediaRouter = Router();

mediaRouter.post("/cloudflare/direct-upload", createCloudflareDirectUploadController);
mediaRouter.get("/cloudflare/details/:imageId", getCloudflareImageDetailsController);

export default mediaRouter;
