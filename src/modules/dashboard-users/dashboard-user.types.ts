import { Types } from "mongoose";
import type { AuthRole } from "../auth/auth.types";

export const DASHBOARD_USER_STATUSES = ["active", "inactive"] as const;
export type DashboardUserStatus = (typeof DASHBOARD_USER_STATUSES)[number];

export interface DashboardUser {
  username: string;
  passwordHash: string;
  role: AuthRole;
  status: DashboardUserStatus;
  displayName?: string;
  scopedFlowId?: Types.ObjectId | null;
  scopedChannelAccountId?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DashboardUserUpsertBody {
  username?: unknown;
  password?: unknown;
  displayName?: unknown;
  status?: unknown;
  scopedFlowId?: unknown;
  scopedChannelAccountId?: unknown;
}
