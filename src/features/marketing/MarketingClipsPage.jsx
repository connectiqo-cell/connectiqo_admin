import { useCallback, useEffect, useState } from "react";
import {
  createTableRow,
  deleteTableRow,
  deleteMarketingStorageObjectByPublicUrl,
  listTableRows,
  updateTableRow,
  uploadMarketingClipFile,
} from "../../services/adminApi.js";
import { useEnvironment } from "../../app/providers/EnvironmentProvider.jsx";
import { useAudit } from "../../app/providers/AuditProvider.jsx";
import { ConfirmModal } from "../../components/common/ConfirmModal.jsx";

const emptyForm = {
  title: "",
  subtitle: "",
  clip_type: "youtube",
  youtube_video_id: "",
  media_url: "",
  sort_order: 0,
  is_active: true,
};

export function MarketingClipsPage() {
  const { config, environment } = useEnvironment();
  const { addLog } = useAudit();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { rows: data } = await listTableRows(config, "home_marketing_clips", 200);
      setRows(data || []);
    } catch (err) {
      setError(err.message || "Failed to load clips (run migration 006 if table is missing).");
    } finally {
      setLoading(false);
    }
  }, [config]);

  useEffect(() => {
    load();
  }, [load]);

  const resetForm = () => {
    setForm(emptyForm);
    setEditing(null);
  };

  const startEdit = (row) => {
    setEditing(row);
    setForm({
      title: row.title || "",
      subtitle: row.subtitle || "",
      clip_type: row.clip_type === "url" ? "url" : "youtube",
      youtube_video_id: row.youtube_video_id || "",
      media_url: row.media_url || "",
      sort_order: Number(row.sort_order) || 0,
      is_active: Boolean(row.is_active),
    });
  };

  const submit = async () => {
    setError("");
    try {
      const payload = {
        title: form.title.trim(),
        subtitle: form.subtitle.trim() || null,
        clip_type: form.clip_type === "url" ? "url" : "youtube",
        youtube_video_id:
          form.clip_type === "youtube" ? form.youtube_video_id.trim() || null : null,
        media_url: form.clip_type === "url" ? form.media_url.trim() || null : null,
        sort_order: Number(form.sort_order) || 0,
        is_active: Boolean(form.is_active),
      };
      if (!payload.title) {
        setError("Title is required.");
        return;
      }
      if (payload.clip_type === "youtube" && !payload.youtube_video_id) {
        setError("YouTube video ID is required for YouTube clips.");
        return;
      }
      if (payload.clip_type === "url" && !payload.media_url) {
        setError("Media URL is required for uploaded / direct URL clips.");
        return;
      }

      if (editing?.id) {
        const updated = await updateTableRow(config, "home_marketing_clips", editing.id, payload);
        addLog({ action: "UPDATE", entity: "home_marketing_clips", environment, payload: updated });
      } else {
        const created = await createTableRow(config, "home_marketing_clips", payload);
        addLog({ action: "CREATE", entity: "home_marketing_clips", environment, payload: created });
      }
      resetForm();
      await load();
    } catch (err) {
      setError(err.message || "Save failed");
    }
  };

  const onPickFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const url = await uploadMarketingClipFile(config, file);
      setForm((prev) => ({
        ...prev,
        clip_type: "url",
        media_url: url,
      }));
    } catch (err) {
      setError(err.message || "Upload failed (check storage bucket marketing-clips).");
    } finally {
      setUploading(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget?.id) return;
    setError("");
    try {
      const url = deleteTarget.media_url;
      if (url && String(url).includes("marketing-clips")) {
        try {
          await deleteMarketingStorageObjectByPublicUrl(config, url);
        } catch {
          /* still remove DB row */
        }
      }
      await deleteTableRow(config, "home_marketing_clips", deleteTarget.id);
      addLog({
        action: "DELETE",
        entity: "home_marketing_clips",
        environment,
        payload: deleteTarget,
      });
      setDeleteTarget(null);
      if (editing?.id === deleteTarget.id) resetForm();
      await load();
    } catch (err) {
      setError(err.message || "Delete failed");
    }
  };

  return (
    <div className="d-grid gap-3">
      <div className="admin-card p-3 p-md-4">
        <h4 className="mb-2">Home marketing clips</h4>
        <p className="text-muted mb-3">
          Clips appear on the app home screen. Use YouTube (video ID only) or upload MP4/WebM to public storage
          (direct URL playback).
        </p>
        {error ? <div className="alert alert-danger">{error}</div> : null}

        <div className="row g-3">
          <div className="col-12 col-md-6">
            <label className="form-label">Title</label>
            <input
              className="form-control"
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
            />
          </div>
          <div className="col-12 col-md-6">
            <label className="form-label">Subtitle</label>
            <input
              className="form-control"
              value={form.subtitle}
              onChange={(e) => setForm((p) => ({ ...p, subtitle: e.target.value }))}
            />
          </div>
          <div className="col-12 col-md-4">
            <label className="form-label">Type</label>
            <select
              className="form-select"
              value={form.clip_type}
              onChange={(e) => setForm((p) => ({ ...p, clip_type: e.target.value }))}
            >
              <option value="youtube">YouTube</option>
              <option value="url">Direct URL / upload</option>
            </select>
          </div>
          <div className="col-12 col-md-4">
            <label className="form-label">Sort order</label>
            <input
              type="number"
              className="form-control"
              value={form.sort_order}
              onChange={(e) => setForm((p) => ({ ...p, sort_order: e.target.value }))}
            />
          </div>
          <div className="col-12 col-md-4">
            <label className="form-label">Active</label>
            <select
              className="form-select"
              value={form.is_active ? "true" : "false"}
              onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.value === "true" }))}
            >
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </div>
          {form.clip_type === "youtube" ? (
            <div className="col-12 col-md-8">
              <label className="form-label">YouTube video ID</label>
              <input
                className="form-control"
                placeholder="e.g. qp0HIF3SfI4"
                value={form.youtube_video_id}
                onChange={(e) => setForm((p) => ({ ...p, youtube_video_id: e.target.value }))}
              />
            </div>
          ) : (
            <div className="col-12 col-md-8">
              <label className="form-label">Media URL</label>
              <input
                className="form-control"
                placeholder="https://…"
                value={form.media_url}
                onChange={(e) => setForm((p) => ({ ...p, media_url: e.target.value }))}
              />
              <div className="mt-2">
                <label className="btn btn-outline-secondary btn-sm mb-0">
                  {uploading ? "Uploading…" : "Upload video file"}
                  <input type="file" accept="video/mp4,video/webm,video/quicktime" hidden onChange={onPickFile} />
                </label>
              </div>
            </div>
          )}
          <div className="col-12 d-flex gap-2 flex-wrap">
            <button type="button" className="btn btn-primary" onClick={submit}>
              {editing ? "Update clip" : "Add clip"}
            </button>
            <button type="button" className="btn btn-outline-secondary" onClick={resetForm}>
              Clear
            </button>
          </div>
        </div>
      </div>

      <div className="admin-card p-3 p-md-4">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h5 className="mb-0">Configured clips</h5>
          <button type="button" className="btn btn-sm btn-outline-primary" onClick={load} disabled={loading}>
            Refresh
          </button>
        </div>
        {loading ? <div className="text-muted">Loading…</div> : null}
        {!loading && !rows.length ? <div className="text-muted">No clips yet.</div> : null}
        {!loading && rows.length > 0 ? (
          <div className="admin-table-shell">
            <div className="admin-table-scroll table-wrap">
            <table className="table admin-table mb-0">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Title</th>
                  <th>Type</th>
                  <th>Source</th>
                  <th>Active</th>
                  <th style={{ width: 220 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.sort_order}</td>
                    <td>{row.title}</td>
                    <td>{row.clip_type}</td>
                    <td className="small text-truncate" style={{ maxWidth: 200 }} title={row.youtube_video_id || row.media_url}>
                      {row.clip_type === "youtube" ? row.youtube_video_id : row.media_url}
                    </td>
                    <td>{row.is_active ? "Yes" : "No"}</td>
                    <td>
                      <div className="btn-group btn-group-sm">
                        <button type="button" className="btn btn-outline-primary" onClick={() => startEdit(row)}>
                          Edit
                        </button>
                        <button type="button" className="btn btn-outline-danger" onClick={() => setDeleteTarget(row)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        ) : null}
      </div>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Delete marketing clip"
        body="Remove this clip from the home screen. Uploaded files in storage may also be removed."
        confirmText="Delete"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
