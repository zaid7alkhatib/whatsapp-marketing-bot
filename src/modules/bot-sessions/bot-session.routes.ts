import { Router } from "express";
import {
  createBotSession,
  getBotSessionById,
  getBotSessions,
} from "./bot-session.controller";

const botSessionRouter = Router();

botSessionRouter.get("/", getBotSessions);
botSessionRouter.post("/", createBotSession);
botSessionRouter.get("/:id", getBotSessionById);

export default botSessionRouter;
