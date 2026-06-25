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
import { useClientLocale } from "../i18n/ClientLocaleContext";
import api from "../services/api";
import type { ApiSuccessResponse } from "../types/api";

interface ChannelCapabilities {
  text?: boolean;
  image?: boolean;
  document?: boolean;
  audio?: boolean;
  buttons?: boolean;
  lists?: boolean;
}

interface ChannelRecord {
  _id: string;
  code: string;
  name: string;
  provider: string;
  status: string;
  capabilities?: ChannelCapabilities;
}

type ChannelSortKey = "code" | "name" | "provider" | "status";

interface ChannelCreateFormState {
  code: string;
  name: string;
  provider: string;
  status: string;
  capabilityText: boolean;
  capabilityImage: boolean;
  capabilityDocument: boolean;
  capabilityAudio: boolean;
  capabilityButtons: boolean;
  capabilityLists: boolean;
}

const INITIAL_FORM: ChannelCreateFormState = {
  code: "whatsapp",
  name: "WhatsApp",
  provider: "baileys",
  status: "active",
  capabilityText: true,
  capabilityImage: false,
  capabilityDocument: false,
  capabilityAudio: false,
  capabilityButtons: false,
  capabilityLists: false,
};

function buildCapabilitiesSummary(
  capabilities: ChannelCapabilities | undefined,
  t: (key: string) => string
): string {
  if (!capabilities) {
    return "-";
  }

  const enabledCapabilities = Object.entries(capabilities)
    .filter(([, isEnabled]) => isEnabled === true)
    .map(([capability]) => t(`capability.${capability}`));

  return enabledCapabilities.length > 0 ? enabledCapabilities.join(", ") : "-";
}

