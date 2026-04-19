import type { ReactNode } from "react";
import type { SortDirection } from "../hooks/useClientTable";

interface SortableHeaderProps<TSortKey extends string> {
  label: ReactNode;
  sortKeyValue: TSortKey;
  activeSortKey: TSortKey;
  sortDirection: SortDirection;
  onSort: (key: TSortKey) => void;
  className?: string;
}

function SortableHeader<TSortKey extends string>({
  label,
  sortKeyValue,
  activeSortKey,
  sortDirection,
  onSort,
  className,
}: SortableHeaderProps<TSortKey>) {
  const isActive = sortKeyValue === activeSortKey;
  const indicator = isActive ? (sortDirection === "asc" ? "^" : "v") : "";

  return (
    <th className={className}>
      <button
        type="button"
        className={`sort-header-button${isActive ? " sort-header-button-active" : ""}`}
        onClick={() => onSort(sortKeyValue)}
      >
        <span>{label}</span>
        <span className="sort-indicator">{indicator}</span>
      </button>
    </th>
  );
}

export default SortableHeader;
