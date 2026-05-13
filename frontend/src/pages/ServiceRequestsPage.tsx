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
import { useClientLocale } from "../i18n/ClientLocaleContext";
import api from "../services/api";
import type { ApiSuccessResponse } from "../types/api";
import {
  getLocalizedRequestTypeLabel,
  getLocalizedServiceAreaLabel,
} from "../utils/requestLabels";

interface ServiceRequestPersonSummary {
  fullName?: string;
  phone?: string;
  email?: string;
  dateOfBirth?: string;
  contactReference?: string;
}

interface ServiceRequestRecord {
  _id: string;
  reference?: string;
  statusCode: string;
  isAppointment?: boolean;
  priorityCode?: string;
  language?: string;
  submittedAt: string;
  requestTypeLabel?: string;
  serviceLabel?: string;
  clinicLabel?: string;
  person?: ServiceRequestPersonSummary;
  snapshots?: {
    requestType?: { code?: string };
    service?: { code?: string };
  };
}

type ServiceRequestSortKey =
  | "_id"
  | "statusCode"
  | "priorityCode"
  | "language"
  | "submittedAt"
  | "personName"
  | "clinicLabel"
  | "requestTypeLabel";

function formatDateTime(value?: string): string {
  if (!value) {
    return "-";
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return "-";
  }

  return parsedDate.toLocaleString();
}

