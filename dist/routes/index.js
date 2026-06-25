"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const mongoose_1 = __importDefault(require("mongoose"));
const baileys_routes_1 = __importDefault(require("../integrations/baileys/baileys.routes"));
const auth_routes_1 = __importDefault(require("../modules/auth/auth.routes"));
const channel_account_routes_1 = __importDefault(require("../modules/channel-accounts/channel-account.routes"));
const contact_section_routes_1 = __importDefault(require("../modules/contact-sections/contact-section.routes"));
const channel_routes_1 = __importDefault(require("../modules/channels/channel.routes"));
const interested_lead_routes_1 = __importDefault(require("../modules/interested-leads/interested-lead.routes"));
const dashboard_user_routes_1 = __importDefault(require("../modules/users/dashboard-user.routes"));
const whatsapp_outreach_routes_1 = __importDefault(require("../modules/whatsapp-outreach/whatsapp-outreach.routes"));
const auth_1 = require("../shared/middlewares/auth");
const apiResponse_1 = require("../shared/utils/apiResponse");
const router = (0, express_1.Router)();
router.get("/health", (_req, res) => {
    (0, apiResponse_1.sendSuccess)(res, { message: "Server is running. / الخادم يعمل." });
});
router.get("/api/v1/system/readiness", (_req, res) => {
    const database = mongoose_1.default.connection.readyState === 1 ? "ok" : "not_ready";
    (0, apiResponse_1.sendSuccess)(res, {
        data: {
            server: "ok",
            database,
            whatsappRuntime: "ok",
        },
    });
});
router.use("/api/v1/auth", auth_routes_1.default);
router.use("/api/v1/users", auth_1.requireAuth, (0, auth_1.allowRoles)(["super_admin"]), dashboard_user_routes_1.default);
router.use("/api/v1/channels", auth_1.requireAuth, (0, auth_1.allowRoles)(["super_admin", "admin"]), channel_routes_1.default);
router.use("/api/v1/channel-accounts", auth_1.requireAuth, (0, auth_1.allowRoleMethods)({ super_admin: "ALL", admin: "ALL", manager: ["GET"] }), channel_account_routes_1.default);
router.use("/api/v1/contact-sections", auth_1.requireAuth, (0, auth_1.allowRoleMethods)({ super_admin: "ALL", admin: "ALL", manager: "ALL" }), contact_section_routes_1.default);
router.use("/api/v1/baileys", auth_1.requireAuth, (0, auth_1.allowRoleMethods)({ super_admin: "ALL", admin: "ALL", manager: ["GET"] }), baileys_routes_1.default);
router.use("/api/v1/whatsapp-outreach", auth_1.requireAuth, (0, auth_1.allowRoleMethods)({ super_admin: "ALL", admin: "ALL", manager: "ALL" }), whatsapp_outreach_routes_1.default);
router.use("/api/v1/interested-leads", auth_1.requireAuth, (0, auth_1.allowRoleMethods)({ super_admin: "ALL", admin: "ALL", manager: ["GET"], viewer: ["GET"] }), interested_lead_routes_1.default);
exports.default = router;
