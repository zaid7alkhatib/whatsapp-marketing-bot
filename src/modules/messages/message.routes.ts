import { Router } from "express";
import { createMessage, getMessageById, getMessages } from "./message.controller";

const messageRouter = Router();

messageRouter.get("/", getMessages);
messageRouter.post("/", createMessage);
messageRouter.get("/:id", getMessageById);

export default messageRouter;
