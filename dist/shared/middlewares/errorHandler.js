"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
const env_1 = require("../../config/env");
const apiResponse_1 = require("../utils/apiResponse");
function errorHandler(error, req, res, _next) {
    const statusCodeCandidate = error.statusCode;
    const statusCode = typeof statusCodeCandidate === "number" ? statusCodeCandidate : 500;
    const safeMessage = statusCode >= 500 && env_1.env.nodeEnv !== "development"
        ? "Internal server error"
        : error.message || "Internal server error";
    console.error(`[error] ${req.method} ${req.originalUrl} -> ${statusCode}: ${error.message || "Internal server error"}`);
    (0, apiResponse_1.sendError)(res, safeMessage, statusCode);
}
