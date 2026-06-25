"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const service_request_controller_1 = require("./service-request.controller");
const serviceRequestRouter = (0, express_1.Router)();
serviceRequestRouter.get("/", service_request_controller_1.getServiceRequests);
serviceRequestRouter.post("/", service_request_controller_1.createServiceRequest);
serviceRequestRouter.get("/:id", service_request_controller_1.getServiceRequestById);
exports.default = serviceRequestRouter;
