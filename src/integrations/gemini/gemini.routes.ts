import { Router, type RequestHandler } from "express";
import { sendError, sendSuccess } from "../../shared/utils/apiResponse";
import { generateGeminiResponse, type GeminiChatTurn } from "./gemini.service";

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

geminiRouter.post("/generate", generateGeminiController);

export default geminiRouter;
