import { ChannelAccountModel } from "../modules/channel-accounts/channel-account.model";
import { ChannelModel } from "../modules/channels/channel.model";
import { env } from "../config/env";
import { hashPassword, normalizeUsername } from "../modules/auth/auth.service";
import { DashboardUserModel } from "../modules/users/dashboard-user.model";

export async function bootstrapWhatsAppWorkspace(): Promise<void> {
  const channel = await ChannelModel.findOneAndUpdate(
    { code: "whatsapp" },
    {
      $setOnInsert: {
        code: "whatsapp",
        name: "WhatsApp",
        provider: "baileys",
        status: "active",
        capabilities: {
          text: true,
          image: false,
          document: false,
          audio: false,
          buttons: false,
          lists: false,
        },
      },
    },
    { returnDocument: "after", upsert: true }
  ).exec();

  const existingAccount = await ChannelAccountModel.exists({ channelId: channel._id });
  if (existingAccount) {
    return;
  }

  await ChannelAccountModel.create({
    channelId: channel._id,
    code: "MAIN_WHATSAPP",
    displayName: "Main WhatsApp Account",
    status: "pending",
    providerConfig: {},
  });
}

export async function bootstrapSuperAdmin(): Promise<void> {
  const username = normalizeUsername(env.dashboardAdminUsername || "admin");
  const existingSuperAdmin = await DashboardUserModel.exists({ role: "super_admin" });
  if (existingSuperAdmin) {
    return;
  }

  await DashboardUserModel.create({
    username,
    displayName: "Super Admin",
    role: "super_admin",
    passwordHash: await hashPassword(env.dashboardAdminPassword || "admin"),
    isActive: true,
  });
}
