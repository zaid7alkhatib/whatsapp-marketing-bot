"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const service_request_controller_1 = require("../service-requests/service-request.controller");
const clientAppointmentRouter = (0, express_1.Router)();
clientAppointmentRouter.get("/schedule-options", service_request_controller_1.getMedicalAppointmentScheduleOptions);
clientAppointmentRouter.post("/:id/decision", service_request_controller_1.submitMedicalAppointmentDecision);
exports.default = clientAppointmentRouter;
