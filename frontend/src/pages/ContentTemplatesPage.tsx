import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import axios from "axios";
import FormModeBanner from "../components/FormModeBanner";
import ListFilters from "../components/ListFilters";
import PageSection from "../components/PageSection";
import SortableHeader from "../components/SortableHeader";
import StatusBadge from "../components/StatusBadge";
import TablePagination from "../components/TablePagination";
import useClientTable from "../hooks/useClientTable";
import api from "../services/api";
import type { ApiSuccessResponse } from "../types/api";

interface TranslationRecord {
  ar?: string;
  en?: string;
  de?: string;
}

interface ContentTemplateRecord {
  _id: string;
  key: string;
  contentType: string;
  scope: string;
  status: string;
  translations?: TranslationRecord;
  placeholders?: string[];
}

type ContentTemplateSortKey = "key" | "contentType" | "scope" | "status";

interface ContentTemplateCreateFormState {
  key: string;
  contentType: string;
  scope: string;
  status: string;
  translationAr: string;
  translationEn: string;
  translationDe: string;
  placeholders: string;
}

const INITIAL_FORM: ContentTemplateCreateFormState = {
  key: "",
  contentType: "text",
  scope: "global",
  status: "active",
  translationAr: "",
  translationEn: "",
  translationDe: "",
  placeholders: "",
};

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function buildTranslationSummary(translations?: TranslationRecord): string {
  if (!translations) {
    return "None";
  }

  const available = ["ar", "en", "de"].filter((languageCode) => {
    const value = translations[languageCode as keyof TranslationRecord];
    return hasText(value);
  });

  return available.length > 0 ? available.join(" / ") : "None";
}

