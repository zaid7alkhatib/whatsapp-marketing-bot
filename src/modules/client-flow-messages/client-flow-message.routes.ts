import { Router } from "express";
import {
  deleteClientFlowMessage,
  getClientFlowMessages,
  updateClientFlowMessage,
} from "./client-flow-message.controller";

const clientFlowMessageRouter = Router();

clientFlowMessageRouter.get("/", getClientFlowMessages);
clientFlowMessageRouter.put("/:key", updateClientFlowMessage);
clientFlowMessageRouter.delete("/:key", deleteClientFlowMessage);

export default clientFlowMessageRouter;
