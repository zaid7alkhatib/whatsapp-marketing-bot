import { Router } from "express";
import {
  createSessionStepResponse,
  getSessionStepResponseById,
  getSessionStepResponses,
} from "./session-step-response.controller";

const sessionStepResponseRouter = Router();

sessionStepResponseRouter.get("/", getSessionStepResponses);
sessionStepResponseRouter.post("/", createSessionStepResponse);
sessionStepResponseRouter.get("/:id", getSessionStepResponseById);

export default sessionStepResponseRouter;
