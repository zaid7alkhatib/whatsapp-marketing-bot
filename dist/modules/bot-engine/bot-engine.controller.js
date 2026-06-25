"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startSessionController = startSessionController;
exports.processMessageController = processMessageController;
const bot_engine_service_1 = require("./bot-engine.service");
async function startSessionController(req, res, next) {
    try {
        const data = await (0, bot_engine_service_1.startSession)(req.body);
        res.status(201).json({
            success: true,
            data,
        });
    }
    catch (error) {
        if ((0, bot_engine_service_1.isBotEngineError)(error)) {
            res.status(error.statusCode).json({
                success: false,
                message: error.message,
            });
            return;
        }
        next(error);
    }
}
async function processMessageController(req, res, next) {
    try {
        const data = await (0, bot_engine_service_1.processMessage)(req.body);
        res.status(200).json({
            success: true,
            data,
        });
    }
    catch (error) {
        if ((0, bot_engine_service_1.isBotEngineError)(error)) {
            res.status(error.statusCode).json({
                success: false,
                message: error.message,
            });
            return;
        }
        next(error);
    }
}
