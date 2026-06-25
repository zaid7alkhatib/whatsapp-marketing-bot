"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bot_engine_controller_1 = require("./bot-engine.controller");
const botEngineRouter = (0, express_1.Router)();
botEngineRouter.post("/start-session", bot_engine_controller_1.startSessionController);
botEngineRouter.post("/process-message", bot_engine_controller_1.processMessageController);
exports.default = botEngineRouter;
