import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import InlineAlert from "../components/InlineAlert";
import ListFilters from "../components/ListFilters";
import LoadingState from "../components/LoadingState";
import PageSection from "../components/PageSection";
import api from "../services/api";
import type { ApiSuccessResponse } from "../types/api";

interface FlowSummary {
  _id: string;
  code: string;
  version: number;
}

interface FlowMessageRecord {
  key: string;
  linkedStepCodes: string[];
  usedInSteps: number;
  configured: boolean;
  contentType: string;
  status: string;
  translations: {
    ar: string;
    en: string;
    de: string;
  };
}

interface FlowMessagesResponse {
  flow: FlowSummary;
  messages: FlowMessageRecord[];
}

const REPLY_MARKERS = ["Reply with:", "\u0623\u0631\u0633\u0644:", "Antworten Sie mit:"];
const OPTION_MARKER_SOURCE = "[1-9](?:\\uFE0F?\\u20E3)?";

function compactMessageText(value: string): string {
  return value
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeMessageText(value: string): string {
  if (!value.trim()) {
    return value;
  }

  const normalized = compactMessageText(value.replace(/\r\n/g, "\n").replace(/\s*(?:\\n|\/n)\s*/g, "\n"));

  const replyMarker = REPLY_MARKERS.map((marker) => ({
    marker,
    index: normalized.indexOf(marker),
  }))
    .filter((entry) => entry.index >= 0)
    .sort((left, right) => left.index - right.index)[0];

  let beforeReply = normalized;
  let replyLine = "";

  if (replyMarker) {
    beforeReply = normalized.slice(0, replyMarker.index).trim();
    replyLine = normalized.slice(replyMarker.index).trim();
  }

  if (/(^|\s)1(?:\uFE0F?\u20E3)?\s+\S+/u.test(beforeReply) && /(^|\s)2(?:\uFE0F?\u20E3)?\s+\S+/u.test(beforeReply)) {
    const optionMarkerAhead = new RegExp(`(?=${OPTION_MARKER_SOURCE}\\s+)`, "u");
    const optionMarkerWithLeadingSpace = new RegExp(`\\s+(?=${OPTION_MARKER_SOURCE}\\s+)`, "gu");

    beforeReply = beforeReply
      .replace(new RegExp(`:\\s*${optionMarkerAhead.source}`, "u"), ":\n")
      .replace(new RegExp(`([\\u061F?])\\s*${optionMarkerAhead.source}`, "u"), "$1\n")
      .replace(optionMarkerWithLeadingSpace, "\n");
  }

  return compactMessageText([beforeReply, replyLine].filter(Boolean).join("\n"));
}
function getFirstPreviewLine(message: FlowMessageRecord): string {
  const firstValue = [message.translations.ar, message.translations.en, message.translations.de].find(
    (value) => value.trim().length > 0
  );

  if (!firstValue) {
    return "No visible text saved yet.";
  }

  return firstValue.split("\n")[0]?.trim() || "No visible text saved yet.";
}

function FlowMessagesPage() {
  const [flow, setFlow] = useState<FlowSummary | null>(null);
  const [messages, setMessages] = useState<FlowMessageRecord[]>([]);
  const [activeKey, setActiveKey] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "configured" | "missing">("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [arText, setArText] = useState("");
  const [enText, setEnText] = useState("");
  const [deText, setDeText] = useState("");

  const loadFlowMessages = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await api.get<ApiSuccessResponse<FlowMessagesResponse>>(
        "/api/v1/client/flow-messages"
      );

      if (!response.data.success || !response.data.data) {
        throw new Error(response.data.message ?? "Failed to load flow messages.");
      }

      setFlow(response.data.data.flow);
      setMessages(response.data.data.messages ?? []);

      if (!activeKey && response.data.data.messages.length > 0) {
        setActiveKey(response.data.data.messages[0].key);
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const apiMessage = (error.response?.data as { message?: string } | undefined)?.message;
        setErrorMessage(apiMessage ?? error.message ?? "Failed to load flow messages.");
      } else {
        setErrorMessage("Failed to load flow messages.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [activeKey]);

  useEffect(() => {
    void loadFlowMessages();
  }, [loadFlowMessages]);

  const filteredMessages = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return messages.filter((message) => {
      if (statusFilter === "configured" && !message.configured) {
        return false;
      }
      if (statusFilter === "missing" && message.configured) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const searchable = [
        message.key,
        ...message.linkedStepCodes,
        message.translations.ar,
        message.translations.en,
        message.translations.de,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchable.includes(normalizedSearch);
    });
  }, [messages, searchTerm, statusFilter]);

  const activeMessage = useMemo(
    () => filteredMessages.find((message) => message.key === activeKey) ?? null,
    [filteredMessages, activeKey]
  );

  useEffect(() => {
    if (activeMessage) {
      setArText(normalizeMessageText(activeMessage.translations.ar ?? ""));
      setEnText(normalizeMessageText(activeMessage.translations.en ?? ""));
      setDeText(normalizeMessageText(activeMessage.translations.de ?? ""));
      return;
    }

    if (filteredMessages.length > 0) {
      setActiveKey(filteredMessages[0].key);
      return;
    }

    setActiveKey("");
    setArText("");
    setEnText("");
    setDeText("");
  }, [activeMessage, filteredMessages]);

  const configuredCount = useMemo(
    () => messages.filter((message) => message.configured).length,
    [messages]
  );

  const totalLinkedSteps = useMemo(
    () => messages.reduce((total, message) => total + message.usedInSteps, 0),
    [messages]
  );

  const formatEditorTexts = useCallback(() => {
    setArText((previous) => normalizeMessageText(previous));
    setEnText((previous) => normalizeMessageText(previous));
    setDeText((previous) => normalizeMessageText(previous));
    setSuccessMessage("Message text formatted with line breaks.");
  }, []);

  const handleSave = useCallback(async () => {
    if (!activeMessage) {
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const nextTranslations = {
      ar: normalizeMessageText(arText),
      en: normalizeMessageText(enText),
      de: normalizeMessageText(deText),
    };

    try {
      const response = await api.put<ApiSuccessResponse<FlowMessageRecord>>(
        `/api/v1/client/flow-messages/${encodeURIComponent(activeMessage.key)}`,
        {
          translations: nextTranslations,
        }
      );

      if (!response.data.success || !response.data.data) {
        throw new Error(response.data.message ?? "Failed to save flow message.");
      }

      const updatedMessage = response.data.data;
      setMessages((previousMessages) =>
        previousMessages.map((message) =>
          message.key === updatedMessage.key
            ? {
                ...message,
                configured: true,
                status: updatedMessage.status,
                contentType: updatedMessage.contentType,
                translations: updatedMessage.translations,
              }
            : message
        )
      );

      setArText(updatedMessage.translations.ar);
      setEnText(updatedMessage.translations.en);
      setDeText(updatedMessage.translations.de);
      setSuccessMessage(`Saved message: ${updatedMessage.key}`);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const apiMessage = (error.response?.data as { message?: string } | undefined)?.message;
        setErrorMessage(apiMessage ?? error.message ?? "Failed to save flow message.");
      } else {
        setErrorMessage("Failed to save flow message.");
      }
    } finally {
      setIsSaving(false);
    }
  }, [activeMessage, arText, enText, deText]);

  const handleDelete = useCallback(async () => {
    if (!activeMessage?.configured) {
      return;
    }

    const confirmMessage = `Delete the saved text for ${activeMessage.key}? The step stays in the clinic flow, but the visible message will become empty until you save a new one.`;
    if (typeof window !== "undefined" && !window.confirm(confirmMessage)) {
      return;
    }

    setIsDeleting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await api.delete<ApiSuccessResponse<{ key: string }>>(
        `/api/v1/client/flow-messages/${encodeURIComponent(activeMessage.key)}`
      );

      if (!response.data.success) {
        throw new Error(response.data.message ?? "Failed to delete flow message.");
      }

      setMessages((previousMessages) =>
        previousMessages.map((message) =>
          message.key === activeMessage.key
            ? {
                ...message,
                configured: false,
                translations: { ar: "", en: "", de: "" },
              }
            : message
        )
      );

      setArText("");
      setEnText("");
      setDeText("");
      setSuccessMessage(`Deleted saved text for ${activeMessage.key}.`);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const apiMessage = (error.response?.data as { message?: string } | undefined)?.message;
        setErrorMessage(apiMessage ?? error.message ?? "Failed to delete flow message.");
      } else {
        setErrorMessage("Failed to delete flow message.");
      }
    } finally {
      setIsDeleting(false);
    }
  }, [activeMessage]);

  return (
    <PageSection
      title="Flow Messages"
      description="Write the visible WhatsApp text for the approved clinic flow and keep it readable."
      onRefresh={() => void loadFlowMessages()}
    >
      {flow ? (
        <div className="client-flow-summary-card">
          <div className="client-flow-summary-copy">
            <p className="client-flow-summary-kicker">Scoped clinic message set</p>
            <h3 className="client-flow-summary-title">{`${flow.code} v${flow.version}`}</h3>
            <p className="client-flow-summary-description">
              Fix the wording here first. Each saved message should read naturally, use line breaks,
              and tell the person exactly what to send back.
            </p>
            <div className="form-actions">
              <Link to="/flow-steps" className="secondary-button button-link">
                Open Flow Steps
              </Link>
            </div>
          </div>

          <div className="client-flow-summary-stats">
            <div className="client-flow-summary-stat">
              <span className="client-flow-summary-stat-label">Message keys</span>
              <strong>{messages.length}</strong>
            </div>
            <div className="client-flow-summary-stat">
              <span className="client-flow-summary-stat-label">Configured</span>
              <strong>{configuredCount}</strong>
            </div>
            <div className="client-flow-summary-stat">
              <span className="client-flow-summary-stat-label">Missing text</span>
              <strong>{messages.length - configuredCount}</strong>
            </div>
            <div className="client-flow-summary-stat">
              <span className="client-flow-summary-stat-label">Linked steps</span>
              <strong>{totalLinkedSteps}</strong>
            </div>
          </div>
        </div>
      ) : null}

      <ListFilters
        searchTerm={searchTerm}
        onSearchTermChange={setSearchTerm}
        searchPlaceholder="Search message key or step code..."
        filteredCount={filteredMessages.length}
        totalCount={messages.length}
        onReset={() => {
          setSearchTerm("");
          setStatusFilter("all");
        }}
      >
        <label className="form-field list-filter-field">
          <span>Template status</span>
          <select
            className="input-control"
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as "all" | "configured" | "missing")
            }
          >
            <option value="all">All</option>
            <option value="configured">Configured</option>
            <option value="missing">Missing text</option>
          </select>
        </label>
      </ListFilters>

      {isLoading ? <LoadingState text="Loading flow messages..." /> : null}
      {!isLoading && errorMessage ? <InlineAlert tone="error" message={errorMessage} /> : null}
      {!isLoading && !errorMessage && successMessage ? (
        <InlineAlert tone="success" message={successMessage} />
      ) : null}

      {!isLoading && !errorMessage && filteredMessages.length === 0 ? (
        <InlineAlert
          tone="empty"
          message="No flow messages found. Add content keys to the scoped flow steps first."
        />
      ) : null}

      {!isLoading && !errorMessage && filteredMessages.length > 0 ? (
        <div className="flow-messages-layout">
          <div className="flow-messages-list">
            {filteredMessages.map((message) => (
              <button
                key={message.key}
                type="button"
                className={`flow-message-item ${message.key === activeKey ? "flow-message-item-active" : ""}`}
                onClick={() => {
                  setActiveKey(message.key);
                  setSuccessMessage(null);
                }}
              >
                <div className="flow-message-item-header">
                  <strong>{message.key}</strong>
                  <span
                    className={`flow-message-badge ${
                      message.configured ? "flow-message-badge-ready" : "flow-message-badge-missing"
                    }`}
                  >
                    {message.configured ? "Configured" : "Missing"}
                  </span>
                </div>
                <p className="muted-text">{getFirstPreviewLine(message)}</p>
                <p className="muted-text">
                  {`Used in ${message.usedInSteps} step${message.usedInSteps === 1 ? "" : "s"}: ${message.linkedStepCodes.join(", ")}`}
                </p>
              </button>
            ))}
          </div>

          <div className="runtime-form">
            {activeMessage ? (
              <>
                <div className="flow-message-editor-header">
                  <div className="form-header">
                    <h3 className="form-title">Message Editor</h3>
                    <p className="form-subtitle">{`Key: ${activeMessage.key}`}</p>
                  </div>

                  <div className="flow-message-step-chips">
                    {activeMessage.linkedStepCodes.map((stepCode) => (
                      <span className="flow-message-step-chip" key={stepCode}>
                        {stepCode}
                      </span>
                    ))}
                  </div>
                </div>

                {!activeMessage.configured ? (
                  <InlineAlert
                    tone="info"
                    message="This key is linked to the clinic flow, but it does not have visible text yet."
                  />
                ) : null}

                <div className="form-grid">
                  <label className="form-field">
                    <span>Arabic text (ar)</span>
                    <textarea
                      className="input-control text-area-control"
                      value={arText}
                      onChange={(event) => setArText(event.target.value)}
                      placeholder="Write the Arabic message..."
                    />
                  </label>
                  <label className="form-field">
                    <span>English text (en)</span>
                    <textarea
                      className="input-control text-area-control"
                      value={enText}
                      onChange={(event) => setEnText(event.target.value)}
                      placeholder="Write the English message..."
                    />
                  </label>
                  <label className="form-field form-field-full">
                    <span>German text (de)</span>
                    <textarea
                      className="input-control text-area-control"
                      value={deText}
                      onChange={(event) => setDeText(event.target.value)}
                      placeholder="Write the German message..."
                    />
                  </label>
                </div>

                <div className="state-block state-info">
                  <p>
                    Use real line breaks between the question, the numbered options, and the reply
                    instruction. The formatter button will clean one-line prompts automatically.
                  </p>
                </div>

                <div className="form-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={formatEditorTexts}
                    disabled={isSaving || isDeleting}
                  >
                    Format Text
                  </button>
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => void handleSave()}
                    disabled={isSaving || isDeleting}
                  >
                    {isSaving ? "Saving..." : "Save Message"}
                  </button>
                  {activeMessage.configured ? (
                    <button
                      type="button"
                      className="secondary-button button-danger"
                      onClick={() => void handleDelete()}
                      disabled={isSaving || isDeleting}
                    >
                      {isDeleting ? "Deleting..." : "Delete Saved Text"}
                    </button>
                  ) : null}
                </div>
              </>
            ) : (
              <InlineAlert tone="empty" message="Select a message key to edit its text." />
            )}
          </div>
        </div>
      ) : null}
    </PageSection>
  );
}

export default FlowMessagesPage;

