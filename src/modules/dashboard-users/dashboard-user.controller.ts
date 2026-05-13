import { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import { ChannelAccountModel } from "../channel-accounts/channel-account.model";
import { FlowModel } from "../flows/flow.model";
import { createPasswordHash } from "../auth/auth.service";
import { idsMatch } from "../auth/auth.scope";
import { DashboardUserModel } from "./dashboard-user.model";
import {
  DASHBOARD_USER_STATUSES,
  DashboardUserStatus,
  DashboardUserUpsertBody,
} from "./dashboard-user.types";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isDashboardUserStatus(value: unknown): value is DashboardUserStatus {
  return (
    typeof value === "string" &&
    DASHBOARD_USER_STATUSES.includes(value as DashboardUserStatus)
  );
}

function normalizeUsername(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function buildClientUserResponse(user: {
  _id: mongoose.Types.ObjectId | string;
  username: string;
  role?: string;
  status: string;
  displayName?: string;
  scopedFlowId?: mongoose.Types.ObjectId | null;
  scopedChannelAccountId?: mongoose.Types.ObjectId | null;
  createdAt?: Date;
  updatedAt?: Date;
}) {
  return {
    _id: String(user._id),
    username: user.username,
    role: user.role ?? "user",
    status: user.status,
    displayName: user.displayName ?? "",
    scopedFlowId: user.scopedFlowId ? String(user.scopedFlowId) : null,
    scopedChannelAccountId: user.scopedChannelAccountId
      ? String(user.scopedChannelAccountId)
      : null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function resolveAuthenticatedClientScope(req: Pick<Request, "authUser">): {
  scopedFlowId: string;
  scopedChannelAccountId: string;
} | null {
  const scopedFlowId = req.authUser?.scopedFlowId;
  const scopedChannelAccountId = req.authUser?.scopedChannelAccountId;

  if (
    !isNonEmptyString(scopedFlowId) ||
    !mongoose.isValidObjectId(scopedFlowId) ||
    !isNonEmptyString(scopedChannelAccountId) ||
    !mongoose.isValidObjectId(scopedChannelAccountId)
  ) {
    return null;
  }

  return {
    scopedFlowId: scopedFlowId.trim(),
    scopedChannelAccountId: scopedChannelAccountId.trim(),
  };
}

async function validateScopeReferences(
  flowId: string,
  channelAccountId: string
): Promise<string | null> {
  if (!mongoose.isValidObjectId(flowId)) {
    return "Field 'scopedFlowId' must be a valid ObjectId.";
  }

  if (!mongoose.isValidObjectId(channelAccountId)) {
    return "Field 'scopedChannelAccountId' must be a valid ObjectId.";
  }

  const [flowExists, channelAccountExists] = await Promise.all([
    FlowModel.exists({ _id: flowId }),
    ChannelAccountModel.exists({ _id: channelAccountId }),
  ]);

  if (!flowExists) {
    return "Scoped flow was not found.";
  }

  if (!channelAccountExists) {
    return "Scoped channel account was not found.";
  }

  return null;
}

export async function getClientUsers(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const users = await DashboardUserModel.find({ role: { $in: ["user", "employee"] } })
      .sort({ createdAt: -1 })
      .lean();

    const flowIds = Array.from(
      new Set(
        users
          .map((user) => (user.scopedFlowId ? String(user.scopedFlowId) : ""))
          .filter(Boolean)
      )
    );
    const channelAccountIds = Array.from(
      new Set(
        users
          .map((user) =>
            user.scopedChannelAccountId ? String(user.scopedChannelAccountId) : ""
          )
          .filter(Boolean)
      )
    );

    const [flows, channelAccounts] = await Promise.all([
      flowIds.length
        ? FlowModel.find({ _id: { $in: flowIds } })
            .select("_id code version")
            .lean()
        : [],
      channelAccountIds.length
        ? ChannelAccountModel.find({ _id: { $in: channelAccountIds } })
            .select("_id code displayName phoneNumber")
            .lean()
        : [],
    ]);

    const flowsById = new Map(flows.map((flow) => [String(flow._id), flow] as const));
    const channelAccountsById = new Map(
      channelAccounts.map((channelAccount) => [String(channelAccount._id), channelAccount] as const)
    );

    const data = users.map((user) => {
      const flow = user.scopedFlowId ? flowsById.get(String(user.scopedFlowId)) : null;
      const channelAccount = user.scopedChannelAccountId
        ? channelAccountsById.get(String(user.scopedChannelAccountId))
        : null;

      return {
        ...buildClientUserResponse(user),
        scope: {
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
        },
      };
    });

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
}

export async function createClientUser(
  req: Request<unknown, unknown, DashboardUserUpsertBody>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const username = normalizeUsername(req.body.username);
    const password = typeof req.body.password === "string" ? req.body.password : "";
    const displayName = isNonEmptyString(req.body.displayName)
      ? req.body.displayName.trim()
      : undefined;
    const status = req.body.status ?? "active";
    const scopedFlowId = typeof req.body.scopedFlowId === "string" ? req.body.scopedFlowId.trim() : "";
    const scopedChannelAccountId =
      typeof req.body.scopedChannelAccountId === "string"
        ? req.body.scopedChannelAccountId.trim()
        : "";

    if (!username) {
      res.status(400).json({ success: false, message: "Field 'username' is required." });
      return;
    }

    if (!password || password.length < 8) {
      res.status(400).json({
        success: false,
        message: "Field 'password' is required and must be at least 8 characters.",
      });
      return;
    }

    if (!isDashboardUserStatus(status)) {
      res.status(400).json({
        success: false,
        message: `Field 'status' must be one of: ${DASHBOARD_USER_STATUSES.join(", ")}.`,
      });
      return;
    }

    if (!scopedFlowId || !scopedChannelAccountId) {
      res.status(400).json({
        success: false,
        message: "Scoped flow and scoped channel account are required.",
      });
      return;
    }

    const scopeError = await validateScopeReferences(scopedFlowId, scopedChannelAccountId);
    if (scopeError) {
      res.status(400).json({ success: false, message: scopeError });
      return;
    }

    const existingUser = await DashboardUserModel.findOne({ username })
      .select("_id")
      .lean();
    if (existingUser) {
      res.status(409).json({ success: false, message: "Username already exists." });
      return;
    }

    const createdUser = await DashboardUserModel.create({
      username,
      passwordHash: createPasswordHash(password),
      role: "user",
      status,
      displayName,
      scopedFlowId: new mongoose.Types.ObjectId(scopedFlowId),
      scopedChannelAccountId: new mongoose.Types.ObjectId(scopedChannelAccountId),
    });

    res.status(201).json({
      success: true,
      data: buildClientUserResponse(createdUser),
    });
  } catch (error) {
    const dbError = error as { code?: number };
    if (dbError.code === 11000) {
      res.status(409).json({ success: false, message: "Username already exists." });
      return;
    }

    next(error);
  }
}

export async function updateClientUser(
  req: Request<{ id: string }, unknown, DashboardUserUpsertBody>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({ success: false, message: "Invalid client user id." });
      return;
    }

    const user = await DashboardUserModel.findOne({
      _id: id,
      role: { $in: ["user", "employee"] },
    });
    if (!user) {
      res.status(404).json({ success: false, message: "Client user not found." });
      return;
    }

    if (req.body.username !== undefined) {
      const username = normalizeUsername(req.body.username);
      if (!username) {
        res.status(400).json({ success: false, message: "Field 'username' must be non-empty." });
        return;
      }

      const duplicate = await DashboardUserModel.findOne({
        username,
        _id: { $ne: user._id },
      })
        .select("_id")
        .lean();
      if (duplicate) {
        res.status(409).json({ success: false, message: "Username already exists." });
        return;
      }

      user.username = username;
    }

    if (req.body.password !== undefined) {
      if (typeof req.body.password !== "string" || req.body.password.length < 8) {
        res.status(400).json({
          success: false,
          message: "Field 'password' must be at least 8 characters when provided.",
        });
        return;
      }

      user.passwordHash = createPasswordHash(req.body.password);
    }

    if (req.body.displayName !== undefined) {
      user.displayName = isNonEmptyString(req.body.displayName)
        ? req.body.displayName.trim()
        : undefined;
    }

    if (req.body.status !== undefined) {
      if (!isDashboardUserStatus(req.body.status)) {
        res.status(400).json({
          success: false,
          message: `Field 'status' must be one of: ${DASHBOARD_USER_STATUSES.join(", ")}.`,
        });
        return;
      }

      user.status = req.body.status;
    }

    const nextScopedFlowId =
      req.body.scopedFlowId !== undefined
        ? typeof req.body.scopedFlowId === "string"
          ? req.body.scopedFlowId.trim()
          : ""
        : user.scopedFlowId
          ? String(user.scopedFlowId)
          : "";

    const nextScopedChannelAccountId =
      req.body.scopedChannelAccountId !== undefined
        ? typeof req.body.scopedChannelAccountId === "string"
          ? req.body.scopedChannelAccountId.trim()
          : ""
        : user.scopedChannelAccountId
          ? String(user.scopedChannelAccountId)
          : "";

    if (!nextScopedFlowId || !nextScopedChannelAccountId) {
      res.status(400).json({
        success: false,
        message: "Scoped flow and scoped channel account are required.",
      });
      return;
    }

    const scopeError = await validateScopeReferences(
      nextScopedFlowId,
      nextScopedChannelAccountId
    );
    if (scopeError) {
      res.status(400).json({ success: false, message: scopeError });
      return;
    }

    user.scopedFlowId = new mongoose.Types.ObjectId(nextScopedFlowId);
    user.scopedChannelAccountId = new mongoose.Types.ObjectId(nextScopedChannelAccountId);

    const updatedUser = await user.save();

    res.status(200).json({
      success: true,
      data: buildClientUserResponse(updatedUser),
    });
  } catch (error) {
    const dbError = error as { code?: number };
    if (dbError.code === 11000) {
      res.status(409).json({ success: false, message: "Username already exists." });
      return;
    }

    next(error);
  }
}

export async function getScopedEmployeeUsers(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (req.authUser?.role !== "user") {
      res.status(403).json({
        success: false,
        message: "Only the scoped workspace owner can manage employee users.",
      });
      return;
    }

    const scope = resolveAuthenticatedClientScope(req);
    if (!scope) {
      res.status(403).json({
        success: false,
        message: "Your account does not have a complete client scope.",
      });
      return;
    }

    const users = await DashboardUserModel.find({
      role: "employee",
      scopedFlowId: new mongoose.Types.ObjectId(scope.scopedFlowId),
      scopedChannelAccountId: new mongoose.Types.ObjectId(scope.scopedChannelAccountId),
    })
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      data: users.map(buildClientUserResponse),
    });
  } catch (error) {
    next(error);
  }
}

