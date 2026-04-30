import { Router, type RequestHandler } from "express";
import { allowRoleMethods, allowRoles } from "../../shared/middlewares/auth";
import { sendError, sendSuccess } from "../../shared/utils/apiResponse";
import {
  generateGeminiResponse,
  getInsuranceCardOcrPromptState,
  resetInsuranceCardOcrPrompt,
  saveInsuranceCardOcrPrompt,
  type GeminiChatTurn,
} from "./gemini.service";

const geminiRouter = Router();
const MAX_HISTORY_TURNS = 12;

function normalizeHistory(history: unknown): GeminiChatTurn[] {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .slice(-MAX_HISTORY_TURNS)
    .flatMap((entry) => {
      if (typeof entry !== "object" || entry === null) {
        return [];
      }

      const role = "role" in entry ? entry.role : undefined;
      const text = "text" in entry ? entry.text : undefined;

      if (
        (role !== "user" && role !== "assistant") ||
        typeof text !== "string" ||
        text.trim().length === 0
      ) {
        return [];
      }

      return [
        {
          role,
          text: text.trim(),
        },
      ];
    });
}

const generateGeminiController: RequestHandler = async (req, res) => {
  const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
  if (!prompt) {
    return sendError(res, "Field 'prompt' is required.", 400);
  }

  const systemPrompt =
    typeof req.body?.systemPrompt === "string" && req.body.systemPrompt.trim().length > 0
      ? req.body.systemPrompt.trim()
      : undefined;
  const history = normalizeHistory(req.body?.history);

  try {
    const result = await generateGeminiResponse(prompt, {
      history,
      systemPrompt,
    });

    return sendSuccess(res, {
      data: result,
      message: "Gemini response generated.",
    });
  } catch (error) {
    console.error("[gemini] dashboard generation failed:", error);

    return sendError(
      res,
      error instanceof Error ? error.message : "Gemini request failed.",
      502
    );
  }
};

const getInsuranceCardOcrPromptController: RequestHandler = async (_req, res) => {
  try {
    const promptState = await getInsuranceCardOcrPromptState();

    return sendSuccess(res, {
      data: promptState,
      message: "Insurance card OCR prompt loaded.",
    });
  } catch (error) {
    console.error("[gemini] failed to load OCR prompt:", error);

    return sendError(
      res,
      error instanceof Error ? error.message : "Failed to load OCR prompt.",
      500
    );
  }
};

const saveInsuranceCardOcrPromptController: RequestHandler = async (req, res) => {
  const prompt = typeof req.body?.prompt === "string" ? req.body.prompt : "";

  if (!prompt.trim()) {
    return sendError(res, "Field 'prompt' is required.", 400);
  }

  try {
    const promptState = await saveInsuranceCardOcrPrompt(prompt);

    return sendSuccess(res, {
      data: promptState,
      message: "Insurance card OCR prompt saved.",
    });
  } catch (error) {
    console.error("[gemini] failed to save OCR prompt:", error);

    return sendError(
      res,
      error instanceof Error ? error.message : "Failed to save OCR prompt.",
      500
    );
  }
};

const resetInsuranceCardOcrPromptController: RequestHandler = async (_req, res) => {
  try {
    const promptState = await resetInsuranceCardOcrPrompt();

    return sendSuccess(res, {
      data: promptState,
      message: "Insurance card OCR prompt reset to default.",
    });
  } catch (error) {
    console.error("[gemini] failed to reset OCR prompt:", error);

    return sendError(
      res,
      error instanceof Error ? error.message : "Failed to reset OCR prompt.",
      500
    );
  }
};

geminiRouter.post("/generate", allowRoles(["admin"]), generateGeminiController);
geminiRouter.get(
  "/ocr-prompt",
  allowRoleMethods({ admin: "ALL", user: ["GET", "PUT", "POST"] }),
  getInsuranceCardOcrPromptController
);
geminiRouter.put(
  "/ocr-prompt",
  allowRoleMethods({ admin: "ALL", user: ["GET", "PUT", "POST"] }),
  saveInsuranceCardOcrPromptController
);
geminiRouter.post(
  "/ocr-prompt/reset",
  allowRoleMethods({ admin: "ALL", user: ["GET", "PUT", "POST"] }),
  resetInsuranceCardOcrPromptController
);

export default geminiRouter;
