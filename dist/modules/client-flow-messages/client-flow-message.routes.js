"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_flow_message_controller_1 = require("./client-flow-message.controller");
const clientFlowMessageRouter = (0, express_1.Router)();
clientFlowMessageRouter.get("/", client_flow_message_controller_1.getClientFlowMessages);
clientFlowMessageRouter.put("/:key", client_flow_message_controller_1.updateClientFlowMessage);
clientFlowMessageRouter.delete("/:key", client_flow_message_controller_1.deleteClientFlowMessage);
exports.default = clientFlowMessageRouter;
