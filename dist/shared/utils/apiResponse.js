"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendSuccess = sendSuccess;
exports.sendError = sendError;
function sendSuccess(res, options) {
    const statusCode = options?.statusCode ?? 200;
    const payload = {
        success: true,
    };
    if (options?.data !== undefined) {
        payload.data = options.data;
    }
    if (typeof options?.message === "string" && options.message.trim().length > 0) {
        payload.message = options.message;
    }
    return res.status(statusCode).json(payload);
}
function sendError(res, message, statusCode = 500) {
    return res.status(statusCode).json({
        success: false,
        message,
    });
}
