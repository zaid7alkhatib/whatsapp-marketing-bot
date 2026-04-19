import type { Response } from "express";

interface ErrorResponsePayload {
  success: false;
  message: string;
}

interface SuccessResponsePayload<T> {
  success: true;
  data?: T;
  message?: string;
}

export function sendSuccess<T>(
  res: Response,
  options?: {
    data?: T;
    message?: string;
    statusCode?: number;
  }
): Response<SuccessResponsePayload<T>> {
  const statusCode = options?.statusCode ?? 200;

  const payload: SuccessResponsePayload<T> = {
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

export function sendError(
  res: Response,
  message: string,
  statusCode = 500
): Response<ErrorResponsePayload> {
  return res.status(statusCode).json({
    success: false,
    message,
  });
}
