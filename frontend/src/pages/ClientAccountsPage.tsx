import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import axios from "axios";
import api from "../services/api";
import type { ApiSuccessResponse } from "../types/api";
import InlineAlert from "../components/InlineAlert";
import PageSection from "../components/PageSection";
import LoadingState from "../components/LoadingState";
import EmptyState from "../components/EmptyState";
import StatusBadge from "../components/StatusBadge";

type ClientUserStatus = "active" | "inactive";

interface FlowOption {
  _id: string;
  code: string;
  version?: number;
}

interface ChannelAccountOption {
  _id: string;
  code: string;
  displayName: string;
  phoneNumber?: string | null;
}

interface ClientUserRecord {
  _id: string;
  username: string;
  status: ClientUserStatus;
  displayName?: string;
  scopedFlowId?: string | null;
  scopedChannelAccountId?: string | null;
  updatedAt?: string;
  scope?: {
    flow?: {
      id: string;
      code: string;
      version?: number;
    } | null;
    channelAccount?: {
      id: string;
      code: string;
      displayName: string;
      phoneNumber?: string | null;
    } | null;
  };
}

interface ClientUserFormState {
  username: string;
  password: string;
  displayName: string;
  status: ClientUserStatus;
  scopedFlowId: string;
  scopedChannelAccountId: string;
}

const INITIAL_FORM: ClientUserFormState = {
  username: "",
  password: "",
  displayName: "",
  status: "active",
  scopedFlowId: "",
  scopedChannelAccountId: "",
};

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

function formatDateTime(value: string | undefined): string {
  if (!value) {
    return "-";
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return parsedDate.toLocaleString();
}

function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase();
}

