"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../../shared/middlewares/auth");
const apiResponse_1 = require("../../shared/utils/apiResponse");
const gemini_service_1 = require("./gemini.service");
const geminiRouter = (0, express_1.Router)();
const MAX_HISTORY_TURNS = 12;
function normalizeHistory(history) {
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
        if ((role !== "user" && role !== "assistant") ||
            typeof text !== "string" ||
            text.trim().length === 0) {
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
const generateGeminiController = async (req, res) => {
    const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
    if (!prompt) {
        return (0, apiResponse_1.sendError)(res, "Field 'prompt' is required.", 400);
    }
    const systemPrompt = typeof req.body?.systemPrompt === "string" && req.body.systemPrompt.trim().length > 0
        ? req.body.systemPrompt.trim()
        : undefined;
    const history = normalizeHistory(req.body?.history);
    try {
        const result = await (0, gemini_service_1.generateGeminiResponse)(prompt, {
            history,
            systemPrompt,
        });
        return (0, apiResponse_1.sendSuccess)(res, {
            data: result,
            message: "Gemini response generated.",
        });
    }
    catch (error) {
        console.error("[gemini] dashboard generation failed:", error);
        return (0, apiResponse_1.sendError)(res, error instanceof Error ? error.message : "Gemini request failed.", 502);
    }
};
const getInsuranceCardOcrPromptController = async (_req, res) => {
    try {
        const promptState = await (0, gemini_service_1.getInsuranceCardOcrPromptState)();
        return (0, apiResponse_1.sendSuccess)(res, {
            data: promptState,
            message: "Insurance card OCR prompt loaded.",
        });
    }
    catch (error) {
        console.error("[gemini] failed to load OCR prompt:", error);
        return (0, apiResponse_1.sendError)(res, error instanceof Error ? error.message : "Failed to load OCR prompt.", 500);
    }
};
const saveInsuranceCardOcrPromptController = async (req, res) => {
    const prompt = typeof req.body?.prompt === "string" ? req.body.prompt : "";
    if (!prompt.trim()) {
        return (0, apiResponse_1.sendError)(res, "Field 'prompt' is required.", 400);
    }
    try {
        const promptState = await (0, gemini_service_1.saveInsuranceCardOcrPrompt)(prompt);
        return (0, apiResponse_1.sendSuccess)(res, {
            data: promptState,
            message: "Insurance card OCR prompt saved.",
        });
    }
    catch (error) {
        console.error("[gemini] failed to save OCR prompt:", error);
        return (0, apiResponse_1.sendError)(res, error instanceof Error ? error.message : "Failed to save OCR prompt.", 500);
    }
};
const resetInsuranceCardOcrPromptController = async (_req, res) => {
    try {
        const promptState = await (0, gemini_service_1.resetInsuranceCardOcrPrompt)();
        return (0, apiResponse_1.sendSuccess)(res, {
            data: promptState,
            message: "Insurance card OCR prompt reset to default.",
        });
    }
    catch (error) {
        console.error("[gemini] failed to reset OCR prompt:", error);
        return (0, apiResponse_1.sendError)(res, error instanceof Error ? error.message : "Failed to reset OCR prompt.", 500);
    }
};
geminiRouter.post("/generate", (0, auth_1.allowRoles)(["admin"]), generateGeminiController);
geminiRouter.get("/ocr-prompt", (0, auth_1.allowRoleMethods)({ admin: "ALL", user: ["GET", "PUT", "POST"] }), getInsuranceCardOcrPromptController);
geminiRouter.put("/ocr-prompt", (0, auth_1.allowRoleMethods)({ admin: "ALL", user: ["GET", "PUT", "POST"] }), saveInsuranceCardOcrPromptController);
geminiRouter.post("/ocr-prompt/reset", (0, auth_1.allowRoleMethods)({ admin: "ALL", user: ["GET", "PUT", "POST"] }), resetInsuranceCardOcrPromptController);
exports.default = geminiRouter;
