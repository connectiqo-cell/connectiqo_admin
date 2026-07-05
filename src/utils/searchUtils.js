function valueToSearchText(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/**
 * Client-side filter: matches query against row values (all columns or a subset).
 */
export function filterRowsBySearch(rows, query, columns = null) {
  if (!Array.isArray(rows) || !rows.length) return rows || [];
  const q = String(query || "").trim().toLowerCase();
  if (!q) return rows;

  return rows.filter((row) => {
    const cols =
      Array.isArray(columns) && columns.length
        ? columns
        : Object.keys(row || {});
    return cols.some((col) => valueToSearchText(row[col]).toLowerCase().includes(q));
  });
}

export function getSearchResultHint(filteredCount, totalCount, query) {
  const q = String(query || "").trim();
  if (!q) return null;
  if (filteredCount === totalCount) {
    return `${filteredCount} match${filteredCount === 1 ? "" : "es"} on this loaded page only — other pages are not searched`;
  }
  return `${filteredCount} of ${totalCount} on this loaded page only — other pages are not searched`;
}
