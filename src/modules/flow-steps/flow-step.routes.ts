import { Router } from "express";
import {
  createFlowStep,
  deleteFlowStep,
  getFlowStepById,
  getFlowSteps,
  updateFlowStep,
} from "./flow-step.controller";

const flowStepRouter = Router();

flowStepRouter.get("/", getFlowSteps);
flowStepRouter.post("/", createFlowStep);
flowStepRouter.put("/:id", updateFlowStep);
flowStepRouter.delete("/:id", deleteFlowStep);
flowStepRouter.get("/:id", getFlowStepById);

export default flowStepRouter;