function ContentTemplatesPage() {
  const [templates, setTemplates] = useState<ContentTemplateRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [form, setForm] = useState<ContentTemplateCreateFormState>(INITIAL_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [contentTypeFilter, setContentTypeFilter] = useState("all");
  const [scopeFilter, setScopeFilter] = useState("all");

  const loadTemplates = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await api.get<ApiSuccessResponse<ContentTemplateRecord[]>>(
        "/api/v1/content-templates"
      );

      if (!response.data.success) {
        throw new Error(response.data.message ?? "Failed to load content templates.");
      }

      setTemplates(Array.isArray(response.data.data) ? response.data.data : []);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const apiMessage = (error.response?.data as { message?: string } | undefined)?.message;
        setErrorMessage(apiMessage ?? error.message ?? "Failed to load content templates.");
      } else {
        setErrorMessage("Failed to load content templates.");
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  const statusOptions = useMemo(() => {
    return Array.from(new Set(templates.map((template) => template.status).filter(Boolean))).sort();
  }, [templates]);

  const contentTypeOptions = useMemo(() => {
    return Array.from(
      new Set(templates.map((template) => template.contentType).filter(Boolean))
    ).sort();
  }, [templates]);

  const scopeOptions = useMemo(() => {
    return Array.from(new Set(templates.map((template) => template.scope).filter(Boolean))).sort();
  }, [templates]);

  const filteredTemplates = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return templates.filter((template) => {
      if (statusFilter !== "all" && template.status !== statusFilter) {
        return false;
      }
      if (contentTypeFilter !== "all" && template.contentType !== contentTypeFilter) {
        return false;
      }
      if (scopeFilter !== "all" && template.scope !== scopeFilter) {
        return false;
      }

      if (!query) {
        return true;
      }

      const searchableText = [
        template.key,
        template.contentType,
        template.scope,
        buildTranslationSummary(template.translations),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(query);
    });
  }, [templates, searchTerm, statusFilter, contentTypeFilter, scopeFilter]);

  const {
    sortKey,
    sortDirection,
    currentPage,
    pageSize,
    totalItems,
    totalPages,
    startItem,
    endItem,
    paginatedItems: paginatedTemplates,
    handleSort,
    handlePageChange,
    handlePageSizeChange,
  } = useClientTable<ContentTemplateRecord, ContentTemplateSortKey>({
    items: filteredTemplates,
    initialSortKey: "key",
    getSortValue: (template, key) => template[key] ?? "",
    resetPageKey: `${searchTerm}|${statusFilter}|${contentTypeFilter}|${scopeFilter}`,
  });

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(null);

    if (!form.key.trim()) {
      setSubmitError("key is required.");
      return;
    }

    const translations: Record<string, string> = {};
    if (form.translationAr.trim()) {
      translations.ar = form.translationAr.trim();
    }
    if (form.translationEn.trim()) {
      translations.en = form.translationEn.trim();
    }
    if (form.translationDe.trim()) {
      translations.de = form.translationDe.trim();
    }

    if (Object.keys(translations).length === 0) {
      setSubmitError("At least one translation is required.");
      return;
    }

    const parsedPlaceholders = form.placeholders
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

    const payload: Record<string, unknown> = {
      key: form.key.trim(),
      contentType: form.contentType,
      scope: form.scope,
      status: form.status,
      translations,
    };

    if (parsedPlaceholders.length > 0) {
      payload.placeholders = parsedPlaceholders;
    }

    setIsSubmitting(true);
    try {
      const isEditMode = Boolean(editingId);
      const response = isEditMode
        ? await api.put<ApiSuccessResponse<unknown>>(
            `/api/v1/content-templates/${editingId}`,
            payload
          )
        : await api.post<ApiSuccessResponse<unknown>>("/api/v1/content-templates", payload);
      if (!response.data.success) {
        throw new Error(
          response.data.message ??
            (isEditMode
              ? "Failed to update content template."
              : "Failed to create content template.")
        );
      }

      setSubmitSuccess(
        isEditMode ? "Content template updated successfully." : "Content template created successfully."
      );
      setForm(INITIAL_FORM);
      setEditingId(null);
      await loadTemplates();
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const apiMessage = (error.response?.data as { message?: string } | undefined)?.message;
        setSubmitError(apiMessage ?? error.message ?? "Failed to save content template.");
      } else {
        setSubmitError("Failed to save content template.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const startEdit = (template: ContentTemplateRecord) => {
    setEditingId(template._id);
    setSubmitError(null);
    setSubmitSuccess(null);
    setForm({
      key: template.key,
      contentType: template.contentType,
      scope: template.scope,
      status: template.status,
      translationAr: template.translations?.ar ?? "",
      translationEn: template.translations?.en ?? "",
      translationDe: template.translations?.de ?? "",
      placeholders: Array.isArray(template.placeholders) ? template.placeholders.join(", ") : "",
    });
  };

  const cancelEditPrefill = () => {
    setEditingId(null);
    setSubmitError(null);
    setForm(INITIAL_FORM);
  };

  return (
    <PageSection
      title="Content Templates"
      description="Configured message templates from the backend."
      onRefresh={() => void loadTemplates()}
    >
      <form className="runtime-form" onSubmit={(event) => void handleSubmit(event)}>
        <FormModeBanner entityName="Content Template" editingId={editingId} />
        <div className="form-grid">
          <label className="form-field">
            <span>Key</span>
            <input
              className="input-control"
              type="text"
              value={form.key}
              onChange={(event) => setForm((previous) => ({ ...previous, key: event.target.value }))}
              required
            />
          </label>

          <label className="form-field">
            <span>Content Type</span>
            <select
              className="input-control"
              value={form.contentType}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, contentType: event.target.value }))
              }
            >
              <option value="text">text</option>
              <option value="markdown">markdown</option>
              <option value="media_caption">media_caption</option>
            </select>
          </label>

          <label className="form-field">
            <span>Scope</span>
            <select
              className="input-control"
              value={form.scope}
              onChange={(event) => setForm((previous) => ({ ...previous, scope: event.target.value }))}
            >
              <option value="global">global</option>
              <option value="org_unit">org_unit</option>
            </select>
          </label>

          <label className="form-field">
            <span>Status</span>
            <select
              className="input-control"
              value={form.status}
              onChange={(event) => setForm((previous) => ({ ...previous, status: event.target.value }))}
            >
              <option value="active">active</option>
              <option value="inactive">inactive</option>
            </select>
          </label>

          <label className="form-field">
            <span>Translation (ar)</span>
            <input
              className="input-control"
              type="text"
              value={form.translationAr}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, translationAr: event.target.value }))
              }
            />
            <small className="form-help">Arabic localized text (optional).</small>
          </label>

          <label className="form-field">
            <span>Translation (en)</span>
            <input
              className="input-control"
              type="text"
              value={form.translationEn}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, translationEn: event.target.value }))
              }
            />
            <small className="form-help">English localized text (optional).</small>
          </label>

          <label className="form-field">
            <span>Translation (de)</span>
            <input
              className="input-control"
              type="text"
              value={form.translationDe}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, translationDe: event.target.value }))
              }
            />
            <small className="form-help">German localized text (optional).</small>
          </label>

          <label className="form-field form-field-full">
            <span>Placeholders (comma-separated)</span>
            <input
              className="input-control"
              type="text"
              value={form.placeholders}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, placeholders: event.target.value }))
              }
              placeholder="name, firstName, selected_language"
            />
            <small className="form-help">Used for runtime template interpolation (for example: name, languageChoice).</small>
          </label>
        </div>

        <div className="form-actions">
          <button type="submit" className="primary-button" disabled={isSubmitting}>
            {isSubmitting
              ? "Submitting..."
              : editingId
              ? "Update Content Template"
              : "Create Content Template"}
          </button>
          {editingId ? (
            <button type="button" className="secondary-button" onClick={cancelEditPrefill}>
              Cancel Edit
            </button>
          ) : null}
        </div>
      </form>

      {submitError ? (
        <div className="state-block state-error">
          <p>{submitError}</p>
        </div>
      ) : null}

      {submitSuccess ? (
        <div className="state-block state-success">
          <p>{submitSuccess}</p>
        </div>
      ) : null}

      <ListFilters
        searchTerm={searchTerm}
        onSearchTermChange={setSearchTerm}
        searchPlaceholder="Search by key, content type, scope, translations..."
        filteredCount={filteredTemplates.length}
        totalCount={templates.length}
        onReset={() => {
          setSearchTerm("");
          setStatusFilter("all");
          setContentTypeFilter("all");
          setScopeFilter("all");
        }}
      >
        <label className="form-field list-filter-field">
          <span>Status</span>
          <select
            className="input-control"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">All</option>
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>

        <label className="form-field list-filter-field">
          <span>Content Type</span>
          <select
            className="input-control"
            value={contentTypeFilter}
            onChange={(event) => setContentTypeFilter(event.target.value)}
          >
            <option value="all">All</option>
            {contentTypeOptions.map((contentType) => (
              <option key={contentType} value={contentType}>
                {contentType}
              </option>
            ))}
          </select>
        </label>

        <label className="form-field list-filter-field">
          <span>Scope</span>
          <select
            className="input-control"
            value={scopeFilter}
            onChange={(event) => setScopeFilter(event.target.value)}
          >
            <option value="all">All</option>
            {scopeOptions.map((scope) => (
              <option key={scope} value={scope}>
                {scope}
              </option>
            ))}
          </select>
        </label>
      </ListFilters>

      {isLoading ? <p className="state-text">Loading content templates...</p> : null}

      {!isLoading && errorMessage ? (
        <div className="state-block state-error">
          <p>{errorMessage}</p>
        </div>
      ) : null}

      {!isLoading && !errorMessage && templates.length === 0 ? (
        <div className="state-block state-empty">
          <p>No content templates found.</p>
        </div>
      ) : null}

      {!isLoading && !errorMessage && templates.length > 0 && filteredTemplates.length === 0 ? (
        <div className="state-block state-empty">
          <p>No content templates match the current filters.</p>
        </div>
      ) : null}

      {!isLoading && !errorMessage && filteredTemplates.length > 0 ? (
        <>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <SortableHeader
                    label="Key"
                    sortKeyValue="key"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="Content Type"
                    sortKeyValue="contentType"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="Scope"
                    sortKeyValue="scope"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="Status"
                    sortKeyValue="status"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <th>Translations</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedTemplates.map((template) => (
                  <tr key={template._id}>
                    <td>{template.key}</td>
                    <td>{template.contentType}</td>
                    <td>{template.scope}</td>
                    <td>
                      <StatusBadge value={template.status} />
                    </td>
                    <td>{buildTranslationSummary(template.translations)}</td>
                    <td>
                      <button
                        type="button"
                        className="secondary-button table-action-button"
                        onClick={() => startEdit(template)}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <TablePagination
            totalItems={totalItems}
            currentPage={currentPage}
            totalPages={totalPages}
            pageSize={pageSize}
            startItem={startItem}
            endItem={endItem}
            onPageChange={handlePageChange}
            onPageSizeChange={handlePageSizeChange}
          />
        </>
      ) : null}
    </PageSection>
  );
}

export default ContentTemplatesPage;
