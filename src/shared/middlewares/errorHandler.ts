import type { NextFunction, Request, Response } from "express";
import { env } from "../../config/env";
import { sendError } from "../utils/apiResponse";

export function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCodeCandidate = (error as Error & { statusCode?: unknown }).statusCode;
  const statusCode = typeof statusCodeCandidate === "number" ? statusCodeCandidate : 500;

  const safeMessage =
    statusCode >= 500 && env.nodeEnv !== "development"
      ? "Internal server error"
      : error.message || "Internal server error";

  console.error(
    `[error] ${req.method} ${req.originalUrl} -> ${statusCode}: ${
      error.message || "Internal server error"
    }`
  );

  sendError(res, safeMessage, statusCode);
}
