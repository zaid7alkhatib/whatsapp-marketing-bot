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
  code: "",
  name: "",
  provider: "telegram_bot_api",
  status: "active",
  capabilityText: true,
  capabilityImage: false,
  capabilityDocument: false,
  capabilityAudio: false,
  capabilityButtons: false,
  capabilityLists: false,
};

function buildCapabilitiesSummary(capabilities?: ChannelCapabilities): string {
  if (!capabilities) {
    return "-";
  }

  const enabledCapabilities = Object.entries(capabilities)
    .filter(([, isEnabled]) => isEnabled === true)
    .map(([capability]) => capability);

  return enabledCapabilities.length > 0 ? enabledCapabilities.join(", ") : "-";
}

function ChannelsPage() {
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
        throw new Error(response.data.message ?? "Failed to load channels.");
      }

      setChannels(Array.isArray(response.data.data) ? response.data.data : []);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const apiMessage = (error.response?.data as { message?: string } | undefined)?.message;
        setErrorMessage(apiMessage ?? error.message ?? "Failed to load channels.");
      } else {
        setErrorMessage("Failed to load channels.");
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

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
        buildCapabilitiesSummary(channel.capabilities),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(query);
    });
  }, [channels, searchTerm, statusFilter, providerFilter]);

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
      setSubmitError("code, name, provider, and status are required.");
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
          response.data.message ?? (isEditMode ? "Failed to update channel." : "Failed to create channel.")
        );
      }

      setSubmitSuccess(isEditMode ? "Channel updated successfully." : "Channel created successfully.");
      setForm(INITIAL_FORM);
      setEditingId(null);
      await loadChannels();
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const apiMessage = (error.response?.data as { message?: string } | undefined)?.message;
        setSubmitError(apiMessage ?? error.message ?? "Failed to save channel.");
      } else {
        setSubmitError("Failed to save channel.");
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
      title="Channels"
      description="Channels loaded from the backend."
      onRefresh={() => void loadChannels()}
    >
      <form className="runtime-form" onSubmit={(event) => void handleSubmit(event)}>
        <FormModeBanner entityName="Channel" editingId={editingId} />
        <div className="form-grid">
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
            <span>Name</span>
            <input
              className="input-control"
              type="text"
              value={form.name}
              onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))}
              required
            />
          </label>

          <label className="form-field">
            <span>Provider</span>
            <select
              className="input-control"
              value={form.provider}
              onChange={(event) => setForm((previous) => ({ ...previous, provider: event.target.value }))}
            >
              <option value="telegram_bot_api">telegram_bot_api</option>
              <option value="baileys">baileys</option>
              <option value="meta">meta</option>
              <option value="twilio">twilio</option>
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

          <label className="form-field checkbox-field">
            <span>Capability: text</span>
            <input
              type="checkbox"
              checked={form.capabilityText}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, capabilityText: event.target.checked }))
              }
            />
          </label>

          <label className="form-field checkbox-field">
            <span>Capability: image</span>
            <input
              type="checkbox"
              checked={form.capabilityImage}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, capabilityImage: event.target.checked }))
              }
            />
          </label>

          <label className="form-field checkbox-field">
            <span>Capability: document</span>
            <input
              type="checkbox"
              checked={form.capabilityDocument}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, capabilityDocument: event.target.checked }))
              }
            />
          </label>

          <label className="form-field checkbox-field">
            <span>Capability: audio</span>
            <input
              type="checkbox"
              checked={form.capabilityAudio}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, capabilityAudio: event.target.checked }))
              }
            />
          </label>

          <label className="form-field checkbox-field">
            <span>Capability: buttons</span>
            <input
              type="checkbox"
              checked={form.capabilityButtons}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, capabilityButtons: event.target.checked }))
              }
            />
          </label>

          <label className="form-field checkbox-field">
            <span>Capability: lists</span>
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
            {isSubmitting ? "Submitting..." : editingId ? "Update Channel" : "Create Channel"}
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
        searchPlaceholder="Search by code, name, provider, capabilities..."
        filteredCount={filteredChannels.length}
        totalCount={channels.length}
        onReset={() => {
          setSearchTerm("");
          setStatusFilter("all");
          setProviderFilter("all");
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
          <span>Provider</span>
          <select
            className="input-control"
            value={providerFilter}
            onChange={(event) => setProviderFilter(event.target.value)}
          >
            <option value="all">All</option>
            {providerOptions.map((provider) => (
              <option key={provider} value={provider}>
                {provider}
              </option>
            ))}
          </select>
        </label>
      </ListFilters>

      {isLoading ? <p className="state-text">Loading channels...</p> : null}

      {!isLoading && errorMessage ? (
        <div className="state-block state-error">
          <p>{errorMessage}</p>
        </div>
      ) : null}

      {!isLoading && !errorMessage && channels.length === 0 ? (
        <div className="state-block state-empty">
          <p>No channels found.</p>
        </div>
      ) : null}

      {!isLoading && !errorMessage && channels.length > 0 && filteredChannels.length === 0 ? (
        <div className="state-block state-empty">
          <p>No channels match the current filters.</p>
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
                    label="Code"
                    sortKeyValue="code"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="Name"
                    sortKeyValue="name"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="Provider"
                    sortKeyValue="provider"
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
                  <th>Capabilities</th>
                  <th>Actions</th>
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
                    <td>{buildCapabilitiesSummary(channel.capabilities)}</td>
                    <td>
                      <button
                        type="button"
                        className="secondary-button table-action-button"
                        onClick={() => startEdit(channel)}
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

export default ChannelsPage;
