import type { ReactNode } from "react";

interface ListFiltersProps {
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  searchPlaceholder?: string;
  onReset?: () => void;
  filteredCount: number;
  totalCount: number;
  children?: ReactNode;
}

function ListFilters({
  searchTerm,
  onSearchTermChange,
  searchPlaceholder = "Search...",
  onReset,
  filteredCount,
  totalCount,
  children,
}: ListFiltersProps) {
  return (
    <div className="list-filters">
      <div className="list-filters-controls">
        <label className="form-field list-filter-search">
          <span>Search</span>
          <input
            className="input-control"
            type="text"
            value={searchTerm}
            onChange={(event) => onSearchTermChange(event.target.value)}
            placeholder={searchPlaceholder}
          />
        </label>

        {children}
      </div>

      <div className="list-filters-footer">
        <p className="result-count">
          Showing {filteredCount} of {totalCount}
        </p>
        {onReset ? (
          <button type="button" className="secondary-button list-filters-reset" onClick={onReset}>
            Clear filters
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default ListFilters;
