import { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import { isClientUserRole, resolveScopedChannelAccount } from "../auth/auth.scope";
import { ChannelAccountModel } from "../channel-accounts/channel-account.model";
import { sendError, sendSuccess } from "../../shared/utils/apiResponse";
import { InterestedLeadModel } from "./interested-lead.model";

interface LeanInterestedLead {
  _id: mongoose.Types.ObjectId;
  channelAccountId: mongoose.Types.ObjectId;
  channelUserRef: string;
  phoneNumber: string;
  displayName?: string;
  lastMessage: string;
  trigger: string;
  status: string;
  acknowledgementMessage: string;
  acknowledgementSentAt?: Date;
  acknowledgementError?: string;
  firstInterestedAt: Date;
  lastInterestedAt: Date;
  messageCount: number;
  createdAt?: Date;
  updatedAt?: Date;
}

interface LeanChannelAccount {
  _id: mongoose.Types.ObjectId;
  code?: string;
  displayName?: string;
  phoneNumber?: string | null;
}

function getQueryString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalizedValue = value.trim();
  return normalizedValue || undefined;
}

function serializeDate(value: Date | undefined): string | undefined {
  return value ? value.toISOString() : undefined;
}

export async function getInterestedLeads(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const filter: Record<string, unknown> = {};

    if (isClientUserRole(req.authUser?.role)) {
      const scopedChannelAccount = await resolveScopedChannelAccount(req.authUser);
      if (!scopedChannelAccount) {
        sendError(res, "Client channel account scope is not configured.", 403);
        return;
      }

      filter.channelAccountId = scopedChannelAccount._id;
    } else {
      const queryChannelAccountId = getQueryString(req.query.channelAccountId);
      if (queryChannelAccountId) {
        if (!mongoose.isValidObjectId(queryChannelAccountId)) {
          sendError(res, "Field 'channelAccountId' must be a valid ObjectId.", 400);
          return;
        }

        filter.channelAccountId = new mongoose.Types.ObjectId(queryChannelAccountId);
      }
    }

    const leads = await InterestedLeadModel.find(filter)
      .sort({ lastInterestedAt: -1 })
      .limit(200)
      .lean<LeanInterestedLead[]>()
      .exec();

    const accountIds = Array.from(
      new Set(leads.map((lead) => String(lead.channelAccountId)))
    ).filter((id) => mongoose.isValidObjectId(id));

    const channelAccounts = await ChannelAccountModel.find({ _id: { $in: accountIds } })
      .select("_id code displayName phoneNumber")
      .lean<LeanChannelAccount[]>()
      .exec();
    const channelAccountMap = new Map(
      channelAccounts.map((account) => [String(account._id), account])
    );

    sendSuccess(res, {
      data: leads.map((lead) => {
        const channelAccount = channelAccountMap.get(String(lead.channelAccountId));
        const channelAccountName =
          channelAccount?.displayName || channelAccount?.code || String(lead.channelAccountId);

        return {
          _id: String(lead._id),
          channelAccountId: String(lead.channelAccountId),
          channelAccountName,
          channelAccountPhoneNumber: channelAccount?.phoneNumber ?? null,
          channelUserRef: lead.channelUserRef,
          phoneNumber: lead.phoneNumber,
          displayName: lead.displayName ?? null,
          lastMessage: lead.lastMessage,
          trigger: lead.trigger,
          status: lead.status,
          acknowledgementMessage: lead.acknowledgementMessage,
          acknowledgementSentAt: serializeDate(lead.acknowledgementSentAt),
          acknowledgementError: lead.acknowledgementError ?? null,
          firstInterestedAt: lead.firstInterestedAt.toISOString(),
          lastInterestedAt: lead.lastInterestedAt.toISOString(),
          messageCount: lead.messageCount,
          createdAt: serializeDate(lead.createdAt),
          updatedAt: serializeDate(lead.updatedAt),
        };
      }),
    });
  } catch (error) {
    next(error);
  }
}
