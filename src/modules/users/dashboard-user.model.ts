import { Document, Schema, model } from "mongoose";
import type { AuthRole } from "../auth/auth.types";

export const DASHBOARD_USER_ROLES: AuthRole[] = [
  "super_admin",
  "admin",
  "manager",
  "viewer",
];

export interface DashboardUserDocument extends Document {
  username: string;
  displayName: string;
  role: AuthRole;
  passwordHash: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const dashboardUserSchema = new Schema<DashboardUserDocument>(
  {
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
      enum: DASHBOARD_USER_ROLES,
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
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

export const DashboardUserModel = model<DashboardUserDocument>(
  "DashboardUser",
  dashboardUserSchema
);
