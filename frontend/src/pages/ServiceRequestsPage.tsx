import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import ListFilters from "../components/ListFilters";
import PageSection from "../components/PageSection";
import SortableHeader from "../components/SortableHeader";
import StatusBadge from "../components/StatusBadge";
import TablePagination from "../components/TablePagination";
import useClientTable from "../hooks/useClientTable";
import api from "../services/api";
import type { ApiSuccessResponse } from "../types/api";

interface ServiceRequestRecord {
  _id: string;
  statusCode: string;
  priorityCode?: string;
  language?: string;
  submittedAt: string;
  snapshots?: {
    requestType?: { code?: string };
    service?: { code?: string };
  };
}

type ServiceRequestSortKey = "_id" | "statusCode" | "priorityCode" | "language" | "submittedAt";

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
  const [serviceRequests, setServiceRequests] = useState<ServiceRequestRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [languageFilter, setLanguageFilter] = useState("all");

  const loadServiceRequests = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await api.get<ApiSuccessResponse<ServiceRequestRecord[]>>(
        "/api/v1/service-requests"
      );

      if (!response.data.success) {
        throw new Error(response.data.message ?? "Failed to load service requests.");
      }

      setServiceRequests(Array.isArray(response.data.data) ? response.data.data : []);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const apiMessage = (error.response?.data as { message?: string } | undefined)?.message;
        setErrorMessage(apiMessage ?? error.message ?? "Failed to load service requests.");
      } else {
        setErrorMessage("Failed to load service requests.");
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadServiceRequests();
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
      if (statusFilter !== "all" && serviceRequest.statusCode !== statusFilter) {
        return false;
      }
      if (priorityFilter !== "all" && serviceRequest.priorityCode !== priorityFilter) {
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
        serviceRequest.statusCode,
        serviceRequest.priorityCode,
        serviceRequest.language,
        serviceRequest.snapshots?.service?.code,
        serviceRequest.snapshots?.requestType?.code,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(query);
    });
  }, [serviceRequests, searchTerm, statusFilter, priorityFilter, languageFilter]);

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
      return serviceRequest[key] ?? "";
    },
    resetPageKey: `${searchTerm}|${statusFilter}|${priorityFilter}|${languageFilter}`,
  });

  return (
    <PageSection
      title="Service Requests"
      description="Service requests loaded from the backend."
      onRefresh={() => void loadServiceRequests()}
    >
      <ListFilters
        searchTerm={searchTerm}
        onSearchTermChange={setSearchTerm}
        searchPlaceholder="Search by id, status, priority, language, service or request type..."
        filteredCount={filteredServiceRequests.length}
        totalCount={serviceRequests.length}
        onReset={() => {
          setSearchTerm("");
          setStatusFilter("all");
          setPriorityFilter("all");
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

      {isLoading ? <p className="state-text">Loading service requests...</p> : null}

      {!isLoading && errorMessage ? (
        <div className="state-block state-error">
          <p>{errorMessage}</p>
        </div>
      ) : null}

      {!isLoading && !errorMessage && serviceRequests.length === 0 ? (
        <div className="state-block state-empty">
          <p>No service requests found.</p>
        </div>
      ) : null}

      {!isLoading && !errorMessage && serviceRequests.length > 0 && filteredServiceRequests.length === 0 ? (
        <div className="state-block state-empty">
          <p>No service requests match the current filters.</p>
        </div>
      ) : null}

      {!isLoading && !errorMessage && filteredServiceRequests.length > 0 ? (
        <>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
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
              </thead>
              <tbody>
                {paginatedServiceRequests.map((serviceRequest) => (
                  <tr key={serviceRequest._id}>
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
                    <td className="cell-wrap">{serviceRequest.snapshots?.requestType?.code || "-"}</td>
                    <td className="cell-wrap">{serviceRequest.snapshots?.service?.code || "-"}</td>
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
