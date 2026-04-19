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

interface BusinessPartnerRecord {
  _id: string;
  type: string;
  subtype: string;
  status: string;
  names?: {
    fullName?: string;
    firstName?: string;
    lastName?: string;
  };
  personalInfo?: {
    dateOfBirth?: string;
    gender?: string;
  };
  contactInfo?: {
    phone?: string;
    email?: string;
  };
  preferredLanguage?: string;
  identifiers?: {
    externalRef?: string;
    insuranceNumber?: string;
    patientNumber?: string;
  };
  tags?: string[];
}

type BusinessPartnerSortKey = "fullName" | "type" | "subtype" | "status" | "preferredLanguage";

interface BusinessPartnerCreateFormState {
  type: string;
  subtype: string;
  status: string;
  fullName: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  phone: string;
  email: string;
  preferredLanguage: string;
  externalRef: string;
  insuranceNumber: string;
  patientNumber: string;
  tags: string;
}

const INITIAL_FORM: BusinessPartnerCreateFormState = {
  type: "person",
  subtype: "patient",
  status: "active",
  fullName: "",
  firstName: "",
  lastName: "",
  dateOfBirth: "",
  gender: "",
  phone: "",
  email: "",
  preferredLanguage: "",
  externalRef: "",
  insuranceNumber: "",
  patientNumber: "",
  tags: "",
};

