/** Page numbers to show: first, last, and a window around the current page, with gaps. */
function pageItems(page, totalPages) {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const items = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(totalPages - 1, page + 1);
  if (start > 2) items.push("gap-start");
  for (let p = start; p <= end; p += 1) items.push(p);
  if (end < totalPages - 1) items.push("gap-end");
  items.push(totalPages);
  return items;
}

export function Pagination({
  page,
  pageSize,
  count,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
  disabled = false,
  itemLabel = "records",
}) {
  const totalPages = Math.max(1, Math.ceil(count / pageSize));
  const from = count === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, count);

  const go = (target) => {
    const next = Math.min(Math.max(1, target), totalPages);
    if (next !== page) onPageChange(next);
  };

  return (
    <nav className="admin-pagination" aria-label="Pagination">
      <div className="admin-pagination__summary text-muted small" aria-live="polite">
        Showing <strong>{from.toLocaleString()}–{to.toLocaleString()}</strong> of{" "}
        <strong>{count.toLocaleString()}</strong> {itemLabel}
      </div>

      <div className="admin-pagination__controls">
        <label className="admin-pagination__size text-muted small">
          Rows
          <select
            className="form-select form-select-sm"
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            disabled={disabled}
          >
            {pageSizeOptions.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>

        <ul className="admin-pagination__pages">
          <li>
            <button
              type="button"
              className="admin-pagination__btn"
              onClick={() => go(page - 1)}
              disabled={disabled || page <= 1}
              aria-label="Previous page"
            >
              <span className="material-icons" aria-hidden="true">chevron_left</span>
            </button>
          </li>
          {pageItems(page, totalPages).map((item) =>
            typeof item === "number" ? (
              <li key={item}>
                <button
                  type="button"
                  className={`admin-pagination__btn ${item === page ? "is-active" : ""}`}
                  onClick={() => go(item)}
                  disabled={disabled}
                  aria-label={`Page ${item}`}
                  aria-current={item === page ? "page" : undefined}
                >
                  {item}
                </button>
              </li>
            ) : (
              <li key={item} className="admin-pagination__gap" aria-hidden="true">…</li>
            )
          )}
          <li>
            <button
              type="button"
              className="admin-pagination__btn"
              onClick={() => go(page + 1)}
              disabled={disabled || page >= totalPages}
              aria-label="Next page"
            >
              <span className="material-icons" aria-hidden="true">chevron_right</span>
            </button>
          </li>
        </ul>
      </div>
    </nav>
  );
}
