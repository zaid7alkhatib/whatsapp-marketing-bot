import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import ListFilters from "../components/ListFilters";
import PageSection from "../components/PageSection";
import SortableHeader from "../components/SortableHeader";
import StatusBadge from "../components/StatusBadge";
import TablePagination from "../components/TablePagination";
import useClientTable from "../hooks/useClientTable";
import api from "../services/api";
import type { ApiSuccessResponse } from "../types/api";

interface MedicalAppointmentRecord {
  _id: string;
  reference?: string;
  statusCode: string;
  priorityCode?: string;
  language?: string;
  requestTypeLabel?: string;
  clinicLabel?: string;
  submittedAt: string;
  isAppointment?: boolean;
  requestedAppointmentDateLabel?: string;
  requestedAppointmentTimeLabel?: string;
  person?: {
    fullName?: string;
    phone?: string;
    contactReference?: string;
  };
}

type AppointmentSortKey =
  | "reference"
  | "personName"
  | "clinicLabel"
  | "statusCode"
  | "submittedAt"
  | "appointmentSlot";

function formatDateTime(value?: string): string {
  if (!value) {
    return "-";
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return parsedDate.toLocaleString();
}

function buildAppointmentSlot(record: MedicalAppointmentRecord): string {
  const dateLabel = record.requestedAppointmentDateLabel ?? "";
  const timeLabel = record.requestedAppointmentTimeLabel ?? "";
  return [dateLabel, timeLabel].filter(Boolean).join(" at ");
}

function MedicalAppointmentsPage() {
  const { user } = useAuth();
  const isClientUser = user?.role === "user";
  const [appointments, setAppointments] = useState<MedicalAppointmentRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState(isClientUser ? "new" : "all");
  const [languageFilter, setLanguageFilter] = useState("all");

  const loadAppointments = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await api.get<ApiSuccessResponse<MedicalAppointmentRecord[]>>(
        "/api/v1/service-requests"
      );

      if (!response.data.success) {
        throw new Error(response.data.message ?? "Failed to load medical appointments.");
      }

      const records = Array.isArray(response.data.data) ? response.data.data : [];
      setAppointments(records.filter((record) => record.isAppointment));
    } catch (error) {
      const apiMessage = axios.isAxiosError(error)
        ? (error.response?.data as { message?: string } | undefined)?.message
        : undefined;
      setErrorMessage(apiMessage ?? "Failed to load medical appointments.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAppointments();
  }, [loadAppointments]);

  useEffect(() => {
    if (isClientUser && statusFilter === "all") {
      setStatusFilter("new");
    }
  }, [isClientUser, statusFilter]);

  const statusOptions = useMemo(
    () =>
      Array.from(new Set(appointments.map((appointment) => appointment.statusCode).filter(Boolean))).sort(),
    [appointments]
  );

  const languageOptions = useMemo(
    () =>
      Array.from(
        new Set(
          appointments
            .map((appointment) => appointment.language)
            .filter((language): language is string => Boolean(language?.trim()))
        )
      ).sort(),
    [appointments]
  );

  const filteredAppointments = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return appointments.filter((appointment) => {
      if (statusFilter !== "all" && appointment.statusCode !== statusFilter) {
        return false;
      }

      if (languageFilter !== "all" && appointment.language !== languageFilter) {
        return false;
      }

      if (!query) {
        return true;
      }

      const searchableText = [
        appointment.reference,
        appointment.person?.fullName,
        appointment.person?.phone,
        appointment.person?.contactReference,
        appointment.clinicLabel,
        appointment.requestTypeLabel,
        appointment.requestedAppointmentDateLabel,
        appointment.requestedAppointmentTimeLabel,
        appointment.statusCode,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(query);
    });
  }, [appointments, searchTerm, statusFilter, languageFilter]);

  const {
    sortKey,
    sortDirection,
    currentPage,
    pageSize,
    totalItems,
    totalPages,
    startItem,
    endItem,
    paginatedItems,
    handleSort,
    handlePageChange,
    handlePageSizeChange,
  } = useClientTable<MedicalAppointmentRecord, AppointmentSortKey>({
    items: filteredAppointments,
    initialSortKey: "submittedAt",
    getSortValue: (appointment, key) => {
      if (key === "submittedAt") {
        return new Date(appointment.submittedAt).getTime();
      }
      if (key === "personName") {
        return appointment.person?.fullName ?? "";
      }
      if (key === "appointmentSlot") {
        return buildAppointmentSlot(appointment);
      }
      return appointment[key] ?? "";
    },
    resetPageKey: `${searchTerm}|${statusFilter}|${languageFilter}`,
  });

  return (
    <PageSection
      title="Medical Appointments"
      description={
        isClientUser
          ? "Start with unresolved booking requests, then switch to all appointment history only when needed."
          : "Approve or reschedule appointment requests from the clinic WhatsApp flow."
      }
      onRefresh={() => void loadAppointments()}
    >
      {isClientUser ? (
        <div className="list-mode-toggle" role="tablist" aria-label="Appointment visibility">
          <button
            type="button"
            className={
              statusFilter === "new"
                ? "list-mode-toggle-button list-mode-toggle-button-active"
                : "list-mode-toggle-button"
            }
            onClick={() => setStatusFilter("new")}
          >
            {`Not Opened (${appointments.filter((appointment) => appointment.statusCode === "new").length})`}
          </button>
          <button
            type="button"
            className={
              statusFilter === "all"
                ? "list-mode-toggle-button list-mode-toggle-button-active"
                : "list-mode-toggle-button"
            }
            onClick={() => setStatusFilter("all")}
          >
            View All
          </button>
        </div>
      ) : null}

      <ListFilters
        searchTerm={searchTerm}
        onSearchTermChange={setSearchTerm}
        searchPlaceholder="Search by request number, patient, phone, clinic, or requested slot..."
        filteredCount={filteredAppointments.length}
        totalCount={appointments.length}
        onReset={() => {
          setSearchTerm("");
          setStatusFilter(isClientUser ? "new" : "all");
          setLanguageFilter("all");
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
          <span>Language</span>
          <select
            className="input-control"
            value={languageFilter}
            onChange={(event) => setLanguageFilter(event.target.value)}
          >
            <option value="all">All</option>
            {languageOptions.map((language) => (
              <option key={language} value={language}>
                {language}
              </option>
            ))}
          </select>
        </label>
      </ListFilters>

      {isLoading ? <p className="state-text">Loading medical appointments...</p> : null}

      {!isLoading && errorMessage ? (
        <div className="state-block state-error">
          <p>{errorMessage}</p>
        </div>
      ) : null}

      {!isLoading && !errorMessage && appointments.length === 0 ? (
        <div className="state-block state-empty">
          <p>No medical appointment requests found.</p>
        </div>
      ) : null}

      {!isLoading && !errorMessage && appointments.length > 0 && filteredAppointments.length === 0 ? (
        <div className="state-block state-empty">
          <p>No medical appointment requests match the current filters.</p>
        </div>
      ) : null}

      {!isLoading && !errorMessage && filteredAppointments.length > 0 ? (
        <>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <SortableHeader
                    label="Request"
                    sortKeyValue="reference"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="Patient"
                    sortKeyValue="personName"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <th>Phone</th>
                  <SortableHeader
                    label="Clinic"
                    sortKeyValue="clinicLabel"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="Requested Slot"
                    sortKeyValue="appointmentSlot"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="Status"
                    sortKeyValue="statusCode"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="Submitted At"
                    sortKeyValue="submittedAt"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                </tr>
              </thead>
              <tbody>
                {paginatedItems.map((appointment) => (
                  <tr key={appointment._id}>
                    <td className="cell-wrap">
                      <Link className="table-link" to={`/service-requests/${appointment._id}`}>
                        {`Open Request ${appointment.reference ?? appointment._id.slice(-6)}`}
                      </Link>
                    </td>
                    <td className="cell-wrap">{appointment.person?.fullName || "Not provided"}</td>
                    <td className="cell-wrap">
                      {appointment.person?.phone || appointment.person?.contactReference || "-"}
                    </td>
                    <td className="cell-wrap">{appointment.clinicLabel || "-"}</td>
                    <td className="cell-wrap">{buildAppointmentSlot(appointment) || "Pending slot"}</td>
                    <td>
                      <StatusBadge value={appointment.statusCode} />
                    </td>
                    <td>{formatDateTime(appointment.submittedAt)}</td>
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

export default MedicalAppointmentsPage;
