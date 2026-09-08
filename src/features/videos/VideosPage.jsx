import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { SearchBar } from "../../components/common/SearchBar.jsx";
import {
  deleteMentorUploadedVideo,
  getMentorUploadedVideo,
  listAllMentorUploadedVideos,
  setMentorVideoPromoted,
  updateMentorUploadedVideo,
} from "../../services/adminApi.js";
import { useEnvironment } from "../../app/providers/EnvironmentProvider.jsx";
import { ConfirmModal } from "../../components/common/ConfirmModal.jsx";
import { RecordingPlayerModal } from "../../components/common/RecordingPlayerModal.jsx";
import { PaginationBar } from "../../components/common/PaginationBar.jsx";
import { useAudit } from "../../app/providers/AuditProvider.jsx";
import { useToast } from "../../app/providers/ToastProvider.jsx";

const emptyEdit = {
  title: "",
  description: "",
  is_free: false,
  is_promoted: false,
};

export function VideosPage() {
  const { config, environment } = useEnvironment();
  const { addLog } = useAudit();
  const { addToast } = useToast();

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [playTarget, setPlayTarget] = useState(null);
  const [playLoadingId, setPlayLoadingId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState(emptyEdit);
  const [saving, setSaving] = useState(false);
  const [promoBusyId, setPromoBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { rows: next, total: count } = await listAllMentorUploadedVideos(config, {
        page,
        pageSize,
        search: appliedSearch,
      });
      setRows(next || []);
      setTotal(count || 0);
    } catch (err) {
      setRows([]);
      setTotal(0);
      setError(err.message || "Failed to load mentor videos");
    } finally {
      setLoading(false);
    }
  }, [config, page, pageSize, appliedSearch]);

  useEffect(() => {
    load();
  }, [load]);

  const runSearch = () => {
    setPage(1);
    setAppliedSearch(searchQuery.trim());
  };

  const handlePlay = async (row) => {
    if (!row?.id) return;
    setPlayLoadingId(row.id);
    setError("");
    try {
      const details = await getMentorUploadedVideo(config, row.id);
      if (!details?.video_url) {
        setError("This video has no playable URL.");
        return;
      }
      setPlayTarget({
        id: details.id,
        fileUrl: details.video_url,
        url: details.video_url,
        title: details.title,
      });
    } catch (err) {
      setError(err.message || "Could not load video for playback");
    } finally {
      setPlayLoadingId(null);
    }
  };

  const openEdit = (row) => {
    setEditTarget(row);
    setEditForm({
      title: row.title || "",
      description: row.description || "",
      is_free: Boolean(row.is_free),
      is_promoted: Boolean(row.is_promoted),
    });
  };

  const saveEdit = async () => {
    if (!editTarget?.id) return;
    setSaving(true);
    setError("");
    try {
      const updated = await updateMentorUploadedVideo(config, editTarget.id, {
        title: editForm.title.trim(),
        description: editForm.description.trim() || null,
        is_free: editForm.is_free,
        is_promoted: editForm.is_promoted,
      });
      addLog({
        action: "UPDATE",
        entity: "mentor_videos",
        environment,
        payload: updated,
      });
      addToast("Video updated");
      setEditTarget(null);
      await load();
    } catch (err) {
      setError(err.message || "Update failed — run mentor_videos promote migration if needed");
    } finally {
      setSaving(false);
    }
  };

  const togglePromote = async (row) => {
    if (!row?.id) return;
    setPromoBusyId(row.id);
    setError("");
    try {
      const next = !row.is_promoted;
      const updated = await setMentorVideoPromoted(config, row.id, next);
      addLog({
        action: "UPDATE",
        entity: "mentor_videos",
        environment,
        payload: { ...updated, _admin_action: next ? "promote" : "unpromote" },
      });
      addToast(next ? "Video promoted to top of feed" : "Promotion removed");
      await load();
    } catch (err) {
      setError(err.message || "Promote failed — run 20260906170000_fix_mentor_video_promote.sql");
    } finally {
      setPromoBusyId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget?.id) return;
    try {
      const full = await getMentorUploadedVideo(config, deleteTarget.id).catch(() => deleteTarget);
      await deleteMentorUploadedVideo(config, full);
      addLog({
        action: "DELETE",
        entity: "mentor_videos",
        environment,
        payload: deleteTarget,
      });
      addToast("Video deleted");
      setDeleteTarget(null);
      if (playTarget?.id === deleteTarget.id) setPlayTarget(null);
      await load();
    } catch (err) {
      setError(err.message || "Delete failed — run mentor_videos admin migration if needed");
      setDeleteTarget(null);
    }
  };

  return (
    <div className="d-grid gap-3">
      <div className="admin-card p-3 p-md-4">
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
          <div>
            <h4 className="mb-1">Uploaded videos</h4>
            <div className="text-muted small">
              Mentor library videos from the app Videos tab. Use Promote to pin a video at the top of
              the learner feed.
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

        <form
          className="d-flex flex-wrap gap-2 mb-3 align-items-start"
          onSubmit={(e) => {
            e.preventDefault();
            runSearch();
          }}
        >
          <div className="flex-grow-1" style={{ minWidth: 220 }}>
            <SearchBar
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search title, description, mentor…"
              disabled={loading && !rows.length}
            />
          </div>
          <button type="submit" className="btn btn-primary btn-sm">
            Search
          </button>
        </form>

        {loading && !rows.length ? (
          <div className="d-flex align-items-center gap-2 text-muted py-3">
            <div className="spinner-border spinner-border-sm" role="status" />
            <span>Loading videos…</span>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table table-sm table-hover align-middle mb-0">
              <thead>
                <tr>
                  <th style={{ width: 72 }}>Thumb</th>
                  <th>Title</th>
                  <th>Mentor</th>
                  <th>Access</th>
                  <th>Promo</th>
                  <th>Created</th>
                  <th style={{ width: 260 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {!rows.length ? (
                  <tr>
                    <td colSpan={7} className="text-muted text-center py-4">
                      {appliedSearch
                        ? "No videos match your search."
                        : "No mentor videos found."}
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => {
                    const isPlayLoading = playLoadingId === row.id;
                    return (
                      <tr key={row.id}>
                        <td>
                          {row.thumbnail_url ? (
                            <img
                              src={row.thumbnail_url}
                              alt=""
                              className="rounded"
                              style={{ width: 56, height: 40, objectFit: "cover" }}
                            />
                          ) : (
                            <div
                              className="rounded bg-secondary-subtle d-flex align-items-center justify-content-center"
                              style={{ width: 56, height: 40 }}
                            >
                              <span className="material-icons text-muted" style={{ fontSize: 18 }}>
                                movie
                              </span>
                            </div>
                          )}
                        </td>
                        <td>
                          <div className="fw-semibold text-truncate" style={{ maxWidth: 220 }}>
                            {row.title || "Untitled"}
                          </div>
                          <div className="text-muted small font-monospace text-truncate" style={{ maxWidth: 220 }}>
                            {row.id}
                          </div>
                        </td>
                        <td>
                          <Link to={`/users/${row.mentor_id}`} className="text-decoration-none">
                            {row.mentor_name || row.mentor_email || row.mentor_id}
                          </Link>
                        </td>
                        <td>
                          <span
                            className={`badge rounded-pill ${
                              row.is_free ? "text-bg-success" : "text-bg-secondary"
                            }`}
                          >
                            {row.is_free ? "Free" : "Paid"}
                          </span>
                        </td>
                        <td>
                          {row.is_promoted ? (
                            <span className="badge rounded-pill text-bg-warning">Promoted</span>
                          ) : (
                            <span className="text-muted small">—</span>
                          )}
                        </td>
                        <td className="small text-muted">
                          {row.created_at ? new Date(row.created_at).toLocaleString() : "—"}
                        </td>
                        <td>
                          <div className="btn-group btn-group-sm">
                            <button
                              type="button"
                              className="btn btn-outline-primary"
                              onClick={() => handlePlay(row)}
                              disabled={isPlayLoading}
                              title="Play"
                            >
                              {isPlayLoading ? (
                                <span className="spinner-border spinner-border-sm" role="status" />
                              ) : (
                                <span className="material-icons" style={{ fontSize: 18 }}>
                                  play_arrow
                                </span>
                              )}
                            </button>
                            <button
                              type="button"
                              className={`btn ${
                                row.is_promoted ? "btn-warning" : "btn-outline-warning"
                              }`}
                              onClick={() => togglePromote(row)}
                              disabled={promoBusyId === row.id}
                              title={
                                row.is_promoted
                                  ? "Remove from top of Videos feed"
                                  : "Pin to top of Videos feed"
                              }
                            >
                              {promoBusyId === row.id
                                ? "…"
                                : row.is_promoted
                                  ? "Unpromote"
                                  : "Promote"}
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline-secondary"
                              onClick={() => openEdit(row)}
                            >
                              Edit
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
          total={total}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      </div>

      {editTarget ? (
        <div className="modal modal-futuristic d-block" tabIndex={-1} role="dialog">
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Edit video</h5>
                <button
                  type="button"
                  className="btn-close"
                  aria-label="Close"
                  onClick={() => setEditTarget(null)}
                />
              </div>
              <div className="modal-body d-grid gap-3">
                <div>
                  <label className="form-label small">Title</label>
                  <input
                    className="form-control"
                    value={editForm.title}
                    onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="form-label small">Description</label>
                  <textarea
                    className="form-control"
                    rows={3}
                    value={editForm.description}
                    onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                  />
                </div>
                <div className="d-grid gap-2">
                  <div className="form-check">
                    <input
                      id="video-is-free"
                      type="checkbox"
                      className="form-check-input"
                      checked={editForm.is_free}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, is_free: e.target.checked }))
                      }
                    />
                    <label className="form-check-label" htmlFor="video-is-free">
                      Free (visible without unlock)
                    </label>
                  </div>
                  <div className="form-check">
                    <input
                      id="video-is-promoted"
                      type="checkbox"
                      className="form-check-input"
                      checked={editForm.is_promoted}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, is_promoted: e.target.checked }))
                      }
                    />
                    <label className="form-check-label" htmlFor="video-is-promoted">
                      Promote to top of learner Videos feed
                    </label>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={() => setEditTarget(null)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={saveEdit}
                  disabled={saving}
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <RecordingPlayerModal
        open={Boolean(playTarget)}
        recording={playTarget}
        onClose={() => setPlayTarget(null)}
      />

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Delete uploaded video"
        body={`Permanently delete "${deleteTarget?.title || "this video"}" from the mentor library and storage.`}
        confirmText="Delete video"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
