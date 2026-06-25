import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import axios from "axios";
import { useAuth } from "../auth/AuthContext";
import type { DashboardRole } from "../auth/auth.types";
import InlineAlert from "../components/InlineAlert";
import PageSection from "../components/PageSection";
import api from "../services/api";
import type { ApiSuccessResponse } from "../types/api";

interface DashboardUserRecord {
  _id: string;
  username: string;
  displayName: string;
  role: DashboardRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const ROLE_OPTIONS: Array<{ role: DashboardRole; label: string; description: string }> = [
  {
    role: "super_admin",
    label: "Super Admin",
    description: "System owner. Cannot be edited or deleted; only changes own password.",
  },
  {
    role: "admin",
    label: "Admin",
    description: "Full access to every dashboard page and WhatsApp connection tools.",
  },
  {
    role: "manager",
    label: "Manager",
    description: "Can manage campaigns, contact sections, and interested people. No WhatsApp pairing or setup pages.",
  },
  {
    role: "viewer",
    label: "Follow-up Agent",
    description: "Can only open Interested People for sales follow-up.",
  },
];

const EDITABLE_ROLE_OPTIONS = ROLE_OPTIONS.filter((option) => option.role !== "super_admin");

function getRoleLabel(role: DashboardRole): string {
  return ROLE_OPTIONS.find((option) => option.role === role)?.label ?? role;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const message = (error.response?.data as { message?: string } | undefined)?.message;
    return message || fallback;
  }
  return error instanceof Error ? error.message : fallback;
}

function UsersPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<DashboardUserRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    username: "",
    displayName: "",
    role: "manager" as DashboardRole,
    password: "",
  });

  const editingUser = useMemo(
    () => users.find((record) => record._id === editingUserId) ?? null,
    [editingUserId, users]
  );
  const isEditingSuperAdmin = editingUser?.role === "super_admin";

  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await api.get<ApiSuccessResponse<{ users: DashboardUserRecord[] }>>(
        "/api/v1/users"
      );
      setUsers(response.data.data?.users ?? []);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Failed to load users."));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  function resetForm() {
    setEditingUserId(null);
    setForm({ username: "", displayName: "", role: "manager", password: "" });
  }

  function startEdit(record: DashboardUserRecord) {
    setEditingUserId(record._id);
    setForm({
      username: record.username,
      displayName: record.displayName,
      role: record.role,
      password: "",
    });
    setSuccessMessage(null);
    setErrorMessage(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      if (editingUser) {
        const payload = isEditingSuperAdmin
          ? { password: form.password }
          : {
              displayName: form.displayName.trim(),
              role: form.role,
              ...(form.password ? { password: form.password } : {}),
            };
        await api.patch(`/api/v1/users/${editingUser._id}`, payload);
        setSuccessMessage("User updated.");
      } else {
        await api.post("/api/v1/users", {
          username: form.username.trim(),
          displayName: form.displayName.trim(),
          role: form.role,
          password: form.password,
        });
        setSuccessMessage("User created.");
      }

      resetForm();
      await loadUsers();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Failed to save user."));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(record: DashboardUserRecord) {
    if (record.role === "super_admin") {
      return;
    }
    const confirmed = window.confirm(`Delete ${record.displayName}?`);
    if (!confirmed) {
      return;
    }

    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await api.delete(`/api/v1/users/${record._id}`);
      setSuccessMessage("User deleted.");
      await loadUsers();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Failed to delete user."));
    }
  }

  return (
    <div className="page-stack">
      <PageSection
        title="User Management"
        description="Create dashboard users, assign roles, and protect the Super Admin account."
        onRefresh={() => void loadUsers()}
      >
        <div className="role-grid">
          {ROLE_OPTIONS.map((option) => (
            <div className="metric-card" key={option.role}>
              <span>{option.label}</span>
              <strong>{option.role === "viewer" ? "Interested only" : option.role === "manager" ? "No pairing" : "Full access"}</strong>
              <p>{option.description}</p>
            </div>
          ))}
        </div>

        {errorMessage ? <InlineAlert tone="error" message={errorMessage} /> : null}
        {successMessage ? <InlineAlert tone="success" message={successMessage} /> : null}

        <form className="app-form user-form" onSubmit={(event) => void handleSubmit(event)}>
          <div className="form-grid">
            <label className="form-field">
              <span>Username</span>
              <input
                value={form.username}
                disabled={Boolean(editingUser)}
                onChange={(event) => setForm((previous) => ({ ...previous, username: event.target.value }))}
                placeholder="agent01"
              />
            </label>
            <label className="form-field">
              <span>Name</span>
              <input
                value={form.displayName}
                disabled={isEditingSuperAdmin}
                onChange={(event) => setForm((previous) => ({ ...previous, displayName: event.target.value }))}
                placeholder="Full team member name"
                required={!isEditingSuperAdmin}
              />
            </label>
            <label className="form-field">
              <span>Role</span>
              <select
                value={form.role}
                disabled={isEditingSuperAdmin}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, role: event.target.value as DashboardRole }))
                }
              >
                {(isEditingSuperAdmin ? ROLE_OPTIONS : EDITABLE_ROLE_OPTIONS).map((option) => (
                  <option key={option.role} value={option.role}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>{editingUser ? "New password" : "Password"}</span>
              <input
                type="password"
                value={form.password}
                onChange={(event) => setForm((previous) => ({ ...previous, password: event.target.value }))}
                placeholder={editingUser ? "Leave empty to keep current password" : "At least 6 characters"}
                required={!editingUser || isEditingSuperAdmin}
              />
            </label>
          </div>

          <div className="form-actions">
            <button type="submit" className="primary-button" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : editingUser ? "Update User" : "Create User"}
            </button>
            {editingUser ? (
              <button type="button" className="secondary-button" onClick={resetForm}>
                Cancel Edit
              </button>
            ) : null}
          </div>
        </form>
      </PageSection>

      <PageSection title="Dashboard Users" description="Super Admin is locked; all other users can be edited or deleted.">
        {isLoading ? <InlineAlert tone="info" message="Loading users..." /> : null}
        {!isLoading && users.length === 0 ? <InlineAlert tone="empty" message="No users found." /> : null}
        {!isLoading && users.length > 0 ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Username</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((record) => {
                  const isSuperAdmin = record.role === "super_admin";
                  const canEdit = !isSuperAdmin || record._id === user?.userId;
                  return (
                    <tr key={record._id}>
                      <td>
                        <strong>{record.displayName}</strong>
                      </td>
                      <td>{record.username}</td>
                      <td>{getRoleLabel(record.role)}</td>
                      <td>{record.isActive ? "Active" : "Inactive"}</td>
                      <td>{new Date(record.updatedAt).toLocaleString()}</td>
                      <td>
                        <div className="table-actions">
                          <button
                            type="button"
                            className="secondary-button compact-button"
                            disabled={!canEdit}
                            onClick={() => startEdit(record)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="danger-button compact-button"
                            disabled={isSuperAdmin}
                            onClick={() => void handleDelete(record)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </PageSection>
    </div>
  );
}

export default UsersPage;
