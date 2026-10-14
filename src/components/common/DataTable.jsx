import { columnDisplayLabel } from "../../utils/displayLabels.js";

export function DataTable({
  rows,
  onView,
  onEdit,
  onDelete,
  visibleColumns,
  columnLabels,
  renderExtraActions,
  sortCol,
  sortDir,
  onSort,
  rawColumnLabels = false,
}) {
  if (!rows?.length) {
    return (
      <div className="table-empty">
        <span className="material-icons">inbox</span>
        <span>No records found</span>
        <small className="text-muted">Try adjusting filters or create a new row.</small>
      </div>
    );
  }

  const inferredColumns = Object.keys(rows[0]);
  const columns =
    Array.isArray(visibleColumns) && visibleColumns.length ? visibleColumns : inferredColumns;

  const hasView = typeof onView === "function";
  const hasEdit = typeof onEdit === "function";
  const hasDelete = typeof onDelete === "function";
  const hasExtras = typeof renderExtraActions === "function";
  const hasActions = hasView || hasEdit || hasDelete || hasExtras;
  const hasSorting = typeof onSort === "function";

  const labelFor = (column) =>
    (columnLabels && columnLabels[column]) ||
    columnDisplayLabel(column, { raw: rawColumnLabels });

  const handleSort = (col) => {
    if (!hasSorting) return;
    onSort(col);
  };

  const formatCell = (raw) => {
    if (raw === null || raw === undefined) {
      return <span className="text-muted">—</span>;
    }
    if (typeof raw === "boolean") {
      return raw ? (
        <span className="badge rounded-pill bg-danger-subtle text-danger-emphasis">Yes</span>
      ) : (
        <span className="badge rounded-pill bg-secondary-subtle text-secondary-emphasis">No</span>
      );
    }
    if (typeof raw === "object") {
      return (
        <span className="text-muted fst-italic" title={JSON.stringify(raw)}>
          {"{…}"}
        </span>
      );
    }
    const str = String(raw);
    if (str.length > 36) {
      return (
        <span title={str} style={{ cursor: "help" }}>
          {str.slice(0, 32)}…
        </span>
      );
    }
    return str;
  };

  return (
    <div className="table-wrap">
      <table className="table table-sm table-hover align-middle mb-0">
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column}
                className={hasSorting ? "table-sortable-th" : undefined}
                onClick={() => handleSort(column)}
              >
                {labelFor(column)}
                {hasSorting ? (
                  <span className={`table-sort-icon${sortCol === column ? " is-active" : ""}`}>
                    {sortCol === column ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
                  </span>
                ) : null}
              </th>
            ))}
            {hasActions ? <th className="table-actions-th">Actions</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id || index}>
              {columns.map((column) => (
                <td key={`${row.id || index}-${column}`}>{formatCell(row[column])}</td>
              ))}
              {hasActions ? (
                <td>
                  <div className="table-row-actions">
                    <div className="btn-group btn-group-sm">
                      {hasView ? (
                        <button
                          type="button"
                          className="btn btn-outline-secondary"
                          onClick={() => onView(row)}
                        >
                          View
                        </button>
                      ) : null}
                      {hasEdit ? (
                        <button
                          type="button"
                          className="btn btn-outline-primary"
                          onClick={() => onEdit(row)}
                        >
                          Edit
                        </button>
                      ) : null}
                      {hasDelete ? (
                        <button
                          type="button"
                          className="btn btn-outline-danger"
                          onClick={() => onDelete(row)}
                        >
                          Delete
                        </button>
                      ) : null}
                    </div>
                    {hasExtras ? (
                      <div className="table-row-actions__extra">{renderExtraActions(row)}</div>
                    ) : null}
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