function ClientAccountsPage() {
  const [clientUsers, setClientUsers] = useState<ClientUserRecord[]>([]);
  const [flows, setFlows] = useState<FlowOption[]>([]);
  const [channelAccounts, setChannelAccounts] = useState<ChannelAccountOption[]>([]);
  const [form, setForm] = useState<ClientUserFormState>(INITIAL_FORM);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ClientUserStatus>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchClientUsers = useCallback(async () => {
    const response = await api.get<ApiSuccessResponse<ClientUserRecord[]>>(
      "/api/v1/dashboard-users"
    );
    setClientUsers(response.data.data ?? []);
  }, []);

  const fetchScopeOptions = useCallback(async () => {
    const [flowResponse, channelAccountResponse] = await Promise.all([
      api.get<ApiSuccessResponse<FlowOption[]>>("/api/v1/flows"),
      api.get<ApiSuccessResponse<ChannelAccountOption[]>>("/api/v1/channel-accounts"),
    ]);

    setFlows(flowResponse.data.data ?? []);
    setChannelAccounts(channelAccountResponse.data.data ?? []);
  }, []);

  const loadPageData = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      await Promise.all([fetchClientUsers(), fetchScopeOptions()]);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Failed to load client accounts."));
    } finally {
      setIsLoading(false);
    }
  }, [fetchClientUsers, fetchScopeOptions]);

  useEffect(() => {
    void loadPageData();
  }, [loadPageData]);

  const filteredUsers = useMemo(() => {
    const normalizedQuery = normalizeSearchText(searchQuery);

    return clientUsers.filter((user) => {
      if (statusFilter !== "all" && user.status !== statusFilter) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const flowCode = user.scope?.flow?.code ?? "";
      const channelAccountCode = user.scope?.channelAccount?.code ?? "";
      const channelAccountName = user.scope?.channelAccount?.displayName ?? "";

      return [
        user.username,
        user.displayName ?? "",
        flowCode,
        channelAccountCode,
        channelAccountName,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [clientUsers, searchQuery, statusFilter]);

  const resetForm = useCallback(() => {
    setForm(INITIAL_FORM);
    setEditingUserId(null);
  }, []);

  const handleRefresh = async () => {
    setSuccessMessage(null);
    await loadPageData();
  };

  const handleEdit = (user: ClientUserRecord) => {
    setEditingUserId(user._id);
    setSuccessMessage(null);
    setErrorMessage(null);
    setForm({
      username: user.username ?? "",
      password: "",
      displayName: user.displayName ?? "",
      status: user.status ?? "active",
      scopedFlowId: user.scopedFlowId ?? user.scope?.flow?.id ?? "",
      scopedChannelAccountId:
        user.scopedChannelAccountId ?? user.scope?.channelAccount?.id ?? "",
    });
  };

  const handleCancelEdit = () => {
    resetForm();
    setErrorMessage(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const normalizedUsername = form.username.trim().toLowerCase();
    const normalizedPassword = form.password.trim();

    if (!normalizedUsername) {
      setErrorMessage("Username is required.");
      return;
    }

    if (!editingUserId && normalizedPassword.length < 8) {
      setErrorMessage("Password is required and must be at least 8 characters.");
      return;
    }

    if (normalizedPassword && normalizedPassword.length < 8) {
      setErrorMessage("Password must be at least 8 characters.");
      return;
    }

    if (!form.scopedFlowId) {
      setErrorMessage("Scoped flow is required.");
      return;
    }

    if (!form.scopedChannelAccountId) {
      setErrorMessage("Scoped channel account is required.");
      return;
    }

    const payload: Record<string, unknown> = {
      username: normalizedUsername,
      displayName: form.displayName.trim(),
      status: form.status,
      scopedFlowId: form.scopedFlowId,
      scopedChannelAccountId: form.scopedChannelAccountId,
    };

    if (normalizedPassword) {
      payload.password = normalizedPassword;
    }

    setIsSubmitting(true);

    try {
      if (editingUserId) {
        await api.put<ApiSuccessResponse<ClientUserRecord>>(
          `/api/v1/dashboard-users/${editingUserId}`,
          payload
        );
        setSuccessMessage("Client account updated successfully.");
      } else {
        await api.post<ApiSuccessResponse<ClientUserRecord>>(
          "/api/v1/dashboard-users",
          payload
        );
        setSuccessMessage("Client account created successfully.");
      }

      await fetchClientUsers();
      resetForm();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Failed to save client account."));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PageSection
      title="Client Accounts"
      description="Create and manage client dashboard users with strict scope to one flow and one WhatsApp channel account."
      actions={
        <button type="button" className="secondary-button section-refresh" onClick={() => void handleRefresh()}>
          Refresh
        </button>
      }
    >
      <form className="runtime-form" onSubmit={(event) => void handleSubmit(event)}>
        <div className="form-header">
          <h3 className="form-title">
            {editingUserId ? "Edit Client Account" : "Create Client Account"}
          </h3>
          <p className="form-subtitle">
            {editingUserId
              ? "Update credentials, scope, and status. Leave password empty to keep the current one."
              : "Create a new client login and lock it to one flow and one WhatsApp account."}
          </p>
        </div>

        <div className="form-grid">
          <label className="form-field">
            <span>Username</span>
            <input
              className="input-control"
              type="text"
              value={form.username}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  username: event.target.value,
                }))
              }
              placeholder="client_workspace"
            />
          </label>

          <label className="form-field">
            <span>Password</span>
            <input
              className="input-control"
              type="password"
              value={form.password}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  password: event.target.value,
                }))
              }
              placeholder={editingUserId ? "Leave empty to keep existing password" : "Minimum 8 characters"}
            />
          </label>

          <label className="form-field">
            <span>Display Name</span>
            <input
              className="input-control"
              type="text"
              value={form.displayName}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  displayName: event.target.value,
                }))
              }
              placeholder="Client team"
            />
          </label>

          <label className="form-field">
            <span>Status</span>
            <select
              className="input-control"
              value={form.status}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  status: event.target.value as ClientUserStatus,
                }))
              }
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>

          <label className="form-field">
            <span>Scoped Flow</span>
            <select
              className="input-control"
              value={form.scopedFlowId}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  scopedFlowId: event.target.value,
                }))
              }
            >
              <option value="">Select flow</option>
              {flows.map((flow) => (
                <option key={flow._id} value={flow._id}>
                  {flow.code}
                  {flow.version ? ` v${flow.version}` : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="form-field">
            <span>Scoped Channel Account</span>
            <select
              className="input-control"
              value={form.scopedChannelAccountId}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  scopedChannelAccountId: event.target.value,
                }))
              }
            >
              <option value="">Select channel account</option>
              {channelAccounts.map((channelAccount) => (
                <option key={channelAccount._id} value={channelAccount._id}>
                  {channelAccount.displayName || channelAccount.code}
                  {channelAccount.phoneNumber ? ` - ${channelAccount.phoneNumber}` : ""}
                </option>
              ))}
            </select>
          </label>
        </div>

        {errorMessage ? <InlineAlert tone="error" message={errorMessage} /> : null}
        {successMessage ? <InlineAlert tone="success" message={successMessage} /> : null}

        <div className="form-actions">
          <button type="submit" className="primary-button" disabled={isSubmitting}>
            {isSubmitting
              ? editingUserId
                ? "Updating..."
                : "Creating..."
              : editingUserId
                ? "Update Client Account"
                : "Create Client Account"}
          </button>
          {editingUserId ? (
            <button type="button" className="secondary-button" onClick={handleCancelEdit}>
              Cancel Edit
            </button>
          ) : null}
        </div>
      </form>

      <div className="list-filters">
        <div className="list-filters-controls">
          <label className="form-field list-filter-search">
            <span>Search</span>
            <input
              className="input-control"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search by username, display name, flow, or channel account..."
            />
          </label>

          <label className="form-field list-filter-field">
            <span>Status</span>
            <select
              className="input-control"
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as "all" | ClientUserStatus)
              }
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
        </div>

        <div className="list-filters-footer">
          <p className="result-count">
            Showing {filteredUsers.length} of {clientUsers.length}
          </p>
          <button
            type="button"
            className="secondary-button list-filters-reset"
            onClick={() => {
              setSearchQuery("");
              setStatusFilter("all");
            }}
          >
            Clear filters
          </button>
        </div>
      </div>

      {isLoading ? (
        <LoadingState text="Loading client accounts..." />
      ) : filteredUsers.length === 0 ? (
        <EmptyState
          title="No client accounts found."
          description="Create a client account to start assigning scoped access."
        />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Display Name</th>
                <th>Status</th>
                <th>Scoped Flow</th>
                <th>Scoped Channel Account</th>
                <th>Last Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user._id}>
                  <td>{user.username}</td>
                  <td>{user.displayName || "-"}</td>
                  <td>
                    <StatusBadge value={user.status} />
                  </td>
                  <td>
                    {user.scope?.flow ? `${user.scope.flow.code} v${user.scope.flow.version ?? 1}` : "-"}
                  </td>
                  <td>
                    {user.scope?.channelAccount
                      ? `${user.scope.channelAccount.displayName} (${user.scope.channelAccount.code})`
                      : "-"}
                  </td>
                  <td>{formatDateTime(user.updatedAt)}</td>
                  <td>
                    <button
                      type="button"
                      className="secondary-button table-action-button"
                      onClick={() => handleEdit(user)}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageSection>
  );
}

export default ClientAccountsPage;
