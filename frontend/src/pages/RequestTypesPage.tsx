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

interface LocalizedName {
  ar?: string;
  en?: string;
  de?: string;
}

interface RequestTypeConfig {
  requiresHumanReview?: boolean;
  aiTaskCodes?: string[];
  formDefinitionCode?: string;
}

interface RequestTypeRecord {
  _id: string;
  serviceId: string;
  code: string;
  status: string;
  name?: LocalizedName;
  config?: RequestTypeConfig;
}

type RequestTypeSortKey = "code" | "status" | "serviceId";

interface ServiceOption {
  _id: string;
  code: string;
}

interface RequestTypeCreateFormState {
  serviceId: string;
  code: string;
  status: string;
  nameAr: string;
  nameEn: string;
  nameDe: string;
  requiresHumanReview: boolean;
  aiTaskCodes: string;
  formDefinitionCode: string;
}

function createInitialForm(serviceId = ""): RequestTypeCreateFormState {
  return {
    serviceId,
    code: "",
    status: "active",
    nameAr: "",
    nameEn: "",
    nameDe: "",
    requiresHumanReview: false,
    aiTaskCodes: "",
    formDefinitionCode: "",
  };
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function buildLocalizedNameSummary(name?: LocalizedName): string {
  if (!name) {
    return "-";
  }

  const parts: string[] = [];
  if (hasText(name.ar)) {
    parts.push(`ar: ${name.ar}`);
  }
  if (hasText(name.en)) {
    parts.push(`en: ${name.en}`);
  }
  if (hasText(name.de)) {
    parts.push(`de: ${name.de}`);
  }

  return parts.length > 0 ? parts.join(" | ") : "-";
}

function buildConfigSummary(config?: RequestTypeConfig): string {
  if (!config) {
    return "-";
  }

  const summaryParts: string[] = [];
  if (config.requiresHumanReview) {
    summaryParts.push("human review");
  }
  if (Array.isArray(config.aiTaskCodes) && config.aiTaskCodes.length > 0) {
    summaryParts.push(`ai tasks: ${config.aiTaskCodes.length}`);
  }
  if (hasText(config.formDefinitionCode)) {
    summaryParts.push(`form: ${config.formDefinitionCode}`);
  }

  return summaryParts.length > 0 ? summaryParts.join(", ") : "-";
}

function RequestTypesPage() {
  const [requestTypes, setRequestTypes] = useState<RequestTypeRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [serviceOptions, setServiceOptions] = useState<ServiceOption[]>([]);
  const [isLoadingServices, setIsLoadingServices] = useState(true);
  const [servicesErrorMessage, setServicesErrorMessage] = useState<string | null>(null);

  const [form, setForm] = useState<RequestTypeCreateFormState>(createInitialForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const loadRequestTypes = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await api.get<ApiSuccessResponse<RequestTypeRecord[]>>("/api/v1/request-types");

      if (!response.data.success) {
        throw new Error(response.data.message ?? "Failed to load request types.");
      }

      setRequestTypes(Array.isArray(response.data.data) ? response.data.data : []);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const apiMessage = (error.response?.data as { message?: string } | undefined)?.message;
        setErrorMessage(apiMessage ?? error.message ?? "Failed to load request types.");
      } else {
        setErrorMessage("Failed to load request types.");
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadServices = useCallback(async () => {
    setIsLoadingServices(true);
    setServicesErrorMessage(null);

    try {
      const response = await api.get<ApiSuccessResponse<ServiceOption[]>>("/api/v1/services");

      if (!response.data.success) {
        throw new Error(response.data.message ?? "Failed to load services.");
      }

      const nextServices = Array.isArray(response.data.data) ? response.data.data : [];
      setServiceOptions(nextServices);
      setForm((previous) => ({
        ...previous,
        serviceId: previous.serviceId || nextServices[0]?._id || "",
      }));
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const apiMessage = (error.response?.data as { message?: string } | undefined)?.message;
        setServicesErrorMessage(apiMessage ?? error.message ?? "Failed to load services.");
      } else {
        setServicesErrorMessage("Failed to load services.");
      }
    } finally {
      setIsLoadingServices(false);
    }
  }, []);

  useEffect(() => {
    void loadRequestTypes();
    void loadServices();
  }, [loadRequestTypes, loadServices]);

  const statusOptions = useMemo(() => {
    return Array.from(new Set(requestTypes.map((requestType) => requestType.status).filter(Boolean))).sort();
  }, [requestTypes]);

  const filteredRequestTypes = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return requestTypes.filter((requestType) => {
      if (statusFilter !== "all" && requestType.status !== statusFilter) {
        return false;
      }

      if (!query) {
        return true;
      }

      const searchableText = [
        requestType.code,
        requestType.serviceId,
        buildLocalizedNameSummary(requestType.name),
        buildConfigSummary(requestType.config),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(query);
    });
  }, [requestTypes, searchTerm, statusFilter]);

  const {
    sortKey,
    sortDirection,
    currentPage,
    pageSize,
    totalItems,
    totalPages,
    startItem,
    endItem,
    paginatedItems: paginatedRequestTypes,
    handleSort,
    handlePageChange,
    handlePageSizeChange,
  } = useClientTable<RequestTypeRecord, RequestTypeSortKey>({
    items: filteredRequestTypes,
    initialSortKey: "code",
    getSortValue: (requestType, key) => requestType[key] ?? "",
    resetPageKey: `${searchTerm}|${statusFilter}`,
  });

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(null);

    if (!form.serviceId) {
      setSubmitError("serviceId is required.");
      return;
    }
    if (!form.code.trim()) {
      setSubmitError("code is required.");
      return;
    }

    const parsedAiTaskCodes = form.aiTaskCodes
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

    const payload: Record<string, unknown> = {
      serviceId: form.serviceId,
      code: form.code.trim(),
      status: form.status,
      config: {
        requiresHumanReview: form.requiresHumanReview,
        aiTaskCodes: parsedAiTaskCodes,
      },
    };

    const localizedName: Record<string, string> = {};
    if (form.nameAr.trim()) {
      localizedName.ar = form.nameAr.trim();
    }
    if (form.nameEn.trim()) {
      localizedName.en = form.nameEn.trim();
    }
    if (form.nameDe.trim()) {
      localizedName.de = form.nameDe.trim();
    }
    if (Object.keys(localizedName).length > 0) {
      payload.name = localizedName;
    }

    if (form.formDefinitionCode.trim()) {
      (payload.config as Record<string, unknown>).formDefinitionCode = form.formDefinitionCode.trim();
    }

    setIsSubmitting(true);
    try {
      const isEditMode = Boolean(editingId);
      const response = isEditMode
        ? await api.put<ApiSuccessResponse<unknown>>(`/api/v1/request-types/${editingId}`, payload)
        : await api.post<ApiSuccessResponse<unknown>>("/api/v1/request-types", payload);
      if (!response.data.success) {
        throw new Error(
          response.data.message ??
            (isEditMode ? "Failed to update request type." : "Failed to create request type.")
        );
      }

      setSubmitSuccess(
        isEditMode ? "Request type updated successfully." : "Request type created successfully."
      );
      setForm(createInitialForm(serviceOptions[0]?._id || form.serviceId));
      setEditingId(null);
      await loadRequestTypes();
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const apiMessage = (error.response?.data as { message?: string } | undefined)?.message;
        setSubmitError(apiMessage ?? error.message ?? "Failed to save request type.");
      } else {
        setSubmitError("Failed to save request type.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const startEdit = (requestType: RequestTypeRecord) => {
    setEditingId(requestType._id);
    setSubmitError(null);
    setSubmitSuccess(null);
    setForm({
      serviceId: requestType.serviceId,
      code: requestType.code,
      status: requestType.status,
      nameAr: requestType.name?.ar ?? "",
      nameEn: requestType.name?.en ?? "",
      nameDe: requestType.name?.de ?? "",
      requiresHumanReview: Boolean(requestType.config?.requiresHumanReview),
      aiTaskCodes: Array.isArray(requestType.config?.aiTaskCodes)
        ? requestType.config?.aiTaskCodes.join(", ")
        : "",
      formDefinitionCode: requestType.config?.formDefinitionCode ?? "",
    });
  };

  const cancelEditPrefill = () => {
    setEditingId(null);
    setSubmitError(null);
    setForm(createInitialForm(serviceOptions[0]?._id || ""));
  };

  return (
    <PageSection
      title="Request Types"
      description="Request types loaded from the backend."
      onRefresh={() => {
        void loadRequestTypes();
        void loadServices();
      }}
    >
      <form className="runtime-form" onSubmit={(event) => void handleSubmit(event)}>
        <FormModeBanner entityName="Request Type" editingId={editingId} />
        <div className="form-grid">
          <label className="form-field">
            <span>Service</span>
            <select
              className="input-control"
              value={form.serviceId}
              onChange={(event) => setForm((previous) => ({ ...previous, serviceId: event.target.value }))}
              required
              disabled={isLoadingServices}
            >
              <option value="">Select service</option>
              {serviceOptions.map((service) => (
                <option key={service._id} value={service._id}>
                  {service.code}
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
            <span>Name (ar)</span>
            <input
              className="input-control"
              type="text"
              value={form.nameAr}
              onChange={(event) => setForm((previous) => ({ ...previous, nameAr: event.target.value }))}
            />
          </label>

          <label className="form-field">
            <span>Name (en)</span>
            <input
              className="input-control"
              type="text"
              value={form.nameEn}
              onChange={(event) => setForm((previous) => ({ ...previous, nameEn: event.target.value }))}
            />
          </label>

          <label className="form-field">
            <span>Name (de)</span>
            <input
              className="input-control"
              type="text"
              value={form.nameDe}
              onChange={(event) => setForm((previous) => ({ ...previous, nameDe: event.target.value }))}
            />
          </label>

          <label className="form-field checkbox-field">
            <span>Requires Human Review</span>
            <input
              type="checkbox"
              checked={form.requiresHumanReview}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, requiresHumanReview: event.target.checked }))
              }
            />
          </label>

          <label className="form-field">
            <span>AI Task Codes (comma-separated)</span>
            <input
              className="input-control"
              type="text"
              value={form.aiTaskCodes}
              onChange={(event) => setForm((previous) => ({ ...previous, aiTaskCodes: event.target.value }))}
            />
          </label>

          <label className="form-field">
            <span>Form Definition Code</span>
            <input
              className="input-control"
              type="text"
              value={form.formDefinitionCode}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, formDefinitionCode: event.target.value }))
              }
            />
          </label>
        </div>

        <div className="form-actions">
          <button type="submit" className="primary-button" disabled={isSubmitting || isLoadingServices}>
            {isSubmitting
              ? "Submitting..."
              : editingId
              ? "Update Request Type"
              : "Create Request Type"}
          </button>
          {editingId ? (
            <button type="button" className="secondary-button" onClick={cancelEditPrefill}>
              Cancel Edit
            </button>
          ) : null}
        </div>
      </form>

      {servicesErrorMessage ? (
        <div className="state-block state-error">
          <p>{servicesErrorMessage}</p>
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
        searchPlaceholder="Search by code, service id, localized name, config..."
        filteredCount={filteredRequestTypes.length}
        totalCount={requestTypes.length}
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

      {isLoading ? <p className="state-text">Loading request types...</p> : null}

      {!isLoading && errorMessage ? (
        <div className="state-block state-error">
          <p>{errorMessage}</p>
        </div>
      ) : null}

      {!isLoading && !errorMessage && requestTypes.length === 0 ? (
        <div className="state-block state-empty">
          <p>No request types found.</p>
        </div>
      ) : null}

      {!isLoading && !errorMessage && requestTypes.length > 0 && filteredRequestTypes.length === 0 ? (
        <div className="state-block state-empty">
          <p>No request types match the current filters.</p>
        </div>
      ) : null}

      {!isLoading && !errorMessage && filteredRequestTypes.length > 0 ? (
        <>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <SortableHeader
                    label="Service ID"
                    sortKeyValue="serviceId"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="Code"
                    sortKeyValue="code"
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
                  <th>Localized Name</th>
                  <th>Config</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRequestTypes.map((requestType) => (
                  <tr key={requestType._id}>
                    <td className="cell-mono">{requestType._id}</td>
                    <td className="cell-mono">{requestType.serviceId}</td>
                    <td>{requestType.code}</td>
                    <td>
                      <StatusBadge value={requestType.status} />
                    </td>
                    <td>{buildLocalizedNameSummary(requestType.name)}</td>
                    <td>{buildConfigSummary(requestType.config)}</td>
                    <td>
                      <button
                        type="button"
                        className="secondary-button table-action-button"
                        onClick={() => startEdit(requestType)}
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

export default RequestTypesPage;
