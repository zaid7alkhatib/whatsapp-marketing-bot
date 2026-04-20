import { useCallback, useEffect, useMemo, useState } from "react";
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

function FlowMessagesPage() {
  const [flow, setFlow] = useState<FlowSummary | null>(null);
  const [messages, setMessages] = useState<FlowMessageRecord[]>([]);
  const [activeKey, setActiveKey] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "configured" | "missing">("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
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
      setArText(activeMessage.translations.ar ?? "");
      setEnText(activeMessage.translations.en ?? "");
      setDeText(activeMessage.translations.de ?? "");
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

  const handleSave = useCallback(async () => {
    if (!activeMessage) {
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await api.put<ApiSuccessResponse<FlowMessageRecord>>(
        `/api/v1/client/flow-messages/${encodeURIComponent(activeMessage.key)}`,
        {
          translations: {
            ar: arText,
            en: enText,
            de: deText,
          },
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
                translations: updatedMessage.translations,
              }
            : message
        )
      );

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

  return (
    <PageSection
      title="Flow Messages"
      description="Edit only the message texts used by your approved clinic WhatsApp flow."
      onRefresh={() => void loadFlowMessages()}
    >
      {flow ? (
        <div className="state-block state-info">
          <p>{`Scoped flow: ${flow.code} v${flow.version}`}</p>
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
                <p className="muted-text">
                  {`Used in ${message.usedInSteps} step${message.usedInSteps === 1 ? "" : "s"}: ${message.linkedStepCodes.join(", ")}`}
                </p>
              </button>
            ))}
          </div>

          <div className="runtime-form">
            {activeMessage ? (
              <>
                <div className="form-header">
                  <h3 className="form-title">Message Editor</h3>
                  <p className="form-subtitle">{`Key: ${activeMessage.key}`}</p>
                </div>

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

                <div className="form-actions">
                  <button type="button" className="primary-button" onClick={() => void handleSave()} disabled={isSaving}>
                    {isSaving ? "Saving..." : "Save Message"}
                  </button>
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
