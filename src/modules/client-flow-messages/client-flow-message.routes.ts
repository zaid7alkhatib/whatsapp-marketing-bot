import { Router } from "express";
import {
  getClientFlowMessages,
  updateClientFlowMessage,
} from "./client-flow-message.controller";

const clientFlowMessageRouter = Router();

clientFlowMessageRouter.get("/", getClientFlowMessages);
clientFlowMessageRouter.put("/:key", updateClientFlowMessage);

export default clientFlowMessageRouter;
