"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = void 0;
exports.allowRoles = allowRoles;
exports.allowRoleMethods = allowRoleMethods;
const auth_service_1 = require("../../modules/auth/auth.service");
const dashboard_user_model_1 = require("../../modules/users/dashboard-user.model");
const apiResponse_1 = require("../utils/apiResponse");
function normalizeMethod(method) {
    return method.trim().toUpperCase();
}
function parseBearerToken(headerValue) {
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
const requireAuth = async (req, res, next) => {
    try {
        const token = parseBearerToken(req.headers.authorization);
        if (!token) {
            return (0, apiResponse_1.sendError)(res, "Authentication required.", 401);
        }
        const authUser = (0, auth_service_1.verifyAuthToken)(token);
        if (!authUser) {
            return (0, apiResponse_1.sendError)(res, "Invalid or expired authentication token.", 401);
        }
        const dashboardUser = authUser.userId
            ? await dashboard_user_model_1.DashboardUserModel.findOne({ _id: authUser.userId, isActive: true })
                .select("_id username displayName role")
                .lean()
                .exec()
            : await dashboard_user_model_1.DashboardUserModel.findOne({
                username: (0, auth_service_1.normalizeUsername)(authUser.username),
                isActive: true,
            })
                .select("_id username displayName role")
                .lean()
                .exec();
        if (!dashboardUser) {
            return (0, apiResponse_1.sendError)(res, "Invalid or expired authentication token.", 401);
        }
        req.authUser = {
            ...authUser,
            userId: String(dashboardUser._id),
            username: dashboardUser.username,
            displayName: dashboardUser.displayName,
            role: dashboardUser.role,
        };
        return next();
    }
    catch (error) {
        return next(error);
    }
};
exports.requireAuth = requireAuth;
function allowRoles(allowedRoles) {
    return (req, res, next) => {
        if (!req.authUser) {
            return (0, apiResponse_1.sendError)(res, "Authentication required.", 401);
        }
        if (!allowedRoles.includes(req.authUser.role)) {
            return (0, apiResponse_1.sendError)(res, "You are not allowed to access this resource.", 403);
        }
        return next();
    };
}
function allowRoleMethods(roleMethods) {
    return (req, res, next) => {
        if (!req.authUser) {
            return (0, apiResponse_1.sendError)(res, "Authentication required.", 401);
        }
        const allowedMethods = roleMethods[req.authUser.role];
        if (!allowedMethods) {
            return (0, apiResponse_1.sendError)(res, "You are not allowed to access this resource.", 403);
        }
        if (allowedMethods === "ALL") {
            return next();
        }
        const currentMethod = normalizeMethod(req.method);
        const normalizedAllowedMethods = allowedMethods.map(normalizeMethod);
        if (!normalizedAllowedMethods.includes(currentMethod)) {
            return (0, apiResponse_1.sendError)(res, "You are not allowed to perform this action.", 403);
        }
        return next();
    };
}
