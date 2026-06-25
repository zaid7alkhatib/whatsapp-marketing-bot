"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const runtime_controller_1 = require("./runtime.controller");
const runtimeRouter = (0, express_1.Router)();
runtimeRouter.post("/inbound-message", runtime_controller_1.inboundMessageController);
exports.default = runtimeRouter;
