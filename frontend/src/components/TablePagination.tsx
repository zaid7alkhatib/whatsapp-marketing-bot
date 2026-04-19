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
  if (totalItems === 0) {
    return null;
  }

  return (
    <div className="table-pagination">
      <p className="result-count">
        Showing {startItem}-{endItem} of {totalItems}
      </p>

      <div className="table-pagination-controls">
        <label className="table-pagination-size">
          <span>Rows</span>
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
          Page {currentPage} of {totalPages}
        </span>

        <button
          type="button"
          className="secondary-button table-pagination-button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
        >
          Previous
        </button>

        <button
          type="button"
          className="secondary-button table-pagination-button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
        >
          Next
        </button>
      </div>
    </div>
  );
}

export default TablePagination;
