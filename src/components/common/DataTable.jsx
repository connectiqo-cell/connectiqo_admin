import { useMemo } from "react";
import { humanizeKey, inferKind } from "../../utils/formatters.js";
import { CellValue } from "./CellValue.jsx";

/** Normalise column specs: "status" or { key, label?, kind?, render? }. */
function useColumns(rows, visibleColumns, personColumns) {
  return useMemo(() => {
    const specs =
      Array.isArray(visibleColumns) && visibleColumns.length
        ? visibleColumns
        : Object.keys(rows[0] || {});
    return specs.map((spec) => {
      const col = typeof spec === "string" ? { key: spec } : spec;
      // Infer from the first non-empty value so a leading null doesn't hide the type.
      const sample = rows.find((r) => r?.[col.key] !== null && r?.[col.key] !== undefined)?.[col.key];
      return {
        ...col,
        label: col.label || personColumns?.[col.key] || humanizeKey(col.key),
        kind: col.kind || inferKind(col.key, sample, personColumns),
      };
    });
  }, [rows, visibleColumns, personColumns]);
}

const RIGHT_ALIGNED = new Set(["paise", "inr", "number", "percent"]);

function ActionButton({ icon, label, tone, onClick }) {
  return (
    <button
      type="button"
      className={`table-action table-action--${tone}`}
      onClick={onClick}
      title={label}
      aria-label={label}
    >
      <span className="material-icons" aria-hidden="true">{icon}</span>
    </button>
  );
}

export function DataTable({
  rows,
  onView,
  onEdit,
  onDelete,
  visibleColumns,
  renderExtraActions,
  sortCol,
  sortDir,
  onSort,
  people = null,
  personColumns = null,
  rowLabel = (row) => row?.name || row?.email || "row",
}) {
  const columns = useColumns(rows || [], visibleColumns, personColumns);

  if (!rows?.length) {
    return (
      <div className="table-empty">
        <span className="material-icons" aria-hidden="true">inbox</span>
        <span>No records found</span>
        <small className="text-muted">Try a different search or filter.</small>
      </div>
    );
  }

  const hasView = typeof onView === "function";
  const hasEdit = typeof onEdit === "function";
  const hasDelete = typeof onDelete === "function";
  const hasExtras = typeof renderExtraActions === "function";
  const hasActions = hasView || hasEdit || hasDelete || hasExtras;
  const hasSorting = typeof onSort === "function";

  return (
    <div className="table-wrap">
      <table className="table table-sm table-hover align-middle admin-data-table">
        <thead>
          <tr>
            {columns.map((col) => {
              const align = RIGHT_ALIGNED.has(col.kind) ? "text-end" : "";
              const active = sortCol === col.key;
              const ariaSort = active ? (sortDir === "asc" ? "ascending" : "descending") : "none";
              return (
                <th key={col.key} className={align} aria-sort={hasSorting ? ariaSort : undefined}>
                  {hasSorting && col.sortable !== false ? (
                    <button
                      type="button"
                      className={`admin-sortable-th ${active ? "is-active" : ""}`}
                      onClick={() => onSort(col.key)}
                      title={`Sort by ${col.label}`}
                    >
                      {col.label}
                      <span className="material-icons" aria-hidden="true">
                        {active ? (sortDir === "asc" ? "arrow_upward" : "arrow_downward") : "unfold_more"}
                      </span>
                    </button>
                  ) : (
                    col.label
                  )}
                </th>
              );
            })}
            {hasActions ? <th className="text-end table-actions-th">Actions</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id || index}>
              {columns.map((col) => (
                <td
                  key={`${row.id || index}-${col.key}`}
                  className={`${RIGHT_ALIGNED.has(col.kind) ? "text-end" : ""} cell-kind-${col.kind}`}
                >
                  {col.render ? (
                    col.render(row)
                  ) : (
                    <CellValue kind={col.kind} columnKey={col.key} value={row[col.key]} people={people} />
                  )}
                </td>
              ))}
              {hasActions ? (
                <td className="text-end">
                  <div className="table-actions">
                    {hasExtras ? renderExtraActions(row) : null}
                    {hasView ? <ActionButton icon="visibility" label={`View ${rowLabel(row)}`} tone="neutral" onClick={() => onView(row)} /> : null}
                    {hasEdit ? <ActionButton icon="edit" label={`Edit ${rowLabel(row)}`} tone="primary" onClick={() => onEdit(row)} /> : null}
                    {hasDelete ? <ActionButton icon="delete_outline" label={`Delete ${rowLabel(row)}`} tone="danger" onClick={() => onDelete(row)} /> : null}
                  </div>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
