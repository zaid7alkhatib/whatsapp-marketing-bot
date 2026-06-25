"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const message_controller_1 = require("./message.controller");
const messageRouter = (0, express_1.Router)();
messageRouter.get("/", message_controller_1.getMessages);
messageRouter.post("/", message_controller_1.createMessage);
messageRouter.get("/:id", message_controller_1.getMessageById);
exports.default = messageRouter;
