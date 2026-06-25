"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const interested_lead_controller_1 = require("./interested-lead.controller");
const interestedLeadRouter = (0, express_1.Router)();
interestedLeadRouter.get("/", interested_lead_controller_1.getInterestedLeads);
exports.default = interestedLeadRouter;
