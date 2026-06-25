"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bot_session_controller_1 = require("./bot-session.controller");
const botSessionRouter = (0, express_1.Router)();
botSessionRouter.get("/", bot_session_controller_1.getBotSessions);
botSessionRouter.post("/", bot_session_controller_1.createBotSession);
botSessionRouter.get("/:id", bot_session_controller_1.getBotSessionById);
exports.default = botSessionRouter;
