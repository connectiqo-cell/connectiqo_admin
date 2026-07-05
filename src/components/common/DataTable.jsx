export function DataTable({ rows, onView, onEdit, onDelete, visibleColumns, renderExtraActions, sortCol, sortDir, onSort }) {
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
  const columns = Array.isArray(visibleColumns) && visibleColumns.length
    ? visibleColumns
    : inferredColumns;

  const hasView    = typeof onView === "function";
  const hasEdit    = typeof onEdit === "function";
  const hasDelete  = typeof onDelete === "function";
  const hasExtras  = typeof renderExtraActions === "function";
  const hasActions = hasView || hasEdit || hasDelete || hasExtras;
  const hasSorting = typeof onSort === "function";

  const handleSort = (col) => {
    if (!hasSorting) return;
    onSort(col);
  };

  return (
    <div className="table-wrap">
      <table className="table table-sm table-hover align-middle">
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column}
                style={{ whiteSpace: "nowrap", cursor: hasSorting ? "pointer" : "default", userSelect: "none" }}
                onClick={() => handleSort(column)}
              >
                {column}
                {hasSorting && (
                  <span style={{ marginLeft: 5, opacity: sortCol === column ? 1 : 0.3, fontSize: "0.75rem" }}>
                    {sortCol === column ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
                  </span>
                )}
              </th>
            ))}
            {hasActions ? <th style={{ width: hasExtras ? 280 : 200 }}>Actions</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id || index}>
              {columns.map((column) => {
                const raw = row[column];
                let display;
                if (raw === null || raw === undefined) {
                  display = <span className="text-muted">—</span>;
                } else if (typeof raw === "object") {
                  display = <span className="text-muted fst-italic" title={JSON.stringify(raw)}>{"{…}"}</span>;
                } else {
                  const str = String(raw);
                  display = str.length > 28
                    ? <span title={str} style={{ cursor: "help" }}>{str.slice(0, 24)}…</span>
                    : str;
                }
                return <td key={`${row.id || index}-${column}`}>{display}</td>;
              })}
              {hasActions ? (
                <td>
                  <div className="btn-group btn-group-sm">
                    {hasView   ? <button className="btn btn-outline-secondary" onClick={() => onView(row)}>View</button>   : null}
                    {hasEdit   ? <button className="btn btn-outline-primary"   onClick={() => onEdit(row)}>Edit</button>   : null}
                    {hasDelete ? <button className="btn btn-outline-danger"    onClick={() => onDelete(row)}>Delete</button> : null}
                    {hasExtras ? renderExtraActions(row) : null}
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
