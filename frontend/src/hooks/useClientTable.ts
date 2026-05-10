import { useMemo, useState } from "react";

export type SortDirection = "asc" | "desc";

interface UseClientTableParams<TItem, TSortKey extends string> {
  items: TItem[];
  initialSortKey: TSortKey;
  getSortValue: (item: TItem, sortKey: TSortKey) => unknown;
  resetPageKey: string;
}

function normalizeSortValue(value: unknown): string | number {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }

  return String(value).toLowerCase();
}

function compareValues(a: unknown, b: unknown, direction: SortDirection): number {
  const left = normalizeSortValue(a);
  const right = normalizeSortValue(b);

  let result = 0;
  if (typeof left === "number" && typeof right === "number") {
    result = left - right;
  } else {
    result = String(left).localeCompare(String(right), undefined, { numeric: true });
  }

  return direction === "asc" ? result : -result;
}

function useClientTable<TItem, TSortKey extends string>({
  items,
  initialSortKey,
  getSortValue,
  resetPageKey,
}: UseClientTableParams<TItem, TSortKey>) {
  const [sortKey, setSortKey] = useState<TSortKey>(initialSortKey);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [pageState, setPageState] = useState({ currentPage: 1, resetPageKey });
  const [pageSize, setPageSize] = useState(10);

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) =>
      compareValues(getSortValue(a, sortKey), getSortValue(b, sortKey), sortDirection)
    );
  }, [items, getSortValue, sortKey, sortDirection]);

  const totalItems = sortedItems.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const requestedCurrentPage =
    pageState.resetPageKey === resetPageKey ? pageState.currentPage : 1;
  const currentPage = Math.min(requestedCurrentPage, totalPages);

  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedItems.slice(start, start + pageSize);
  }, [sortedItems, currentPage, pageSize]);

  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = totalItems === 0 ? 0 : Math.min(currentPage * pageSize, totalItems);

  const handleSort = (nextSortKey: TSortKey) => {
    if (sortKey === nextSortKey) {
      setSortDirection((previous) => (previous === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(nextSortKey);
      setSortDirection("asc");
    }
    setPageState({ currentPage: 1, resetPageKey });
  };

  const handlePageChange = (nextPage: number) => {
    if (nextPage < 1 || nextPage > totalPages) {
      return;
    }
    setPageState({ currentPage: nextPage, resetPageKey });
  };

  const handlePageSizeChange = (nextPageSize: number) => {
    setPageSize(nextPageSize);
    setPageState({ currentPage: 1, resetPageKey });
  };

  return {
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
  };
}

export default useClientTable;
