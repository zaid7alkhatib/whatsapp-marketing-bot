import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import InlineAlert from "../components/InlineAlert";
import LoadingState from "../components/LoadingState";
import PageSection from "../components/PageSection";
import api from "../services/api";
import type { ApiSuccessResponse } from "../types/api";

interface MarketingMessageTemplate {
  englishGreeting: string;
  arabicGreeting: string;
  englishResponseInstruction: string;
  arabicResponseInstruction: string;
}

interface ChannelAccountRecord {
  _id: string;
  displayName?: string;
  code?: string;
}

interface OutreachTemplateRecord {
  _id: string;
  channelAccountId: string;
  name: string;
  personalizationTemplate: MarketingMessageTemplate;
  interestTriggers: string[];
  updatedAt?: string;
}

const DEFAULT_TEMPLATE: MarketingMessageTemplate = {
  englishGreeting: "Hello {name},",
  arabicGreeting: "مرحبا {name}،",
  englishResponseInstruction: "To let our team follow up with you, reply with 1 or write Interested.",
  arabicResponseInstruction: "للمتابعة مع فريقنا، أرسل 1 أو اكتب مهتم.",
};

const DEFAULT_TRIGGERS = ["1", "interested", "مهتم", "مهتمة", "نعم"].join("\n");

function getErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const apiMessage = (error.response?.data as { message?: string } | undefined)?.message;
    return apiMessage ?? error.message ?? fallback;
  }

  return error instanceof Error && error.message ? error.message : fallback;
}

function renderTemplateLine(value: string, name: string): string | null {
  const normalizedValue = value.replace(/\s+/g, " ").trim();
  return normalizedValue ? normalizedValue.replace(/\{name\}/g, name) : null;
}

function buildPreview(template: MarketingMessageTemplate, message: string, name: string): string {
  const lines = [
    renderTemplateLine(template.englishGreeting, name || "there"),
    renderTemplateLine(template.arabicGreeting, name || "عميلنا الكريم"),
    message.trim(),
    renderTemplateLine(template.englishResponseInstruction, name || "there"),
    renderTemplateLine(template.arabicResponseInstruction, name || "عميلنا الكريم"),
  ].filter(Boolean);

  return lines.join("\n\n");
}

