import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import FormModeBanner from "../components/FormModeBanner";
import ListFilters from "../components/ListFilters";
import PageSection from "../components/PageSection";
import SortableHeader from "../components/SortableHeader";
import StatusBadge from "../components/StatusBadge";
import TablePagination from "../components/TablePagination";
import useClientTable from "../hooks/useClientTable";
import api from "../services/api";
import type { ApiSuccessResponse } from "../types/api";

interface FlowRecord {
  _id: string;
  code: string;
  name: string;
  version: number;
  status: string;
  startStepCode: string;
  settings?: {
    allowResume?: boolean;
    sessionTimeoutMinutes?: number;
    createServiceRequestOnCompletion?: boolean;
    serviceId?: string;
    requestTypeId?: string;
  };
}

type FlowSortKey = "code" | "name" | "version" | "status" | "startStepCode";

interface ServiceOption {
  _id: string;
  code: string;
}

interface RequestTypeOption {
  _id: string;
  serviceId: string;
  code: string;
}

interface FlowCreateFormState {
  code: string;
  name: string;
  version: string;
  status: string;
  startStepCode: string;
  allowResume: boolean;
  sessionTimeoutMinutes: string;
  createServiceRequestOnCompletion: boolean;
  serviceId: string;
  requestTypeId: string;
}

const INITIAL_FORM: FlowCreateFormState = {
  code: "",
  name: "",
  version: "1",
  status: "draft",
  startStepCode: "",
  allowResume: false,
  sessionTimeoutMinutes: "",
  createServiceRequestOnCompletion: false,
  serviceId: "",
  requestTypeId: "",
};