function ChannelsPage() {
  const { t } = useClientLocale();
  const [channels, setChannels] = useState<ChannelRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [form, setForm] = useState<ChannelCreateFormState>(INITIAL_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [providerFilter, setProviderFilter] = useState("all");

  const loadChannels = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await api.get<ApiSuccessResponse<ChannelRecord[]>>("/api/v1/channels");

      if (!response.data.success) {
        throw new Error(response.data.message ?? t("channels.failedLoad"));
      }

      setChannels(Array.isArray(response.data.data) ? response.data.data : []);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const apiMessage = (error.response?.data as { message?: string } | undefined)?.message;
        setErrorMessage(apiMessage ?? error.message ?? t("channels.failedLoad"));
      } else {
        setErrorMessage(t("channels.failedLoad"));
      }
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadChannels();
  }, [loadChannels]);

  const statusOptions = useMemo(() => {
    return Array.from(new Set(channels.map((channel) => channel.status).filter(Boolean))).sort();
  }, [channels]);

  const providerOptions = useMemo(() => {
    return Array.from(new Set(channels.map((channel) => channel.provider).filter(Boolean))).sort();
  }, [channels]);

  const filteredChannels = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return channels.filter((channel) => {
      if (statusFilter !== "all" && channel.status !== statusFilter) {
        return false;
      }
      if (providerFilter !== "all" && channel.provider !== providerFilter) {
        return false;
      }

      if (!query) {
        return true;
      }

      const searchableText = [
        channel.code,
        channel.name,
        channel.provider,
        buildCapabilitiesSummary(channel.capabilities, t),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(query);
    });
  }, [channels, searchTerm, statusFilter, providerFilter, t]);

  const {
    sortKey,
    sortDirection,
    currentPage,
    pageSize,
    totalItems,
    totalPages,
    startItem,
    endItem,
    paginatedItems: paginatedChannels,
    handleSort,
    handlePageChange,
    handlePageSizeChange,
  } = useClientTable<ChannelRecord, ChannelSortKey>({
    items: filteredChannels,
    initialSortKey: "code",
    getSortValue: (channel, key) => channel[key] ?? "",
    resetPageKey: `${searchTerm}|${statusFilter}|${providerFilter}`,
  });

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(null);

    if (!form.code.trim() || !form.name.trim() || !form.provider.trim() || !form.status.trim()) {
      setSubmitError(t("channels.required"));
      return;
    }

    const payload = {
      code: form.code.trim(),
      name: form.name.trim(),
      provider: form.provider.trim(),
      status: form.status.trim(),
      capabilities: {
        text: form.capabilityText,
        image: form.capabilityImage,
        document: form.capabilityDocument,
        audio: form.capabilityAudio,
        buttons: form.capabilityButtons,
        lists: form.capabilityLists,
      },
    };

    setIsSubmitting(true);
    try {
      const isEditMode = Boolean(editingId);
      const response = isEditMode
        ? await api.put<ApiSuccessResponse<unknown>>(`/api/v1/channels/${editingId}`, payload)
        : await api.post<ApiSuccessResponse<unknown>>("/api/v1/channels", payload);
      if (!response.data.success) {
        throw new Error(
          response.data.message ?? (isEditMode ? t("channels.failedUpdate") : t("channels.failedCreate"))
        );
      }

      setSubmitSuccess(isEditMode ? t("channels.updated") : t("channels.created"));
      setForm(INITIAL_FORM);
      setEditingId(null);
      await loadChannels();
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const apiMessage = (error.response?.data as { message?: string } | undefined)?.message;
        setSubmitError(apiMessage ?? error.message ?? t("channels.failedSave"));
      } else {
        setSubmitError(t("channels.failedSave"));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const startEdit = (channel: ChannelRecord) => {
    setEditingId(channel._id);
    setSubmitError(null);
    setSubmitSuccess(null);
    setForm({
      code: channel.code,
      name: channel.name,
      provider: channel.provider,
      status: channel.status,
      capabilityText: Boolean(channel.capabilities?.text),
      capabilityImage: Boolean(channel.capabilities?.image),
      capabilityDocument: Boolean(channel.capabilities?.document),
      capabilityAudio: Boolean(channel.capabilities?.audio),
      capabilityButtons: Boolean(channel.capabilities?.buttons),
      capabilityLists: Boolean(channel.capabilities?.lists),
    });
  };

  const cancelEditPrefill = () => {
    setEditingId(null);
    setSubmitError(null);
    setForm(INITIAL_FORM);
  };

  return (
    <PageSection
      title={t("channels.title")}
      description={t("channels.description")}
      onRefresh={() => void loadChannels()}
    >
      <form className="app-form" onSubmit={(event) => void handleSubmit(event)}>
        <FormModeBanner
          entityName={t("channels.title")}
          editingId={editingId}
          title={editingId ? t("channels.formEdit") : t("channels.formCreate")}
          description={
            editingId
              ? t("channels.editDescription", { id: editingId })
              : t("channels.createDescription")
          }
        />
        <div className="form-grid">
          <label className="form-field">
            <span>{t("common.code")}</span>
            <select
              className="input-control"
              value={form.code}
              onChange={(event) => setForm((previous) => ({ ...previous, code: event.target.value }))}
              required
            >
              <option value="whatsapp">whatsapp</option>
            </select>
          </label>

          <label className="form-field">
            <span>{t("common.name")}</span>
            <input
              className="input-control"
              type="text"
              value={form.name}
              onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))}
              required
            />
          </label>

          <label className="form-field">
            <span>{t("common.provider")}</span>
            <select
              className="input-control"
              value={form.provider}
              onChange={(event) => setForm((previous) => ({ ...previous, provider: event.target.value }))}
            >
              <option value="baileys">baileys</option>
            </select>
          </label>

          <label className="form-field">
            <span>{t("common.status")}</span>
            <select
              className="input-control"
              value={form.status}
              onChange={(event) => setForm((previous) => ({ ...previous, status: event.target.value }))}
            >
              <option value="active">{t("status.active")}</option>
              <option value="inactive">{t("status.inactive")}</option>
            </select>
          </label>

          <label className="form-field checkbox-field">
            <span>{t("channels.capabilityText")}</span>
            <input
              type="checkbox"
              checked={form.capabilityText}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, capabilityText: event.target.checked }))
              }
            />
          </label>

          <label className="form-field checkbox-field">
            <span>{t("channels.capabilityImage")}</span>
            <input
              type="checkbox"
              checked={form.capabilityImage}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, capabilityImage: event.target.checked }))
              }
            />
          </label>

          <label className="form-field checkbox-field">
            <span>{t("channels.capabilityDocument")}</span>
            <input
              type="checkbox"
              checked={form.capabilityDocument}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, capabilityDocument: event.target.checked }))
              }
            />
          </label>

          <label className="form-field checkbox-field">
            <span>{t("channels.capabilityAudio")}</span>
            <input
              type="checkbox"
              checked={form.capabilityAudio}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, capabilityAudio: event.target.checked }))
              }
            />
          </label>

          <label className="form-field checkbox-field">
            <span>{t("channels.capabilityButtons")}</span>
            <input
              type="checkbox"
              checked={form.capabilityButtons}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, capabilityButtons: event.target.checked }))
              }
            />
          </label>

          <label className="form-field checkbox-field">
            <span>{t("channels.capabilityLists")}</span>
            <input
              type="checkbox"
              checked={form.capabilityLists}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, capabilityLists: event.target.checked }))
              }
            />
          </label>
        </div>

        <div className="form-actions">
          <button type="submit" className="primary-button" disabled={isSubmitting}>
            {isSubmitting ? t("common.submitting") : editingId ? t("channels.update") : t("channels.create")}
          </button>
          {editingId ? (
            <button type="button" className="secondary-button" onClick={cancelEditPrefill}>
              {t("common.cancelEdit")}
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
        searchPlaceholder={t("channels.searchPlaceholder")}
        filteredCount={filteredChannels.length}
        totalCount={channels.length}
        onReset={() => {
          setSearchTerm("");
          setStatusFilter("all");
          setProviderFilter("all");
        }}
      >
        <label className="form-field list-filter-field">
          <span>{t("common.status")}</span>
          <select
            className="input-control"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">{t("common.all")}</option>
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {t(`status.${status}`)}
              </option>
            ))}
          </select>
        </label>

        <label className="form-field list-filter-field">
          <span>{t("common.provider")}</span>
          <select
            className="input-control"
            value={providerFilter}
            onChange={(event) => setProviderFilter(event.target.value)}
          >
            <option value="all">{t("common.all")}</option>
            {providerOptions.map((provider) => (
              <option key={provider} value={provider}>
                {provider}
              </option>
            ))}
          </select>
        </label>
      </ListFilters>

      {isLoading ? <p className="state-text">{t("channels.loading")}</p> : null}

      {!isLoading && errorMessage ? (
        <div className="state-block state-error">
          <p>{errorMessage}</p>
        </div>
      ) : null}

      {!isLoading && !errorMessage && channels.length === 0 ? (
        <div className="state-block state-empty">
          <p>{t("channels.none")}</p>
        </div>
      ) : null}

      {!isLoading && !errorMessage && channels.length > 0 && filteredChannels.length === 0 ? (
        <div className="state-block state-empty">
          <p>{t("channels.noMatches")}</p>
        </div>
      ) : null}

      {!isLoading && !errorMessage && filteredChannels.length > 0 ? (
        <>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <SortableHeader
                    label={t("common.code")}
                    sortKeyValue="code"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label={t("common.name")}
                    sortKeyValue="name"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label={t("common.provider")}
                    sortKeyValue="provider"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label={t("common.status")}
                    sortKeyValue="status"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <th>{t("channels.capabilities")}</th>
                  <th>{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {paginatedChannels.map((channel) => (
                  <tr key={channel._id}>
                    <td className="cell-mono">{channel._id}</td>
                    <td>{channel.code}</td>
                    <td>{channel.name}</td>
                    <td>{channel.provider}</td>
                    <td>
                      <StatusBadge value={channel.status} />
                    </td>
                    <td>{buildCapabilitiesSummary(channel.capabilities, t)}</td>
                    <td>
                      <button
                        type="button"
                        className="secondary-button table-action-button"
                        onClick={() => startEdit(channel)}
                      >
                        {t("common.edit")}
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

export default ChannelsPage;
