"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const dashboard_user_controller_1 = require("./dashboard-user.controller");
const dashboardUserRouter = (0, express_1.Router)();
dashboardUserRouter.get("/", dashboard_user_controller_1.getClientUsers);
dashboardUserRouter.post("/", dashboard_user_controller_1.createClientUser);
dashboardUserRouter.put("/:id", dashboard_user_controller_1.updateClientUser);
exports.default = dashboardUserRouter;
