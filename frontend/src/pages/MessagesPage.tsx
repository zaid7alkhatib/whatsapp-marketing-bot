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

interface MessageRecord {
  _id: string;
  sessionId: string;
  direction: string;
  actorType: string;
  messageType: string;
  content?: {
    text?: string;
    [key: string]: unknown;
  };
  createdAt: string;
}

type MessageSortKey =
  | "_id"
  | "sessionId"
  | "direction"
  | "actorType"
  | "messageType"
  | "text"
  | "createdAt";

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

function extractMessageText(content?: { text?: string }): string {
  if (!content || typeof content.text !== "string" || content.text.trim().length === 0) {
    return "-";
  }

  return content.text;
}

function MessagesPage() {
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [directionFilter, setDirectionFilter] = useState("all");
  const [actorTypeFilter, setActorTypeFilter] = useState("all");
  const [messageTypeFilter, setMessageTypeFilter] = useState("all");

  const loadMessages = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await api.get<ApiSuccessResponse<MessageRecord[]>>("/api/v1/messages");

      if (!response.data.success) {
        throw new Error(response.data.message ?? "Failed to load messages.");
      }

      setMessages(Array.isArray(response.data.data) ? response.data.data : []);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const apiMessage = (error.response?.data as { message?: string } | undefined)?.message;
        setErrorMessage(apiMessage ?? error.message ?? "Failed to load messages.");
      } else {
        setErrorMessage("Failed to load messages.");
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  const directionOptions = useMemo(() => {
    return Array.from(new Set(messages.map((message) => message.direction).filter(Boolean))).sort();
  }, [messages]);

  const actorTypeOptions = useMemo(() => {
    return Array.from(new Set(messages.map((message) => message.actorType).filter(Boolean))).sort();
  }, [messages]);

  const messageTypeOptions = useMemo(() => {
    return Array.from(new Set(messages.map((message) => message.messageType).filter(Boolean))).sort();
  }, [messages]);

  const filteredMessages = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return messages.filter((message) => {
      if (directionFilter !== "all" && message.direction !== directionFilter) {
        return false;
      }
      if (actorTypeFilter !== "all" && message.actorType !== actorTypeFilter) {
        return false;
      }
      if (messageTypeFilter !== "all" && message.messageType !== messageTypeFilter) {
        return false;
      }

      if (!query) {
        return true;
      }

      const searchableText = [
        message._id,
        message.sessionId,
        message.direction,
        message.actorType,
        message.messageType,
        message.content?.text,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(query);
    });
  }, [messages, searchTerm, directionFilter, actorTypeFilter, messageTypeFilter]);

  const {
    sortKey,
    sortDirection,
    currentPage,
    pageSize,
    totalItems,
    totalPages,
    startItem,
    endItem,
    paginatedItems: paginatedMessages,
    handleSort,
    handlePageChange,
    handlePageSizeChange,
  } = useClientTable<MessageRecord, MessageSortKey>({
    items: filteredMessages,
    initialSortKey: "createdAt",
    getSortValue: (message, key) => {
      switch (key) {
        case "text":
          return extractMessageText(message.content);
        case "createdAt":
          return new Date(message.createdAt).getTime();
        default:
          return message[key] ?? "";
      }
    },
    resetPageKey: `${searchTerm}|${directionFilter}|${actorTypeFilter}|${messageTypeFilter}`,
  });

  return (
    <PageSection
      title="Messages"
      description="Inbound and outbound messages from the backend."
      onRefresh={() => void loadMessages()}
    >
      <ListFilters
        searchTerm={searchTerm}
        onSearchTermChange={setSearchTerm}
        searchPlaceholder="Search by id, session, direction, actor, type, text..."
        filteredCount={filteredMessages.length}
        totalCount={messages.length}
        onReset={() => {
          setSearchTerm("");
          setDirectionFilter("all");
          setActorTypeFilter("all");
          setMessageTypeFilter("all");
        }}
      >
        <label className="form-field list-filter-field">
          <span>Direction</span>
          <select
            className="input-control"
            value={directionFilter}
            onChange={(event) => setDirectionFilter(event.target.value)}
          >
            <option value="all">All</option>
            {directionOptions.map((direction) => (
              <option key={direction} value={direction}>
                {direction}
              </option>
            ))}
          </select>
        </label>

        <label className="form-field list-filter-field">
          <span>Actor Type</span>
          <select
            className="input-control"
            value={actorTypeFilter}
            onChange={(event) => setActorTypeFilter(event.target.value)}
          >
            <option value="all">All</option>
            {actorTypeOptions.map((actorType) => (
              <option key={actorType} value={actorType}>
                {actorType}
              </option>
            ))}
          </select>
        </label>

        <label className="form-field list-filter-field">
          <span>Message Type</span>
          <select
            className="input-control"
            value={messageTypeFilter}
            onChange={(event) => setMessageTypeFilter(event.target.value)}
          >
            <option value="all">All</option>
            {messageTypeOptions.map((messageType) => (
              <option key={messageType} value={messageType}>
                {messageType}
              </option>
            ))}
          </select>
        </label>
      </ListFilters>

      {isLoading ? <p className="state-text">Loading messages...</p> : null}

      {!isLoading && errorMessage ? (
        <div className="state-block state-error">
          <p>{errorMessage}</p>
        </div>
      ) : null}

      {!isLoading && !errorMessage && messages.length === 0 ? (
        <div className="state-block state-empty">
          <p>No messages found.</p>
        </div>
      ) : null}

      {!isLoading && !errorMessage && messages.length > 0 && filteredMessages.length === 0 ? (
        <div className="state-block state-empty">
          <p>No messages match the current filters.</p>
        </div>
      ) : null}

      {!isLoading && !errorMessage && filteredMessages.length > 0 ? (
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
                    label="Session"
                    sortKeyValue="sessionId"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="Direction"
                    sortKeyValue="direction"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="Actor"
                    sortKeyValue="actorType"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="Type"
                    sortKeyValue="messageType"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="Text"
                    sortKeyValue="text"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="Created At"
                    sortKeyValue="createdAt"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                </tr>
              </thead>
              <tbody>
                {paginatedMessages.map((message) => (
                  <tr key={message._id}>
                    <td className="cell-mono">
                      <Link className="table-link" to={`/messages/${message._id}`}>
                        {message._id}
                      </Link>
                    </td>
                    <td className="cell-mono">{message.sessionId}</td>
                    <td>
                      <StatusBadge value={message.direction} />
                    </td>
                    <td>{message.actorType}</td>
                    <td>{message.messageType}</td>
                    <td className="cell-wrap">{extractMessageText(message.content)}</td>
                    <td>{formatDateTime(message.createdAt)}</td>
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

export default MessagesPage;