function TemplatesPage() {
  const [accounts, setAccounts] = useState<ChannelAccountRecord[]>([]);
  const [templates, setTemplates] = useState<OutreachTemplateRecord[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [template, setTemplate] = useState<MarketingMessageTemplate>(DEFAULT_TEMPLATE);
  const [triggerInput, setTriggerInput] = useState(DEFAULT_TRIGGERS);
  const [previewName, setPreviewName] = useState("Zaid Alkhatib");
  const [previewMessage, setPreviewMessage] = useState("Write your campaign message here.");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [pageSuccess, setPageSuccess] = useState<string | null>(null);

  const selectedTemplate = useMemo(
    () => templates.find((record) => record._id === selectedTemplateId) ?? null,
    [selectedTemplateId, templates]
  );
  const preview = useMemo(
    () => buildPreview(template, previewMessage, previewName),
    [previewMessage, previewName, template]
  );
  const triggerCount = useMemo(
    () =>
      triggerInput
        .split(/[\n,;]+/)
        .map((value) => value.trim())
        .filter(Boolean).length,
    [triggerInput]
  );

  const loadAccounts = useCallback(async () => {
    setIsLoading(true);
    setPageError(null);

    try {
      const response = await api.get<ApiSuccessResponse<ChannelAccountRecord[]>>(
        "/api/v1/channel-accounts"
      );
      const records = Array.isArray(response.data.data) ? response.data.data : [];
      setAccounts(records);
      setSelectedAccountId((previous) =>
        previous && records.some((record) => record._id === previous)
          ? previous
          : records[0]?._id ?? ""
      );
    } catch (error) {
      setPageError(getErrorMessage(error, "Failed to load WhatsApp accounts."));
      setAccounts([]);
      setSelectedAccountId("");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadTemplates = useCallback(async (accountId: string) => {
    if (!accountId) {
      setTemplates([]);
      setSelectedTemplateId("");
      return;
    }

    try {
      const response = await api.get<ApiSuccessResponse<OutreachTemplateRecord[]>>(
        `/api/v1/whatsapp-outreach/templates?channelAccountId=${encodeURIComponent(accountId)}`
      );
      const records = Array.isArray(response.data.data) ? response.data.data : [];
      setTemplates(records);
      setSelectedTemplateId((previous) =>
        previous && records.some((record) => record._id === previous) ? previous : ""
      );
    } catch (error) {
      setPageError(getErrorMessage(error, "Failed to load templates."));
      setTemplates([]);
      setSelectedTemplateId("");
    }
  }, []);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  useEffect(() => {
    void loadTemplates(selectedAccountId);
  }, [loadTemplates, selectedAccountId]);

  function resetEditor() {
    setSelectedTemplateId("");
    setTemplateName("");
    setTemplate(DEFAULT_TEMPLATE);
    setTriggerInput(DEFAULT_TRIGGERS);
    setPageError(null);
    setPageSuccess(null);
  }

  function applyTemplate(record: OutreachTemplateRecord) {
    setSelectedTemplateId(record._id);
    setTemplateName(record.name);
    setTemplate({ ...DEFAULT_TEMPLATE, ...record.personalizationTemplate });
    setTriggerInput(record.interestTriggers.join("\n"));
    setPageError(null);
    setPageSuccess(null);
  }

  function updateTemplateField(field: keyof MarketingMessageTemplate, value: string) {
    setTemplate((previous) => ({ ...previous, [field]: value }));
  }

  async function saveTemplate(mode: "create" | "update") {
    if (!selectedAccountId) {
      setPageError("Choose a WhatsApp account first.");
      return;
    }

    if (!templateName.trim()) {
      setPageError("Name the template before saving.");
      return;
    }

    if (mode === "update" && !selectedTemplateId) {
      setPageError("Choose a saved template first.");
      return;
    }

    setIsSubmitting(true);
    setPageError(null);
    setPageSuccess(null);

    try {
      const payload = {
        channelAccountId: selectedAccountId,
        name: templateName.trim(),
        personalizationTemplate: template,
        interestTriggers: triggerInput,
      };

      const response =
        mode === "update"
          ? await api.put<ApiSuccessResponse<OutreachTemplateRecord>>(
              `/api/v1/whatsapp-outreach/templates/${selectedTemplateId}`,
              payload
            )
          : await api.post<ApiSuccessResponse<OutreachTemplateRecord>>(
              "/api/v1/whatsapp-outreach/templates",
              payload
            );

      await loadTemplates(selectedAccountId);
      const savedTemplate = response.data.data;
      if (savedTemplate) {
        setSelectedTemplateId(savedTemplate._id);
        setTemplateName(savedTemplate.name);
      }
      setPageSuccess(mode === "update" ? "Template updated." : "Template saved.");
    } catch (error) {
      setPageError(getErrorMessage(error, "Failed to save template."));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function deleteTemplate() {
    if (!selectedTemplateId) {
      setPageError("Choose a saved template first.");
      return;
    }

    setIsSubmitting(true);
    setPageError(null);
    setPageSuccess(null);

    try {
      await api.delete(`/api/v1/whatsapp-outreach/templates/${selectedTemplateId}`);
      resetEditor();
      await loadTemplates(selectedAccountId);
      setPageSuccess("Template deleted.");
    } catch (error) {
      setPageError(getErrorMessage(error, "Failed to delete template."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="templates-page">
      <PageSection
        title="Template Preview"
        description="Create reusable greetings, response lines, and interested-reply triggers before sending a campaign."
        onRefresh={() => void loadTemplates(selectedAccountId)}
      >
        {pageError ? <InlineAlert tone="error" message={pageError} /> : null}
        {pageSuccess ? <InlineAlert tone="success" message={pageSuccess} /> : null}
        {isLoading ? <LoadingState text="Loading templates..." /> : null}

        <div className="templates-layout">
          <div className="app-form templates-editor">
            <div className="form-grid">
              <label className="form-field">
                <span>WhatsApp account</span>
                <select
                  value={selectedAccountId}
                  onChange={(event) => {
                    setSelectedAccountId(event.target.value);
                    resetEditor();
                  }}
                >
                  {accounts.map((account) => (
                    <option key={account._id} value={account._id}>
                      {account.displayName ?? account.code ?? account._id}
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-field">
                <span>Saved template</span>
                <select
                  value={selectedTemplateId}
                  onChange={(event) => {
                    const record = templates.find((item) => item._id === event.target.value);
                    if (record) {
                      applyTemplate(record);
                    } else {
                      resetEditor();
                    }
                  }}
                >
                  <option value="">New template</option>
                  {templates.map((record) => (
                    <option key={record._id} value={record._id}>
                      {record.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-field">
                <span>Template name</span>
                <input
                  value={templateName}
                  onChange={(event) => setTemplateName(event.target.value)}
                  placeholder="New offer follow-up"
                />
              </label>

              <label className="form-field">
                <span>Preview name</span>
                <input
                  value={previewName}
                  onChange={(event) => setPreviewName(event.target.value)}
                  placeholder="Customer name"
                />
              </label>

              <label className="form-field">
                <span>English greeting</span>
                <input
                  value={template.englishGreeting}
                  onChange={(event) => updateTemplateField("englishGreeting", event.target.value)}
                />
              </label>

              <label className="form-field">
                <span>Arabic greeting</span>
                <input
                  value={template.arabicGreeting}
                  onChange={(event) => updateTemplateField("arabicGreeting", event.target.value)}
                />
              </label>

              <label className="form-field">
                <span>English response line</span>
                <input
                  value={template.englishResponseInstruction}
                  onChange={(event) =>
                    updateTemplateField("englishResponseInstruction", event.target.value)
                  }
                />
              </label>

              <label className="form-field">
                <span>Arabic response line</span>
                <input
                  value={template.arabicResponseInstruction}
                  onChange={(event) =>
                    updateTemplateField("arabicResponseInstruction", event.target.value)
                  }
                />
              </label>

              <label className="form-field form-field-full">
                <span>Interested reply triggers</span>
                <textarea
                  className="text-area-control outreach-trigger-area"
                  value={triggerInput}
                  onChange={(event) => setTriggerInput(event.target.value)}
                />
                <small className="form-help">
                  {triggerCount} trigger(s). Use one per line or separate with commas.
                </small>
              </label>
            </div>

            <div className="form-actions">
              <button
                type="button"
                className="primary-button"
                disabled={isSubmitting}
                onClick={() => void saveTemplate("create")}
              >
                Save New Template
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={isSubmitting || !selectedTemplate}
                onClick={() => void saveTemplate("update")}
              >
                Update
              </button>
              <button
                type="button"
                className="danger-button"
                disabled={isSubmitting || !selectedTemplate}
                onClick={() => void deleteTemplate()}
              >
                Delete
              </button>
              <button type="button" className="secondary-button" onClick={resetEditor}>
                Default
              </button>
            </div>
          </div>

          <aside className="templates-preview-panel">
            <label className="form-field">
              <span>Campaign message preview</span>
              <textarea
                className="text-area-control"
                value={previewMessage}
                onChange={(event) => setPreviewMessage(event.target.value)}
              />
            </label>
            <div className="outreach-preview">
              <div className="outreach-preview-header">
                <strong>Live preview</strong>
                <span className="muted-text">{preview.length} chars</span>
              </div>
              <pre>{preview || "Your preview will appear here."}</pre>
            </div>
          </aside>
        </div>
      </PageSection>
    </div>
  );
}

export default TemplatesPage;
