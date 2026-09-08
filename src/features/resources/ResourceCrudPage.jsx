import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createTableRow,
  deleteTableRow,
  freezeMentor,
  getAdminProfileDetail,
  getTableRowById,
  listTableRows,
  unfreezeMentor,
  updateTableRow,
} from "../../services/adminApi.js";
import { useEnvironment } from "../../app/providers/EnvironmentProvider.jsx";
import { useAudit } from "../../app/providers/AuditProvider.jsx";
import { useAuth } from "../../app/providers/AuthProvider.jsx";
import { useToast } from "../../app/providers/ToastProvider.jsx";
import { DataTable } from "../../components/common/DataTable.jsx";
import { JsonEditorModal } from "../../components/common/JsonEditorModal.jsx";
import { ConfirmModal } from "../../components/common/ConfirmModal.jsx";
import { MentorFreezeModal } from "../../components/common/MentorFreezeModal.jsx";
import { ProfileDetailsModal } from "../../components/common/ProfileDetailsModal.jsx";
import { RowDetailsModal } from "../../components/common/RowDetailsModal.jsx";
import { SearchBar } from "../../components/common/SearchBar.jsx";
import { filterRowsBySearch, getSearchResultHint } from "../../utils/searchUtils.js";

const EXCLUDE_FROM_CREATE = ["id", "created_at", "updated_at"];
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export function ResourceCrudPage({
  title,
  tableName,
  description,
  compactColumns = null,
  columnLabels = null,
  detailFields = null,
  renderExtraActions = null,
  enableProfileFreeze = false,
  /** Mentor-side timed freeze (hides profile/videos, keeps learner access). */
  enableMentorFreeze = false,
  rowLimit = null,
  /** e.g. [{ key: "status", label: "Status", options: ["all","pending","completed","failed"] }] */
  filterFields = null,
  /** Override default listTableRows (e.g. mentor profiles with profile names). */
  fetchRows = null,
  /** Hide Create/Edit/Delete — use when a dedicated control panel owns mutations. */
  readOnly = false,
  /** When set, fetch and open this row's details (e.g. deep-link from reports). */
  openRowId = null,
  /** Called after the deep-linked details modal is closed. */
  onOpenRowHandled = null,
  /** Rich moderation profile panel instead of generic row details. */
  enableRichProfileView = false,
  /** Override View button (e.g. navigate to /users/:id). */
  onViewRow = null,
}) {
  const { config, environment } = useEnvironment();
  const { addLog } = useAudit();
  const { addToast } = useToast();
  const { session } = useAuth();
  const operator = session?.user?.email || session?.email || "admin";

  const [rows, setRows]             = useState([]);
  const [count, setCount]           = useState(0);
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

  // Search (client-side on current page)
  const [searchQuery, setSearchQuery] = useState("");

  // Modals
  const [editingRow, setEditingRow]   = useState(null);
  const [viewingRow, setViewingRow]   = useState(null);
  const [deleteRow, setDeleteRow]     = useState(null);
  const [createOpen, setCreateOpen]   = useState(false);
  const [banRow, setBanRow]           = useState(null);
  const [mentorFreezeRow, setMentorFreezeRow] = useState(null);
  const [mentorFreezeBusy, setMentorFreezeBusy] = useState(false);
  const [profileDetail, setProfileDetail] = useState(null);
  const [profileDetailLoading, setProfileDetailLoading] = useState(false);

  // Reset everything when table changes (Database Explorer)
  useEffect(() => {
    setPage(1);
    setSortCol(null);
    setSortDir("asc");
    setActiveFilters({});
    setSearchQuery("");
  }, [tableName]);

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
      });
      setRows(result.rows);
      setCount(result.count);
    } catch (err) {
      setError(err.message || `Failed to load ${tableName}`);
    } finally {
      setLoading(false);
    }
  }, [config, tableName, rowLimit, page, pageSize, sortCol, sortDir, activeFilters, fetchRows]);

  useEffect(() => { load(); }, [load]);

  const openRichProfile = useCallback(
    async (idOrRow) => {
      const id = typeof idOrRow === "object" ? idOrRow?.id : idOrRow;
      if (!id) return;
      setViewingRow(typeof idOrRow === "object" ? idOrRow : { id });
      setProfileDetailLoading(true);
      setProfileDetail(null);
      try {
        const detail = await getAdminProfileDetail(config, id);
        if (!detail) {
          addToast("Profile not found", "error");
          setViewingRow(null);
          onOpenRowHandled?.();
          return;
        }
        setProfileDetail(detail);
      } catch (err) {
        addToast(err.message || "Failed to open profile", "error");
        setViewingRow(null);
        onOpenRowHandled?.();
      } finally {
        setProfileDetailLoading(false);
      }
    },
    [config, addToast, onOpenRowHandled]
  );

  // Deep-link: open a specific row's details (e.g. /users?id=…)
  useEffect(() => {
    if (!openRowId) return;

    let cancelled = false;

    const openLinkedRow = async () => {
      if (enableRichProfileView) {
        if (!cancelled) await openRichProfile(openRowId);
        return;
      }
      try {
        const row = await getTableRowById(config, tableName, openRowId);
        if (cancelled) return;
        if (row) {
          setViewingRow(row);
        } else {
          addToast("Profile not found", "error");
          onOpenRowHandled?.();
        }
      } catch (err) {
        if (cancelled) return;
        addToast(err.message || "Failed to open profile", "error");
        onOpenRowHandled?.();
      }
    };

    openLinkedRow();
    return () => {
      cancelled = true;
    };
    // Intentionally omit toast/callback identity — only reopen when the target id changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRowId, tableName, config, enableRichProfileView]);

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

  const openMentorFreeze = async (row) => {
    setMentorFreezeBusy(true);
    try {
      const mentorRow = await getTableRowById(config, "mentor_profiles", row.id);
      setMentorFreezeRow({
        id: row.id,
        name: row.name || mentorRow?.name,
        email: row.email || mentorRow?.email,
        mentor_frozen: mentorRow?.mentor_frozen === true,
        mentor_frozen_until: mentorRow?.mentor_frozen_until ?? null,
        mentor_freeze_reason: mentorRow?.mentor_freeze_reason ?? null,
      });
    } catch (err) {
      addToast(err.message || "Could not load mentor freeze status", "error");
    } finally {
      setMentorFreezeBusy(false);
    }
  };

  const confirmBanLogin = async () => {
    if (!banRow?.id) return;
    try {
      const next = !Boolean(banRow.is_frozen);
      const updated = await updateTableRow(config, "profiles", banRow.id, { is_frozen: next });
      addLog({
        action: "UPDATE",
        entity: "profiles",
        environment,
        payload: { ...updated, _admin_action: next ? "ban_login" : "unban_login" },
      });
      addToast(`${banRow.name || "User"} ${next ? "banned from login" : "login restored"}`);
      setBanRow(null);
      await load();
      if (enableRichProfileView && viewingRow?.id === banRow.id) {
        await openRichProfile(banRow.id);
      }
    } catch (err) {
      addToast(err.message || "Ban toggle failed", "error");
    }
  };

  const confirmMentorFreeze = async (row, { until, reason }) => {
    setMentorFreezeBusy(true);
    try {
      const updated = await freezeMentor(config, row.id, { until, reason, operator });
      addLog({
        action: "UPDATE",
        entity: "mentor_profiles",
        environment,
        payload: { ...updated, _admin_action: "mentor_freeze" },
      });
      addToast(`${row.name || "Mentor"} frozen`);
      setMentorFreezeRow(null);
      await load();
      if (enableRichProfileView && (viewingRow?.id === row.id || profileDetail?.profile?.id === row.id)) {
        await openRichProfile(row.id);
      }
    } catch (err) {
      addToast(err.message || "Mentor freeze failed", "error");
    } finally {
      setMentorFreezeBusy(false);
    }
  };

  const confirmMentorUnfreeze = async (row) => {
    setMentorFreezeBusy(true);
    try {
      const updated = await unfreezeMentor(config, row.id, operator);
      addLog({
        action: "UPDATE",
        entity: "mentor_profiles",
        environment,
        payload: { ...updated, _admin_action: "mentor_unfreeze" },
      });
      addToast(`${row.name || "Mentor"} restored`);
      setMentorFreezeRow(null);
      await load();
      if (enableRichProfileView && (viewingRow?.id === row.id || profileDetail?.profile?.id === row.id)) {
        await openRichProfile(row.id);
      }
    } catch (err) {
      addToast(err.message || "Mentor unfreeze failed", "error");
    } finally {
      setMentorFreezeBusy(false);
    }
  };

  const extraForRow = (row) => {
    const nodes = [];
    if (enableMentorFreeze) {
      const active =
        row.mentor_frozen === true &&
        (!row.mentor_frozen_until || new Date(row.mentor_frozen_until).getTime() > Date.now());
      nodes.push(
        <button
          key="mentor-freeze"
          type="button"
          className={`btn btn-sm btn-outline-${active ? "success" : "warning"}`}
          onClick={() => openMentorFreeze(row)}
        >
          {active ? "Unfreeze mentor" : "Freeze mentor"}
        </button>
      );
    }
    if (enableProfileFreeze && (tableName === "profiles" || tableName === "mentor_profiles")) {
      nodes.push(
        <button
          key="ban-login"
          type="button"
          className={`btn btn-sm btn-outline-${row.is_frozen ? "success" : "danger"}`}
          onClick={() => setBanRow(row)}
        >
          {row.is_frozen ? "Unban login" : "Ban login"}
        </button>
      );
    }
    if (typeof renderExtraActions === "function") {
      const custom = renderExtraActions(row, load);
      if (custom) nodes.push(<span key="custom">{custom}</span>);
    }
    if (!nodes.length) return null;
    return <>{nodes}</>;
  };

  const showRowExtras =
    enableMentorFreeze ||
    (enableProfileFreeze && (tableName === "profiles" || tableName === "mentor_profiles")) ||
    typeof renderExtraActions === "function";

  const filteredRows = useMemo(
    () => filterRowsBySearch(rows, searchQuery, compactColumns),
    [rows, searchQuery, compactColumns]
  );

  const searchHint = getSearchResultHint(filteredRows.length, rows.length, searchQuery);

  // Pagination calc
  const totalPages = rowLimit != null ? 1 : Math.max(1, Math.ceil(count / pageSize));
  const rangeFrom  = rowLimit != null ? 1 : (page - 1) * pageSize + 1;
  const rangeTo    = rowLimit != null ? count : Math.min(page * pageSize, count);

  return (
    <div className="resource-page admin-card p-3 p-md-4">
      <div className="resource-page__header">
        <div className="resource-page__intro">
          <h4 className="resource-page__title">{title}</h4>
          {description ? <p className="resource-page__desc">{description}</p> : null}
          {count > 0 ? (
            <p className="resource-page__meta">
              {searchQuery.trim() && filteredRows.length !== rows.length
                ? `${filteredRows.length} of ${rows.length} on this page · ${count} total`
                : `${count} total records`}
            </p>
          ) : null}
        </div>
        <div className="resource-page__actions">
          <button type="button" className="btn btn-outline-primary btn-sm" onClick={load} disabled={loading}>
            Refresh
          </button>
          {!readOnly ? (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setCreateOpen(true)}>
              + Create
            </button>
          ) : null}
        </div>
      </div>

      {/* Server-side filters */}
      {filterFields?.length ? (
        <div className="admin-h-scroll resource-page__filters rounded admin-toolbar">
          <span className="small fw-semibold text-muted text-nowrap">Filter:</span>
          {filterFields.map((field) => (
            <div key={field.key} className="d-flex align-items-center gap-1">
              <label className="small text-muted mb-0 text-nowrap">{field.label}</label>
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
          placeholder={`Search ${title.toLowerCase()}…`}
          hint={searchHint}
          disabled={loading}
        />
      </div>

      {error ? <div className="alert alert-danger">{error}</div> : null}

      {/* Table */}
      {loading ? (
        <div className="d-flex align-items-center gap-2 text-muted py-3">
          <div className="spinner-border spinner-border-sm" role="status" />
          <span>Loading {title.toLowerCase()}...</span>
        </div>
      ) : (
        <DataTable
          rows={filteredRows}
          visibleColumns={compactColumns}
          columnLabels={columnLabels}
          onView={
            typeof onViewRow === "function"
              ? onViewRow
              : enableRichProfileView
                ? openRichProfile
                : setViewingRow
          }
          onEdit={readOnly ? null : setEditingRow}
          onDelete={readOnly ? null : setDeleteRow}
          renderExtraActions={showRowExtras ? extraForRow : null}
          sortCol={sortCol}
          sortDir={sortDir}
          onSort={handleSort}
        />
      )}

      {/* Pagination */}
      {!loading && rowLimit == null && count > 0 ? (
        <div className="resource-page__pager">
          <div className="text-muted small">
            {count > 0 ? `${rangeFrom}–${rangeTo} of ${count} records` : "No records"}
          </div>
          <div className="d-flex align-items-center gap-2 flex-wrap">
            <span className="text-muted small">Rows</span>
            <select
              className="form-select form-select-sm"
              style={{ width: 72 }}
              value={pageSize}
              onChange={(e) => handlePageSizeChange(Number(e.target.value))}
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              disabled={page <= 1}
              onClick={() => setPage(1)}
            >
              «
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              ‹
            </button>
            <span className="small px-1 text-nowrap">
              Page {page} / {totalPages}
            </span>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              ›
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              disabled={page >= totalPages}
              onClick={() => setPage(totalPages)}
            >
              »
            </button>
          </div>
        </div>
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
        open={Boolean(banRow)}
        title={banRow?.is_frozen ? "Restore login?" : "Ban login (full account)?"}
        body={
          banRow?.is_frozen
            ? `Restore sign-in access for "${banRow?.name || banRow?.email}".`
            : `Block all sign-in for "${banRow?.name || banRow?.email}". Prefer mentor freeze unless you need a full ban.`
        }
        confirmText={banRow?.is_frozen ? "Unban login" : "Ban login"}
        onCancel={() => setBanRow(null)}
        onConfirm={confirmBanLogin}
      />
      <MentorFreezeModal
        open={Boolean(mentorFreezeRow)}
        row={mentorFreezeRow}
        busy={mentorFreezeBusy}
        onCancel={() => setMentorFreezeRow(null)}
        onConfirmFreeze={confirmMentorFreeze}
        onConfirmUnfreeze={confirmMentorUnfreeze}
      />
      {enableRichProfileView ? (
        <ProfileDetailsModal
          open={Boolean(viewingRow)}
          detail={profileDetail}
          loading={profileDetailLoading}
          onClose={() => {
            setViewingRow(null);
            setProfileDetail(null);
            if (openRowId && String(viewingRow?.id) === String(openRowId)) {
              onOpenRowHandled?.();
            }
          }}
          onBanLogin={(profile) => {
            setBanRow(profile);
          }}
          onFreezeMentor={(profile) => {
            openMentorFreeze({
              id: profile.id,
              name: profile.name,
              email: profile.email,
            });
          }}
        />
      ) : (
        <RowDetailsModal
          open={Boolean(viewingRow)}
          title={`Row details: ${tableName}`}
          data={viewingRow}
          fields={detailFields}
          onClose={() => {
            setViewingRow(null);
            if (openRowId && String(viewingRow?.id) === String(openRowId)) {
              onOpenRowHandled?.();
            }
          }}
        />
      )}
    </div>
  );
}