export async function createScopedEmployeeUser(
  req: Request<unknown, unknown, DashboardUserUpsertBody>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (req.authUser?.role !== "user") {
      res.status(403).json({
        success: false,
        message: "Only the scoped workspace owner can create employee users.",
      });
      return;
    }

    const scope = resolveAuthenticatedClientScope(req);
    if (!scope) {
      res.status(403).json({
        success: false,
        message: "Your account does not have a complete client scope.",
      });
      return;
    }

    const username = normalizeUsername(req.body.username);
    const password = typeof req.body.password === "string" ? req.body.password : "";
    const displayName = isNonEmptyString(req.body.displayName)
      ? req.body.displayName.trim()
      : undefined;
    const status = req.body.status ?? "active";

    if (!username) {
      res.status(400).json({ success: false, message: "Field 'username' is required." });
      return;
    }

    if (!password || password.length < 8) {
      res.status(400).json({
        success: false,
        message: "Field 'password' is required and must be at least 8 characters.",
      });
      return;
    }

    if (!isDashboardUserStatus(status)) {
      res.status(400).json({
        success: false,
        message: `Field 'status' must be one of: ${DASHBOARD_USER_STATUSES.join(", ")}.`,
      });
      return;
    }

    const scopeError = await validateScopeReferences(
      scope.scopedFlowId,
      scope.scopedChannelAccountId
    );
    if (scopeError) {
      res.status(400).json({ success: false, message: scopeError });
      return;
    }

    const existingUser = await DashboardUserModel.findOne({ username })
      .select("_id")
      .lean();
    if (existingUser) {
      res.status(409).json({ success: false, message: "Username already exists." });
      return;
    }

    const createdUser = await DashboardUserModel.create({
      username,
      passwordHash: createPasswordHash(password),
      role: "employee",
      status,
      displayName,
      scopedFlowId: new mongoose.Types.ObjectId(scope.scopedFlowId),
      scopedChannelAccountId: new mongoose.Types.ObjectId(scope.scopedChannelAccountId),
    });

    res.status(201).json({
      success: true,
      data: buildClientUserResponse(createdUser),
    });
  } catch (error) {
    const dbError = error as { code?: number };
    if (dbError.code === 11000) {
      res.status(409).json({ success: false, message: "Username already exists." });
      return;
    }

    next(error);
  }
}

