import { Router } from "express";
import mongoose from "mongoose";
import baileysRouter from "../integrations/baileys/baileys.routes";
import geminiRouter from "../integrations/gemini/gemini.routes";
import authRouter from "../modules/auth/auth.routes";
import businessPartnerRouter from "../modules/business-partners/business-partner.routes";
import botEngineRouter from "../modules/bot-engine/bot-engine.routes";
import botSessionRouter from "../modules/bot-sessions/bot-session.routes";
import channelAccountRouter from "../modules/channel-accounts/channel-account.routes";
import channelRouter from "../modules/channels/channel.routes";
import clientFlowMessageRouter from "../modules/client-flow-messages/client-flow-message.routes";
import contentTemplateRouter from "../modules/content-templates/content-template.routes";
import dashboardUserRouter from "../modules/dashboard-users/dashboard-user.routes";
import flowStepRouter from "../modules/flow-steps/flow-step.routes";
import flowRouter from "../modules/flows/flow.routes";
import messageRouter from "../modules/messages/message.routes";
import mediaRouter from "../modules/media/media.routes";
import orgUnitRouter from "../modules/org-units/org-unit.routes";
import requestTypeRouter from "../modules/request-types/request-type.routes";
import runtimeRouter from "../modules/runtime/runtime.routes";
import sessionStepResponseRouter from "../modules/session-step-responses/session-step-response.routes";
import serviceRequestRouter from "../modules/service-requests/service-request.routes";
import serviceRouter from "../modules/services/service.routes";
import { allowRoleMethods, allowRoles, requireAuth } from "../shared/middlewares/auth";
import { sendSuccess } from "../shared/utils/apiResponse";

const router = Router();

router.get("/health", (_req, res) => {
  sendSuccess(res, { message: "Server is running" });
});

router.get("/api/v1/system/readiness", (_req, res) => {
  const database = mongoose.connection.readyState === 1 ? "ok" : "not_ready";

  sendSuccess(res, {
    data: {
      server: "ok",
      database,
      runtime: "ok",
    },
  });
});

router.use("/api/v1/auth", authRouter);
router.use("/api/v1/gemini", requireAuth, geminiRouter);
router.use("/api/v1/org-units", requireAuth, allowRoles(["admin"]), orgUnitRouter);
router.use("/api/v1/channels", requireAuth, allowRoles(["admin"]), channelRouter);
router.use(
  "/api/v1/channel-accounts",
  requireAuth,
  allowRoleMethods({ admin: "ALL", user: ["GET"] }),
  channelAccountRouter
);
router.use(
  "/api/v1/business-partners",
  requireAuth,
  allowRoles(["admin"]),
  businessPartnerRouter
);
router.use("/api/v1/services", requireAuth, allowRoles(["admin"]), serviceRouter);
router.use("/api/v1/request-types", requireAuth, allowRoles(["admin"]), requestTypeRouter);
router.use("/api/v1/content-templates", requireAuth, allowRoles(["admin"]), contentTemplateRouter);
router.use(
  "/api/v1/media",
  requireAuth,
  allowRoleMethods({ admin: "ALL", user: ["GET"] }),
  mediaRouter
);
router.use("/api/v1/dashboard-users", requireAuth, allowRoles(["admin"]), dashboardUserRouter);
router.use("/api/v1/flows", requireAuth, allowRoleMethods({ admin: "ALL", user: ["GET"] }), flowRouter);
router.use(
  "/api/v1/flow-steps",
  requireAuth,
  allowRoleMethods({ admin: "ALL", user: ["GET", "POST", "PUT"] }),
  flowStepRouter
);
router.use("/api/v1/bot-sessions", requireAuth, allowRoles(["admin"]), botSessionRouter);
router.use("/api/v1/messages", requireAuth, allowRoles(["admin"]), messageRouter);
router.use(
  "/api/v1/session-step-responses",
  requireAuth,
  allowRoles(["admin"]),
  sessionStepResponseRouter
);
router.use(
  "/api/v1/service-requests",
  requireAuth,
  allowRoleMethods({ admin: "ALL", user: ["GET"] }),
  serviceRequestRouter
);
router.use("/api/v1/bot-engine", requireAuth, allowRoles(["admin"]), botEngineRouter);
router.use(
  "/api/v1/runtime",
  requireAuth,
  allowRoles(["admin"]),
  runtimeRouter
);
router.use(
  "/api/v1/baileys",
  requireAuth,
  allowRoleMethods({ admin: "ALL", user: ["GET", "POST"] }),
  baileysRouter
);
router.use(
  "/api/v1/client/flow-messages",
  requireAuth,
  allowRoles(["user"]),
  clientFlowMessageRouter
);

export default router;
