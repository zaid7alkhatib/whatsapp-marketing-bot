import { Router } from "express";
import { inboundMessageController } from "./runtime.controller";

const runtimeRouter = Router();

runtimeRouter.post("/inbound-message", inboundMessageController);

export default runtimeRouter;
