import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import axios from "axios";
import { useAuth } from "../auth/AuthContext";
import InlineAlert from "../components/InlineAlert";
import LoadingState from "../components/LoadingState";
import PageSection from "../components/PageSection";
import api from "../services/api";
import type { ApiSuccessResponse } from "../types/api";

interface GeminiTurn {
  role: "user" | "assistant";
  text: string;
  createdAt: string;
}

interface GeminiGenerationResult {
  reply: string;
  model: string;
}

interface InsuranceCardOcrPromptState {
  currentPrompt: string;
  defaultPrompt: string;
  isCustomized: boolean;
  updatedAt?: string;
}

interface PromptMetrics {
  lineCount: number;
  characterCount: number;
}

function buildPromptMetrics(value: string): PromptMetrics {
  const normalized = value.replace(/\r\n/g, "\n");
  const lineCount = normalized.length === 0 ? 0 : normalized.split("\n").length;

  return {
    lineCount,
    characterCount: value.length,
  };
}

function formatTimestamp(value?: string): string {
  if (!value) {
    return "Default prompt";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Recently updated";
  }

  return date.toLocaleString();
}

function GeminiPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [conversation, setConversation] = useState<GeminiTurn[]>([]);
  const [prompt, setPrompt] = useState("");
  const [systemPrompt, setSystemPrompt] = useState(
    "You are a concise clinical operations assistant for an internal admin dashboard."
  );
  const [latestModel, setLatestModel] = useState("Not used yet");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCopying, setIsCopying] = useState(false);

  const [ocrPrompt, setOcrPrompt] = useState("");
  const [defaultOcrPrompt, setDefaultOcrPrompt] = useState("");
  const [isCustomized, setIsCustomized] = useState(false);
  const [ocrUpdatedAt, setOcrUpdatedAt] = useState<string | undefined>();
  const [isLoadingPrompt, setIsLoadingPrompt] = useState(true);
  const [isSavingPrompt, setIsSavingPrompt] = useState(false);
  const [isResettingPrompt, setIsResettingPrompt] = useState(false);

  const [chatAlert, setChatAlert] = useState<{ tone: "error" | "success" | "info"; message: string } | null>(null);
  const [promptAlert, setPromptAlert] = useState<{ tone: "error" | "success" | "info"; message: string } | null>(null);

  const promptMetrics = useMemo(() => buildPromptMetrics(ocrPrompt), [ocrPrompt]);
  const defaultMetrics = useMemo(() => buildPromptMetrics(defaultOcrPrompt), [defaultOcrPrompt]);
  const latestAssistantMessage = useMemo(
    () => [...conversation].reverse().find((turn) => turn.role === "assistant"),
    [conversation]
  );

  async function loadOcrPrompt() {
    setIsLoadingPrompt(true);
    setPromptAlert(null);

    try {
      const response = await api.get<ApiSuccessResponse<InsuranceCardOcrPromptState>>(
        "/api/v1/gemini/ocr-prompt"
      );

      const promptState = response.data.data;
      if (!promptState) {
        throw new Error("OCR prompt response did not include data.");
      }

      setOcrPrompt(promptState.currentPrompt);
      setDefaultOcrPrompt(promptState.defaultPrompt);
      setIsCustomized(promptState.isCustomized);
      setOcrUpdatedAt(promptState.updatedAt);
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? error.response?.data?.message ?? error.message
        : error instanceof Error
          ? error.message
          : "Failed to load the OCR prompt.";

      setPromptAlert({
        tone: "error",
        message,
      });
    } finally {
      setIsLoadingPrompt(false);
    }
  }

  useEffect(() => {
    void loadOcrPrompt();
  }, []);

  async function handleSaveOcrPrompt() {
    if (!ocrPrompt.trim()) {
      setPromptAlert({
        tone: "error",
        message: "The OCR prompt cannot be empty.",
      });
      return;
    }

    setIsSavingPrompt(true);
    setPromptAlert(null);

    try {
      const response = await api.put<ApiSuccessResponse<InsuranceCardOcrPromptState>>(
        "/api/v1/gemini/ocr-prompt",
        {
          prompt: ocrPrompt,
        }
      );

      const promptState = response.data.data;
      if (!promptState) {
        throw new Error("OCR prompt save response did not include data.");
      }

      setOcrPrompt(promptState.currentPrompt);
      setDefaultOcrPrompt(promptState.defaultPrompt);
      setIsCustomized(promptState.isCustomized);
      setOcrUpdatedAt(promptState.updatedAt);
      setPromptAlert({
        tone: "success",
        message: response.data.message ?? "OCR prompt saved.",
      });
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? error.response?.data?.message ?? error.message
        : error instanceof Error
          ? error.message
          : "Failed to save the OCR prompt.";

      setPromptAlert({
        tone: "error",
        message,
      });
    } finally {
      setIsSavingPrompt(false);
    }
  }

  async function handleResetOcrPrompt() {
    setIsResettingPrompt(true);
    setPromptAlert(null);

    try {
      const response = await api.post<ApiSuccessResponse<InsuranceCardOcrPromptState>>(
        "/api/v1/gemini/ocr-prompt/reset"
      );

      const promptState = response.data.data;
      if (!promptState) {
        throw new Error("OCR prompt reset response did not include data.");
      }

      setOcrPrompt(promptState.currentPrompt);
      setDefaultOcrPrompt(promptState.defaultPrompt);
      setIsCustomized(promptState.isCustomized);
      setOcrUpdatedAt(promptState.updatedAt);
      setPromptAlert({
        tone: "success",
        message: response.data.message ?? "OCR prompt reset to default.",
      });
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? error.response?.data?.message ?? error.message
        : error instanceof Error
          ? error.message
          : "Failed to reset the OCR prompt.";

      setPromptAlert({
        tone: "error",
        message,
      });
    } finally {
      setIsResettingPrompt(false);
    }
  }

  async function handleSubmit() {
    const trimmedPrompt = prompt.trim();

    if (!trimmedPrompt) {
      setChatAlert({
        tone: "error",
        message: "Write a prompt before sending it to Gemini.",
      });
      return;
    }

    setIsSubmitting(true);
    setChatAlert(null);

    const nextConversation = [
      ...conversation,
      {
        role: "user" as const,
        text: trimmedPrompt,
        createdAt: new Date().toISOString(),
      },
    ];

    setConversation(nextConversation);
    setPrompt("");

    try {
      const response = await api.post<ApiSuccessResponse<GeminiGenerationResult>>(
        "/api/v1/gemini/generate",
        {
          prompt: trimmedPrompt,
          systemPrompt: systemPrompt.trim(),
          history: nextConversation.map((turn) => ({
            role: turn.role,
            text: turn.text,
          })),
        }
      );

      const result = response.data.data;
      if (!result) {
        throw new Error("Gemini response did not include data.");
      }

      setLatestModel(result.model);
      setConversation((currentConversation) => [
        ...currentConversation,
        {
          role: "assistant",
          text: result.reply,
          createdAt: new Date().toISOString(),
        },
      ]);
      setChatAlert({
        tone: "success",
        message: response.data.message ?? "Gemini replied successfully.",
      });
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? error.response?.data?.message ?? error.message
        : error instanceof Error
          ? error.message
          : "Gemini request failed.";

      setConversation((currentConversation) =>
        currentConversation.filter(
          (turn, index) =>
            !(index === currentConversation.length - 1 && turn.role === "user" && turn.text === trimmedPrompt)
        )
      );
      setPrompt(trimmedPrompt);
      setChatAlert({
        tone: "error",
        message,
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCopyLatestReply() {
    if (!latestAssistantMessage?.text) {
      return;
    }

    setIsCopying(true);

    try {
      await navigator.clipboard.writeText(latestAssistantMessage.text);
      setChatAlert({
        tone: "success",
        message: "Latest Gemini reply copied.",
      });
    } catch {
      setChatAlert({
        tone: "error",
        message: "Copy failed in this browser.",
      });
    } finally {
      setIsCopying(false);
    }
  }

  function handlePromptKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      void handleSubmit();
    }
  }

  function handleResetConversation() {
    setConversation([]);
    setLatestModel("Not used yet");
    setChatAlert({
      tone: "info",
      message: "Gemini conversation cleared.",
    });
  }

  return (
    <div className="dashboard-overview gemini-studio-stack">
      <PageSection
        title="Gemini Studio"
        description={
          isAdmin
            ? "Manage the insurance-card OCR prompt and use Gemini directly from the admin dashboard."
            : "Manage the insurance-card OCR prompt used by the clinic WhatsApp workspace."
        }
      >
        {promptAlert ? <InlineAlert tone={promptAlert.tone} message={promptAlert.message} /> : null}
        {isLoadingPrompt ? (
          <LoadingState text="Loading OCR prompt..." />
        ) : (
          <div className="gemini-prompt-studio">
            <div className="gemini-prompt-panel">
              <div className="gemini-card-header">
                <div>
                  <h3 className="card-title">Insurance Card OCR Prompt</h3>
                  <p className="card-description">
                    This prompt controls how Gemini validates and reads insurance card images coming from WhatsApp.
                  </p>
                </div>
                <div className="gemini-prompt-status">
                  <span className={`status-badge ${isCustomized ? "status-warning" : "status-positive"}`}>
                    {isCustomized ? "Customized" : "Default"}
                  </span>
                  <span className="muted-text">{formatTimestamp(ocrUpdatedAt)}</span>
                </div>
              </div>

              <label className="form-field">
                <span>Prompt text</span>
                <textarea
                  className="input-control text-area-control gemini-prompt-editor"
                  value={ocrPrompt}
                  onChange={(event) => setOcrPrompt(event.target.value)}
                  spellCheck={false}
                />
              </label>

              <div className="gemini-prompt-actions">
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => void handleSaveOcrPrompt()}
                  disabled={isSavingPrompt || isResettingPrompt}
                >
                  {isSavingPrompt ? "Saving..." : "Save Prompt"}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => void handleResetOcrPrompt()}
                  disabled={isSavingPrompt || isResettingPrompt}
                >
                  {isResettingPrompt ? "Resetting..." : "Reset to Default"}
                </button>
              </div>
            </div>

            <div className="gemini-prompt-side">
              <div className="gemini-stats-grid gemini-prompt-metrics">
                <div className="gemini-stat">
                  <span className="muted-text">Current lines</span>
                  <strong>{promptMetrics.lineCount}</strong>
                </div>
                <div className="gemini-stat">
                  <span className="muted-text">Current characters</span>
                  <strong>{promptMetrics.characterCount}</strong>
                </div>
                <div className="gemini-stat">
                  <span className="muted-text">Default lines</span>
                  <strong>{defaultMetrics.lineCount}</strong>
                </div>
                <div className="gemini-stat">
                  <span className="muted-text">Default characters</span>
                  <strong>{defaultMetrics.characterCount}</strong>
                </div>
              </div>

              <div className="runtime-form gemini-default-preview">
                <h3 className="card-title">Default preview</h3>
                <p className="card-description">
                  Reset always restores this exact backend default prompt, not a frontend copy.
                </p>
                <pre className="json-output gemini-default-preview-text">{defaultOcrPrompt}</pre>
              </div>
            </div>
          </div>
        )}
      </PageSection>

      {isAdmin ? (
        <div className="gemini-layout">
          <PageSection
            title="Conversation Sandbox"
            description="Use the same Gemini backend from the dashboard to test prompts quickly."
            actions={
              <>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={handleResetConversation}
                  disabled={conversation.length === 0}
                >
                  Clear Conversation
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => void handleCopyLatestReply()}
                  disabled={!latestAssistantMessage || isCopying}
                >
                  {isCopying ? "Copying..." : "Copy Latest Reply"}
                </button>
              </>
            }
          >
            {chatAlert ? <InlineAlert tone={chatAlert.tone} message={chatAlert.message} /> : null}
            <div className="gemini-thread">
              {conversation.length === 0 ? (
                <InlineAlert
                  tone="info"
                  message="No Gemini conversation yet. Send a prompt from the composer panel."
                />
              ) : (
                conversation.map((turn, index) => (
                  <article
                    key={`${turn.role}-${turn.createdAt}-${index}`}
                    className={`gemini-message ${
                      turn.role === "user" ? "gemini-message-user" : "gemini-message-assistant"
                    }`}
                  >
                    <div className="gemini-message-meta">
                      <span className="gemini-message-role">
                        {turn.role === "user" ? "You" : "Gemini"}
                      </span>
                      <span className="gemini-message-time">
                        {new Date(turn.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="gemini-message-text">{turn.text}</p>
                  </article>
                ))
              )}
            </div>
          </PageSection>

          <PageSection
            title="Prompt Composer"
            description="Write a system prompt and a message, then send with Ctrl+Enter."
          >
            <div className="gemini-stats-grid">
              <div className="gemini-stat">
                <span className="muted-text">Conversation turns</span>
                <strong>{conversation.length}</strong>
              </div>
              <div className="gemini-stat">
                <span className="muted-text">Latest model</span>
                <strong>{latestModel}</strong>
              </div>
            </div>

            <label className="form-field">
              <span>System prompt</span>
              <textarea
                className="input-control text-area-control gemini-system-prompt"
                value={systemPrompt}
                onChange={(event) => setSystemPrompt(event.target.value)}
                spellCheck={false}
              />
            </label>

            <label className="form-field">
              <span>User prompt</span>
              <textarea
                className="input-control text-area-control gemini-prompt-input"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={handlePromptKeyDown}
                placeholder="Ask Gemini something useful for the bot workspace..."
              />
            </label>

            <div className="gemini-quick-prompts">
              {[
                "Rewrite this clinic prompt to be shorter and clearer.",
                "Explain this OCR validation instruction in plain English.",
                "Suggest safer fallback wording for invalid insurance card images.",
              ].map((quickPrompt) => (
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

            <div className="gemini-actions">
              <button
                type="button"
                className="primary-button"
                onClick={() => void handleSubmit()}
                disabled={isSubmitting}
              >
                {isSubmitting ? "Sending..." : "Send to Gemini"}
              </button>
            </div>
          </PageSection>
        </div>
      ) : null}
    </div>
  );
}

export default GeminiPage;
