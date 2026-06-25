"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteDashboardUserController = exports.updateDashboardUserController = exports.createDashboardUserController = exports.listDashboardUsersController = void 0;
const apiResponse_1 = require("../../shared/utils/apiResponse");
const auth_service_1 = require("../auth/auth.service");
const dashboard_user_model_1 = require("./dashboard-user.model");
function serializeUser(user) {
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
function parseDisplayName(value) {
    return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}
function parsePassword(value) {
    return typeof value === "string" ? value : "";
}
const listDashboardUsersController = async (_req, res, next) => {
    try {
        const users = await dashboard_user_model_1.DashboardUserModel.find({}).sort({ role: 1, username: 1 }).exec();
        (0, apiResponse_1.sendSuccess)(res, { data: { users: users.map(serializeUser) } });
    }
    catch (error) {
        next(error);
    }
};
exports.listDashboardUsersController = listDashboardUsersController;
const createDashboardUserController = async (req, res, next) => {
    try {
        const username = (0, auth_service_1.normalizeUsername)(req.body?.username);
        const displayName = parseDisplayName(req.body?.displayName);
        const password = parsePassword(req.body?.password);
        const role = req.body?.role;
        if (!username || !displayName || password.length < 6 || !(0, auth_service_1.isAuthRole)(role)) {
            return (0, apiResponse_1.sendError)(res, "Username, name, role, and a password of at least 6 characters are required.", 400);
        }
        if (role === "super_admin") {
            return (0, apiResponse_1.sendError)(res, "Super Admin is created only by system bootstrap.", 403);
        }
        const user = await dashboard_user_model_1.DashboardUserModel.create({
            username,
            displayName,
            role,
            passwordHash: await (0, auth_service_1.hashPassword)(password),
            isActive: true,
        });
        (0, apiResponse_1.sendSuccess)(res, { data: { user: serializeUser(user) }, statusCode: 201 });
    }
    catch (error) {
        next(error);
    }
};
exports.createDashboardUserController = createDashboardUserController;
const updateDashboardUserController = async (req, res, next) => {
    try {
        const user = await dashboard_user_model_1.DashboardUserModel.findById(req.params.userId).exec();
        if (!user) {
            return (0, apiResponse_1.sendError)(res, "User not found.", 404);
        }
        const requesterId = req.authUser?.userId;
        const isSelf = requesterId === String(user._id);
        if (user.role === "super_admin") {
            const password = parsePassword(req.body?.password);
            if (!isSelf || Object.keys(req.body ?? {}).some((key) => key !== "password")) {
                return (0, apiResponse_1.sendError)(res, "Super Admin can only change their own password.", 403);
            }
            if (password.length < 6) {
                return (0, apiResponse_1.sendError)(res, "Password must be at least 6 characters.", 400);
            }
            user.passwordHash = await (0, auth_service_1.hashPassword)(password);
            await user.save();
            return (0, apiResponse_1.sendSuccess)(res, { data: { user: serializeUser(user) } });
        }
        const displayName = parseDisplayName(req.body?.displayName);
        const role = req.body?.role;
        const password = parsePassword(req.body?.password);
        if (displayName) {
            user.displayName = displayName;
        }
        if (role !== undefined) {
            if (!(0, auth_service_1.isAuthRole)(role) || role === "super_admin") {
                return (0, apiResponse_1.sendError)(res, "Invalid role.", 400);
            }
            user.role = role;
        }
        if (password) {
            if (password.length < 6) {
                return (0, apiResponse_1.sendError)(res, "Password must be at least 6 characters.", 400);
            }
            user.passwordHash = await (0, auth_service_1.hashPassword)(password);
        }
        await user.save();
        (0, apiResponse_1.sendSuccess)(res, { data: { user: serializeUser(user) } });
    }
    catch (error) {
        next(error);
    }
};
exports.updateDashboardUserController = updateDashboardUserController;
const deleteDashboardUserController = async (req, res, next) => {
    try {
        const user = await dashboard_user_model_1.DashboardUserModel.findById(req.params.userId).exec();
        if (!user) {
            return (0, apiResponse_1.sendError)(res, "User not found.", 404);
        }
        if (user.role === "super_admin") {
            return (0, apiResponse_1.sendError)(res, "Super Admin cannot be deleted.", 403);
        }
        await user.deleteOne();
        (0, apiResponse_1.sendSuccess)(res, { data: { deleted: true } });
    }
    catch (error) {
        next(error);
    }
};
exports.deleteDashboardUserController = deleteDashboardUserController;
