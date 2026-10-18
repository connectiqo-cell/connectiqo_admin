import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createTableRow,
  deleteTableRow,
  listTableRows,
  PERSON_COLUMNS,
  updateTableRow,
} from "../../services/adminApi.js";
import { useEnvironment } from "../../app/providers/EnvironmentProvider.jsx";
import { useAudit } from "../../app/providers/AuditProvider.jsx";
import { useToast } from "../../app/providers/ToastProvider.jsx";
import { DataTable } from "../../components/common/DataTable.jsx";
import { JsonEditorModal } from "../../components/common/JsonEditorModal.jsx";
import { ConfirmModal } from "../../components/common/ConfirmModal.jsx";
import { RowDetailsModal } from "../../components/common/RowDetailsModal.jsx";
import { SearchBar } from "../../components/common/SearchBar.jsx";
import { Pagination } from "../../components/common/Pagination.jsx";
import { filterRowsBySearch, getSearchResultHint } from "../../utils/searchUtils.js";

const EXCLUDE_FROM_CREATE = ["id", "created_at", "updated_at"];
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export function ResourceCrudPage({
  title,
  tableName,
  description,
  compactColumns = null,
  detailFields = null,
  renderExtraActions = null,
  enableProfileFreeze = false,
  rowLimit = null,
  /** e.g. [{ key: "status", label: "Status", options: ["all","pending","completed","failed"] }] */
  filterFields = null,
  /** Override default listTableRows (e.g. mentor profiles with profile names). */
  fetchRows = null,
  /**
   * Real, text-typed column names to search server-side (across the whole table,
   * not just the loaded page). Omit when the searchable fields aren't real columns
   * on this table (e.g. enriched/joined display names) — search then falls back to
   * filtering only the currently-loaded page, and is labeled as such.
   */
  searchColumns = null,
  /** Hide the card heading when it would just repeat the top bar's page title. */
  hideTitle = false,
}) {
  const { config, environment } = useEnvironment();
  const { addLog } = useAudit();
  const { addToast } = useToast();
  const cardRef = useRef(null);

  const [rows, setRows]             = useState([]);
  const [count, setCount]           = useState(0);
  const [people, setPeople]         = useState({});
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState("");

  // Pagination
  const [page, setPage]             = useState(1);
  const [pageSize, setPageSize]     = useState(25);

  // Sort
  const [sortCol, setSortCol]       = useState(null);
  const [sortDir, setSortDir]       = useState("asc");

  // Filters (server-side)
  const [activeFilters, setActiveFilters] = useState({});

  // Search — server-side (whole table) when searchColumns is supplied, else
  // client-side (current page only, clearly labeled as such).
  const isServerSearch = Array.isArray(searchColumns) && searchColumns.length > 0;
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  useEffect(() => {
    if (isServerSearch) setPage(1);
  }, [debouncedSearch, isServerSearch]);

  // Modals
  const [editingRow, setEditingRow]   = useState(null);
  const [viewingRow, setViewingRow]   = useState(null);
  const [deleteRow, setDeleteRow]     = useState(null);
  const [createOpen, setCreateOpen]   = useState(false);
  const [freezeRow, setFreezeRow]     = useState(null);

  // Reset everything when table changes (Database Explorer)
  useEffect(() => {
    setPage(1);
    setSortCol(null);
    setSortDir("asc");
    setActiveFilters({});
    setSearchQuery("");
    setDebouncedSearch("");
  }, [tableName]);

  const searchDep = isServerSearch ? debouncedSearch : null;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const listFn = typeof fetchRows === "function" ? fetchRows : listTableRows;
      const result = await listFn(config, tableName, {
        ...(rowLimit != null ? { limit: rowLimit } : { page, pageSize }),
        sortCol,
        sortDir,
        filters: activeFilters,
        withPeople: true,
        ...(isServerSearch ? { search: searchDep, searchColumns } : {}),
      });
      setRows(result.rows);
      setCount(result.count);
      setPeople(result.people || {});
    } catch (err) {
      setError(err.message || `Failed to load ${tableName}`);
    } finally {
      setLoading(false);
    }
  }, [config, tableName, rowLimit, page, pageSize, sortCol, sortDir, activeFilters, fetchRows, isServerSearch, searchDep, searchColumns]);

  useEffect(() => { load(); }, [load]);

  // Column sort: toggle asc/desc, reset page
  const handleSort = (col) => {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
    setPage(1);
  };

  // Filter change: reset page
  const handleFilterChange = (key, val) => {
    setActiveFilters((prev) => ({ ...prev, [key]: val }));
    setPage(1);
  };

  // Page size change: reset page
  const handlePageSizeChange = (size) => {
    setPageSize(size);
    setPage(1);
  };

  // Create template derived from first row's shape
  const createTemplate = useMemo(() => {
    if (!rows.length) return {};
    return Object.fromEntries(
      Object.entries(rows[0])
        .filter(([k]) => !EXCLUDE_FROM_CREATE.includes(k))
        .map(([k, v]) => {
          if (typeof v === "boolean") return [k, false];
          if (typeof v === "number")  return [k, 0];
          if (typeof v === "object")  return [k, null];
          return [k, ""];
        })
    );
  }, [rows]);

  // CRUD handlers
  const handleSaveEdit = async (payload) => {
    try {
      const { id: _omitId, ...rest } = payload || {};
      const updated = await updateTableRow(config, tableName, editingRow.id, rest);
      addLog({ action: "UPDATE", entity: tableName, environment, payload: updated });
      setEditingRow(null);
      addToast("Row updated successfully");
      await load();
    } catch (err) {
      addToast(err.message || "Update failed", "error");
    }
  };

  const handleCreate = async (payload) => {
    try {
      const { id: _omitId, ...rest } = payload || {};
      const created = await createTableRow(config, tableName, rest);
      addLog({ action: "CREATE", entity: tableName, environment, payload: created });
      setCreateOpen(false);
      addToast("Row created successfully");
      await load();
    } catch (err) {
      addToast(err.message || "Create failed", "error");
    }
  };

  const confirmDelete = async () => {
    try {
      await deleteTableRow(config, tableName, deleteRow.id);
      addLog({ action: "DELETE", entity: tableName, environment, payload: deleteRow });
      setDeleteRow(null);
      addToast("Row deleted");
      await load();
    } catch (err) {
      addToast(err.message || "Delete failed", "error");
    }
  };

  const confirmFreeze = async () => {
    if (!freezeRow?.id) return;
    try {
      const next = !freezeRow.is_frozen;
      const updated = await updateTableRow(config, "profiles", freezeRow.id, { is_frozen: next });
      addLog({ action: "UPDATE", entity: "profiles", environment, payload: { ...updated, _admin_action: next ? "freeze" : "unfreeze" } });
      addToast(`${freezeRow.name || "User"} ${next ? "frozen" : "unfrozen"}`);
      setFreezeRow(null);
      await load();
    } catch (err) {
      addToast(err.message || "Freeze toggle failed", "error");
    }
  };

  const extraForRow = (row) => {
    const nodes = [];
    if (enableProfileFreeze && tableName === "profiles") {
      nodes.push(
        <button
          key="freeze"
          type="button"
          className={`table-action table-action--${row.is_frozen ? "success" : "warning"}`}
          onClick={() => setFreezeRow(row)}
          title={row.is_frozen ? "Unfreeze account" : "Freeze account"}
          aria-label={`${row.is_frozen ? "Unfreeze" : "Freeze"} ${row.name || row.email || "account"}`}
        >
          <span className="material-icons" aria-hidden="true">{row.is_frozen ? "lock_open" : "ac_unit"}</span>
        </button>
      );
    }
    if (typeof renderExtraActions === "function") {
      const custom = renderExtraActions(row, load, people);
      if (custom) nodes.push(<span key="custom">{custom}</span>);
    }
    if (!nodes.length) return null;
    return <>{nodes}</>;
  };

  const showRowExtras =
    (enableProfileFreeze && tableName === "profiles") ||
    typeof renderExtraActions === "function";

  const filteredRows = useMemo(
    () => (isServerSearch ? rows : filterRowsBySearch(rows, searchQuery, compactColumns)),
    [rows, searchQuery, compactColumns, isServerSearch]
  );

  const searchHint = isServerSearch
    ? (searchQuery.trim() ? `${count} matching record${count === 1 ? "" : "s"} found across all pages` : null)
    : getSearchResultHint(filteredRows.length, rows.length, searchQuery, count);

  // Client-side search only sees what was loaded; say so when that isn't everything.
  const isPartialLoad = count > rows.length;

  const isPaginated = rowLimit == null;
  const totalPages  = isPaginated ? Math.max(1, Math.ceil(count / pageSize)) : 1;

  // e.g. deleting the last row on the last page: step back instead of showing an empty page.
  useEffect(() => {
    if (!loading && page > totalPages) setPage(totalPages);
  }, [loading, page, totalPages]);

  const goToPage = (next) => {
    setPage(next);
    // Bring the top of the list back into view when paging from the bottom controls.
    const top = cardRef.current?.getBoundingClientRect().top;
    if (top != null && top < 0) cardRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="admin-card p-3 p-md-4" ref={cardRef}>
      {/* Header */}
      <div className="d-flex flex-wrap align-items-start justify-content-between gap-3 mb-3">
        <div>
          {hideTitle ? null : <h4 className="mb-1">{title}</h4>}
          <div className="text-muted small">{description}</div>
          {count > 0 && (
            <small className="text-muted">
              {searchQuery.trim() && filteredRows.length !== rows.length
                ? `${filteredRows.length} of ${rows.length} on this page · ${count} total`
                : rowLimit != null && isPartialLoad
                  ? `Showing the first ${rows.length} of ${count} records`
                  : `${count} total records`}
            </small>
          )}
        </div>
        <div className="d-flex gap-2">
          <button className="btn btn-outline-primary btn-sm" onClick={load} disabled={loading}>
            Refresh
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setCreateOpen(true)}>
            + Create Row
          </button>
        </div>
      </div>

      {/* Server-side filters */}
      {filterFields?.length ? (
        <div className="d-flex flex-wrap align-items-center gap-3 mb-3 p-2 rounded admin-toolbar">
          <span className="small fw-semibold text-muted">Filter:</span>
          {filterFields.map((field) => (
            <div key={field.key} className="d-flex align-items-center gap-1">
              <label className="small text-muted mb-0">{field.label}</label>
              <select
                className="form-select form-select-sm"
                style={{ width: 150 }}
                value={activeFilters[field.key] || "all"}
                onChange={(e) => handleFilterChange(field.key, e.target.value)}
              >
                {field.options.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt === "all" ? `All` : opt.charAt(0).toUpperCase() + opt.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          ))}
          {Object.values(activeFilters).some((v) => v && v !== "all") && (
            <button
              className="btn btn-sm btn-outline-secondary"
              onClick={() => { setActiveFilters({}); setPage(1); }}
            >
              Clear
            </button>
          )}
        </div>
      ) : null}

      <div className="admin-list-toolbar">
        <SearchBar
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={
            isServerSearch || !isPartialLoad
              ? `Search ${title.toLowerCase()}…`
              : `Search ${title.toLowerCase()} (loaded records only)…`
          }
          hint={searchHint}
        />
      </div>

      {error ? <div className="alert alert-danger">{error}</div> : null}

      {/* Table — first load shows a spinner; later loads keep rows visible (dimmed) to avoid layout jumps */}
      {loading && !rows.length ? (
        <div className="d-flex align-items-center gap-2 text-muted py-3" role="status">
          <div className="spinner-border spinner-border-sm" aria-hidden="true" />
          <span>Loading {title.toLowerCase()}…</span>
        </div>
      ) : (
        <div className={`admin-table-loading-wrap ${loading ? "is-loading" : ""}`} aria-busy={loading}>
          {loading ? (
            <div className="admin-table-loading-indicator" role="status">
              <span className="spinner-border spinner-border-sm" aria-hidden="true" />
              <span className="visually-hidden">Loading…</span>
            </div>
          ) : null}
          <DataTable
            rows={filteredRows}
            visibleColumns={compactColumns}
            onView={setViewingRow}
            onEdit={setEditingRow}
            onDelete={setDeleteRow}
            renderExtraActions={showRowExtras ? extraForRow : null}
            sortCol={sortCol}
            sortDir={sortDir}
            onSort={handleSort}
            people={people}
            personColumns={PERSON_COLUMNS[tableName]}
          />
        </div>
      )}

      {/* Pagination */}
      {isPaginated && count > 0 ? (
        <Pagination
          page={page}
          pageSize={pageSize}
          count={count}
          onPageChange={goToPage}
          onPageSizeChange={handlePageSizeChange}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          disabled={loading}
        />
      ) : null}

      {/* Modals */}
      <JsonEditorModal
        open={Boolean(editingRow)}
        title={`Edit ${tableName} row`}
        initialValue={editingRow}
        onClose={() => setEditingRow(null)}
        onSave={handleSaveEdit}
      />
      <JsonEditorModal
        open={createOpen}
        title={`Create ${tableName} row`}
        initialValue={createTemplate}
        onClose={() => setCreateOpen(false)}
        onSave={handleCreate}
      />
      <ConfirmModal
        open={Boolean(deleteRow)}
        title={`Delete row from ${tableName}`}
        body={`Permanently delete this row${deleteRow?.name ? ` for "${deleteRow.name}"` : ""}. This cannot be undone.`}
        confirmText="Delete"
        onCancel={() => setDeleteRow(null)}
        onConfirm={confirmDelete}
      />
      <ConfirmModal
        open={Boolean(freezeRow)}
        title={freezeRow?.is_frozen ? "Unfreeze account?" : "Freeze account?"}
        body={
          freezeRow?.is_frozen
            ? `Restore sign-in access for "${freezeRow?.name || freezeRow?.email}".`
            : `Block sign-in for "${freezeRow?.name || freezeRow?.email}". They won't be able to log in until unfrozen.`
        }
        confirmText={freezeRow?.is_frozen ? "Unfreeze" : "Freeze"}
        onCancel={() => setFreezeRow(null)}
        onConfirm={confirmFreeze}
      />
      <RowDetailsModal
        open={Boolean(viewingRow)}
        title={viewingRow?.name || viewingRow?.email ? `${viewingRow.name || viewingRow.email}` : `${title} details`}
        data={viewingRow}
        fields={detailFields}
        people={people}
        personColumns={PERSON_COLUMNS[tableName]}
        onClose={() => setViewingRow(null)}
      />
    </div>
  );
}
