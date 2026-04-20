import type { RequestHandler } from "express";
import { sendError, sendSuccess } from "../../shared/utils/apiResponse";
import { isClientUserRole, resolveScopedChannelAccount, resolveScopedFlow } from "./auth.scope";
import { authenticateDashboardUser } from "./auth.service";

export const loginController: RequestHandler = async (req, res, next) => {
  try {
    const loginResult = await authenticateDashboardUser(
      req.body?.username,
      req.body?.password
    );

    if (!loginResult) {
      return sendError(res, "Invalid username or password.", 401);
    }

    return sendSuccess(res, {
      data: loginResult,
      message: "Login successful.",
    });
  } catch (error) {
    next(error);
  }
};

export const meController: RequestHandler = async (req, res) => {
  if (!req.authUser) {
    return sendError(res, "Authentication required.", 401);
  }

  let scope: Record<string, unknown> | undefined;

  if (isClientUserRole(req.authUser.role)) {
    const [flow, channelAccount] = await Promise.all([
      resolveScopedFlow(req.authUser),
      resolveScopedChannelAccount(req.authUser),
    ]);

    scope = {
      flow: flow
        ? {
            id: String(flow._id),
            code: flow.code,
            version: flow.version,
          }
        : null,
      channelAccount: channelAccount
        ? {
            id: String(channelAccount._id),
            code: channelAccount.code,
            displayName: channelAccount.displayName,
            phoneNumber: channelAccount.phoneNumber ?? null,
          }
        : null,
    };
  }

  return sendSuccess(res, {
    data: {
      user: {
        userId: req.authUser.userId,
        username: req.authUser.username,
        role: req.authUser.role,
        displayName: req.authUser.displayName,
      },
      scope,
    },
  });
};

export const logoutController: RequestHandler = (_req, res) => {
  return sendSuccess(res, {
    message: "Logout successful.",
  });
};