export async function updateScopedEmployeeUser(
  req: Request<{ id: string }, unknown, DashboardUserUpsertBody>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (req.authUser?.role !== "user") {
      res.status(403).json({
        success: false,
        message: "Only the scoped workspace owner can update employee users.",
      });
      return;
    }

    const scope = resolveAuthenticatedClientScope(req);
    if (!scope) {
      res.status(403).json({
        success: false,
        message: "Your account does not have a complete client scope.",
      });
      return;
    }

    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({ success: false, message: "Invalid employee user id." });
      return;
    }

    const user = await DashboardUserModel.findOne({
      _id: id,
      role: "employee",
      scopedFlowId: new mongoose.Types.ObjectId(scope.scopedFlowId),
      scopedChannelAccountId: new mongoose.Types.ObjectId(scope.scopedChannelAccountId),
    });
    if (!user) {
      res.status(404).json({ success: false, message: "Employee user not found." });
      return;
    }

    if (req.body.username !== undefined) {
      const username = normalizeUsername(req.body.username);
      if (!username) {
        res.status(400).json({ success: false, message: "Field 'username' must be non-empty." });
        return;
      }

      const duplicate = await DashboardUserModel.findOne({
        username,
        _id: { $ne: user._id },
      })
        .select("_id")
        .lean();
      if (duplicate) {
        res.status(409).json({ success: false, message: "Username already exists." });
        return;
      }

      user.username = username;
    }

    if (req.body.password !== undefined) {
      if (typeof req.body.password !== "string" || req.body.password.length < 8) {
        res.status(400).json({
          success: false,
          message: "Field 'password' must be at least 8 characters when provided.",
        });
        return;
      }

      user.passwordHash = createPasswordHash(req.body.password);
    }

    if (req.body.displayName !== undefined) {
      user.displayName = isNonEmptyString(req.body.displayName)
        ? req.body.displayName.trim()
        : undefined;
    }

    if (req.body.status !== undefined) {
      if (!isDashboardUserStatus(req.body.status)) {
        res.status(400).json({
          success: false,
          message: `Field 'status' must be one of: ${DASHBOARD_USER_STATUSES.join(", ")}.`,
        });
        return;
      }

      user.status = req.body.status;
    }

    if (
      req.body.scopedFlowId !== undefined &&
      !idsMatch(req.body.scopedFlowId as string, scope.scopedFlowId)
    ) {
      res.status(400).json({ success: false, message: "Employee flow scope cannot be changed." });
      return;
    }

    if (
      req.body.scopedChannelAccountId !== undefined &&
      !idsMatch(req.body.scopedChannelAccountId as string, scope.scopedChannelAccountId)
    ) {
      res.status(400).json({
        success: false,
        message: "Employee channel account scope cannot be changed.",
      });
      return;
    }

    user.scopedFlowId = new mongoose.Types.ObjectId(scope.scopedFlowId);
    user.scopedChannelAccountId = new mongoose.Types.ObjectId(scope.scopedChannelAccountId);

    const updatedUser = await user.save();

    res.status(200).json({
      success: true,
      data: buildClientUserResponse(updatedUser),
    });
  } catch (error) {
    const dbError = error as { code?: number };
    if (dbError.code === 11000) {
      res.status(409).json({ success: false, message: "Username already exists." });
      return;
    }

    next(error);
  }
}
