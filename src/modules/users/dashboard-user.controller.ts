import type { RequestHandler } from "express";
import { sendError, sendSuccess } from "../../shared/utils/apiResponse";
import { hashPassword, isAuthRole, normalizeUsername } from "../auth/auth.service";
import { DashboardUserModel, type DashboardUserDocument } from "./dashboard-user.model";

function serializeUser(user: DashboardUserDocument) {
  return {
    _id: String(user._id),
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function parseDisplayName(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function parsePassword(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export const listDashboardUsersController: RequestHandler = async (_req, res, next) => {
  try {
    const users = await DashboardUserModel.find({}).sort({ role: 1, username: 1 }).exec();
    sendSuccess(res, { data: { users: users.map(serializeUser) } });
  } catch (error) {
    next(error);
  }
};

export const createDashboardUserController: RequestHandler = async (req, res, next) => {
  try {
    const username = normalizeUsername(req.body?.username);
    const displayName = parseDisplayName(req.body?.displayName);
    const password = parsePassword(req.body?.password);
    const role = req.body?.role;

    if (!username || !displayName || password.length < 6 || !isAuthRole(role)) {
      return sendError(
        res,
        "Username, name, role, and a password of at least 6 characters are required.",
        400
      );
    }

    if (role === "super_admin") {
      return sendError(res, "Super Admin is created only by system bootstrap.", 403);
    }

    const user = await DashboardUserModel.create({
      username,
      displayName,
      role,
      passwordHash: await hashPassword(password),
      isActive: true,
    });

    sendSuccess(res, { data: { user: serializeUser(user) }, statusCode: 201 });
  } catch (error) {
    next(error);
  }
};

export const updateDashboardUserController: RequestHandler = async (req, res, next) => {
  try {
    const user = await DashboardUserModel.findById(req.params.userId).exec();
    if (!user) {
      return sendError(res, "User not found.", 404);
    }

    const requesterId = req.authUser?.userId;
    const isSelf = requesterId === String(user._id);

    if (user.role === "super_admin") {
      const password = parsePassword(req.body?.password);
      if (!isSelf || Object.keys(req.body ?? {}).some((key) => key !== "password")) {
        return sendError(res, "Super Admin can only change their own password.", 403);
      }
      if (password.length < 6) {
        return sendError(res, "Password must be at least 6 characters.", 400);
      }
      user.passwordHash = await hashPassword(password);
      await user.save();
      return sendSuccess(res, { data: { user: serializeUser(user) } });
    }

    const displayName = parseDisplayName(req.body?.displayName);
    const role = req.body?.role;
    const password = parsePassword(req.body?.password);

    if (displayName) {
      user.displayName = displayName;
    }
    if (role !== undefined) {
      if (!isAuthRole(role) || role === "super_admin") {
        return sendError(res, "Invalid role.", 400);
      }
      user.role = role;
    }
    if (password) {
      if (password.length < 6) {
        return sendError(res, "Password must be at least 6 characters.", 400);
      }
      user.passwordHash = await hashPassword(password);
    }

    await user.save();
    sendSuccess(res, { data: { user: serializeUser(user) } });
  } catch (error) {
    next(error);
  }
};

export const deleteDashboardUserController: RequestHandler = async (req, res, next) => {
  try {
    const user = await DashboardUserModel.findById(req.params.userId).exec();
    if (!user) {
      return sendError(res, "User not found.", 404);
    }

    if (user.role === "super_admin") {
      return sendError(res, "Super Admin cannot be deleted.", 403);
    }

    await user.deleteOne();
    sendSuccess(res, { data: { deleted: true } });
  } catch (error) {
    next(error);
  }
};
