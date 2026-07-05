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
import { useAudit } from "../../app/providers/AuditProvider.jsx";
import { canPlayRecording } from "../../utils/recording.js";

export function RecordingsPage() {
  const { config, environment } = useEnvironment();
  const { addLog } = useAudit();
  const [sdkRows, setSdkRows] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [playTarget, setPlayTarget] = useState(null);
  const [playLoadingId, setPlayLoadingId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredRows = useMemo(
    () => filterRowsBySearch(sdkRows, searchQuery, ["id", "roomId", "status", "sessionId"]),
    [sdkRows, searchQuery]
  );

  const searchHint = getSearchResultHint(filteredRows.length, sdkRows.length, searchQuery);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const sdkRecordings = await listVideoSdkRecordings(config);
      setSdkRows(sdkRecordings);
    } catch (err) {
      setError(err.message || "Failed to load recordings");
    } finally {
      setLoading(false);
    }
  }, [config]);

  useEffect(() => {
    load();
  }, [load]);

  const handlePlay = async (row) => {
    if (!row?.id) return;

    if (canPlayRecording(row)) {
      setPlayTarget(row);
      return;
    }

    setPlayLoadingId(row.id);
    setError("");
    try {
      const details = await getVideoSdkRecording(config, row.id);
      const merged = { ...row, ...details, file: details?.file || row.file };
      setPlayTarget(merged);
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
            <h4 className="mb-1">VideoSDK Recordings</h4>
            <div className="text-muted small">Play, preview, or delete session recordings from VideoSDK.</div>
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
          placeholder="Search recordings by id, room, or status…"
          hint={searchHint}
          disabled={loading && !sdkRows.length}
        />

        {loading && !sdkRows.length ? (
          <div className="d-flex align-items-center gap-2 text-muted py-3">
            <div className="spinner-border spinner-border-sm" role="status" />
            <span>Loading recordings…</span>
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
                      {searchQuery.trim() ? "No recordings match your search." : "No recordings found."}
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => {
                    const duration = row?.file?.meta?.duration;
                    const playable = canPlayRecording(row);
                    const isPlayLoading = playLoadingId === row.id;

                    return (
                      <tr key={row.id}>
                        <td className="text-truncate" style={{ maxWidth: 140 }} title={row.id}>
                          {row.id}
                        </td>
                        <td>{row.roomId || "—"}</td>
                        <td>
                          <span
                            className={`badge rounded-pill ${
                              playable ? "text-bg-success" : "text-bg-secondary"
                            }`}
                          >
                            {row.status || "—"}
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
                              title={playable ? "Play recording" : "Load and play recording"}
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
