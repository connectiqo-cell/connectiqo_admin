import { useCallback, useEffect, useMemo, useState } from "react";
import { SearchBar } from "../../components/common/SearchBar.jsx";
import { filterRowsBySearch, getSearchResultHint } from "../../utils/searchUtils.js";
import {
  deleteVideoSdkRecording,
  getVideoSdkRecording,
  listVideoSdkRecordings,
} from "../../services/adminApi.js";
import { useEnvironment } from "../../app/providers/EnvironmentProvider.jsx";
import { ConfirmModal } from "../../components/common/ConfirmModal.jsx";
import { RecordingPlayerModal } from "../../components/common/RecordingPlayerModal.jsx";
import { PaginationBar, paginateRows } from "../../components/common/PaginationBar.jsx";
import { useAudit } from "../../app/providers/AuditProvider.jsx";
import { getRecordingStatus, getRecordingStatusBadgeClass } from "../../utils/recording.js";

export function RecordingsPage() {
  const { config, environment } = useEnvironment();
  const { addLog } = useAudit();
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [playTarget, setPlayTarget] = useState(null);
  const [playLoadingId, setPlayLoadingId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const filteredRows = useMemo(
    () =>
      filterRowsBySearch(rows, searchQuery, ["id", "roomId", "status", "sessionId"]),
    [rows, searchQuery]
  );

  const pageRows = useMemo(
    () => paginateRows(filteredRows, page, pageSize),
    [filteredRows, page, pageSize]
  );

  const searchHint = getSearchResultHint(filteredRows.length, rows.length, searchQuery);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, pageSize]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const next = await listVideoSdkRecordings(config);
      setRows(next || []);
    } catch (err) {
      setRows([]);
      setError(err.message || "Failed to load VideoSDK recordings");
    } finally {
      setLoading(false);
    }
  }, [config]);

  useEffect(() => {
    load();
  }, [load]);

  const handlePlay = async (row) => {
    if (!row?.id) return;

    setPlayLoadingId(row.id);
    setError("");
    try {
      const details = await getVideoSdkRecording(config, row.id);
      setPlayTarget({ ...row, ...details, file: details?.file || row.file });
    } catch (err) {
      setError(err.message || "Could not load recording for playback");
    } finally {
      setPlayLoadingId(null);
    }
  };

  const confirmDelete = async () => {
    try {
      await deleteVideoSdkRecording(config, deleteTarget.id);
      addLog({
        action: "DELETE",
        entity: "videosdk_recording",
        environment,
        payload: deleteTarget,
      });
      setDeleteTarget(null);
      if (playTarget?.id === deleteTarget.id) setPlayTarget(null);
      await load();
    } catch (err) {
      setError(err.message || "Delete failed");
    }
  };

  return (
    <div className="d-grid gap-3">
      <div className="admin-card p-3 p-md-4">
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
          <div>
            <h4 className="mb-1">Recordings</h4>
            <div className="text-muted small">
              VideoSDK cloud recordings. Play loads the file URL only when you click play.
            </div>
          </div>
          <button
            type="button"
            className="btn btn-outline-primary btn-sm"
            onClick={load}
            disabled={loading}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        {error ? <div className="alert alert-danger">{error}</div> : null}

        <SearchBar
          className="mb-3"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by id, room, status…"
          hint={searchHint}
          disabled={loading && !rows.length}
        />

        {loading && !rows.length ? (
          <div className="d-flex align-items-center gap-2 text-muted py-3">
            <div className="spinner-border spinner-border-sm" role="status" />
            <span>Loading VideoSDK recordings (can take up to a minute)…</span>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table table-sm table-hover align-middle mb-0">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Room</th>
                  <th>Status</th>
                  <th>Duration</th>
                  <th style={{ width: 160 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {!filteredRows.length ? (
                  <tr>
                    <td colSpan={5} className="text-muted text-center py-4">
                      {searchQuery.trim()
                        ? "No recordings match your search."
                        : "No VideoSDK recordings found."}
                    </td>
                  </tr>
                ) : (
                  pageRows.map((row) => {
                    const duration = row?.duration ?? row?.file?.meta?.duration;
                    const isPlayLoading = playLoadingId === row.id;
                    const status = getRecordingStatus(row);

                    return (
                      <tr key={row.id}>
                        <td className="text-truncate" style={{ maxWidth: 140 }} title={row.id}>
                          {row.id}
                        </td>
                        <td>{row.roomId || "—"}</td>
                        <td>
                          <span className={`badge rounded-pill ${getRecordingStatusBadgeClass(status)}`}>
                            {status}
                          </span>
                        </td>
                        <td>
                          {duration != null ? `${Number(duration).toFixed(1)}s` : "—"}
                        </td>
                        <td>
                          <div className="btn-group btn-group-sm">
                            <button
                              type="button"
                              className="btn btn-outline-primary"
                              onClick={() => handlePlay(row)}
                              disabled={isPlayLoading}
                              title="Load and play recording"
                            >
                              {isPlayLoading ? (
                                <span
                                  className="spinner-border spinner-border-sm"
                                  role="status"
                                  aria-hidden="true"
                                />
                              ) : (
                                <span className="material-icons" style={{ fontSize: 18 }}>
                                  play_arrow
                                </span>
                              )}
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline-danger"
                              onClick={() => setDeleteTarget(row)}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
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
      </div>

      <RecordingPlayerModal
        open={Boolean(playTarget)}
        recording={playTarget}
        onClose={() => setPlayTarget(null)}
      />

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Delete VideoSDK recording"
        body="This will permanently delete the recording in VideoSDK."
        confirmText="Delete recording"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
