import { Request, Response, Router } from "express";
import { idsMatch, isClientUserRole, resolveScopedChannelAccount } from "../../modules/auth/auth.scope";
import { sendError, sendSuccess } from "../../shared/utils/apiResponse";
import {
  getBaileysQr,
  getBaileysStatus,
  isBaileysIntegrationError,
  logoutBaileys,
  startBaileys,
} from "./baileys.service";

const router = Router();

async function enforceChannelAccountScope(
  req: Request<{ channelAccountId: string }>,
  res: Response
): Promise<boolean> {
  if (!isClientUserRole(req.authUser?.role)) {
    return true;
  }

  const scopedChannelAccount = await resolveScopedChannelAccount(req.authUser);
  if (!scopedChannelAccount) {
    sendError(res, "Client channel account scope is not configured.", 403);
    return false;
  }

  if (!idsMatch(scopedChannelAccount._id, req.params.channelAccountId)) {
    sendError(res, "Channel account not found.", 404);
    return false;
  }

  return true;
}

router.post("/start/:channelAccountId", async (req, res, next) => {
  try {
    if (!(await enforceChannelAccountScope(req, res))) {
      return;
    }

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
  (async () => {
    try {
      if (!(await enforceChannelAccountScope(req, res))) {
        return;
      }

      const result = getBaileysStatus(req.params.channelAccountId);
      sendSuccess(res, { data: result });
    } catch (error) {
      if (isBaileysIntegrationError(error)) {
        sendError(res, error.message, error.statusCode);
        return;
      }
      next(error);
    }
  })();
});

router.get("/qr/:channelAccountId", (req, res, next) => {
  (async () => {
    try {
      if (!(await enforceChannelAccountScope(req, res))) {
        return;
      }

      const result = getBaileysQr(req.params.channelAccountId);

      if (result.qr) {
        sendSuccess(res, { data: result });
        return;
      }

      sendSuccess(res, {
        data: result,
        message: "No QR is currently available for this channel account.",
      });
    } catch (error) {
      if (isBaileysIntegrationError(error)) {
        sendError(res, error.message, error.statusCode);
        return;
      }
      next(error);
    }
  })();
});

router.post("/logout/:channelAccountId", async (req, res, next) => {
  try {
    if (!(await enforceChannelAccountScope(req, res))) {
      return;
    }

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
