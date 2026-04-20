import { Document, Schema, model } from "mongoose";
import type { DashboardUser } from "./dashboard-user.types";
import { DASHBOARD_USER_STATUSES } from "./dashboard-user.types";

export interface DashboardUserDocument extends DashboardUser, Document {}

const dashboardUserSchema = new Schema<DashboardUserDocument>(
  {
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
      enum: ["admin", "user"],
      required: true,
      default: "user",
    },
    status: {
      type: String,
      enum: DASHBOARD_USER_STATUSES,
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
      type: Schema.Types.ObjectId,
      ref: "Flow",
      default: null,
    },
    scopedChannelAccountId: {
      type: Schema.Types.ObjectId,
      ref: "ChannelAccount",
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

dashboardUserSchema.index({ role: 1, status: 1, createdAt: -1 });

export const DashboardUserModel = model<DashboardUserDocument>(
  "DashboardUser",
  dashboardUserSchema
);
