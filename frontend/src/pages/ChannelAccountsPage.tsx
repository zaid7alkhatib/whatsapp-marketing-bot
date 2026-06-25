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

interface ChannelAccountRecord {
  _id: string;
  code: string;
  displayName: string;
  phoneNumber?: string;
  status: string;
  channelId: string;
  orgUnitId?: string | null;
  providerConfig?: {
    authStorageKey?: string;
    webhookEnabled?: boolean;
  };
}

type ChannelAccountSortKey = "code" | "displayName" | "phoneNumber" | "status";

interface ChannelRecord {
  _id: string;
  code: string;
  name: string;
}

interface ChannelAccountCreateFormState {
  channelId: string;
  code: string;
  displayName: string;
  phoneNumber: string;
  status: string;
  authStorageKey: string;
  webhookEnabled: boolean;
}

function createInitialForm(channelId = ""): ChannelAccountCreateFormState {
  return {
    channelId,
    code: "",
    displayName: "",
    phoneNumber: "",
    status: "pending",
    authStorageKey: "",
    webhookEnabled: false,
  };
}

function ChannelAccountsPage() {
  const { t } = useClientLocale();
  const [channelAccounts, setChannelAccounts] = useState<ChannelAccountRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [channels, setChannels] = useState<ChannelRecord[]>([]);
  const [isLoadingRefs, setIsLoadingRefs] = useState(true);
  const [refsErrorMessage, setRefsErrorMessage] = useState<string | null>(null);

  const [form, setForm] = useState<ChannelAccountCreateFormState>(createInitialForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const loadChannelAccounts = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await api.get<ApiSuccessResponse<ChannelAccountRecord[]>>(
        "/api/v1/channel-accounts"
      );

      if (!response.data.success) {
        throw new Error(response.data.message ?? t("accounts.failedLoad"));
      }

      setChannelAccounts(Array.isArray(response.data.data) ? response.data.data : []);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const apiMessage = (error.response?.data as { message?: string } | undefined)?.message;
        setErrorMessage(apiMessage ?? error.message ?? t("accounts.failedLoad"));
      } else {
        setErrorMessage(t("accounts.failedLoad"));
      }
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  const loadReferences = useCallback(async () => {
    setIsLoadingRefs(true);
    setRefsErrorMessage(null);

    try {
      const channelsResponse = await api.get<ApiSuccessResponse<ChannelRecord[]>>("/api/v1/channels");
      const nextChannels = Array.isArray(channelsResponse.data.data) ? channelsResponse.data.data : [];

      setChannels(nextChannels);

      setForm((previous) => ({
        ...previous,
        channelId: previous.channelId || nextChannels[0]?._id || "",
      }));
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const apiMessage = (error.response?.data as { message?: string } | undefined)?.message;
        setRefsErrorMessage(apiMessage ?? error.message ?? t("accounts.failedLoadChannels"));
      } else {
        setRefsErrorMessage(t("accounts.failedLoadChannels"));
      }
    } finally {
      setIsLoadingRefs(false);
    }
  }, [t]);

  useEffect(() => {
    void loadChannelAccounts();
    void loadReferences();
  }, [loadChannelAccounts, loadReferences]);

  const statusOptions = useMemo(() => {
    return Array.from(
      new Set(channelAccounts.map((channelAccount) => channelAccount.status).filter(Boolean))
    ).sort();
  }, [channelAccounts]);

  const filteredChannelAccounts = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return channelAccounts.filter((channelAccount) => {
      if (statusFilter !== "all" && channelAccount.status !== statusFilter) {
        return false;
      }

      if (!query) {
        return true;
      }

      const searchableText = [
        channelAccount.code,
        channelAccount.displayName,
        channelAccount.phoneNumber,
        channelAccount.channelId,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(query);
    });
  }, [channelAccounts, searchTerm, statusFilter]);

  const {
    sortKey,
    sortDirection,
    currentPage,
    pageSize,
    totalItems,
    totalPages,
    startItem,
    endItem,
    paginatedItems: paginatedChannelAccounts,
    handleSort,
    handlePageChange,
    handlePageSizeChange,
  } = useClientTable<ChannelAccountRecord, ChannelAccountSortKey>({
    items: filteredChannelAccounts,
    initialSortKey: "code",
    getSortValue: (channelAccount, key) => channelAccount[key] ?? "",
    resetPageKey: `${searchTerm}|${statusFilter}`,
  });

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(null);

    if (!form.channelId) {
      setSubmitError(t("accounts.channelRequired"));
      return;
    }
    if (!form.code.trim() || !form.displayName.trim() || !form.status.trim()) {
      setSubmitError(t("accounts.required"));
      return;
    }

    const payload: Record<string, unknown> = {
      channelId: form.channelId,
      code: form.code.trim(),
      displayName: form.displayName.trim(),
      status: form.status.trim(),
      providerConfig: {
        authStorageKey: form.authStorageKey.trim(),
        webhookEnabled: form.webhookEnabled,
      },
    };

    if (form.phoneNumber.trim()) {
      payload.phoneNumber = form.phoneNumber.trim();
    }

    setIsSubmitting(true);
    try {
      const isEditMode = Boolean(editingId);
      const response = isEditMode
        ? await api.put<ApiSuccessResponse<unknown>>(
            `/api/v1/channel-accounts/${editingId}`,
            payload
          )
        : await api.post<ApiSuccessResponse<unknown>>("/api/v1/channel-accounts", payload);
      if (!response.data.success) {
        throw new Error(
          response.data.message ??
            (isEditMode ? t("accounts.failedUpdate") : t("accounts.failedCreate"))
        );
      }

      setSubmitSuccess(
        isEditMode ? t("accounts.updated") : t("accounts.created")
      );
      setForm(createInitialForm(channels[0]?._id || form.channelId));
      setEditingId(null);
      await loadChannelAccounts();
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const apiMessage = (error.response?.data as { message?: string } | undefined)?.message;
        setSubmitError(apiMessage ?? error.message ?? t("accounts.failedSave"));
      } else {
        setSubmitError(t("accounts.failedSave"));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const startEdit = (channelAccount: ChannelAccountRecord) => {
    setEditingId(channelAccount._id);
    setSubmitError(null);
    setSubmitSuccess(null);
    setForm({
      channelId: channelAccount.channelId,
      code: channelAccount.code,
      displayName: channelAccount.displayName,
      phoneNumber: channelAccount.phoneNumber ?? "",
      status: channelAccount.status,
      authStorageKey: channelAccount.providerConfig?.authStorageKey ?? "",
      webhookEnabled: Boolean(channelAccount.providerConfig?.webhookEnabled),
    });
  };

  const cancelEditPrefill = () => {
    setEditingId(null);
    setSubmitError(null);
    setForm(createInitialForm(channels[0]?._id || ""));
  };

  return (
    <PageSection
      title={t("accounts.title")}
      description={t("accounts.description")}
      onRefresh={() => {
        void loadChannelAccounts();
        void loadReferences();
      }}
    >
      <form className="app-form" onSubmit={(event) => void handleSubmit(event)}>
        <FormModeBanner
          entityName={t("accounts.title")}
          editingId={editingId}
          title={editingId ? t("accounts.formEdit") : t("accounts.formCreate")}
          description={
            editingId
              ? t("accounts.editDescription", { id: editingId })
              : t("accounts.createDescription")
          }
        />
        <div className="form-grid">
          <label className="form-field">
            <span>{t("common.channel")}</span>
            <select
              className="input-control"
              value={form.channelId}
              onChange={(event) => setForm((previous) => ({ ...previous, channelId: event.target.value }))}
              required
              disabled={isLoadingRefs}
            >
              <option value="">{t("common.channel")}</option>
              {channels.map((channel) => (
                <option key={channel._id} value={channel._id}>
                  {channel.code} - {channel.name}
                </option>
              ))}
            </select>
          </label>

          <label className="form-field">
            <span>{t("common.code")}</span>
            <input
              className="input-control"
              type="text"
              value={form.code}
              onChange={(event) => setForm((previous) => ({ ...previous, code: event.target.value }))}
              required
            />
          </label>

          <label className="form-field">
            <span>{t("accounts.displayName")}</span>
            <input
              className="input-control"
              type="text"
              value={form.displayName}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, displayName: event.target.value }))
              }
              required
            />
          </label>

          <label className="form-field">
            <span>{t("accounts.phoneNumber")}</span>
            <input
              className="input-control"
              type="text"
              value={form.phoneNumber}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, phoneNumber: event.target.value }))
              }
            />
          </label>

          <label className="form-field">
            <span>{t("common.status")}</span>
            <select
              className="input-control"
              value={form.status}
              onChange={(event) => setForm((previous) => ({ ...previous, status: event.target.value }))}
            >
              <option value="pending">{t("status.pending")}</option>
              <option value="connected">{t("status.connected")}</option>
              <option value="disconnected">{t("status.disconnected")}</option>
              <option value="blocked">{t("status.blocked")}</option>
            </select>
          </label>

          <label className="form-field">
            <span>{t("accounts.authStorageKey")}</span>
            <input
              className="input-control"
              type="text"
              value={form.authStorageKey}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, authStorageKey: event.target.value }))
              }
            />
          </label>

          <label className="form-field checkbox-field">
            <span>{t("accounts.webhookEnabled")}</span>
            <input
              type="checkbox"
              checked={form.webhookEnabled}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, webhookEnabled: event.target.checked }))
              }
            />
          </label>
        </div>

        <div className="form-actions">
          <button type="submit" className="primary-button" disabled={isSubmitting || isLoadingRefs}>
            {isSubmitting
              ? t("common.submitting")
              : editingId
              ? t("accounts.update")
              : t("accounts.create")}
          </button>
          {editingId ? (
            <button type="button" className="secondary-button" onClick={cancelEditPrefill}>
              {t("common.cancelEdit")}
            </button>
          ) : null}
        </div>
      </form>

      {refsErrorMessage ? (
        <div className="state-block state-error">
          <p>{refsErrorMessage}</p>
        </div>
      ) : null}

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
        searchPlaceholder={t("accounts.searchPlaceholder")}
        filteredCount={filteredChannelAccounts.length}
        totalCount={channelAccounts.length}
        onReset={() => {
          setSearchTerm("");
          setStatusFilter("all");
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
      </ListFilters>

      {isLoading ? <p className="state-text">{t("accounts.loading")}</p> : null}

      {!isLoading && errorMessage ? (
        <div className="state-block state-error">
          <p>{errorMessage}</p>
        </div>
      ) : null}

      {!isLoading && !errorMessage && channelAccounts.length === 0 ? (
        <div className="state-block state-empty">
          <p>{t("accounts.none")}</p>
        </div>
      ) : null}

      {!isLoading && !errorMessage && channelAccounts.length > 0 && filteredChannelAccounts.length === 0 ? (
        <div className="state-block state-empty">
          <p>{t("accounts.noMatches")}</p>
        </div>
      ) : null}

      {!isLoading && !errorMessage && filteredChannelAccounts.length > 0 ? (
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
                    label={t("accounts.displayName")}
                    sortKeyValue="displayName"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label={t("common.phone")}
                    sortKeyValue="phoneNumber"
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
                  <th>{t("common.channel")} {t("common.id")}</th>
                  <th>{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {paginatedChannelAccounts.map((channelAccount) => (
                  <tr key={channelAccount._id}>
                    <td className="cell-mono">{channelAccount._id}</td>
                    <td>{channelAccount.code}</td>
                    <td>{channelAccount.displayName}</td>
                    <td>{channelAccount.phoneNumber || "-"}</td>
                    <td>
                      <StatusBadge value={channelAccount.status} />
                    </td>
                    <td className="cell-mono">{channelAccount.channelId}</td>
                    <td>
                      <button
                        type="button"
                        className="secondary-button table-action-button"
                        onClick={() => startEdit(channelAccount)}
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

export default ChannelAccountsPage;
