import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import axios from "axios";
import EmptyState from "../components/EmptyState";
import InlineAlert from "../components/InlineAlert";
import LoadingState from "../components/LoadingState";
import PageSection from "../components/PageSection";
import StatusBadge from "../components/StatusBadge";
import api from "../services/api";
import type { ApiSuccessResponse } from "../types/api";

type TeamUserStatus = "active" | "inactive";

interface TeamUserRecord {
  _id: string;
  username: string;
  role: "employee";
  status: TeamUserStatus;
  displayName?: string;
  updatedAt?: string;
}

interface TeamUserFormState {
  username: string;
  password: string;
  displayName: string;
  status: TeamUserStatus;
}

const INITIAL_FORM: TeamUserFormState = {
  username: "",
  password: "",
  displayName: "",
  status: "active",
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

function TeamUsersPage() {
  const [teamUsers, setTeamUsers] = useState<TeamUserRecord[]>([]);
  const [form, setForm] = useState<TeamUserFormState>(INITIAL_FORM);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | TeamUserStatus>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchTeamUsers = useCallback(async () => {
    const response = await api.get<ApiSuccessResponse<TeamUserRecord[]>>(
      "/api/v1/client/users"
    );
    setTeamUsers(response.data.data ?? []);
  }, []);

  const loadPageData = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      await fetchTeamUsers();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Failed to load team users."));
    } finally {
      setIsLoading(false);
    }
  }, [fetchTeamUsers]);

  useEffect(() => {
    void loadPageData();
  }, [loadPageData]);

  const filteredUsers = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return teamUsers.filter((user) => {
      if (statusFilter !== "all" && user.status !== statusFilter) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return [user.username, user.displayName ?? "", user.role]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [searchQuery, statusFilter, teamUsers]);

  const resetForm = useCallback(() => {
    setForm(INITIAL_FORM);
    setEditingUserId(null);
  }, []);

  const handleEdit = (user: TeamUserRecord) => {
    setEditingUserId(user._id);
    setSuccessMessage(null);
    setErrorMessage(null);
    setForm({
      username: user.username,
      password: "",
      displayName: user.displayName ?? "",
      status: user.status,
    });
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

    const payload: Record<string, unknown> = {
      username: normalizedUsername,
      displayName: form.displayName.trim(),
      status: form.status,
    };

    if (normalizedPassword) {
      payload.password = normalizedPassword;
    }

    setIsSubmitting(true);

    try {
      if (editingUserId) {
        await api.put<ApiSuccessResponse<TeamUserRecord>>(
          `/api/v1/client/users/${editingUserId}`,
          payload
        );
        setSuccessMessage("Employee user updated successfully.");
      } else {
        await api.post<ApiSuccessResponse<TeamUserRecord>>(
          "/api/v1/client/users",
          payload
        );
        setSuccessMessage("Employee user created successfully.");
      }

      await fetchTeamUsers();
      resetForm();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Failed to save employee user."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (user: TeamUserRecord) => {
    const confirmed = window.confirm(
      `Delete employee user "${user.username}"? This login will no longer be able to access the workspace.`
    );
    if (!confirmed) {
      return;
    }

    setErrorMessage(null);
    setSuccessMessage(null);
    setDeletingUserId(user._id);

    try {
      await api.delete<ApiSuccessResponse<TeamUserRecord>>(
        `/api/v1/client/users/${user._id}`
      );
      setSuccessMessage("Employee user deleted successfully.");
      if (editingUserId === user._id) {
        resetForm();
      }
      await fetchTeamUsers();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Failed to delete employee user."));
    } finally {
      setDeletingUserId(null);
    }
  };

  return (
    <PageSection
      title="Team Users"
      description="Create employee logins for this clinic workspace. Employees inherit this account's flow and WhatsApp scope."
      actions={
        <button
          type="button"
          className="secondary-button section-refresh"
          onClick={() => void loadPageData()}
        >
          Refresh
        </button>
      }
    >
      <form className="runtime-form" onSubmit={(event) => void handleSubmit(event)}>
        <div className="form-header">
          <h3 className="form-title">
            {editingUserId ? "Edit Employee User" : "Create Employee User"}
          </h3>
          <p className="form-subtitle">
            Employee users can sign in to this clinic workspace only. They cannot create more users.
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
                setForm((current) => ({ ...current, username: event.target.value }))
              }
              placeholder="employee_name"
            />
          </label>

          <label className="form-field">
            <span>Password</span>
            <input
              className="input-control"
              type="password"
              value={form.password}
              onChange={(event) =>
                setForm((current) => ({ ...current, password: event.target.value }))
              }
              placeholder={editingUserId ? "Leave empty to keep current password" : "Minimum 8 characters"}
            />
          </label>

          <label className="form-field">
            <span>Display Name</span>
            <input
              className="input-control"
              type="text"
              value={form.displayName}
              onChange={(event) =>
                setForm((current) => ({ ...current, displayName: event.target.value }))
              }
              placeholder="Reception employee"
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
                  status: event.target.value as TeamUserStatus,
                }))
              }
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
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
                ? "Update Employee"
                : "Create Employee"}
          </button>
          {editingUserId ? (
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                resetForm();
                setErrorMessage(null);
              }}
            >
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
              placeholder="Search by username or display name..."
            />
          </label>

          <label className="form-field list-filter-field">
            <span>Status</span>
            <select
              className="input-control"
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as "all" | TeamUserStatus)
              }
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
        </div>
      </div>

      {isLoading ? (
        <LoadingState text="Loading team users..." />
      ) : filteredUsers.length === 0 ? (
        <EmptyState
          title="No employee users found."
          description="Create an employee login for this clinic workspace."
        />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Display Name</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user._id}>
                  <td>{user.username}</td>
                  <td>{user.displayName || "-"}</td>
                  <td>Employee</td>
                  <td>
                    <StatusBadge value={user.status} />
                  </td>
                  <td>{formatDateTime(user.updatedAt)}</td>
                  <td>
                    <div className="table-actions">
                      <button
                        type="button"
                        className="secondary-button table-action-button"
                        onClick={() => handleEdit(user)}
                        disabled={deletingUserId === user._id}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="secondary-button table-action-button"
                        onClick={() => void handleDelete(user)}
                        disabled={deletingUserId === user._id}
                      >
                        {deletingUserId === user._id ? "Deleting..." : "Delete"}
                      </button>
                    </div>
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

export default TeamUsersPage;
