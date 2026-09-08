const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export function PaginationBar({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
}) {
  const totalPages = Math.max(1, Math.ceil((total || 0) / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const rangeFrom = total ? (safePage - 1) * pageSize + 1 : 0;
  const rangeTo = Math.min(safePage * pageSize, total || 0);

  if (!total) return null;

  return (
    <div
      className="d-flex align-items-center justify-content-between flex-wrap gap-2 mt-3 pt-2"
      style={{ borderTop: "1px solid var(--admin-border)" }}
    >
      <div className="text-muted small">
        {rangeFrom}–{rangeTo} of {total} records
      </div>
      <div className="d-flex align-items-center gap-2">
        <span className="text-muted small">Rows:</span>
        <select
          className="form-select form-select-sm"
          style={{ width: 70 }}
          value={pageSize}
          onChange={(e) => onPageSizeChange?.(Number(e.target.value))}
        >
          {pageSizeOptions.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary"
          disabled={safePage <= 1}
          onClick={() => onPageChange?.(1)}
        >
          «
        </button>
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary"
          disabled={safePage <= 1}
          onClick={() => onPageChange?.(safePage - 1)}
        >
          ‹
        </button>
        <span className="small px-1">
          Page {safePage} / {totalPages}
        </span>
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary"
          disabled={safePage >= totalPages}
          onClick={() => onPageChange?.(safePage + 1)}
        >
          ›
        </button>
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary"
          disabled={safePage >= totalPages}
          onClick={() => onPageChange?.(totalPages)}
        >
          »
        </button>
      </div>
    </div>
  );
}

export function paginateRows(rows, page, pageSize) {
  const list = Array.isArray(rows) ? rows : [];
  const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return list.slice(start, start + pageSize);
}