function BusinessPartnersPage() {
  const [partners, setPartners] = useState<BusinessPartnerRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [form, setForm] = useState<BusinessPartnerCreateFormState>(INITIAL_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [subtypeFilter, setSubtypeFilter] = useState("all");
  const [preferredLanguageFilter, setPreferredLanguageFilter] = useState("all");

  const loadPartners = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await api.get<ApiSuccessResponse<BusinessPartnerRecord[]>>(
        "/api/v1/business-partners"
      );

      if (!response.data.success) {
        throw new Error(response.data.message ?? "Failed to load business partners.");
      }

      setPartners(Array.isArray(response.data.data) ? response.data.data : []);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const apiMessage = (error.response?.data as { message?: string } | undefined)?.message;
        setErrorMessage(apiMessage ?? error.message ?? "Failed to load business partners.");
      } else {
        setErrorMessage("Failed to load business partners.");
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPartners();
  }, [loadPartners]);

  const statusOptions = useMemo(() => {
    return Array.from(new Set(partners.map((partner) => partner.status).filter(Boolean))).sort();
  }, [partners]);

  const typeOptions = useMemo(() => {
    return Array.from(new Set(partners.map((partner) => partner.type).filter(Boolean))).sort();
  }, [partners]);

  const subtypeOptions = useMemo(() => {
    return Array.from(new Set(partners.map((partner) => partner.subtype).filter(Boolean))).sort();
  }, [partners]);

  const preferredLanguageOptions = useMemo(() => {
    return Array.from(
      new Set(
        partners
          .map((partner) => partner.preferredLanguage)
          .filter((language): language is string => !!language?.trim())
      )
    ).sort();
  }, [partners]);

  const filteredPartners = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return partners.filter((partner) => {
      if (statusFilter !== "all" && partner.status !== statusFilter) {
        return false;
      }
      if (typeFilter !== "all" && partner.type !== typeFilter) {
        return false;
      }
      if (subtypeFilter !== "all" && partner.subtype !== subtypeFilter) {
        return false;
      }
      if (
        preferredLanguageFilter !== "all" &&
        partner.preferredLanguage !== preferredLanguageFilter
      ) {
        return false;
      }

      if (!query) {
        return true;
      }

      const searchableText = [
        partner.names?.fullName,
        partner.type,
        partner.subtype,
        partner.contactInfo?.phone,
        partner.contactInfo?.email,
        partner.preferredLanguage,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(query);
    });
  }, [partners, searchTerm, statusFilter, typeFilter, subtypeFilter, preferredLanguageFilter]);

  const {
    sortKey,
    sortDirection,
    currentPage,
    pageSize,
    totalItems,
    totalPages,
    startItem,
    endItem,
    paginatedItems: paginatedPartners,
    handleSort,
    handlePageChange,
    handlePageSizeChange,
  } = useClientTable<BusinessPartnerRecord, BusinessPartnerSortKey>({
    items: filteredPartners,
    initialSortKey: "fullName",
    getSortValue: (partner, key) => {
      if (key === "fullName") {
        return partner.names?.fullName ?? "";
      }
      return partner[key] ?? "";
    },
    resetPageKey: `${searchTerm}|${statusFilter}|${typeFilter}|${subtypeFilter}|${preferredLanguageFilter}`,
  });

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(null);

    if (!form.fullName.trim()) {
      setSubmitError("fullName is required.");
      return;
    }

    const payload: Record<string, unknown> = {
      type: form.type,
      subtype: form.subtype,
      status: form.status,
      names: {
        fullName: form.fullName.trim(),
      },
    };

    if (form.firstName.trim()) {
      (payload.names as Record<string, string>).firstName = form.firstName.trim();
    }
    if (form.lastName.trim()) {
      (payload.names as Record<string, string>).lastName = form.lastName.trim();
    }

    const personalInfo: Record<string, string> = {};
    if (form.dateOfBirth.trim()) {
      personalInfo.dateOfBirth = form.dateOfBirth.trim();
    }
    if (form.gender.trim()) {
      personalInfo.gender = form.gender.trim();
    }
    if (Object.keys(personalInfo).length > 0) {
      payload.personalInfo = personalInfo;
    }

    const contactInfo: Record<string, string> = {};
    if (form.phone.trim()) {
      contactInfo.phone = form.phone.trim();
    }
    if (form.email.trim()) {
      contactInfo.email = form.email.trim();
    }
    if (Object.keys(contactInfo).length > 0) {
      payload.contactInfo = contactInfo;
    }

    if (form.preferredLanguage.trim()) {
      payload.preferredLanguage = form.preferredLanguage.trim();
    }

    const identifiers: Record<string, string> = {};
    if (form.externalRef.trim()) {
      identifiers.externalRef = form.externalRef.trim();
    }
    if (form.insuranceNumber.trim()) {
      identifiers.insuranceNumber = form.insuranceNumber.trim();
    }
    if (form.patientNumber.trim()) {
      identifiers.patientNumber = form.patientNumber.trim();
    }
    if (Object.keys(identifiers).length > 0) {
      payload.identifiers = identifiers;
    }

    const parsedTags = form.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
    if (parsedTags.length > 0) {
      payload.tags = parsedTags;
    }

    setIsSubmitting(true);
    try {
      const isEditMode = Boolean(editingId);
      const response = isEditMode
        ? await api.put<ApiSuccessResponse<unknown>>(
            `/api/v1/business-partners/${editingId}`,
            payload
          )
        : await api.post<ApiSuccessResponse<unknown>>("/api/v1/business-partners", payload);
      if (!response.data.success) {
        throw new Error(
          response.data.message ??
            (isEditMode ? "Failed to update business partner." : "Failed to create business partner.")
        );
      }

      setSubmitSuccess(
        isEditMode ? "Business partner updated successfully." : "Business partner created successfully."
      );
      setForm(INITIAL_FORM);
      setEditingId(null);
      await loadPartners();
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const apiMessage = (error.response?.data as { message?: string } | undefined)?.message;
        setSubmitError(apiMessage ?? error.message ?? "Failed to save business partner.");
      } else {
        setSubmitError("Failed to save business partner.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const startEdit = (partner: BusinessPartnerRecord) => {
    setEditingId(partner._id);
    setSubmitError(null);
    setSubmitSuccess(null);
    setForm({
      type: partner.type,
      subtype: partner.subtype,
      status: partner.status,
      fullName: partner.names?.fullName ?? "",
      firstName: partner.names?.firstName ?? "",
      lastName: partner.names?.lastName ?? "",
      dateOfBirth: partner.personalInfo?.dateOfBirth ?? "",
      gender: partner.personalInfo?.gender ?? "",
      phone: partner.contactInfo?.phone ?? "",
      email: partner.contactInfo?.email ?? "",
      preferredLanguage: partner.preferredLanguage ?? "",
      externalRef: partner.identifiers?.externalRef ?? "",
      insuranceNumber: partner.identifiers?.insuranceNumber ?? "",
      patientNumber: partner.identifiers?.patientNumber ?? "",
      tags: Array.isArray(partner.tags) ? partner.tags.join(", ") : "",
    });
  };

  const cancelEditPrefill = () => {
    setEditingId(null);
    setSubmitError(null);
    setForm(INITIAL_FORM);
  };

  return (
    <PageSection
      title="Business Partners"
      description="Business partners loaded from the backend."
      onRefresh={() => void loadPartners()}
    >
      <form className="runtime-form" onSubmit={(event) => void handleSubmit(event)}>
        <FormModeBanner entityName="Business Partner" editingId={editingId} />
        <div className="form-grid">
          <label className="form-field">
            <span>Type</span>
            <select
              className="input-control"
              value={form.type}
              onChange={(event) => setForm((previous) => ({ ...previous, type: event.target.value }))}
            >
              <option value="person">person</option>
              <option value="company">company</option>
            </select>
          </label>

          <label className="form-field">
            <span>Subtype</span>
            <select
              className="input-control"
              value={form.subtype}
              onChange={(event) => setForm((previous) => ({ ...previous, subtype: event.target.value }))}
            >
              <option value="patient">patient</option>
              <option value="customer">customer</option>
              <option value="lead">lead</option>
              <option value="partner">partner</option>
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
            <span>Full Name</span>
            <input
              className="input-control"
              type="text"
              value={form.fullName}
              onChange={(event) => setForm((previous) => ({ ...previous, fullName: event.target.value }))}
              required
            />
          </label>

          <label className="form-field">
            <span>First Name</span>
            <input
              className="input-control"
              type="text"
              value={form.firstName}
              onChange={(event) => setForm((previous) => ({ ...previous, firstName: event.target.value }))}
            />
          </label>

          <label className="form-field">
            <span>Last Name</span>
            <input
              className="input-control"
              type="text"
              value={form.lastName}
              onChange={(event) => setForm((previous) => ({ ...previous, lastName: event.target.value }))}
            />
          </label>

          <label className="form-field">
            <span>Date of Birth</span>
            <input
              className="input-control"
              type="date"
              value={form.dateOfBirth}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, dateOfBirth: event.target.value }))
              }
            />
          </label>

          <label className="form-field">
            <span>Gender</span>
            <input
              className="input-control"
              type="text"
              value={form.gender}
              onChange={(event) => setForm((previous) => ({ ...previous, gender: event.target.value }))}
            />
          </label>

          <label className="form-field">
            <span>Phone</span>
            <input
              className="input-control"
              type="text"
              value={form.phone}
              onChange={(event) => setForm((previous) => ({ ...previous, phone: event.target.value }))}
            />
          </label>

          <label className="form-field">
            <span>Email</span>
            <input
              className="input-control"
              type="text"
              value={form.email}
              onChange={(event) => setForm((previous) => ({ ...previous, email: event.target.value }))}
            />
          </label>

          <label className="form-field">
            <span>Preferred Language</span>
            <input
              className="input-control"
              type="text"
              value={form.preferredLanguage}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, preferredLanguage: event.target.value }))
              }
            />
          </label>

          <label className="form-field">
            <span>External Ref</span>
            <input
              className="input-control"
              type="text"
              value={form.externalRef}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, externalRef: event.target.value }))
              }
            />
          </label>

          <label className="form-field">
            <span>Insurance Number</span>
            <input
              className="input-control"
              type="text"
              value={form.insuranceNumber}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, insuranceNumber: event.target.value }))
              }
            />
          </label>

          <label className="form-field">
            <span>Patient Number</span>
            <input
              className="input-control"
              type="text"
              value={form.patientNumber}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, patientNumber: event.target.value }))
              }
            />
          </label>

          <label className="form-field form-field-full">
            <span>Tags (comma-separated)</span>
            <input
              className="input-control"
              type="text"
              value={form.tags}
              onChange={(event) => setForm((previous) => ({ ...previous, tags: event.target.value }))}
            />
          </label>
        </div>

        <div className="form-actions">
          <button type="submit" className="primary-button" disabled={isSubmitting}>
            {isSubmitting
              ? "Submitting..."
              : editingId
              ? "Update Business Partner"
              : "Create Business Partner"}
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
        searchPlaceholder="Search by full name, type, subtype, phone, email, language..."
        filteredCount={filteredPartners.length}
        totalCount={partners.length}
        onReset={() => {
          setSearchTerm("");
          setStatusFilter("all");
          setTypeFilter("all");
          setSubtypeFilter("all");
          setPreferredLanguageFilter("all");
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

        <label className="form-field list-filter-field">
          <span>Subtype</span>
          <select
            className="input-control"
            value={subtypeFilter}
            onChange={(event) => setSubtypeFilter(event.target.value)}
          >
            <option value="all">All</option>
            {subtypeOptions.map((subtype) => (
              <option key={subtype} value={subtype}>
                {subtype}
              </option>
            ))}
          </select>
        </label>

        <label className="form-field list-filter-field">
          <span>Preferred Language</span>
          <select
            className="input-control"
            value={preferredLanguageFilter}
            onChange={(event) => setPreferredLanguageFilter(event.target.value)}
          >
            <option value="all">All</option>
            {preferredLanguageOptions.map((language) => (
              <option key={language} value={language}>
                {language}
              </option>
            ))}
          </select>
        </label>
      </ListFilters>

      {isLoading ? <p className="state-text">Loading business partners...</p> : null}

      {!isLoading && errorMessage ? (
        <div className="state-block state-error">
          <p>{errorMessage}</p>
        </div>
      ) : null}

      {!isLoading && !errorMessage && partners.length === 0 ? (
        <div className="state-block state-empty">
          <p>No business partners found.</p>
        </div>
      ) : null}

      {!isLoading && !errorMessage && partners.length > 0 && filteredPartners.length === 0 ? (
        <div className="state-block state-empty">
          <p>No business partners match the current filters.</p>
        </div>
      ) : null}

      {!isLoading && !errorMessage && filteredPartners.length > 0 ? (
        <>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <SortableHeader
                    label="Type"
                    sortKeyValue="type"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="Subtype"
                    sortKeyValue="subtype"
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
                    label="Full Name"
                    sortKeyValue="fullName"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <th>Phone</th>
                  <th>Email</th>
                  <SortableHeader
                    label="Language"
                    sortKeyValue="preferredLanguage"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedPartners.map((partner) => (
                  <tr key={partner._id}>
                    <td className="cell-mono">{partner._id}</td>
                    <td>{partner.type}</td>
                    <td>{partner.subtype}</td>
                    <td>
                      <StatusBadge value={partner.status} />
                    </td>
                    <td>{partner.names?.fullName || "-"}</td>
                    <td>{partner.contactInfo?.phone || "-"}</td>
                    <td>{partner.contactInfo?.email || "-"}</td>
                    <td>{partner.preferredLanguage || "-"}</td>
                    <td>
                      <button
                        type="button"
                        className="secondary-button table-action-button"
                        onClick={() => startEdit(partner)}
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

export default BusinessPartnersPage;
