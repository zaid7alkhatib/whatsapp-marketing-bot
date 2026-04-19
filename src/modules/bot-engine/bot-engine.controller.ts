import { NextFunction, Request, Response } from "express";
import { ProcessMessageBody, StartSessionBody } from "./bot-engine.types";
import {
  isBotEngineError,
  processMessage,
  startSession,
} from "./bot-engine.service";

export async function startSessionController(
  req: Request<unknown, unknown, StartSessionBody>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = await startSession(req.body);
    res.status(201).json({
      success: true,
      data,
    });
  } catch (error) {
    if (isBotEngineError(error)) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
      return;
    }
    next(error);
  }
}

export async function processMessageController(
  req: Request<unknown, unknown, ProcessMessageBody>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = await processMessage(req.body);
    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    if (isBotEngineError(error)) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
      return;
    }
    next(error);
  }
}
