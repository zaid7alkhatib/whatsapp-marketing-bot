import mongoose from "mongoose";
import { env } from "../../config/env";
import { ChannelAccountModel } from "../channel-accounts/channel-account.model";
import type { AuthTokenPayload } from "./auth.types";

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
  return role === "__legacy_scoped_user__";
}

function normalizeScopedId(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
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
