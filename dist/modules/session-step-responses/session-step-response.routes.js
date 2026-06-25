"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const session_step_response_controller_1 = require("./session-step-response.controller");
const sessionStepResponseRouter = (0, express_1.Router)();
sessionStepResponseRouter.get("/", session_step_response_controller_1.getSessionStepResponses);
sessionStepResponseRouter.post("/", session_step_response_controller_1.createSessionStepResponse);
sessionStepResponseRouter.get("/:id", session_step_response_controller_1.getSessionStepResponseById);
exports.default = sessionStepResponseRouter;
