"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logoutController = exports.meController = exports.loginController = void 0;
const apiResponse_1 = require("../../shared/utils/apiResponse");
const auth_scope_1 = require("./auth.scope");
const auth_service_1 = require("./auth.service");
const loginController = async (req, res, next) => {
    try {
        const loginResult = await (0, auth_service_1.authenticateDashboardUser)(req.body?.username, req.body?.password);
        if (!loginResult) {
            return (0, apiResponse_1.sendError)(res, "Invalid username or password. / اسم المستخدم أو كلمة المرور غير صحيحة.", 401);
        }
        return (0, apiResponse_1.sendSuccess)(res, {
            data: loginResult,
            message: "Login successful. / تم تسجيل الدخول بنجاح.",
        });
    }
    catch (error) {
        next(error);
    }
};
exports.loginController = loginController;
const meController = async (req, res) => {
    if (!req.authUser) {
        return (0, apiResponse_1.sendError)(res, "Authentication required. / المصادقة مطلوبة.", 401);
    }
    let scope;
    if ((0, auth_scope_1.isClientUserRole)(req.authUser.role)) {
        const channelAccount = await (0, auth_scope_1.resolveScopedChannelAccount)(req.authUser);
        scope = {
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
    return (0, apiResponse_1.sendSuccess)(res, {
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
exports.meController = meController;
const logoutController = (_req, res) => {
    return (0, apiResponse_1.sendSuccess)(res, {
        message: "Logout successful. / تم تسجيل الخروج بنجاح.",
    });
};
exports.logoutController = logoutController;
