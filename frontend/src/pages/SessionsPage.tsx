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

interface SessionRecord {
  _id: string;
  channelUserRef: string;
  language: string;
  statusCode: string;
  currentStepCode?: string;
  startedAt: string;
  lastActivityAt: string;
}

type SessionSortKey =
  | "_id"
  | "channelUserRef"
  | "language"
  | "statusCode"
  | "currentStepCode"
  | "startedAt"
  | "lastActivityAt";

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

function SessionsPage() {
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [languageFilter, setLanguageFilter] = useState("all");

  const loadSessions = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await api.get<ApiSuccessResponse<SessionRecord[]>>("/api/v1/bot-sessions");

      if (!response.data.success) {
        throw new Error(response.data.message ?? "Failed to load sessions.");
      }

      setSessions(Array.isArray(response.data.data) ? response.data.data : []);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const apiMessage = (error.response?.data as { message?: string } | undefined)?.message;
        setErrorMessage(apiMessage ?? error.message ?? "Failed to load sessions.");
      } else {
        setErrorMessage("Failed to load sessions.");
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const statusOptions = useMemo(() => {
    return Array.from(new Set(sessions.map((session) => session.statusCode).filter(Boolean))).sort();
  }, [sessions]);

  const languageOptions = useMemo(() => {
    return Array.from(
      new Set(sessions.map((session) => session.language).filter((language) => !!language?.trim()))
    ).sort();
  }, [sessions]);

  const filteredSessions = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return sessions.filter((session) => {
      if (statusFilter !== "all" && session.statusCode !== statusFilter) {
        return false;
      }
      if (languageFilter !== "all" && session.language !== languageFilter) {
        return false;
      }

      if (!query) {
        return true;
      }

      const searchableText = [
        session._id,
        session.channelUserRef,
        session.language,
        session.currentStepCode,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(query);
    });
  }, [sessions, searchTerm, statusFilter, languageFilter]);

  const {
    sortKey,
    sortDirection,
    currentPage,
    pageSize,
    totalItems,
    totalPages,
    startItem,
    endItem,
    paginatedItems: paginatedSessions,
    handleSort,
    handlePageChange,
    handlePageSizeChange,
  } = useClientTable<SessionRecord, SessionSortKey>({
    items: filteredSessions,
    initialSortKey: "startedAt",
    getSortValue: (session, key) => {
      switch (key) {
        case "startedAt":
          return new Date(session.startedAt).getTime();
        case "lastActivityAt":
          return new Date(session.lastActivityAt).getTime();
        default:
          return session[key] ?? "";
      }
    },
    resetPageKey: `${searchTerm}|${statusFilter}|${languageFilter}`,
  });

  return (
    <PageSection
      title="Sessions"
      description="Bot sessions loaded from the backend."
      onRefresh={() => void loadSessions()}
    >
      <ListFilters
        searchTerm={searchTerm}
        onSearchTermChange={setSearchTerm}
        searchPlaceholder="Search by id, user ref, language, current step..."
        filteredCount={filteredSessions.length}
        totalCount={sessions.length}
        onReset={() => {
          setSearchTerm("");
          setStatusFilter("all");
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

      {isLoading ? <p className="state-text">Loading sessions...</p> : null}

      {!isLoading && errorMessage ? (
        <div className="state-block state-error">
          <p>{errorMessage}</p>
        </div>
      ) : null}

      {!isLoading && !errorMessage && sessions.length === 0 ? (
        <div className="state-block state-empty">
          <p>No sessions found.</p>
        </div>
      ) : null}

      {!isLoading && !errorMessage && sessions.length > 0 && filteredSessions.length === 0 ? (
        <div className="state-block state-empty">
          <p>No sessions match the current filters.</p>
        </div>
      ) : null}

      {!isLoading && !errorMessage && filteredSessions.length > 0 ? (
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
                    label="Channel User Ref"
                    sortKeyValue="channelUserRef"
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
                    label="Status"
                    sortKeyValue="statusCode"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="Current Step"
                    sortKeyValue="currentStepCode"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="Started At"
                    sortKeyValue="startedAt"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="Last Activity"
                    sortKeyValue="lastActivityAt"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                </tr>
              </thead>
              <tbody>
                {paginatedSessions.map((session) => (
                  <tr key={session._id}>
                    <td className="cell-mono">
                      <Link className="table-link" to={`/sessions/${session._id}`}>
                        {session._id}
                      </Link>
                    </td>
                    <td>{session.channelUserRef}</td>
                    <td>{session.language || "-"}</td>
                    <td>
                      <StatusBadge value={session.statusCode} />
                    </td>
                    <td>{session.currentStepCode || "-"}</td>
                    <td>{formatDateTime(session.startedAt)}</td>
                    <td>{formatDateTime(session.lastActivityAt)}</td>
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

export default SessionsPage;
