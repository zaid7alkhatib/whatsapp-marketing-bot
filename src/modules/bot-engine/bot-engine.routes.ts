import { Router } from "express";
import {
  processMessageController,
  startSessionController,
} from "./bot-engine.controller";

const botEngineRouter = Router();

botEngineRouter.post("/start-session", startSessionController);
botEngineRouter.post("/process-message", processMessageController);

export default botEngineRouter;
