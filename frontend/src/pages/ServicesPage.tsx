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

interface ServiceConfig {
  requiresHumanReview?: boolean;
  aiEnabled?: boolean;
}

interface ServiceRecord {
  _id: string;
  code: string;
  category?: string;
  status: string;
  name?: LocalizedName;
  config?: ServiceConfig;
}

type ServiceSortKey = "code" | "category" | "status";

interface ServiceCreateFormState {
  code: string;
  category: string;
  status: string;
  nameAr: string;
  nameEn: string;
  nameDe: string;
  requiresHumanReview: boolean;
  aiEnabled: boolean;
}

const INITIAL_FORM: ServiceCreateFormState = {
  code: "",
  category: "",
  status: "active",
  nameAr: "",
  nameEn: "",
  nameDe: "",
  requiresHumanReview: false,
  aiEnabled: false,
};

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

function buildConfigSummary(config?: ServiceConfig): string {
  if (!config) {
    return "-";
  }

  const summaryParts: string[] = [];
  if (config.requiresHumanReview) {
    summaryParts.push("human review");
  }
  if (config.aiEnabled) {
    summaryParts.push("ai enabled");
  }

  return summaryParts.length > 0 ? summaryParts.join(", ") : "-";
}

function ServicesPage() {
  const [services, setServices] = useState<ServiceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [form, setForm] = useState<ServiceCreateFormState>(INITIAL_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const loadServices = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await api.get<ApiSuccessResponse<ServiceRecord[]>>("/api/v1/services");

      if (!response.data.success) {
        throw new Error(response.data.message ?? "Failed to load services.");
      }

      setServices(Array.isArray(response.data.data) ? response.data.data : []);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const apiMessage = (error.response?.data as { message?: string } | undefined)?.message;
        setErrorMessage(apiMessage ?? error.message ?? "Failed to load services.");
      } else {
        setErrorMessage("Failed to load services.");
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadServices();
  }, [loadServices]);

  const statusOptions = useMemo(() => {
    return Array.from(new Set(services.map((service) => service.status).filter(Boolean))).sort();
  }, [services]);

  const categoryOptions = useMemo(() => {
    return Array.from(
      new Set(
        services
          .map((service) => service.category)
          .filter((category): category is string => !!category?.trim())
      )
    ).sort();
  }, [services]);

  const filteredServices = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return services.filter((service) => {
      if (statusFilter !== "all" && service.status !== statusFilter) {
        return false;
      }
      if (categoryFilter !== "all" && service.category !== categoryFilter) {
        return false;
      }

      if (!query) {
        return true;
      }

      const searchableText = [
        service.code,
        service.category,
        buildLocalizedNameSummary(service.name),
        buildConfigSummary(service.config),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(query);
    });
  }, [services, searchTerm, statusFilter, categoryFilter]);

  const {
    sortKey,
    sortDirection,
    currentPage,
    pageSize,
    totalItems,
    totalPages,
    startItem,
    endItem,
    paginatedItems: paginatedServices,
    handleSort,
    handlePageChange,
    handlePageSizeChange,
  } = useClientTable<ServiceRecord, ServiceSortKey>({
    items: filteredServices,
    initialSortKey: "code",
    getSortValue: (service, key) => service[key] ?? "",
    resetPageKey: `${searchTerm}|${statusFilter}|${categoryFilter}`,
  });

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(null);

    if (!form.code.trim()) {
      setSubmitError("code is required.");
      return;
    }

    const payload: Record<string, unknown> = {
      code: form.code.trim(),
      status: form.status,
      config: {
        requiresHumanReview: form.requiresHumanReview,
        aiEnabled: form.aiEnabled,
      },
    };

    if (form.category.trim()) {
      payload.category = form.category.trim();
    }

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

    setIsSubmitting(true);
    try {
      const isEditMode = Boolean(editingId);
      const response = isEditMode
        ? await api.put<ApiSuccessResponse<unknown>>(`/api/v1/services/${editingId}`, payload)
        : await api.post<ApiSuccessResponse<unknown>>("/api/v1/services", payload);
      if (!response.data.success) {
        throw new Error(
          response.data.message ?? (isEditMode ? "Failed to update service." : "Failed to create service.")
        );
      }

      setSubmitSuccess(isEditMode ? "Service updated successfully." : "Service created successfully.");
      setForm(INITIAL_FORM);
      setEditingId(null);
      await loadServices();
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const apiMessage = (error.response?.data as { message?: string } | undefined)?.message;
        setSubmitError(apiMessage ?? error.message ?? "Failed to save service.");
      } else {
        setSubmitError("Failed to save service.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const startEdit = (service: ServiceRecord) => {
    setEditingId(service._id);
    setSubmitError(null);
    setSubmitSuccess(null);
    setForm({
      code: service.code,
      category: service.category ?? "",
      status: service.status,
      nameAr: service.name?.ar ?? "",
      nameEn: service.name?.en ?? "",
      nameDe: service.name?.de ?? "",
      requiresHumanReview: Boolean(service.config?.requiresHumanReview),
      aiEnabled: Boolean(service.config?.aiEnabled),
    });
  };

  const cancelEditPrefill = () => {
    setEditingId(null);
    setSubmitError(null);
    setForm(INITIAL_FORM);
  };

  return (
    <PageSection
      title="Services"
      description="Services loaded from the backend."
      onRefresh={() => void loadServices()}
    >
      <form className="runtime-form" onSubmit={(event) => void handleSubmit(event)}>
        <FormModeBanner entityName="Service" editingId={editingId} />
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
            <span>Category</span>
            <input
              className="input-control"
              type="text"
              value={form.category}
              onChange={(event) => setForm((previous) => ({ ...previous, category: event.target.value }))}
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

          <label className="form-field checkbox-field">
            <span>AI Enabled</span>
            <input
              type="checkbox"
              checked={form.aiEnabled}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, aiEnabled: event.target.checked }))
              }
            />
          </label>
        </div>

        <div className="form-actions">
          <button type="submit" className="primary-button" disabled={isSubmitting}>
            {isSubmitting ? "Submitting..." : editingId ? "Update Service" : "Create Service"}
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
        searchPlaceholder="Search by code, category, localized name, config..."
        filteredCount={filteredServices.length}
        totalCount={services.length}
        onReset={() => {
          setSearchTerm("");
          setStatusFilter("all");
          setCategoryFilter("all");
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
          <span>Category</span>
          <select
            className="input-control"
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
          >
            <option value="all">All</option>
            {categoryOptions.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>
      </ListFilters>

      {isLoading ? <p className="state-text">Loading services...</p> : null}

      {!isLoading && errorMessage ? (
        <div className="state-block state-error">
          <p>{errorMessage}</p>
        </div>
      ) : null}

      {!isLoading && !errorMessage && services.length === 0 ? (
        <div className="state-block state-empty">
          <p>No services found.</p>
        </div>
      ) : null}

      {!isLoading && !errorMessage && services.length > 0 && filteredServices.length === 0 ? (
        <div className="state-block state-empty">
          <p>No services match the current filters.</p>
        </div>
      ) : null}

      {!isLoading && !errorMessage && filteredServices.length > 0 ? (
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
                    label="Category"
                    sortKeyValue="category"
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
                {paginatedServices.map((service) => (
                  <tr key={service._id}>
                    <td className="cell-mono">{service._id}</td>
                    <td>{service.code}</td>
                    <td>{service.category || "-"}</td>
                    <td>
                      <StatusBadge value={service.status} />
                    </td>
                    <td>{buildLocalizedNameSummary(service.name)}</td>
                    <td>{buildConfigSummary(service.config)}</td>
                    <td>
                      <button
                        type="button"
                        className="secondary-button table-action-button"
                        onClick={() => startEdit(service)}
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

export default ServicesPage;
