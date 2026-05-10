import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import InlineAlert from "../components/InlineAlert";
import ListFilters from "../components/ListFilters";
import LoadingState from "../components/LoadingState";
import PageSection from "../components/PageSection";
import { useClientLocale } from "../i18n/ClientLocaleContext";
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
function getFirstPreviewLine(message: FlowMessageRecord, fallback: string): string {
  const firstValue = [message.translations.ar, message.translations.en, message.translations.de].find(
    (value) => value.trim().length > 0
  );

  if (!firstValue) {
    return fallback;
  }

  return firstValue.split("\n")[0]?.trim() || fallback;
}

function FlowMessagesPage() {
  const { t } = useClientLocale();
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
        throw new Error(response.data.message ?? t("flowMessages.error"));
      }

      setFlow(response.data.data.flow);
      setMessages(response.data.data.messages ?? []);

      if (!activeKey && response.data.data.messages.length > 0) {
        setActiveKey(response.data.data.messages[0].key);
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const apiMessage = (error.response?.data as { message?: string } | undefined)?.message;
        setErrorMessage(apiMessage ?? error.message ?? t("flowMessages.error"));
      } else {
        setErrorMessage(t("flowMessages.error"));
      }
    } finally {
      setIsLoading(false);
    }
  }, [activeKey, t]);

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
    setSuccessMessage(t("flowMessages.formatted"));
  }, [t]);

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
        throw new Error(response.data.message ?? t("flowMessages.error"));
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
      setSuccessMessage(t("flowMessages.saved", { key: updatedMessage.key }));
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const apiMessage = (error.response?.data as { message?: string } | undefined)?.message;
        setErrorMessage(apiMessage ?? error.message ?? t("flowMessages.error"));
      } else {
        setErrorMessage(t("flowMessages.error"));
      }
    } finally {
      setIsSaving(false);
    }
  }, [activeMessage, arText, enText, deText, t]);

  const handleDelete = useCallback(async () => {
    if (!activeMessage?.configured) {
      return;
    }

    if (typeof window !== "undefined" && !window.confirm(t("flowMessages.confirmDelete"))) {
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
        throw new Error(response.data.message ?? t("flowMessages.error"));
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
      setSuccessMessage(t("flowMessages.deleted", { key: activeMessage.key }));
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const apiMessage = (error.response?.data as { message?: string } | undefined)?.message;
        setErrorMessage(apiMessage ?? error.message ?? t("flowMessages.error"));
      } else {
        setErrorMessage(t("flowMessages.error"));
      }
    } finally {
      setIsDeleting(false);
    }
  }, [activeMessage, t]);

  return (
    <PageSection
      title={t("flowMessages.title")}
      description={t("flowMessages.description")}
      onRefresh={() => void loadFlowMessages()}
    >
      {flow ? (
        <div className="client-flow-summary-card">
          <div className="client-flow-summary-copy">
            <p className="client-flow-summary-kicker">{t("flowMessages.summaryTitle")}</p>
            <h3 className="client-flow-summary-title">{`${flow.code} v${flow.version}`}</h3>
            <p className="client-flow-summary-description">
              {t("flowMessages.summaryDescription")}
            </p>
            <div className="form-actions">
              <Link to="/flow-steps" className="secondary-button button-link">
                {t("flowMessages.openFlowSteps")}
              </Link>
            </div>
          </div>

          <div className="client-flow-summary-stats">
            <div className="client-flow-summary-stat">
              <span className="client-flow-summary-stat-label">{t("flowMessages.messageKeys")}</span>
              <strong>{messages.length}</strong>
            </div>
            <div className="client-flow-summary-stat">
              <span className="client-flow-summary-stat-label">{t("flowMessages.configured")}</span>
              <strong>{configuredCount}</strong>
            </div>
            <div className="client-flow-summary-stat">
              <span className="client-flow-summary-stat-label">{t("flowMessages.missingText")}</span>
              <strong>{messages.length - configuredCount}</strong>
            </div>
            <div className="client-flow-summary-stat">
              <span className="client-flow-summary-stat-label">{t("flowMessages.linkedSteps")}</span>
              <strong>{totalLinkedSteps}</strong>
            </div>
          </div>
        </div>
      ) : null}

      <ListFilters
        searchTerm={searchTerm}
        onSearchTermChange={setSearchTerm}
        searchPlaceholder={t("flowMessages.searchPlaceholder")}
        filteredCount={filteredMessages.length}
        totalCount={messages.length}
        onReset={() => {
          setSearchTerm("");
          setStatusFilter("all");
        }}
      >
        <label className="form-field list-filter-field">
          <span>{t("flowMessages.templateStatus")}</span>
          <select
            className="input-control"
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as "all" | "configured" | "missing")
            }
          >
            <option value="all">{t("common.all")}</option>
            <option value="configured">{t("flowMessages.configured")}</option>
            <option value="missing">{t("flowMessages.missingText")}</option>
          </select>
        </label>
      </ListFilters>

      {isLoading ? <LoadingState text={t("flowMessages.loading")} /> : null}
      {!isLoading && errorMessage ? <InlineAlert tone="error" message={errorMessage} /> : null}
      {!isLoading && !errorMessage && successMessage ? (
        <InlineAlert tone="success" message={successMessage} />
      ) : null}

      {!isLoading && !errorMessage && filteredMessages.length === 0 ? (
        <InlineAlert
          tone="empty"
          message={t("flowMessages.empty")}
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
                    {message.configured ? t("flowMessages.configured") : t("flowMessages.missingText")}
                  </span>
                </div>
                <p className="muted-text">{getFirstPreviewLine(message, t("flowMessages.noVisibleText"))}</p>
                <p className="muted-text">
                  {t("flowMessages.usedInSteps", {
                    count: message.usedInSteps,
                    steps: message.linkedStepCodes.join(", "),
                  })}
                </p>
              </button>
            ))}
          </div>

          <div className="runtime-form">
            {activeMessage ? (
              <>
                <div className="flow-message-editor-header">
                  <div className="form-header">
                    <h3 className="form-title">{t("flowMessages.editorTitle")}</h3>
                    <p className="form-subtitle">{t("flowMessages.linkedKey", { key: activeMessage.key })}</p>
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
                    message={t("flowMessages.infoLinked")}
                  />
                ) : null}

                <div className="form-grid">
                  <label className="form-field">
                    <span>{t("flowMessages.arabicText")}</span>
                    <textarea
                      className="input-control text-area-control"
                      value={arText}
                      onChange={(event) => setArText(event.target.value)}
                      placeholder={t("flowMessages.placeholderArabic")}
                    />
                  </label>
                  <label className="form-field">
                    <span>{t("flowMessages.englishText")}</span>
                    <textarea
                      className="input-control text-area-control"
                      value={enText}
                      onChange={(event) => setEnText(event.target.value)}
                      placeholder={t("flowMessages.placeholderEnglish")}
                    />
                  </label>
                  <label className="form-field form-field-full">
                    <span>{t("flowMessages.germanText")}</span>
                    <textarea
                      className="input-control text-area-control"
                      value={deText}
                      onChange={(event) => setDeText(event.target.value)}
                      placeholder={t("flowMessages.placeholderGerman")}
                    />
                  </label>
                </div>

                <div className="state-block state-info">
                  <p>
                    {t("flowMessages.editorHint")}
                  </p>
                </div>

                <div className="form-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={formatEditorTexts}
                    disabled={isSaving || isDeleting}
                  >
                    {t("flowMessages.formatText")}
                  </button>
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => void handleSave()}
                    disabled={isSaving || isDeleting}
                  >
                    {isSaving ? t("flowMessages.saving") : t("flowMessages.saveMessage")}
                  </button>
                  {activeMessage.configured ? (
                    <button
                      type="button"
                      className="secondary-button button-danger"
                      onClick={() => void handleDelete()}
                      disabled={isSaving || isDeleting}
                    >
                      {isDeleting ? t("flowMessages.deleting") : t("flowMessages.deleteSavedText")}
                    </button>
                  ) : null}
                </div>
              </>
            ) : (
              <InlineAlert tone="empty" message={t("flowMessages.selectMessage")} />
            )}
          </div>
        </div>
      ) : null}
    </PageSection>
  );
}

export default FlowMessagesPage;

