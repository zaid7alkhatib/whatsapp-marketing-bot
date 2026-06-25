"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inboundMessageController = inboundMessageController;
const bot_engine_service_1 = require("../bot-engine/bot-engine.service");
const runtime_service_1 = require("./runtime.service");
async function inboundMessageController(req, res, next) {
    try {
        const data = await (0, runtime_service_1.inboundMessage)(req.body);
        res.status(200).json({
            success: true,
            data,
        });
    }
    catch (error) {
        if ((0, runtime_service_1.isRuntimeError)(error) || (0, bot_engine_service_1.isBotEngineError)(error)) {
            res.status(error.statusCode).json({
                success: false,
                message: error.message,
            });
            return;
        }
        next(error);
    }
}
