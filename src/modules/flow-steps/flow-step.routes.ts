import { Router } from "express";
import {
  createFlowStep,
  getFlowStepById,
  getFlowSteps,
  updateFlowStep,
} from "./flow-step.controller";

const flowStepRouter = Router();

flowStepRouter.get("/", getFlowSteps);
flowStepRouter.post("/", createFlowStep);
flowStepRouter.put("/:id", updateFlowStep);
flowStepRouter.get("/:id", getFlowStepById);

export default flowStepRouter;
