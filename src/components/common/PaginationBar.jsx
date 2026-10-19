import { Pagination } from "./Pagination.jsx";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

/**
 * Pagination for lists that are already fully loaded (Sessions, Recordings, Videos…).
 * Same API as before; renders the shared numbered <Pagination> so every page looks alike.
 */
export function PaginationBar({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
}) {
  if (!total) return null;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);

  return (
    <Pagination
      page={safePage}
      pageSize={pageSize}
      count={total}
      onPageChange={(next) => onPageChange?.(next)}
      onPageSizeChange={(size) => onPageSizeChange?.(size)}
      pageSizeOptions={pageSizeOptions}
    />
  );
}

export function paginateRows(rows, page, pageSize) {
  const list = Array.isArray(rows) ? rows : [];
  const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return list.slice(start, start + pageSize);
}
