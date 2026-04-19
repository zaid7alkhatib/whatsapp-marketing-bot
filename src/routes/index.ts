import { Router } from "express";
import mongoose from "mongoose";
import baileysRouter from "../integrations/baileys/baileys.routes";
import businessPartnerRouter from "../modules/business-partners/business-partner.routes";
import botEngineRouter from "../modules/bot-engine/bot-engine.routes";
import botSessionRouter from "../modules/bot-sessions/bot-session.routes";
import channelAccountRouter from "../modules/channel-accounts/channel-account.routes";
import channelRouter from "../modules/channels/channel.routes";
import contentTemplateRouter from "../modules/content-templates/content-template.routes";
import flowStepRouter from "../modules/flow-steps/flow-step.routes";
import flowRouter from "../modules/flows/flow.routes";
import messageRouter from "../modules/messages/message.routes";
import orgUnitRouter from "../modules/org-units/org-unit.routes";
import requestTypeRouter from "../modules/request-types/request-type.routes";
import runtimeRouter from "../modules/runtime/runtime.routes";
import sessionStepResponseRouter from "../modules/session-step-responses/session-step-response.routes";
import serviceRequestRouter from "../modules/service-requests/service-request.routes";
import serviceRouter from "../modules/services/service.routes";
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

router.use("/api/v1/org-units", orgUnitRouter);
router.use("/api/v1/channels", channelRouter);
router.use("/api/v1/channel-accounts", channelAccountRouter);
router.use("/api/v1/business-partners", businessPartnerRouter);
router.use("/api/v1/services", serviceRouter);
router.use("/api/v1/request-types", requestTypeRouter);
router.use("/api/v1/content-templates", contentTemplateRouter);
router.use("/api/v1/flows", flowRouter);
router.use("/api/v1/flow-steps", flowStepRouter);
router.use("/api/v1/bot-sessions", botSessionRouter);
router.use("/api/v1/messages", messageRouter);
router.use("/api/v1/session-step-responses", sessionStepResponseRouter);
router.use("/api/v1/service-requests", serviceRequestRouter);
router.use("/api/v1/bot-engine", botEngineRouter);
router.use("/api/v1/runtime", runtimeRouter);
router.use("/api/v1/baileys", baileysRouter);

export default router;
