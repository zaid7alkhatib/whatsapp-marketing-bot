import type { ReactNode } from "react";
import { useClientLocale } from "../i18n/ClientLocaleContext";

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
  searchPlaceholder,
  onReset,
  filteredCount,
  totalCount,
  children,
}: ListFiltersProps) {
  const { t } = useClientLocale();
  const resolvedSearchPlaceholder = searchPlaceholder ?? `${t("common.search")}...`;

  return (
    <div className="list-filters">
      <div className="list-filters-controls">
        <label className="form-field list-filter-search">
          <span>{t("common.search")}</span>
          <input
            className="input-control"
            type="text"
            value={searchTerm}
            onChange={(event) => onSearchTermChange(event.target.value)}
            placeholder={resolvedSearchPlaceholder}
          />
        </label>

        {children}
      </div>

      <div className="list-filters-footer">
        <p className="result-count">
          {t("common.showingCount", { filteredCount, totalCount })}
        </p>
        {onReset ? (
          <button type="button" className="secondary-button list-filters-reset" onClick={onReset}>
            {t("common.clearFilters")}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default ListFilters;
