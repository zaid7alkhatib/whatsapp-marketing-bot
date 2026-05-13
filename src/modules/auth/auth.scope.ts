import mongoose from "mongoose";
import { env } from "../../config/env";
import { ChannelAccountModel } from "../channel-accounts/channel-account.model";
import { FlowModel } from "../flows/flow.model";
import type { AuthTokenPayload } from "./auth.types";

interface ScopedFlowRecord {
  _id: mongoose.Types.ObjectId;
  code: string;
  version: number;
}

interface ScopedChannelAccountRecord {
  _id: mongoose.Types.ObjectId;
  code: string;
  displayName: string;
  phoneNumber?: string | null;
}

function normalizeCode(value: string | undefined): string | undefined {
  return value ? value.trim().toUpperCase() : undefined;
}

export function isClientUserRole(role: unknown): boolean {
  return role === "user" || role === "employee";
}

function normalizeScopedId(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

export async function resolveScopedFlow(
  authUser?: Pick<AuthTokenPayload, "role" | "scopedFlowId">
): Promise<ScopedFlowRecord | null> {
  const tokenScopedFlowId = isClientUserRole(authUser?.role)
    ? normalizeScopedId(authUser?.scopedFlowId)
    : undefined;

  if (tokenScopedFlowId && mongoose.isValidObjectId(tokenScopedFlowId)) {
    return FlowModel.findById(tokenScopedFlowId)
      .select("_id code version")
      .lean<ScopedFlowRecord>()
      .exec();
  }

  if (env.dashboardUserFlowId && mongoose.isValidObjectId(env.dashboardUserFlowId)) {
    return FlowModel.findById(env.dashboardUserFlowId)
      .select("_id code version")
      .lean<ScopedFlowRecord>()
      .exec();
  }

  const normalizedFlowCode = normalizeCode(env.dashboardUserFlowCode);
  if (normalizedFlowCode) {
    return FlowModel.findOne({ code: normalizedFlowCode })
      .sort({ version: -1 })
      .select("_id code version")
      .lean<ScopedFlowRecord>()
      .exec();
  }

  return null;
}

export async function resolveScopedChannelAccount(
  authUser?: Pick<AuthTokenPayload, "role" | "scopedChannelAccountId">
): Promise<ScopedChannelAccountRecord | null> {
  const tokenScopedChannelAccountId = isClientUserRole(authUser?.role)
    ? normalizeScopedId(authUser?.scopedChannelAccountId)
    : undefined;

  if (tokenScopedChannelAccountId && mongoose.isValidObjectId(tokenScopedChannelAccountId)) {
    return ChannelAccountModel.findById(tokenScopedChannelAccountId)
      .select("_id code displayName phoneNumber")
      .lean<ScopedChannelAccountRecord>()
      .exec();
  }

  if (
    env.dashboardUserChannelAccountId &&
    mongoose.isValidObjectId(env.dashboardUserChannelAccountId)
  ) {
    return ChannelAccountModel.findById(env.dashboardUserChannelAccountId)
      .select("_id code displayName phoneNumber")
      .lean<ScopedChannelAccountRecord>()
      .exec();
  }

  const normalizedChannelAccountCode = normalizeCode(env.dashboardUserChannelAccountCode);
  if (normalizedChannelAccountCode) {
    return ChannelAccountModel.findOne({ code: normalizedChannelAccountCode })
      .select("_id code displayName phoneNumber")
      .lean<ScopedChannelAccountRecord>()
      .exec();
  }

  return null;
}

export function idsMatch(
  left: mongoose.Types.ObjectId | string | null | undefined,
  right: mongoose.Types.ObjectId | string | null | undefined
): boolean {
  if (!left || !right) {
    return false;
  }

  return String(left) === String(right);
}
