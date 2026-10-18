/** Text for matching: values only (JSON keys like "name" would match every row). */
function valueToSearchText(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(valueToSearchText).join(" ");
  if (typeof value === "object") return Object.values(value).map(valueToSearchText).join(" ");
  return String(value);
}

/**
 * Client-side filter. Every word in the query must appear somewhere in the row
 * (any column, any order), so "john gmail" matches name "John" + email "…@gmail.com".
 */
export function filterRowsBySearch(rows, query, columns = null) {
  if (!Array.isArray(rows) || !rows.length) return rows || [];
  const words = String(query || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return rows;

  return rows.filter((row) => {
    const cols =
      Array.isArray(columns) && columns.length
        ? columns
        : Object.keys(row || {});
    const haystack = cols.map((col) => valueToSearchText(row?.[col])).join(" ").toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

/**
 * @param filteredCount rows matching the query
 * @param loadedCount   rows that were searched (loaded client-side)
 * @param query         current search text
 * @param totalCount    rows that exist server-side; when larger than loadedCount
 *                      the hint warns that only the loaded rows were searched
 */
export function getSearchResultHint(filteredCount, loadedCount, query, totalCount = loadedCount) {
  const q = String(query || "").trim();
  if (!q) return null;
  const matches = `${filteredCount} match${filteredCount === 1 ? "" : "es"}`;
  if (totalCount > loadedCount) {
    return `${matches} in the ${loadedCount} loaded records — ${totalCount - loadedCount} more not searched`;
  }
  return filteredCount === loadedCount ? matches : `${filteredCount} of ${loadedCount} records match`;
}
