"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notFoundHandler = notFoundHandler;
const apiResponse_1 = require("../utils/apiResponse");
function notFoundHandler(_req, res) {
    (0, apiResponse_1.sendError)(res, "Route not found", 404);
}
