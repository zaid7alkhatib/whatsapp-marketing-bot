import { Router } from "express";
import { createFlow, getFlowById, getFlows, updateFlow } from "./flow.controller";

const flowRouter = Router();

flowRouter.get("/", getFlows);
flowRouter.post("/", createFlow);
flowRouter.put("/:id", updateFlow);
flowRouter.get("/:id", getFlowById);

export default flowRouter;
