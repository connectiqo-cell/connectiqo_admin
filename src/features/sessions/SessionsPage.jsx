import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  listAppSessionsFromBookings,
  listVideoSdkSessions,
} from "../../services/adminApi.js";
import { useEnvironment } from "../../app/providers/EnvironmentProvider.jsx";
import { DataTable } from "../../components/common/DataTable.jsx";
import { RowDetailsModal } from "../../components/common/RowDetailsModal.jsx";
import { SearchBar } from "../../components/common/SearchBar.jsx";
import { PaginationBar, paginateRows } from "../../components/common/PaginationBar.jsx";
import { HScroll } from "../../components/common/HScroll.jsx";
import { filterRowsBySearch, getSearchResultHint } from "../../utils/searchUtils.js";

export function SessionsPage() {
  const { config } = useEnvironment();
  const [sdkRows, setSdkRows] = useState([]);
  const [appRows, setAppRows] = useState([]);
  const [source, setSource] = useState("app");
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [loading, setLoading] = useState(false);
  const [viewingRow, setViewingRow] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sdkLoading, setSdkLoading] = useState(false);
  const [sdkLoaded, setSdkLoaded] = useState(false);

  const activeRows = source === "sdk" ? sdkRows : appRows;

  const filteredRows = useMemo(
    () =>
      filterRowsBySearch(activeRows, searchQuery, [
        "start",
        "end",
        "roomId",
        "id",
        "status",
        "mentor_name",
        "learner_name",
      ]),
    [activeRows, searchQuery]
  );

  const pageRows = useMemo(
    () => paginateRows(filteredRows, page, pageSize),
    [filteredRows, page, pageSize]
  );

  const searchHint = getSearchResultHint(filteredRows.length, activeRows.length, searchQuery);

  useEffect(() => {
    setPage(1);
  }, [source, searchQuery, pageSize]);

  const loadApp = useCallback(async () => {
    setLoading(true);
    setError("");
    setWarning("");
    try {
      const rows = await listAppSessionsFromBookings(config, { limit: 300 });
      setAppRows(rows || []);
    } catch (err) {
      setAppRows([]);
      setError(err.message || "Failed to load app sessions");
    } finally {
      setLoading(false);
    }
  }, [config]);

  const loadSdk = useCallback(async () => {
    setSdkLoading(true);
    setWarning("");
    try {
      const rows = await listVideoSdkSessions(config);
      setSdkRows(rows || []);
      setSdkLoaded(true);
    } catch (err) {
      setSdkRows([]);
      setSdkLoaded(true);
      setWarning(`VideoSDK: ${err.message || "failed"}`);
    } finally {
      setSdkLoading(false);
    }
  }, [config]);

  useEffect(() => {
    loadApp();
  }, [loadApp]);

  useEffect(() => {
    if (source === "sdk" && !sdkLoaded && !sdkLoading) {
      loadSdk();
    }
  }, [source, sdkLoaded, sdkLoading, loadSdk]);

  const load = useCallback(async () => {
    setSdkLoaded(false);
    await loadApp();
    if (source === "sdk") {
      await loadSdk();
    }
  }, [loadApp, loadSdk, source]);

  return (
    <div className="admin-card p-3 p-md-4">
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <div>
          <div className="text-muted small">
            Bookings with a meeting room from the app, plus live VideoSDK sessions when the token
            endpoint works.
          </div>
        </div>
        <button type="button" className="btn btn-outline-primary btn-sm" onClick={load} disabled={loading || sdkLoading}>
          {loading || sdkLoading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <HScroll className="mb-3">
        <button
          type="button"
          className={`btn btn-sm ${source === "app" ? "btn-primary" : "btn-outline-secondary"}`}
          onClick={() => setSource("app")}
        >
          App meetings
          <span className="badge rounded-pill bg-secondary-subtle text-secondary-emphasis ms-2">
            {appRows.length}
          </span>
        </button>
        <button
          type="button"
          className={`btn btn-sm ${source === "sdk" ? "btn-primary" : "btn-outline-secondary"}`}
          onClick={() => setSource("sdk")}
        >
          VideoSDK
          <span className="badge rounded-pill bg-secondary-subtle text-secondary-emphasis ms-2">
            {sdkLoading ? "…" : sdkRows.length}
          </span>
        </button>
      </HScroll>

      <SearchBar
        className="mb-3"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Search by room, creator, booked by, or status…"
        hint={searchHint}
      />

      {error ? <div className="alert alert-danger">{error}</div> : null}
      {warning && !error ? <div className="alert alert-warning py-2 small">{warning}</div> : null}

      {loading ? (
        <div className="d-flex align-items-center gap-2 text-muted py-3">
          <div className="spinner-border spinner-border-sm" role="status" />
          <span>Loading sessions…</span>
        </div>
      ) : source === "sdk" && sdkLoading && !sdkRows.length ? (
        <div className="d-flex align-items-center gap-2 text-muted py-3">
          <div className="spinner-border spinner-border-sm" role="status" />
          <span>Loading VideoSDK sessions (can take up to a minute)…</span>
        </div>
      ) : source === "app" ? (
        <div className="table-wrap">
          <table className="table table-sm table-hover align-middle mb-0">
            <thead>
              <tr>
                <th>Room</th>
                <th>Creator</th>
                <th>Booked by</th>
                <th>Status</th>
                <th>Created</th>
                <th style={{ width: 120 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {!filteredRows.length ? (
                <tr>
                  <td colSpan={6} className="text-muted text-center py-4">
                    {searchQuery.trim()
                      ? "No sessions match your search."
                      : "No app meetings with a room id found."}
                  </td>
                </tr>
              ) : (
                pageRows.map((row) => (
                  <tr key={row.id}>
                    <td className="text-truncate" style={{ maxWidth: 140 }} title={row.roomId}>
                      {row.roomId || "—"}
                    </td>
                    <td>{row.mentor_name || "—"}</td>
                    <td>{row.learner_name || "—"}</td>
                    <td>
                      <span className="badge rounded-pill text-bg-secondary">{row.status || "—"}</span>
                    </td>
                    <td>{row.start ? new Date(row.start).toLocaleString() : "—"}</td>
                    <td>
                      <div className="btn-group btn-group-sm">
                        <button
                          type="button"
                          className="btn btn-outline-secondary"
                          onClick={() => setViewingRow(row)}
                        >
                          View
                        </button>
                        {row.mentor_id ? (
                          <Link className="btn btn-outline-primary" to={`/users/${row.mentor_id}`}>
                            Creator
                          </Link>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <DataTable
          rows={pageRows}
          visibleColumns={[
            { key: "start", label: "Started", kind: "datetime" },
            { key: "end", label: "Ended", kind: "datetime" },
            { key: "roomId", label: "Room" },
            "status",
          ]}
          onView={setViewingRow}
        />
      )}

      <PaginationBar
        page={page}
        pageSize={pageSize}
        total={filteredRows.length}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
      />

      <RowDetailsModal
        open={Boolean(viewingRow)}
        title="Session details"
        data={viewingRow}
        onClose={() => setViewingRow(null)}
      />
    </div>
  );
}
