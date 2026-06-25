"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DashboardUserModel = exports.DASHBOARD_USER_ROLES = void 0;
const mongoose_1 = require("mongoose");
exports.DASHBOARD_USER_ROLES = [
    "super_admin",
    "admin",
    "manager",
    "viewer",
];
const dashboardUserSchema = new mongoose_1.Schema({
    username: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
        minlength: 2,
        maxlength: 80,
        unique: true,
        index: true,
    },
    displayName: {
        type: String,
        required: true,
        trim: true,
        minlength: 2,
        maxlength: 120,
    },
    role: {
        type: String,
        enum: exports.DASHBOARD_USER_ROLES,
        required: true,
        index: true,
    },
    passwordHash: {
        type: String,
        required: true,
    },
    isActive: {
        type: Boolean,
        required: true,
        default: true,
        index: true,
    },
}, {
    timestamps: true,
    versionKey: false,
});
exports.DashboardUserModel = (0, mongoose_1.model)("DashboardUser", dashboardUserSchema);
