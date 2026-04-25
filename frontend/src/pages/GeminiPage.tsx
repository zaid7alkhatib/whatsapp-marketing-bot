import { useState, type KeyboardEvent } from "react";
import axios from "axios";
import InlineAlert from "../components/InlineAlert";
import PageSection from "../components/PageSection";
import api from "../services/api";
import type { ApiSuccessResponse } from "../types/api";

interface GeminiResponseRecord {
  text: string;
  model: string;
}

interface GeminiTurn {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
  model?: string;
}

const QUICK_PROMPTS = [
  "Write a polite Arabic reply for a clinic WhatsApp user.",
  "Summarize this patient message in one short line.",
  "Rewrite a bot reply to sound clearer and more human.",
  "Draft a concise English follow-up question.",
];

function createTurnId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatTime(value: string): string {
  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return parsedDate.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const apiMessage = (error.response?.data as { message?: string } | undefined)?.message;
    return apiMessage ?? error.message ?? fallback;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

function GeminiPage() {
  const [prompt, setPrompt] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [conversation, setConversation] = useState<GeminiTurn[]>([]);
  const [latestModel, setLatestModel] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const latestAssistantReply =
    [...conversation].reverse().find((entry) => entry.role === "assistant") ?? null;

  const handleSubmit = async () => {
    const normalizedPrompt = prompt.trim();
    if (!normalizedPrompt) {
      setErrorMessage("Write a prompt first.");
      setInfoMessage(null);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setInfoMessage(null);

    try {
      const response = await api.post<ApiSuccessResponse<GeminiResponseRecord>>(
        "/api/v1/gemini/generate",
        {
          prompt: normalizedPrompt,
          systemPrompt: systemPrompt.trim() || undefined,
          history: conversation.map((entry) => ({
            role: entry.role,
            text: entry.text,
          })),
        }
      );

      const result = response.data.data;
      if (!response.data.success || !result?.text) {
        throw new Error("Gemini returned no usable response.");
      }

      const nowIso = new Date().toISOString();
      setConversation((previous) => [
        ...previous,
        {
          id: createTurnId(),
          role: "user",
          text: normalizedPrompt,
          createdAt: nowIso,
        },
        {
          id: createTurnId(),
          role: "assistant",
          text: result.text,
          createdAt: new Date().toISOString(),
          model: result.model,
        },
      ]);
      setLatestModel(result.model);
      setPrompt("");
      setInfoMessage(`Gemini replied using ${result.model}.`);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Failed to generate a Gemini response."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePromptKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      void handleSubmit();
    }
  };

  const handleCopyLatestReply = async () => {
    if (!latestAssistantReply?.text) {
      setErrorMessage("There is no assistant reply to copy yet.");
      setInfoMessage(null);
      return;
    }

    try {
      await navigator.clipboard.writeText(latestAssistantReply.text);
      setInfoMessage("Latest Gemini reply copied to clipboard.");
      setErrorMessage(null);
    } catch {
      setErrorMessage("Unable to copy the latest reply.");
      setInfoMessage(null);
    }
  };

  const handleResetConversation = () => {
    setConversation([]);
    setLatestModel(null);
    setErrorMessage(null);
    setInfoMessage("Conversation cleared.");
  };

  return (
    <PageSection
      title="Gemini Assistant"
      description="Use Gemini directly from the admin dashboard for drafting, rewriting, and quick response testing."
      actions={
        <button
          type="button"
          className="secondary-button"
          onClick={handleCopyLatestReply}
          disabled={!latestAssistantReply}
        >
          Copy Latest Reply
        </button>
      }
    >
      {errorMessage ? <InlineAlert tone="error" message={errorMessage} /> : null}
      {infoMessage ? <InlineAlert tone="info" message={infoMessage} /> : null}

      <div className="gemini-layout">
        <div className="card gemini-thread-card">
          <div className="gemini-card-header">
            <div>
              <h3 className="card-title">Conversation</h3>
              <p className="card-description">
                Session-local chat history for this dashboard tab. Nothing here is stored in the bot flow.
              </p>
            </div>
            <div className="gemini-stats-grid">
              <div className="gemini-stat">
                <span className="detail-label">Turns</span>
                <strong>{conversation.length}</strong>
              </div>
              <div className="gemini-stat">
                <span className="detail-label">Latest Model</span>
                <strong>{latestModel ?? "-"}</strong>
              </div>
            </div>
          </div>

          {conversation.length === 0 ? (
            <div className="state-block state-empty gemini-empty-state">
              <p>
                Start with a short prompt on the right. Use this page for copy drafting, prompt checks,
                and quick reply experiments before you move anything into a live flow.
              </p>
            </div>
          ) : (
            <div className="gemini-thread">
              {conversation.map((entry) => (
                <article
                  key={entry.id}
                  className={
                    entry.role === "assistant"
                      ? "gemini-message gemini-message-assistant"
                      : "gemini-message gemini-message-user"
                  }
                >
                  <div className="gemini-message-meta">
                    <span className="gemini-message-role">
                      {entry.role === "assistant" ? "Gemini" : "You"}
                    </span>
                    <span className="gemini-message-time">
                      {formatTime(entry.createdAt)}
                      {entry.model ? ` • ${entry.model}` : ""}
                    </span>
                  </div>
                  <p className="gemini-message-text">{entry.text}</p>
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="card gemini-composer-card">
          <div className="gemini-card-header">
            <div>
              <h3 className="card-title">Prompt Composer</h3>
              <p className="card-description">
                Send a direct prompt to Gemini. The optional instruction field lets you steer tone or
                format without touching the bot-engine prompt.
              </p>
            </div>
          </div>

          <div className="form-grid">
            <label className="form-field form-field-full">
              <span>Extra Instruction</span>
              <textarea
                className="input-control text-area-control gemini-system-prompt"
                value={systemPrompt}
                onChange={(event) => setSystemPrompt(event.target.value)}
                placeholder="Optional: reply in Arabic, use bullet points, sound more formal, summarize in one sentence..."
              />
              <small className="form-help">
                Leave empty to use the default Gemini assistant behavior from the backend.
              </small>
            </label>

            <label className="form-field form-field-full">
              <span>Prompt</span>
              <textarea
                className="input-control text-area-control gemini-prompt-input"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={handlePromptKeyDown}
                placeholder="Write the message or task you want Gemini to handle..."
              />
              <small className="form-help">Press Ctrl+Enter to send.</small>
            </label>
          </div>

          <div className="gemini-quick-prompts">
            {QUICK_PROMPTS.map((quickPrompt) => (
              <button
                key={quickPrompt}
                type="button"
                className="secondary-button gemini-quick-prompt"
                onClick={() => setPrompt(quickPrompt)}
              >
                {quickPrompt}
              </button>
            ))}
          </div>

          <div className="form-actions gemini-actions">
            <button
              type="button"
              className="primary-button"
              onClick={() => void handleSubmit()}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Generating..." : "Generate Reply"}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={handleResetConversation}
              disabled={isSubmitting && conversation.length === 0}
            >
              New Conversation
            </button>
          </div>
        </div>
      </div>
    </PageSection>
  );
}

export default GeminiPage;
