import { useClientLocale } from "../i18n/ClientLocaleContext";

interface TablePaginationProps {
  totalItems: number;
  currentPage: number;
  totalPages: number;
  pageSize: number;
  startItem: number;
  endItem: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50];

function TablePagination({
  totalItems,
  currentPage,
  totalPages,
  pageSize,
  startItem,
  endItem,
  onPageChange,
  onPageSizeChange,
}: TablePaginationProps) {
  const { t } = useClientLocale();

  if (totalItems === 0) {
    return null;
  }

  return (
    <div className="table-pagination">
      <p className="result-count">
        {t("common.showingRange", { startItem, endItem, totalItems })}
      </p>

      <div className="table-pagination-controls">
        <label className="table-pagination-size">
          <span>{t("common.rows")}</span>
          <select
            className="input-control"
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
          >
            {PAGE_SIZE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <span className="table-pagination-page">
          {t("common.pageCount", { currentPage, totalPages })}
        </span>

        <button
          type="button"
          className="secondary-button table-pagination-button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
        >
          {t("common.previous")}
        </button>

        <button
          type="button"
          className="secondary-button table-pagination-button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
        >
          {t("common.next")}
        </button>
      </div>
    </div>
  );
}

export default TablePagination;