function ServiceRequestsPage() {
  const { user } = useAuth();
  const isClientUser = user?.role === "user" || user?.role === "employee";
  const { language, t } = useClientLocale();

  const [serviceRequests, setServiceRequests] = useState<ServiceRequestRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState(isClientUser ? "new" : "all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [languageFilter, setLanguageFilter] = useState("all");

  const loadServiceRequests = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setIsLoading(true);
    }
    setErrorMessage(null);

    try {
      const response = await api.get<ApiSuccessResponse<ServiceRequestRecord[]>>(
        "/api/v1/service-requests"
      );

      if (!response.data.success) {
        throw new Error(response.data.message ?? t("serviceRequests.loading"));
      }

      setServiceRequests(Array.isArray(response.data.data) ? response.data.data : []);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const apiMessage = (error.response?.data as { message?: string } | undefined)?.message;
        setErrorMessage(apiMessage ?? error.message ?? t("serviceRequests.loading"));
      } else {
        setErrorMessage(t("serviceRequests.loading"));
      }
    } finally {
      if (!options?.silent) {
        setIsLoading(false);
      }
    }
  }, [t]);

  useEffect(() => {
    void loadServiceRequests();
  }, [loadServiceRequests]);

  useEffect(() => {
    const refresh = () => {
      void loadServiceRequests({ silent: true });
    };

    window.addEventListener("service-requests:changed", refresh);
    window.addEventListener("focus", refresh);
    const intervalId = window.setInterval(refresh, 10000);

    return () => {
      window.removeEventListener("service-requests:changed", refresh);
      window.removeEventListener("focus", refresh);
      window.clearInterval(intervalId);
    };
  }, [loadServiceRequests]);

  const statusOptions = useMemo(() => {
    return Array.from(
      new Set(serviceRequests.map((serviceRequest) => serviceRequest.statusCode).filter(Boolean))
    ).sort();
  }, [serviceRequests]);

  const priorityOptions = useMemo(() => {
    return Array.from(
      new Set(
        serviceRequests
          .map((serviceRequest) => serviceRequest.priorityCode)
          .filter((priority): priority is string => !!priority?.trim())
      )
    ).sort();
  }, [serviceRequests]);

  const languageOptions = useMemo(() => {
    return Array.from(
      new Set(
        serviceRequests
          .map((serviceRequest) => serviceRequest.language)
          .filter((language): language is string => !!language?.trim())
      )
    ).sort();
  }, [serviceRequests]);

  const filteredServiceRequests = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return serviceRequests.filter((serviceRequest) => {
      if (isClientUser && serviceRequest.isAppointment) {
        return false;
      }
      if (statusFilter !== "all" && serviceRequest.statusCode !== statusFilter) {
        return false;
      }
      if (!isClientUser && priorityFilter !== "all" && serviceRequest.priorityCode !== priorityFilter) {
        return false;
      }
      if (languageFilter !== "all" && serviceRequest.language !== languageFilter) {
        return false;
      }

      if (!query) {
        return true;
      }

      const searchableText = [
        serviceRequest._id,
        serviceRequest.reference,
        serviceRequest.statusCode,
        serviceRequest.priorityCode,
        serviceRequest.language,
        serviceRequest.requestTypeLabel,
        serviceRequest.serviceLabel,
        serviceRequest.clinicLabel,
        serviceRequest.person?.fullName,
        serviceRequest.person?.phone,
        serviceRequest.person?.email,
        serviceRequest.person?.contactReference,
        serviceRequest.snapshots?.service?.code,
        serviceRequest.snapshots?.requestType?.code,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(query);
    });
  }, [serviceRequests, searchTerm, statusFilter, priorityFilter, languageFilter, isClientUser]);

  const {
    sortKey,
    sortDirection,
    currentPage,
    pageSize,
    totalItems,
    totalPages,
    startItem,
    endItem,
    paginatedItems: paginatedServiceRequests,
    handleSort,
    handlePageChange,
    handlePageSizeChange,
  } = useClientTable<ServiceRequestRecord, ServiceRequestSortKey>({
    items: filteredServiceRequests,
    initialSortKey: "submittedAt",
    getSortValue: (serviceRequest, key) => {
      if (key === "submittedAt") {
        return new Date(serviceRequest.submittedAt).getTime();
      }
      if (key === "personName") {
        return serviceRequest.person?.fullName ?? "";
      }
      if (key === "clinicLabel") {
        return serviceRequest.clinicLabel ?? "";
      }
      if (key === "requestTypeLabel") {
        return serviceRequest.requestTypeLabel ?? "";
      }
      return serviceRequest[key] ?? "";
    },
    resetPageKey: `${searchTerm}|${statusFilter}|${priorityFilter}|${languageFilter}|${user?.role ?? "guest"}`,
  });

  return (
    <PageSection
      title={isClientUser ? t("serviceRequests.title") : "Service Requests"}
      description={
        isClientUser
          ? t("serviceRequests.description")
          : "Service requests loaded from the backend."
      }
      onRefresh={() => void loadServiceRequests()}
    >
      {isClientUser ? (
        <div className="list-mode-toggle" role="tablist" aria-label="Request visibility">
          <button
            type="button"
            className={
              statusFilter === "new"
                ? "list-mode-toggle-button list-mode-toggle-button-active"
                : "list-mode-toggle-button"
            }
            onClick={() => setStatusFilter("new")}
          >
            {t("common.notOpened", {
              count: serviceRequests.filter(
                (request) => !request.isAppointment && request.statusCode === "new",
              ).length,
            })}
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
            {t("common.viewAll")}
          </button>
        </div>
      ) : null}

      <ListFilters
        searchTerm={searchTerm}
        onSearchTermChange={setSearchTerm}
        searchPlaceholder={
          isClientUser
            ? t("serviceRequests.searchPlaceholder")
            : "Search by id, status, priority, language, service or request type..."
        }
        filteredCount={filteredServiceRequests.length}
        totalCount={serviceRequests.filter((serviceRequest) => !isClientUser || !serviceRequest.isAppointment).length}
        onReset={() => {
          setSearchTerm("");
          setStatusFilter(isClientUser ? "new" : "all");
          setPriorityFilter("all");
          setLanguageFilter("all");
        }}
      >
        <label className="form-field list-filter-field">
          <span>{isClientUser ? t("common.status") : "Status"}</span>
          <select
            className="input-control"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">{isClientUser ? t("serviceRequests.allVisible") : "All"}</option>
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>

        {!isClientUser ? (
          <label className="form-field list-filter-field">
            <span>Priority</span>
            <select
              className="input-control"
              value={priorityFilter}
              onChange={(event) => setPriorityFilter(event.target.value)}
            >
              <option value="all">All</option>
              {priorityOptions.map((priority) => (
                <option key={priority} value={priority}>
                  {priority}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="form-field list-filter-field">
          <span>{isClientUser ? t("common.language") : "Language"}</span>
          <select
            className="input-control"
            value={languageFilter}
            onChange={(event) => setLanguageFilter(event.target.value)}
          >
            <option value="all">{isClientUser ? t("common.all") : "All"}</option>
            {languageOptions.map((language) => (
              <option key={language} value={language}>
                {language}
              </option>
            ))}
          </select>
        </label>
      </ListFilters>

      {isLoading ? (
        <p className="state-text">
          {isClientUser ? t("serviceRequests.loading") : "Loading service requests..."}
        </p>
      ) : null}

      {!isLoading && errorMessage ? (
        <div className="state-block state-error">
          <p>{errorMessage}</p>
        </div>
      ) : null}

      {!isLoading &&
      !errorMessage &&
      serviceRequests.filter((serviceRequest) => !isClientUser || !serviceRequest.isAppointment).length === 0 ? (
        <div className="state-block state-empty">
          <p>{isClientUser ? t("serviceRequests.empty") : "No service requests found."}</p>
        </div>
      ) : null}

      {!isLoading && !errorMessage && serviceRequests.length > 0 && filteredServiceRequests.length === 0 ? (
        <div className="state-block state-empty">
          <p>
            {isClientUser
              ? t("serviceRequests.noMatches")
              : "No service requests match the current filters."}
          </p>
        </div>
      ) : null}

      {!isLoading && !errorMessage && filteredServiceRequests.length > 0 ? (
        <>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                {isClientUser ? (
                  <tr>
                    <th>{t("serviceRequests.request")}</th>
                    <SortableHeader
                      label={t("serviceRequests.person")}
                      sortKeyValue="personName"
                      activeSortKey={sortKey}
                      sortDirection={sortDirection}
                      onSort={handleSort}
                    />
                    <th>{t("serviceRequests.phone")}</th>
                    <SortableHeader
                      label={t("serviceRequests.clinic")}
                      sortKeyValue="clinicLabel"
                      activeSortKey={sortKey}
                      sortDirection={sortDirection}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label={t("serviceRequests.serviceNeeded")}
                      sortKeyValue="requestTypeLabel"
                      activeSortKey={sortKey}
                      sortDirection={sortDirection}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label={t("serviceRequests.status")}
                      sortKeyValue="statusCode"
                      activeSortKey={sortKey}
                      sortDirection={sortDirection}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label={t("serviceRequests.submittedAt")}
                      sortKeyValue="submittedAt"
                      activeSortKey={sortKey}
                      sortDirection={sortDirection}
                      onSort={handleSort}
                    />
                  </tr>
                ) : (
                  <tr>
                    <SortableHeader
                      label="ID"
                      sortKeyValue="_id"
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
                      label="Priority"
                      sortKeyValue="priorityCode"
                      activeSortKey={sortKey}
                      sortDirection={sortDirection}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Language"
                      sortKeyValue="language"
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
                    <th>Request Type</th>
                    <th>Service</th>
                  </tr>
                )}
              </thead>
              <tbody>
                {paginatedServiceRequests.map((serviceRequest) => (
                  <tr key={serviceRequest._id}>
                    {isClientUser ? (
                      <>
                        <td className="cell-wrap">
                          <Link className="table-link" to={`/service-requests/${serviceRequest._id}`}>
                            {t("serviceRequests.openRequest", {
                              reference: serviceRequest.reference ?? serviceRequest._id.slice(-6),
                            })}
                          </Link>
                          <div className="muted-text">
                            {getLocalizedServiceAreaLabel(serviceRequest.serviceLabel, language)}
                          </div>
                        </td>
                        <td className="cell-wrap">
                          <div>{serviceRequest.person?.fullName || t("common.notProvided")}</div>
                          {serviceRequest.person?.dateOfBirth ? (
                            <div className="muted-text">
                              {t("serviceRequests.dateOfBirth", {
                                value: serviceRequest.person.dateOfBirth,
                              })}
                            </div>
                          ) : null}
                        </td>
                        <td className="cell-wrap">
                          {serviceRequest.person?.phone ||
                            serviceRequest.person?.contactReference ||
                            "-"}
                        </td>
                        <td className="cell-wrap">{serviceRequest.clinicLabel || "-"}</td>
                        <td className="cell-wrap">
                          {getLocalizedRequestTypeLabel({
                            label: serviceRequest.requestTypeLabel,
                            code: serviceRequest.snapshots?.requestType?.code,
                            language,
                          })}
                        </td>
                        <td>
                          <StatusBadge value={serviceRequest.statusCode} />
                        </td>
                        <td>{formatDateTime(serviceRequest.submittedAt)}</td>
                      </>
                    ) : (
                      <>
                        <td className="cell-mono">
                          <Link className="table-link" to={`/service-requests/${serviceRequest._id}`}>
                            {serviceRequest._id}
                          </Link>
                        </td>
                        <td>
                          <StatusBadge value={serviceRequest.statusCode} />
                        </td>
                        <td>{serviceRequest.priorityCode || "-"}</td>
                        <td>{serviceRequest.language || "-"}</td>
                        <td>{formatDateTime(serviceRequest.submittedAt)}</td>
                        <td className="cell-wrap">
                          {serviceRequest.snapshots?.requestType?.code || serviceRequest.requestTypeLabel || "-"}
                        </td>
                        <td className="cell-wrap">
                          {serviceRequest.snapshots?.service?.code || serviceRequest.serviceLabel || "-"}
                        </td>
                      </>
                    )}
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

export default ServiceRequestsPage;
