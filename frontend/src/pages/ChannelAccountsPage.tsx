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

interface OrgUnitRecord {
  _id: string;
  code: string;
}

interface ChannelAccountCreateFormState {
  channelId: string;
  orgUnitId: string;
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
    orgUnitId: "",
    code: "",
    displayName: "",
    phoneNumber: "",
    status: "pending",
    authStorageKey: "",
    webhookEnabled: false,
  };
}

function ChannelAccountsPage() {
  const [channelAccounts, setChannelAccounts] = useState<ChannelAccountRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [channels, setChannels] = useState<ChannelRecord[]>([]);
  const [orgUnits, setOrgUnits] = useState<OrgUnitRecord[]>([]);
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
        throw new Error(response.data.message ?? "Failed to load channel accounts.");
      }

      setChannelAccounts(Array.isArray(response.data.data) ? response.data.data : []);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const apiMessage = (error.response?.data as { message?: string } | undefined)?.message;
        setErrorMessage(apiMessage ?? error.message ?? "Failed to load channel accounts.");
      } else {
        setErrorMessage("Failed to load channel accounts.");
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadReferences = useCallback(async () => {
    setIsLoadingRefs(true);
    setRefsErrorMessage(null);

    try {
      const [channelsResponse, orgUnitsResponse] = await Promise.all([
        api.get<ApiSuccessResponse<ChannelRecord[]>>("/api/v1/channels"),
        api.get<ApiSuccessResponse<OrgUnitRecord[]>>("/api/v1/org-units"),
      ]);

      const nextChannels = Array.isArray(channelsResponse.data.data) ? channelsResponse.data.data : [];
      const nextOrgUnits = Array.isArray(orgUnitsResponse.data.data) ? orgUnitsResponse.data.data : [];

      setChannels(nextChannels);
      setOrgUnits(nextOrgUnits);

      setForm((previous) => ({
        ...previous,
        channelId: previous.channelId || nextChannels[0]?._id || "",
      }));
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const apiMessage = (error.response?.data as { message?: string } | undefined)?.message;
        setRefsErrorMessage(apiMessage ?? error.message ?? "Failed to load channels/org units.");
      } else {
        setRefsErrorMessage("Failed to load channels/org units.");
      }
    } finally {
      setIsLoadingRefs(false);
    }
  }, []);

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
        channelAccount.orgUnitId,
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
      setSubmitError("channelId is required.");
      return;
    }
    if (!form.code.trim() || !form.displayName.trim() || !form.status.trim()) {
      setSubmitError("code, displayName, and status are required.");
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

    if (form.orgUnitId) {
      payload.orgUnitId = form.orgUnitId;
    }
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
            (isEditMode ? "Failed to update channel account." : "Failed to create channel account.")
        );
      }

      setSubmitSuccess(
        isEditMode ? "Channel account updated successfully." : "Channel account created successfully."
      );
      setForm(createInitialForm(channels[0]?._id || form.channelId));
      setEditingId(null);
      await loadChannelAccounts();
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const apiMessage = (error.response?.data as { message?: string } | undefined)?.message;
        setSubmitError(apiMessage ?? error.message ?? "Failed to save channel account.");
      } else {
        setSubmitError("Failed to save channel account.");
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
      orgUnitId: channelAccount.orgUnitId ?? "",
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
      title="Channel Accounts"
      description="Channel accounts loaded from the backend."
      onRefresh={() => {
        void loadChannelAccounts();
        void loadReferences();
      }}
    >
      <form className="runtime-form" onSubmit={(event) => void handleSubmit(event)}>
        <FormModeBanner entityName="Channel Account" editingId={editingId} />
        <div className="form-grid">
          <label className="form-field">
            <span>Channel</span>
            <select
              className="input-control"
              value={form.channelId}
              onChange={(event) => setForm((previous) => ({ ...previous, channelId: event.target.value }))}
              required
              disabled={isLoadingRefs}
            >
              <option value="">Select channel</option>
              {channels.map((channel) => (
                <option key={channel._id} value={channel._id}>
                  {channel.code} - {channel.name}
                </option>
              ))}
            </select>
          </label>

          <label className="form-field">
            <span>Org Unit</span>
            <select
              className="input-control"
              value={form.orgUnitId}
              onChange={(event) => setForm((previous) => ({ ...previous, orgUnitId: event.target.value }))}
              disabled={isLoadingRefs}
            >
              <option value="">(optional)</option>
              {orgUnits.map((orgUnit) => (
                <option key={orgUnit._id} value={orgUnit._id}>
                  {orgUnit.code}
                </option>
              ))}
            </select>
          </label>

          <label className="form-field">
            <span>Code</span>
            <input
              className="input-control"
              type="text"
              value={form.code}
              onChange={(event) => setForm((previous) => ({ ...previous, code: event.target.value }))}
              required
            />
          </label>

          <label className="form-field">
            <span>Display Name</span>
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
            <span>Phone Number</span>
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
            <span>Status</span>
            <select
              className="input-control"
              value={form.status}
              onChange={(event) => setForm((previous) => ({ ...previous, status: event.target.value }))}
            >
              <option value="pending">pending</option>
              <option value="connected">connected</option>
              <option value="disconnected">disconnected</option>
              <option value="blocked">blocked</option>
            </select>
          </label>

          <label className="form-field">
            <span>Auth Storage Key</span>
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
            <span>Webhook Enabled</span>
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
              ? "Submitting..."
              : editingId
              ? "Update Channel Account"
              : "Create Channel Account"}
          </button>
          {editingId ? (
            <button type="button" className="secondary-button" onClick={cancelEditPrefill}>
              Cancel Edit
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
        searchPlaceholder="Search by code, display name, phone, channel id, org unit id..."
        filteredCount={filteredChannelAccounts.length}
        totalCount={channelAccounts.length}
        onReset={() => {
          setSearchTerm("");
          setStatusFilter("all");
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
      </ListFilters>

      {isLoading ? <p className="state-text">Loading channel accounts...</p> : null}

      {!isLoading && errorMessage ? (
        <div className="state-block state-error">
          <p>{errorMessage}</p>
        </div>
      ) : null}

      {!isLoading && !errorMessage && channelAccounts.length === 0 ? (
        <div className="state-block state-empty">
          <p>No channel accounts found.</p>
        </div>
      ) : null}

      {!isLoading && !errorMessage && channelAccounts.length > 0 && filteredChannelAccounts.length === 0 ? (
        <div className="state-block state-empty">
          <p>No channel accounts match the current filters.</p>
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
                    label="Code"
                    sortKeyValue="code"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="Display Name"
                    sortKeyValue="displayName"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="Phone"
                    sortKeyValue="phoneNumber"
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
                  <th>Channel ID</th>
                  <th>Org Unit ID</th>
                  <th>Actions</th>
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
                    <td className="cell-mono">{channelAccount.orgUnitId || "-"}</td>
                    <td>
                      <button
                        type="button"
                        className="secondary-button table-action-button"
                        onClick={() => startEdit(channelAccount)}
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

export default ChannelAccountsPage;
