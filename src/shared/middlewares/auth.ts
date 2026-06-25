import type { RequestHandler } from "express";
import { normalizeUsername, verifyAuthToken } from "../../modules/auth/auth.service";
import type { AuthRole } from "../../modules/auth/auth.types";
import { DashboardUserModel } from "../../modules/users/dashboard-user.model";
import { sendError } from "../utils/apiResponse";

type AllowedMethods = "ALL" | string[];

function normalizeMethod(method: string): string {
  return method.trim().toUpperCase();
}

function parseBearerToken(headerValue: unknown): string | null {
  if (typeof headerValue !== "string") {
    return null;
  }

  const trimmedHeader = headerValue.trim();
  if (!trimmedHeader.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  const token = trimmedHeader.slice(7).trim();
  return token || null;
}

export const requireAuth: RequestHandler = async (req, res, next) => {
  try {
    const token = parseBearerToken(req.headers.authorization);
    if (!token) {
      return sendError(res, "Authentication required.", 401);
    }

    const authUser = verifyAuthToken(token);
    if (!authUser) {
      return sendError(res, "Invalid or expired authentication token.", 401);
    }

    const dashboardUser = authUser.userId
      ? await DashboardUserModel.findOne({ _id: authUser.userId, isActive: true })
          .select("_id username displayName role")
          .lean()
          .exec()
      : await DashboardUserModel.findOne({
          username: normalizeUsername(authUser.username),
          isActive: true,
        })
          .select("_id username displayName role")
          .lean()
          .exec();

    if (!dashboardUser) {
      return sendError(res, "Invalid or expired authentication token.", 401);
    }

    req.authUser = {
      ...authUser,
      userId: String(dashboardUser._id),
      username: dashboardUser.username,
      displayName: dashboardUser.displayName,
      role: dashboardUser.role,
    };
    return next();
  } catch (error) {
    return next(error);
  }
};

export function allowRoles(allowedRoles: AuthRole[]): RequestHandler {
  return (req, res, next) => {
    if (!req.authUser) {
      return sendError(res, "Authentication required.", 401);
    }

    if (!allowedRoles.includes(req.authUser.role)) {
      return sendError(res, "You are not allowed to access this resource.", 403);
    }

    return next();
  };
}

export function allowRoleMethods(roleMethods: Partial<Record<AuthRole, AllowedMethods>>): RequestHandler {
  return (req, res, next) => {
    if (!req.authUser) {
      return sendError(res, "Authentication required.", 401);
    }

    const allowedMethods = roleMethods[req.authUser.role];
    if (!allowedMethods) {
      return sendError(res, "You are not allowed to access this resource.", 403);
    }

    if (allowedMethods === "ALL") {
      return next();
    }

    const currentMethod = normalizeMethod(req.method);
    const normalizedAllowedMethods = allowedMethods.map(normalizeMethod);

    if (!normalizedAllowedMethods.includes(currentMethod)) {
      return sendError(res, "You are not allowed to perform this action.", 403);
    }

    return next();
  };
}
