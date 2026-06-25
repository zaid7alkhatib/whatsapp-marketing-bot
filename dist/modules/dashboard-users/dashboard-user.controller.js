"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getClientUsers = getClientUsers;
exports.createClientUser = createClientUser;
exports.updateClientUser = updateClientUser;
exports.getScopedEmployeeUsers = getScopedEmployeeUsers;
exports.createScopedEmployeeUser = createScopedEmployeeUser;
exports.updateScopedEmployeeUser = updateScopedEmployeeUser;
exports.deleteScopedEmployeeUser = deleteScopedEmployeeUser;
const mongoose_1 = __importDefault(require("mongoose"));
const channel_account_model_1 = require("../channel-accounts/channel-account.model");
const flow_model_1 = require("../flows/flow.model");
const auth_service_1 = require("../auth/auth.service");
const auth_scope_1 = require("../auth/auth.scope");
const dashboard_user_model_1 = require("./dashboard-user.model");
const dashboard_user_types_1 = require("./dashboard-user.types");
function isNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
}
function isDashboardUserStatus(value) {
    return (typeof value === "string" &&
        dashboard_user_types_1.DASHBOARD_USER_STATUSES.includes(value));
}
function normalizeUsername(value) {
    return typeof value === "string" ? value.trim().toLowerCase() : "";
}
function buildClientUserResponse(user) {
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
function resolveAuthenticatedClientScope(req) {
    const scopedFlowId = req.authUser?.scopedFlowId;
    const scopedChannelAccountId = req.authUser?.scopedChannelAccountId;
    if (!isNonEmptyString(scopedFlowId) ||
        !mongoose_1.default.isValidObjectId(scopedFlowId) ||
        !isNonEmptyString(scopedChannelAccountId) ||
        !mongoose_1.default.isValidObjectId(scopedChannelAccountId)) {
        return null;
    }
    return {
        scopedFlowId: scopedFlowId.trim(),
        scopedChannelAccountId: scopedChannelAccountId.trim(),
    };
}
async function validateScopeReferences(flowId, channelAccountId) {
    if (!mongoose_1.default.isValidObjectId(flowId)) {
        return "Field 'scopedFlowId' must be a valid ObjectId.";
    }
    if (!mongoose_1.default.isValidObjectId(channelAccountId)) {
        return "Field 'scopedChannelAccountId' must be a valid ObjectId.";
    }
    const [flowExists, channelAccountExists] = await Promise.all([
        flow_model_1.FlowModel.exists({ _id: flowId }),
        channel_account_model_1.ChannelAccountModel.exists({ _id: channelAccountId }),
    ]);
    if (!flowExists) {
        return "Scoped flow was not found.";
    }
    if (!channelAccountExists) {
        return "Scoped channel account was not found.";
    }
    return null;
}
async function getClientUsers(_req, res, next) {
    try {
        const users = await dashboard_user_model_1.DashboardUserModel.find({ role: { $in: ["user", "employee"] } })
            .sort({ createdAt: -1 })
            .lean();
        const flowIds = Array.from(new Set(users
            .map((user) => (user.scopedFlowId ? String(user.scopedFlowId) : ""))
            .filter(Boolean)));
        const channelAccountIds = Array.from(new Set(users
            .map((user) => user.scopedChannelAccountId ? String(user.scopedChannelAccountId) : "")
            .filter(Boolean)));
        const [flows, channelAccounts] = await Promise.all([
            flowIds.length
                ? flow_model_1.FlowModel.find({ _id: { $in: flowIds } })
                    .select("_id code version")
                    .lean()
                : [],
            channelAccountIds.length
                ? channel_account_model_1.ChannelAccountModel.find({ _id: { $in: channelAccountIds } })
                    .select("_id code displayName phoneNumber")
                    .lean()
                : [],
        ]);
        const flowsById = new Map(flows.map((flow) => [String(flow._id), flow]));
        const channelAccountsById = new Map(channelAccounts.map((channelAccount) => [String(channelAccount._id), channelAccount]));
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
    }
    catch (error) {
        next(error);
    }
}
async function createClientUser(req, res, next) {
    try {
        const username = normalizeUsername(req.body.username);
        const password = typeof req.body.password === "string" ? req.body.password : "";
        const displayName = isNonEmptyString(req.body.displayName)
            ? req.body.displayName.trim()
            : undefined;
        const status = req.body.status ?? "active";
        const scopedFlowId = typeof req.body.scopedFlowId === "string" ? req.body.scopedFlowId.trim() : "";
        const scopedChannelAccountId = typeof req.body.scopedChannelAccountId === "string"
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
                message: `Field 'status' must be one of: ${dashboard_user_types_1.DASHBOARD_USER_STATUSES.join(", ")}.`,
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
        const existingUser = await dashboard_user_model_1.DashboardUserModel.findOne({ username })
            .select("_id")
            .lean();
        if (existingUser) {
            res.status(409).json({ success: false, message: "Username already exists." });
            return;
        }
        const createdUser = await dashboard_user_model_1.DashboardUserModel.create({
            username,
            passwordHash: (0, auth_service_1.createPasswordHash)(password),
            role: "user",
            status,
            displayName,
            scopedFlowId: new mongoose_1.default.Types.ObjectId(scopedFlowId),
            scopedChannelAccountId: new mongoose_1.default.Types.ObjectId(scopedChannelAccountId),
        });
        res.status(201).json({
            success: true,
            data: buildClientUserResponse(createdUser),
        });
    }
    catch (error) {
        const dbError = error;
        if (dbError.code === 11000) {
            res.status(409).json({ success: false, message: "Username already exists." });
            return;
        }
        next(error);
    }
}
async function updateClientUser(req, res, next) {
    try {
        const { id } = req.params;
        if (!mongoose_1.default.isValidObjectId(id)) {
            res.status(400).json({ success: false, message: "Invalid client user id." });
            return;
        }
        const user = await dashboard_user_model_1.DashboardUserModel.findOne({
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
            const duplicate = await dashboard_user_model_1.DashboardUserModel.findOne({
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
            user.passwordHash = (0, auth_service_1.createPasswordHash)(req.body.password);
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
                    message: `Field 'status' must be one of: ${dashboard_user_types_1.DASHBOARD_USER_STATUSES.join(", ")}.`,
                });
                return;
            }
            user.status = req.body.status;
        }
        const nextScopedFlowId = req.body.scopedFlowId !== undefined
            ? typeof req.body.scopedFlowId === "string"
                ? req.body.scopedFlowId.trim()
                : ""
            : user.scopedFlowId
                ? String(user.scopedFlowId)
                : "";
        const nextScopedChannelAccountId = req.body.scopedChannelAccountId !== undefined
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
        const scopeError = await validateScopeReferences(nextScopedFlowId, nextScopedChannelAccountId);
        if (scopeError) {
            res.status(400).json({ success: false, message: scopeError });
            return;
        }
        user.scopedFlowId = new mongoose_1.default.Types.ObjectId(nextScopedFlowId);
        user.scopedChannelAccountId = new mongoose_1.default.Types.ObjectId(nextScopedChannelAccountId);
        const updatedUser = await user.save();
        res.status(200).json({
            success: true,
            data: buildClientUserResponse(updatedUser),
        });
    }
    catch (error) {
        const dbError = error;
        if (dbError.code === 11000) {
            res.status(409).json({ success: false, message: "Username already exists." });
            return;
        }
        next(error);
    }
}
async function getScopedEmployeeUsers(req, res, next) {
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
        const users = await dashboard_user_model_1.DashboardUserModel.find({
            role: "employee",
            scopedFlowId: new mongoose_1.default.Types.ObjectId(scope.scopedFlowId),
            scopedChannelAccountId: new mongoose_1.default.Types.ObjectId(scope.scopedChannelAccountId),
        })
            .sort({ createdAt: -1 })
            .lean();
        res.status(200).json({
            success: true,
            data: users.map(buildClientUserResponse),
        });
    }
    catch (error) {
        next(error);
    }
}
async function createScopedEmployeeUser(req, res, next) {
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
                message: `Field 'status' must be one of: ${dashboard_user_types_1.DASHBOARD_USER_STATUSES.join(", ")}.`,
            });
            return;
        }
        const scopeError = await validateScopeReferences(scope.scopedFlowId, scope.scopedChannelAccountId);
        if (scopeError) {
            res.status(400).json({ success: false, message: scopeError });
            return;
        }
        const existingUser = await dashboard_user_model_1.DashboardUserModel.findOne({ username })
            .select("_id")
            .lean();
        if (existingUser) {
            res.status(409).json({ success: false, message: "Username already exists." });
            return;
        }
        const createdUser = await dashboard_user_model_1.DashboardUserModel.create({
            username,
            passwordHash: (0, auth_service_1.createPasswordHash)(password),
            role: "employee",
            status,
            displayName,
            scopedFlowId: new mongoose_1.default.Types.ObjectId(scope.scopedFlowId),
            scopedChannelAccountId: new mongoose_1.default.Types.ObjectId(scope.scopedChannelAccountId),
        });
        res.status(201).json({
            success: true,
            data: buildClientUserResponse(createdUser),
        });
    }
    catch (error) {
        const dbError = error;
        if (dbError.code === 11000) {
            res.status(409).json({ success: false, message: "Username already exists." });
            return;
        }
        next(error);
    }
}
async function updateScopedEmployeeUser(req, res, next) {
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
        if (!mongoose_1.default.isValidObjectId(id)) {
            res.status(400).json({ success: false, message: "Invalid employee user id." });
            return;
        }
        const user = await dashboard_user_model_1.DashboardUserModel.findOne({
            _id: id,
            role: "employee",
            scopedFlowId: new mongoose_1.default.Types.ObjectId(scope.scopedFlowId),
            scopedChannelAccountId: new mongoose_1.default.Types.ObjectId(scope.scopedChannelAccountId),
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
            const duplicate = await dashboard_user_model_1.DashboardUserModel.findOne({
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
            user.passwordHash = (0, auth_service_1.createPasswordHash)(req.body.password);
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
                    message: `Field 'status' must be one of: ${dashboard_user_types_1.DASHBOARD_USER_STATUSES.join(", ")}.`,
                });
                return;
            }
            user.status = req.body.status;
        }
        if (req.body.scopedFlowId !== undefined &&
            !(0, auth_scope_1.idsMatch)(req.body.scopedFlowId, scope.scopedFlowId)) {
            res.status(400).json({ success: false, message: "Employee flow scope cannot be changed." });
            return;
        }
        if (req.body.scopedChannelAccountId !== undefined &&
            !(0, auth_scope_1.idsMatch)(req.body.scopedChannelAccountId, scope.scopedChannelAccountId)) {
            res.status(400).json({
                success: false,
                message: "Employee channel account scope cannot be changed.",
            });
            return;
        }
        user.scopedFlowId = new mongoose_1.default.Types.ObjectId(scope.scopedFlowId);
        user.scopedChannelAccountId = new mongoose_1.default.Types.ObjectId(scope.scopedChannelAccountId);
        const updatedUser = await user.save();
        res.status(200).json({
            success: true,
            data: buildClientUserResponse(updatedUser),
        });
    }
    catch (error) {
        const dbError = error;
        if (dbError.code === 11000) {
            res.status(409).json({ success: false, message: "Username already exists." });
            return;
        }
        next(error);
    }
}
async function deleteScopedEmployeeUser(req, res, next) {
    try {
        if (req.authUser?.role !== "user") {
            res.status(403).json({
                success: false,
                message: "Only the scoped workspace owner can delete employee users.",
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
        if (!mongoose_1.default.isValidObjectId(id)) {
            res.status(400).json({ success: false, message: "Invalid employee user id." });
            return;
        }
        const deletedUser = await dashboard_user_model_1.DashboardUserModel.findOneAndDelete({
            _id: id,
            role: "employee",
            scopedFlowId: new mongoose_1.default.Types.ObjectId(scope.scopedFlowId),
            scopedChannelAccountId: new mongoose_1.default.Types.ObjectId(scope.scopedChannelAccountId),
        })
            .select("_id username role status displayName scopedFlowId scopedChannelAccountId")
            .lean();
        if (!deletedUser) {
            res.status(404).json({ success: false, message: "Employee user not found." });
            return;
        }
        res.status(200).json({
            success: true,
            data: buildClientUserResponse(deletedUser),
            message: "Employee user deleted successfully.",
        });
    }
    catch (error) {
        next(error);
    }
}
