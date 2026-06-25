"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bootstrapWhatsAppWorkspace = bootstrapWhatsAppWorkspace;
exports.bootstrapSuperAdmin = bootstrapSuperAdmin;
const channel_account_model_1 = require("../modules/channel-accounts/channel-account.model");
const channel_model_1 = require("../modules/channels/channel.model");
const env_1 = require("../config/env");
const auth_service_1 = require("../modules/auth/auth.service");
const dashboard_user_model_1 = require("../modules/users/dashboard-user.model");
async function bootstrapWhatsAppWorkspace() {
    const channel = await channel_model_1.ChannelModel.findOneAndUpdate({ code: "whatsapp" }, {
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
    }, { returnDocument: "after", upsert: true }).exec();
    const existingAccount = await channel_account_model_1.ChannelAccountModel.exists({ channelId: channel._id });
    if (existingAccount) {
        return;
    }
    await channel_account_model_1.ChannelAccountModel.create({
        channelId: channel._id,
        code: "MAIN_WHATSAPP",
        displayName: "Main WhatsApp Account",
        status: "pending",
        providerConfig: {},
    });
}
async function bootstrapSuperAdmin() {
    const username = (0, auth_service_1.normalizeUsername)(env_1.env.dashboardAdminUsername || "admin");
    const existingSuperAdmin = await dashboard_user_model_1.DashboardUserModel.exists({ role: "super_admin" });
    if (existingSuperAdmin) {
        return;
    }
    await dashboard_user_model_1.DashboardUserModel.create({
        username,
        displayName: "Super Admin",
        role: "super_admin",
        passwordHash: await (0, auth_service_1.hashPassword)(env_1.env.dashboardAdminPassword || "admin"),
        isActive: true,
    });
}
