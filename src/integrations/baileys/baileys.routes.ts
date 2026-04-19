import { Router } from "express";
import { sendError, sendSuccess } from "../../shared/utils/apiResponse";
import {
  getBaileysStatus,
  isBaileysIntegrationError,
  logoutBaileys,
  startBaileys,
} from "./baileys.service";

const router = Router();

router.post("/start/:channelAccountId", async (req, res, next) => {
  try {
    const result = await startBaileys(req.params.channelAccountId);
    sendSuccess(res, { data: result });
  } catch (error) {
    if (isBaileysIntegrationError(error)) {
      sendError(res, error.message, error.statusCode);
      return;
    }
    next(error);
  }
});

router.get("/status/:channelAccountId", (req, res, next) => {
  try {
    const result = getBaileysStatus(req.params.channelAccountId);
    sendSuccess(res, { data: result });
  } catch (error) {
    if (isBaileysIntegrationError(error)) {
      sendError(res, error.message, error.statusCode);
      return;
    }
    next(error);
  }
});

router.post("/logout/:channelAccountId", async (req, res, next) => {
  try {
    const result = await logoutBaileys(req.params.channelAccountId);
    sendSuccess(res, { data: result });
  } catch (error) {
    if (isBaileysIntegrationError(error)) {
      sendError(res, error.message, error.statusCode);
      return;
    }
    next(error);
  }
});

export default router;
