import { Router } from "express";
import mongoose from "mongoose";
import baileysRouter from "../integrations/baileys/baileys.routes";
import authRouter from "../modules/auth/auth.routes";
import channelAccountRouter from "../modules/channel-accounts/channel-account.routes";
import contactSectionRouter from "../modules/contact-sections/contact-section.routes";
import channelRouter from "../modules/channels/channel.routes";
import interestedLeadRouter from "../modules/interested-leads/interested-lead.routes";
import dashboardUserRouter from "../modules/users/dashboard-user.routes";
import whatsappOutreachRouter from "../modules/whatsapp-outreach/whatsapp-outreach.routes";
import { allowRoleMethods, allowRoles, requireAuth } from "../shared/middlewares/auth";
import { sendSuccess } from "../shared/utils/apiResponse";

const router = Router();

router.get("/health", (_req, res) => {
  sendSuccess(res, { message: "Server is running. / الخادم يعمل." });
});

router.get("/api/v1/system/readiness", (_req, res) => {
  const database = mongoose.connection.readyState === 1 ? "ok" : "not_ready";

  sendSuccess(res, {
    data: {
      server: "ok",
      database,
      whatsappRuntime: "ok",
    },
  });
});

router.use("/api/v1/auth", authRouter);
router.use(
  "/api/v1/users",
  requireAuth,
  allowRoles(["super_admin"]),
  dashboardUserRouter
);
router.use("/api/v1/channels", requireAuth, allowRoles(["super_admin", "admin"]), channelRouter);
router.use(
  "/api/v1/channel-accounts",
  requireAuth,
  allowRoleMethods({ super_admin: "ALL", admin: "ALL", manager: ["GET"] }),
  channelAccountRouter
);
router.use(
  "/api/v1/contact-sections",
  requireAuth,
  allowRoleMethods({ super_admin: "ALL", admin: "ALL", manager: "ALL" }),
  contactSectionRouter
);
router.use(
  "/api/v1/baileys",
  requireAuth,
  allowRoleMethods({ super_admin: "ALL", admin: "ALL", manager: ["GET"] }),
  baileysRouter
);
router.use(
  "/api/v1/whatsapp-outreach",
  requireAuth,
  allowRoleMethods({ super_admin: "ALL", admin: "ALL", manager: "ALL" }),
  whatsappOutreachRouter
);
router.use(
  "/api/v1/interested-leads",
  requireAuth,
  allowRoleMethods({ super_admin: "ALL", admin: "ALL", manager: ["GET"], viewer: ["GET"] }),
  interestedLeadRouter
);

export default router;
