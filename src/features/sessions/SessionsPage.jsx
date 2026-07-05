import { useCallback, useEffect, useMemo, useState } from "react";
import { listVideoSdkSessions } from "../../services/adminApi.js";
import { useEnvironment } from "../../app/providers/EnvironmentProvider.jsx";
import { DataTable } from "../../components/common/DataTable.jsx";
import { RowDetailsModal } from "../../components/common/RowDetailsModal.jsx";
import { SearchBar } from "../../components/common/SearchBar.jsx";
import { filterRowsBySearch, getSearchResultHint } from "../../utils/searchUtils.js";

const SESSION_COLUMNS = ["start", "end", "roomId", "id", "status"];

export function SessionsPage() {
  const { config } = useEnvironment();
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [viewingRow, setViewingRow] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const sessions = await listVideoSdkSessions(config);
      setRows(sessions);
    } catch (err) {
      setError(err.message || "Failed to load VideoSDK sessions");
    } finally {
      setLoading(false);
    }
  }, [config]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredRows = useMemo(
    () => filterRowsBySearch(rows, searchQuery, SESSION_COLUMNS),
    [rows, searchQuery]
  );

  const searchHint = getSearchResultHint(filteredRows.length, rows.length, searchQuery);

  return (
    <div className="admin-card p-3 p-md-4">
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <div>
          <h4 className="mb-1">VideoSDK Sessions</h4>
          <div className="text-muted small">Inspect all sessions from VideoSDK API.</div>
        </div>
        <button type="button" className="btn btn-outline-primary btn-sm" onClick={load} disabled={loading}>
          Refresh
        </button>
      </div>

      <SearchBar
        className="mb-3"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Search sessions by room, id, or status…"
        hint={searchHint}
        disabled={loading}
      />

      {error ? <div className="alert alert-danger">{error}</div> : null}
      {loading ? (
        <div className="d-flex align-items-center gap-2 text-muted py-3">
          <div className="spinner-border spinner-border-sm" role="status" />
          <span>Loading sessions…</span>
        </div>
      ) : (
        <DataTable
          rows={filteredRows}
          visibleColumns={["start", "end", "roomId"]}
          onView={setViewingRow}
        />
      )}

      <RowDetailsModal
        open={Boolean(viewingRow)}
        title="Session details"
        data={viewingRow}
        onClose={() => setViewingRow(null)}
      />
    </div>
  );
}
