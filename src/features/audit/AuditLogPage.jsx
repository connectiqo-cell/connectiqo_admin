import { useMemo } from "react";
import { useAudit } from "../../app/providers/AuditProvider.jsx";
import { Badge } from "../../components/common/CellValue.jsx";
import { PaginationBar, paginateRows } from "../../components/common/PaginationBar.jsx";
import { SearchBar } from "../../components/common/SearchBar.jsx";
import { formatDateTime } from "../../utils/formatters.js";
import { filterRowsBySearch, getSearchResultHint } from "../../utils/searchUtils.js";
import { describeAction, filterOptions, humanize, payloadRows } from "./auditFormat.js";
import { useUrlNumber, useUrlState } from "../../hooks/useUrlState.js";

const AUDIT_COLUMNS = ["timestamp", "environment", "action", "entity", "actorEmail", "payload"];

function Details({ payload }) {
  const rows = payloadRows(payload);
  if (!rows.length) return <span className="text-muted">—</span>;
  return (
    <details>
      <summary className="small">View details</summary>
      <dl className="details-list mb-0 mt-1">
        {rows.map(([label, value]) => (
          <div className="details-list__item" key={label}>
            <dt>{label}</dt>
            <dd className="small text-break">{value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

export function AuditLogPage() {
  const { logs, maxLogs } = useAudit();
  const [searchQuery, setSearchQuery] = useUrlState("q", "");
  const [action, setAction] = useUrlState("action", "all");
  const [entity, setEntity] = useUrlState("area", "all");
  const [page, setPage] = useUrlNumber("page", 1);
  const [pageSize, setPageSize] = useUrlNumber("size", 25);

  const actionOptions = useMemo(() => filterOptions(logs, "action", (value) => describeAction(value).label), [logs]);
  const entityOptions = useMemo(() => filterOptions(logs, "entity", humanize), [logs]);

  const filteredLogs = useMemo(
    () =>
      filterRowsBySearch(logs, searchQuery, AUDIT_COLUMNS).filter(
        (log) => (action === "all" || log.action === action) && (entity === "all" || log.entity === entity)
      ),
    [logs, searchQuery, action, entity]
  );

  const searchHint = getSearchResultHint(filteredLogs.length, logs.length, searchQuery);
  const visibleLogs = paginateRows(filteredLogs, page, pageSize);
  const resetPage = (setter) => (e) => { setter(e.target.value); setPage(1); };

  return (
    <div className="admin-card p-3 p-md-4">
      <p className="text-muted small mb-3">Every change made in this panel, plus payments confirmed automatically.</p>

      <div className="d-flex flex-wrap align-items-start gap-2 mb-3">
        <SearchBar
          className="flex-grow-1"
          value={searchQuery}
          onChange={resetPage(setSearchQuery)}
          placeholder="Search by person, area or details…"
          hint={searchHint}
        />
        <select className="form-select" style={{ maxWidth: 240 }} value={action} onChange={resetPage(setAction)} aria-label="Filter by action">
          <option value="all">All actions</option>
          {actionOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select className="form-select" style={{ maxWidth: 240 }} value={entity} onChange={resetPage(setEntity)} aria-label="Filter by area">
          <option value="all">All areas</option>
          {entityOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>

      {logs.length >= maxLogs ? (
        <p className="text-muted small">Showing the newest {maxLogs.toLocaleString()} events. Older ones aren&apos;t searched.</p>
      ) : null}

      <div className="table-wrap">
        <table className="table table-sm table-hover align-middle mb-0">
          <thead>
            <tr>
              <th>When</th>
              <th>Action</th>
              <th>Area</th>
              <th>By</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {visibleLogs.map((log) => {
              const { label, tone } = describeAction(log.action);
              const specific = log.payload?._admin_action;
              return (
                <tr key={log.id}>
                  <td className="small" style={{ whiteSpace: "nowrap" }}>{formatDateTime(log.timestamp)}</td>
                  <td>
                    <Badge tone={tone}>{label}</Badge>
                    {specific ? <div className="text-muted small mt-1">{humanize(specific)}</div> : null}
                  </td>
                  <td>{humanize(log.entity) || "—"}</td>
                  <td className="small">{log.actorEmail || <span className="text-muted">System</span>}</td>
                  <td><Details payload={log.payload} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!filteredLogs.length ? (
        <div className="text-muted py-3 text-center small">
          {logs.length ? "No audit events match your filters." : "No audit events yet."}
        </div>
      ) : null}
      <div className="mt-3">
        <PaginationBar
          page={page}
          pageSize={pageSize}
          total={filteredLogs.length}
          onPageChange={setPage}
          onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
        />
      </div>
    </div>
  );
}
