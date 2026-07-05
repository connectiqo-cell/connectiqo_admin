import { useMemo, useState } from "react";
import { useAudit } from "../../app/providers/AuditProvider.jsx";
import { SearchBar } from "../../components/common/SearchBar.jsx";
import { filterRowsBySearch, getSearchResultHint } from "../../utils/searchUtils.js";

const AUDIT_COLUMNS = ["timestamp", "environment", "action", "entity", "actorEmail", "payload"];

export function AuditLogPage() {
  const { logs } = useAudit();
  const [searchQuery, setSearchQuery] = useState("");

  const filteredLogs = useMemo(
    () => filterRowsBySearch(logs, searchQuery, AUDIT_COLUMNS),
    [logs, searchQuery]
  );

  const searchHint = getSearchResultHint(filteredLogs.length, logs.length, searchQuery);

  return (
    <div className="admin-card p-3 p-md-4">
      <h4 className="mb-1">Audit Logs</h4>
      <p className="text-muted small mb-3">All destructive and mutation actions are tracked here.</p>

      <SearchBar
        className="mb-3"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Search by action, entity, environment…"
        hint={searchHint}
      />

      <div className="table-wrap">
        <table className="table table-sm table-hover align-middle mb-0">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Environment</th>
              <th>Action</th>
              <th>Entity</th>
              <th>Actor</th>
              <th>Payload</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.map((log) => (
              <tr key={log.id}>
                <td style={{ whiteSpace: "nowrap" }}>{new Date(log.timestamp).toLocaleString()}</td>
                <td>{log.environment}</td>
                <td>
                  <span className="badge text-bg-secondary">{log.action}</span>
                </td>
                <td>{log.entity}</td>
                <td>{log.actorEmail || "—"}</td>
                <td>
                  <pre className="json-pre mb-0">{JSON.stringify(log.payload, null, 2)}</pre>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!filteredLogs.length ? (
        <div className="text-muted py-3 text-center small">
          {searchQuery.trim() ? "No audit events match your search." : "No audit events yet."}
        </div>
      ) : null}
    </div>
  );
}
