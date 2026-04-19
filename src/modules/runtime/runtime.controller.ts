import { NextFunction, Request, Response } from "express";
import { isBotEngineError } from "../bot-engine/bot-engine.service";
import { RuntimeInboundMessageBody } from "./runtime.types";
import { inboundMessage, isRuntimeError } from "./runtime.service";

export async function inboundMessageController(
  req: Request<unknown, unknown, RuntimeInboundMessageBody>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = await inboundMessage(req.body);
    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    if (isRuntimeError(error) || isBotEngineError(error)) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
      return;
    }

    next(error);
  }
}
