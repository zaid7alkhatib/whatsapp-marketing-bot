"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const service_request_controller_1 = require("../service-requests/service-request.controller");
const clientServiceRequestRouter = (0, express_1.Router)();
clientServiceRequestRouter.post("/:id/mark-done", service_request_controller_1.markServiceRequestDone);
clientServiceRequestRouter.post("/:id/reject", service_request_controller_1.rejectServiceRequest);
exports.default = clientServiceRequestRouter;