function FlowsPage() {
  const [flows, setFlows] = useState<FlowRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [requestTypes, setRequestTypes] = useState<RequestTypeOption[]>([]);
  const [isLoadingSettingsRefs, setIsLoadingSettingsRefs] = useState(true);
  const [settingsRefsError, setSettingsRefsError] = useState<string | null>(null);

  const [form, setForm] = useState<FlowCreateFormState>(INITIAL_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const loadFlows = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await api.get<ApiSuccessResponse<FlowRecord[]>>("/api/v1/flows");

      if (!response.data.success) {
        throw new Error(response.data.message ?? "Failed to load flows.");
      }

      setFlows(Array.isArray(response.data.data) ? response.data.data : []);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const apiMessage = (error.response?.data as { message?: string } | undefined)?.message;
        setErrorMessage(apiMessage ?? error.message ?? "Failed to load flows.");
      } else {
        setErrorMessage("Failed to load flows.");
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadSettingsReferences = useCallback(async () => {
    setIsLoadingSettingsRefs(true);
    setSettingsRefsError(null);

    try {
      const [servicesResponse, requestTypesResponse] = await Promise.all([
        api.get<ApiSuccessResponse<ServiceOption[]>>("/api/v1/services"),
        api.get<ApiSuccessResponse<RequestTypeOption[]>>("/api/v1/request-types"),
      ]);

      const nextServices = Array.isArray(servicesResponse.data.data) ? servicesResponse.data.data : [];
      const nextRequestTypes = Array.isArray(requestTypesResponse.data.data)
        ? requestTypesResponse.data.data
        : [];

      setServices(nextServices);
      setRequestTypes(nextRequestTypes);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const apiMessage = (error.response?.data as { message?: string } | undefined)?.message;
        setSettingsRefsError(apiMessage ?? error.message ?? "Failed to load service/request type options.");
      } else {
        setSettingsRefsError("Failed to load service/request type options.");
      }
    } finally {
      setIsLoadingSettingsRefs(false);
    }
  }, []);

  useEffect(() => {
    void loadFlows();
    void loadSettingsReferences();
  }, [loadFlows, loadSettingsReferences]);

  const statusOptions = useMemo(() => {
    return Array.from(new Set(flows.map((flow) => flow.status).filter(Boolean))).sort();
  }, [flows]);

  const filteredRequestTypesByService = useMemo(() => {
    if (!form.serviceId) {
      return requestTypes;
    }

    return requestTypes.filter((requestType) => requestType.serviceId === form.serviceId);
  }, [form.serviceId, requestTypes]);

  useEffect(() => {
    if (!form.requestTypeId) {
      return;
    }

    const exists = filteredRequestTypesByService.some(
      (requestType) => requestType._id === form.requestTypeId
    );

    if (!exists) {
      setForm((previous) => ({ ...previous, requestTypeId: "" }));
    }
  }, [filteredRequestTypesByService, form.requestTypeId]);

  const filteredFlows = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return flows.filter((flow) => {
      if (statusFilter !== "all" && flow.status !== statusFilter) {
        return false;
      }

      if (!query) {
        return true;
      }

      const searchableText = [flow.code, flow.name, flow.startStepCode]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(query);
    });
  }, [flows, searchTerm, statusFilter]);

  const {
    sortKey,
    sortDirection,
    currentPage,
    pageSize,
    totalItems,
    totalPages,
    startItem,
    endItem,
    paginatedItems: paginatedFlows,
    handleSort,
    handlePageChange,
    handlePageSizeChange,
  } = useClientTable<FlowRecord, FlowSortKey>({
    items: filteredFlows,
    initialSortKey: "code",
    getSortValue: (flow, key) => flow[key] ?? "",
    resetPageKey: `${searchTerm}|${statusFilter}`,
  });

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(null);

    if (!form.code.trim() || !form.name.trim() || !form.startStepCode.trim()) {
      setSubmitError("code, name, and startStepCode are required.");
      return;
    }

    const parsedVersion = Number(form.version);
    if (!Number.isFinite(parsedVersion) || parsedVersion <= 0) {
      setSubmitError("version must be a positive number.");
      return;
    }

    let parsedSessionTimeout: number | undefined;
    if (form.sessionTimeoutMinutes.trim()) {
      const timeoutValue = Number(form.sessionTimeoutMinutes);
      if (!Number.isFinite(timeoutValue) || timeoutValue <= 0) {
        setSubmitError("sessionTimeoutMinutes must be a positive number.");
        return;
      }
      parsedSessionTimeout = timeoutValue;
    }

    if (form.createServiceRequestOnCompletion) {
      if (!form.serviceId) {
        setSubmitError("serviceId is required when createServiceRequestOnCompletion is enabled.");
        return;
      }

      if (!form.requestTypeId) {
        setSubmitError("requestTypeId is required when createServiceRequestOnCompletion is enabled.");
        return;
      }
    }

    const payload: Record<string, unknown> = {
      code: form.code.trim(),
      name: form.name.trim(),
      version: parsedVersion,
      status: form.status,
      startStepCode: form.startStepCode.trim(),
      settings: {
        allowResume: form.allowResume,
        createServiceRequestOnCompletion: form.createServiceRequestOnCompletion,
      },
    };

    if (parsedSessionTimeout !== undefined) {
      (payload.settings as { sessionTimeoutMinutes?: number }).sessionTimeoutMinutes =
        parsedSessionTimeout;
    }

    if (form.serviceId) {
      (payload.settings as { serviceId?: string }).serviceId = form.serviceId;
    }

    if (form.requestTypeId) {
      (payload.settings as { requestTypeId?: string }).requestTypeId = form.requestTypeId;
    }

    setIsSubmitting(true);
    try {
      const isEditMode = Boolean(editingId);
      const response = isEditMode
        ? await api.put<ApiSuccessResponse<unknown>>(`/api/v1/flows/${editingId}`, payload)
        : await api.post<ApiSuccessResponse<unknown>>("/api/v1/flows", payload);
      if (!response.data.success) {
        throw new Error(
          response.data.message ?? (isEditMode ? "Failed to update flow." : "Failed to create flow.")
        );
      }

      setSubmitSuccess(isEditMode ? "Flow updated successfully." : "Flow created successfully.");
      setForm(INITIAL_FORM);
      setEditingId(null);
      await loadFlows();
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const apiMessage = (error.response?.data as { message?: string } | undefined)?.message;
        setSubmitError(apiMessage ?? error.message ?? "Failed to save flow.");
      } else {
        setSubmitError("Failed to save flow.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const startEdit = (flow: FlowRecord) => {
    setEditingId(flow._id);
    setSubmitError(null);
    setSubmitSuccess(null);
    setForm({
      code: flow.code,
      name: flow.name,
      version: String(flow.version),
      status: flow.status,
      startStepCode: flow.startStepCode,
      allowResume: Boolean(flow.settings?.allowResume),
      sessionTimeoutMinutes:
        typeof flow.settings?.sessionTimeoutMinutes === "number"
          ? String(flow.settings.sessionTimeoutMinutes)
          : "",
      createServiceRequestOnCompletion: Boolean(flow.settings?.createServiceRequestOnCompletion),
      serviceId: typeof flow.settings?.serviceId === "string" ? flow.settings.serviceId : "",
      requestTypeId:
        typeof flow.settings?.requestTypeId === "string" ? flow.settings.requestTypeId : "",
    });
  };

  const cancelEditPrefill = () => {
    setEditingId(null);
    setSubmitError(null);
    setForm(INITIAL_FORM);
  };

  return (
    <PageSection
      title="Flows"
      description="Configured flows from the backend."
      onRefresh={() => {
        void loadFlows();
        void loadSettingsReferences();
      }}
    >
      <form className="runtime-form" onSubmit={(event) => void handleSubmit(event)}>
        <FormModeBanner entityName="Flow" editingId={editingId} />
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
            <span>Version</span>
            <input
              className="input-control"
              type="number"
              min={1}
              value={form.version}
              onChange={(event) => setForm((previous) => ({ ...previous, version: event.target.value }))}
              required
            />
          </label>

          <label className="form-field">
            <span>Status</span>
            <select
              className="input-control"
              value={form.status}
              onChange={(event) => setForm((previous) => ({ ...previous, status: event.target.value }))}
            >
              <option value="draft">draft</option>
              <option value="published">published</option>
              <option value="archived">archived</option>
            </select>
          </label>

          <label className="form-field">
            <span>Start Step Code</span>
            <input
              className="input-control"
              type="text"
              value={form.startStepCode}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, startStepCode: event.target.value }))
              }
              required
            />
          </label>

          <label className="form-field">
            <span>Session Timeout Minutes</span>
            <input
              className="input-control"
              type="number"
              min={1}
              value={form.sessionTimeoutMinutes}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, sessionTimeoutMinutes: event.target.value }))
              }
              placeholder="optional"
            />
          </label>

          <label className="form-field checkbox-field">
            <span>Allow Resume</span>
            <input
              type="checkbox"
              checked={form.allowResume}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, allowResume: event.target.checked }))
              }
            />
          </label>

          <label className="form-field checkbox-field">
            <span>Create Service Request On Completion</span>
            <input
              type="checkbox"
              checked={form.createServiceRequestOnCompletion}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  createServiceRequestOnCompletion: event.target.checked,
                }))
              }
            />
          </label>

          <label className="form-field">
            <span>Service (for auto-create)</span>
            <select
              className="input-control"
              value={form.serviceId}
              onChange={(event) => setForm((previous) => ({ ...previous, serviceId: event.target.value }))}
              required={form.createServiceRequestOnCompletion}
              disabled={isLoadingSettingsRefs}
            >
              <option value="">
                {form.createServiceRequestOnCompletion ? "Select service (required)" : "(optional)"}
              </option>
              {services.map((service) => (
                <option key={service._id} value={service._id}>
                  {service.code}
                </option>
              ))}
            </select>
          </label>

          <label className="form-field">
            <span>Request Type (for auto-create)</span>
            <select
              className="input-control"
              value={form.requestTypeId}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, requestTypeId: event.target.value }))
              }
              required={form.createServiceRequestOnCompletion}
              disabled={isLoadingSettingsRefs}
            >
              <option value="">
                {form.createServiceRequestOnCompletion
                  ? "Select request type (required)"
                  : "(optional)"}
              </option>
              {filteredRequestTypesByService.map((requestType) => (
                <option key={requestType._id} value={requestType._id}>
                  {requestType.code}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="form-actions">
          <button
            type="submit"
            className="primary-button"
            disabled={isSubmitting || (form.createServiceRequestOnCompletion && isLoadingSettingsRefs)}
          >
            {isSubmitting ? "Submitting..." : editingId ? "Update Flow" : "Create Flow"}
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

      {settingsRefsError ? (
        <div className="state-block state-error">
          <p>{settingsRefsError}</p>
        </div>
      ) : null}

      {isLoadingSettingsRefs ? <p className="state-text">Loading service/request type options...</p> : null}

      <ListFilters
        searchTerm={searchTerm}
        onSearchTermChange={setSearchTerm}
        searchPlaceholder="Search by code, name, start step..."
        filteredCount={filteredFlows.length}
        totalCount={flows.length}
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

      {isLoading ? <p className="state-text">Loading flows...</p> : null}

      {!isLoading && errorMessage ? (
        <div className="state-block state-error">
          <p>{errorMessage}</p>
        </div>
      ) : null}

      {!isLoading && !errorMessage && flows.length === 0 ? (
        <div className="state-block state-empty">
          <p>No flows found.</p>
        </div>
      ) : null}

      {!isLoading && !errorMessage && flows.length > 0 && filteredFlows.length === 0 ? (
        <div className="state-block state-empty">
          <p>No flows match the current filters.</p>
        </div>
      ) : null}

      {!isLoading && !errorMessage && filteredFlows.length > 0 ? (
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
                    label="Version"
                    sortKeyValue="version"
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
                  <SortableHeader
                    label="Start Step"
                    sortKeyValue="startStepCode"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedFlows.map((flow) => (
                  <tr key={flow._id}>
                    <td className="cell-mono">
                      <Link className="table-link" to={`/flows/${flow._id}`}>
                        {flow._id}
                      </Link>
                    </td>
                    <td>{flow.code}</td>
                    <td>{flow.name}</td>
                    <td>{flow.version}</td>
                    <td>
                      <StatusBadge value={flow.status} />
                    </td>
                    <td>{flow.startStepCode}</td>
                    <td>
                      <button
                        type="button"
                        className="secondary-button table-action-button"
                        onClick={() => startEdit(flow)}
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

export default FlowsPage;
