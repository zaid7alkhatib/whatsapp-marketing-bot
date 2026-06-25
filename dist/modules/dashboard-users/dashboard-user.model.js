"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DashboardUserModel = void 0;
const mongoose_1 = require("mongoose");
const dashboard_user_types_1 = require("./dashboard-user.types");
const dashboardUserSchema = new mongoose_1.Schema({
    username: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
        unique: true,
        minlength: 3,
        maxlength: 100,
    },
    passwordHash: {
        type: String,
        required: true,
    },
    role: {
        type: String,
        enum: ["admin", "user", "employee"],
        required: true,
        default: "user",
    },
    status: {
        type: String,
        enum: dashboard_user_types_1.DASHBOARD_USER_STATUSES,
        required: true,
        default: "active",
    },
    displayName: {
        type: String,
        trim: true,
        required: false,
        maxlength: 200,
    },
    scopedFlowId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Flow",
        default: null,
    },
    scopedChannelAccountId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "ChannelAccount",
        default: null,
    },
}, {
    timestamps: true,
    versionKey: false,
});
dashboardUserSchema.index({ role: 1, status: 1, createdAt: -1 });
exports.DashboardUserModel = (0, mongoose_1.model)("DashboardUser", dashboardUserSchema);
