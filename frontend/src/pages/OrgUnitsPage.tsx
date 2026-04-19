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

interface OrgUnitName {
  ar?: string;
  en?: string;
  de?: string;
}

interface OrgUnitContactInfo {
  phone?: string;
  email?: string;
  address?: string;
}

interface OrgUnitRecord {
  _id: string;
  code: string;
  type: string;
  status: string;
  name?: OrgUnitName;
  contactInfo?: OrgUnitContactInfo;
  settings?: {
    registeredUsersOnly?: boolean;
    insuranceQuarterValidation?: boolean;
  };
}

type OrgUnitSortKey = "code" | "type" | "status" | "phone";

interface OrgUnitCreateFormState {
  code: string;
  type: string;
  status: string;
  nameAr: string;
  nameEn: string;
  nameDe: string;
  contactPhone: string;
  contactEmail: string;
  contactAddress: string;
  registeredUsersOnly: boolean;
  insuranceQuarterValidation: boolean;
}

const INITIAL_FORM: OrgUnitCreateFormState = {
  code: "",
  type: "clinic",
  status: "active",
  nameAr: "",
  nameEn: "",
  nameDe: "",
  contactPhone: "",
  contactEmail: "",
  contactAddress: "",
  registeredUsersOnly: false,
  insuranceQuarterValidation: false,
};

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function buildLocalizedNameSummary(name?: OrgUnitName): string {
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

function OrgUnitsPage() {
  const [orgUnits, setOrgUnits] = useState<OrgUnitRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [form, setForm] = useState<OrgUnitCreateFormState>(INITIAL_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  const loadOrgUnits = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await api.get<ApiSuccessResponse<OrgUnitRecord[]>>("/api/v1/org-units");

      if (!response.data.success) {
        throw new Error(response.data.message ?? "Failed to load org units.");
      }

      setOrgUnits(Array.isArray(response.data.data) ? response.data.data : []);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const apiMessage = (error.response?.data as { message?: string } | undefined)?.message;
        setErrorMessage(apiMessage ?? error.message ?? "Failed to load org units.");
      } else {
        setErrorMessage("Failed to load org units.");
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOrgUnits();
  }, [loadOrgUnits]);

  const statusOptions = useMemo(() => {
    return Array.from(new Set(orgUnits.map((orgUnit) => orgUnit.status).filter(Boolean))).sort();
  }, [orgUnits]);

  const typeOptions = useMemo(() => {
    return Array.from(new Set(orgUnits.map((orgUnit) => orgUnit.type).filter(Boolean))).sort();
  }, [orgUnits]);

  const filteredOrgUnits = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return orgUnits.filter((orgUnit) => {
      if (statusFilter !== "all" && orgUnit.status !== statusFilter) {
        return false;
      }
      if (typeFilter !== "all" && orgUnit.type !== typeFilter) {
        return false;
      }

      if (!query) {
        return true;
      }

      const searchableText = [
        orgUnit.code,
        orgUnit.type,
        orgUnit.name?.ar,
        orgUnit.name?.en,
        orgUnit.name?.de,
        orgUnit.contactInfo?.phone,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(query);
    });
  }, [orgUnits, searchTerm, statusFilter, typeFilter]);

  const {
    sortKey,
    sortDirection,
    currentPage,
    pageSize,
    totalItems,
    totalPages,
    startItem,
    endItem,
    paginatedItems: paginatedOrgUnits,
    handleSort,
    handlePageChange,
    handlePageSizeChange,
  } = useClientTable<OrgUnitRecord, OrgUnitSortKey>({
    items: filteredOrgUnits,
    initialSortKey: "code",
    getSortValue: (orgUnit, key) => {
      if (key === "phone") {
        return orgUnit.contactInfo?.phone ?? "";
      }
      return orgUnit[key] ?? "";
    },
    resetPageKey: `${searchTerm}|${statusFilter}|${typeFilter}`,
  });

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(null);

    if (!form.code.trim()) {
      setSubmitError("code is required.");
      return;
    }

    if (!form.type || !form.status) {
      setSubmitError("type and status are required.");
      return;
    }

    if (!form.nameAr.trim() && !form.nameEn.trim() && !form.nameDe.trim()) {
      setSubmitError("At least one localized name is required.");
      return;
    }

    const payload: Record<string, unknown> = {
      code: form.code.trim(),
      type: form.type,
      status: form.status,
      name: {},
      settings: {
        registeredUsersOnly: form.registeredUsersOnly,
        insuranceQuarterValidation: form.insuranceQuarterValidation,
      },
    };

    if (form.nameAr.trim()) {
      (payload.name as Record<string, string>).ar = form.nameAr.trim();
    }
    if (form.nameEn.trim()) {
      (payload.name as Record<string, string>).en = form.nameEn.trim();
    }
    if (form.nameDe.trim()) {
      (payload.name as Record<string, string>).de = form.nameDe.trim();
    }

    const contactInfo: Record<string, string> = {};
    if (form.contactPhone.trim()) {
      contactInfo.phone = form.contactPhone.trim();
    }
    if (form.contactEmail.trim()) {
      contactInfo.email = form.contactEmail.trim();
    }
    if (form.contactAddress.trim()) {
      contactInfo.address = form.contactAddress.trim();
    }
    if (Object.keys(contactInfo).length > 0) {
      payload.contactInfo = contactInfo;
    }

    setIsSubmitting(true);
    try {
      const isEditMode = Boolean(editingId);
      const response = isEditMode
        ? await api.put<ApiSuccessResponse<unknown>>(`/api/v1/org-units/${editingId}`, payload)
        : await api.post<ApiSuccessResponse<unknown>>("/api/v1/org-units", payload);
      if (!response.data.success) {
        throw new Error(
          response.data.message ?? (isEditMode ? "Failed to update org unit." : "Failed to create org unit.")
        );
      }

      setSubmitSuccess(isEditMode ? "Org unit updated successfully." : "Org unit created successfully.");
      setForm(INITIAL_FORM);
      setEditingId(null);
      await loadOrgUnits();
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const apiMessage = (error.response?.data as { message?: string } | undefined)?.message;
        setSubmitError(apiMessage ?? error.message ?? "Failed to save org unit.");
      } else {
        setSubmitError("Failed to save org unit.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const startEdit = (orgUnit: OrgUnitRecord) => {
    setEditingId(orgUnit._id);
    setSubmitError(null);
    setSubmitSuccess(null);
    setForm({
      code: orgUnit.code,
      type: orgUnit.type,
      status: orgUnit.status,
      nameAr: orgUnit.name?.ar ?? "",
      nameEn: orgUnit.name?.en ?? "",
      nameDe: orgUnit.name?.de ?? "",
      contactPhone: orgUnit.contactInfo?.phone ?? "",
      contactEmail: orgUnit.contactInfo?.email ?? "",
      contactAddress: orgUnit.contactInfo?.address ?? "",
      registeredUsersOnly: Boolean(orgUnit.settings?.registeredUsersOnly),
      insuranceQuarterValidation: Boolean(orgUnit.settings?.insuranceQuarterValidation),
    });
  };

  const cancelEditPrefill = () => {
    setEditingId(null);
    setSubmitError(null);
    setForm(INITIAL_FORM);
  };

  return (
    <PageSection
      title="Org Units"
      description="Organization units loaded from the backend."
      onRefresh={() => void loadOrgUnits()}
    >
      <form className="runtime-form" onSubmit={(event) => void handleSubmit(event)}>
        <FormModeBanner entityName="Org Unit" editingId={editingId} />
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
            <span>Type</span>
            <select
              className="input-control"
              value={form.type}
              onChange={(event) => setForm((previous) => ({ ...previous, type: event.target.value }))}
            >
              <option value="clinic">clinic</option>
              <option value="pharmacy">pharmacy</option>
              <option value="workshop">workshop</option>
              <option value="branch">branch</option>
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

          <label className="form-field">
            <span>Contact Phone</span>
            <input
              className="input-control"
              type="text"
              value={form.contactPhone}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, contactPhone: event.target.value }))
              }
            />
          </label>

          <label className="form-field">
            <span>Contact Email</span>
            <input
              className="input-control"
              type="text"
              value={form.contactEmail}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, contactEmail: event.target.value }))
              }
            />
          </label>

          <label className="form-field form-field-full">
            <span>Contact Address</span>
            <input
              className="input-control"
              type="text"
              value={form.contactAddress}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, contactAddress: event.target.value }))
              }
            />
          </label>

          <label className="form-field checkbox-field">
            <span>Registered Users Only</span>
            <input
              type="checkbox"
              checked={form.registeredUsersOnly}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, registeredUsersOnly: event.target.checked }))
              }
            />
          </label>

          <label className="form-field checkbox-field">
            <span>Insurance Quarter Validation</span>
            <input
              type="checkbox"
              checked={form.insuranceQuarterValidation}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  insuranceQuarterValidation: event.target.checked,
                }))
              }
            />
          </label>
        </div>

        <div className="form-actions">
          <button type="submit" className="primary-button" disabled={isSubmitting}>
            {isSubmitting ? "Submitting..." : editingId ? "Update Org Unit" : "Create Org Unit"}
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
        searchPlaceholder="Search by code, type, names, phone..."
        filteredCount={filteredOrgUnits.length}
        totalCount={orgUnits.length}
        onReset={() => {
          setSearchTerm("");
          setStatusFilter("all");
          setTypeFilter("all");
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
          <span>Type</span>
          <select
            className="input-control"
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
          >
            <option value="all">All</option>
            {typeOptions.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
      </ListFilters>

      {isLoading ? <p className="state-text">Loading org units...</p> : null}

      {!isLoading && errorMessage ? (
        <div className="state-block state-error">
          <p>{errorMessage}</p>
        </div>
      ) : null}

      {!isLoading && !errorMessage && orgUnits.length === 0 ? (
        <div className="state-block state-empty">
          <p>No org units found.</p>
        </div>
      ) : null}

      {!isLoading && !errorMessage && orgUnits.length > 0 && filteredOrgUnits.length === 0 ? (
        <div className="state-block state-empty">
          <p>No org units match the current filters.</p>
        </div>
      ) : null}

      {!isLoading && !errorMessage && filteredOrgUnits.length > 0 ? (
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
                    label="Type"
                    sortKeyValue="type"
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
                  <SortableHeader
                    label="Phone"
                    sortKeyValue="phone"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedOrgUnits.map((orgUnit) => (
                  <tr key={orgUnit._id}>
                    <td className="cell-mono">{orgUnit._id}</td>
                    <td>{orgUnit.code}</td>
                    <td>{orgUnit.type}</td>
                    <td>
                      <StatusBadge value={orgUnit.status} />
                    </td>
                    <td>{buildLocalizedNameSummary(orgUnit.name)}</td>
                    <td>{orgUnit.contactInfo?.phone || "-"}</td>
                    <td>
                      <button
                        type="button"
                        className="secondary-button table-action-button"
                        onClick={() => startEdit(orgUnit)}
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

export default OrgUnitsPage;
