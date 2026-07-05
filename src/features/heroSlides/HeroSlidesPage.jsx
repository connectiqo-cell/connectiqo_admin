import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SearchBar } from "../../components/common/SearchBar.jsx";
import { filterRowsBySearch, getSearchResultHint } from "../../utils/searchUtils.js";
import {
  createTableRow,
  deleteTableRow,
  deleteHeroSlideStorage,
  listTableRows,
  updateTableRow,
  uploadHeroSlide,
} from "../../services/adminApi.js";
import { useEnvironment } from "../../app/providers/EnvironmentProvider.jsx";
import { useToast } from "../../app/providers/ToastProvider.jsx";
import { useAudit } from "../../app/providers/AuditProvider.jsx";
import { ConfirmModal } from "../../components/common/ConfirmModal.jsx";

// ─── Edit Modal ───────────────────────────────────────────────────────────────
function EditSlideModal({ open, slide, onClose, onSave }) {
  const [position, setPosition]   = useState(0);
  const [isActive, setIsActive]   = useState(true);

  useEffect(() => {
    if (slide) {
      setPosition(slide.position ?? 0);
      setIsActive(slide.is_active ?? true);
    }
  }, [slide, open]);

  if (!open || !slide) return null;

  return (
    <div className="modal d-block" style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }} tabIndex="-1">
      <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: 400 }}>
        <div className="modal-content" style={{ background: "var(--admin-surface)", border: "1px solid var(--admin-border)", color: "var(--admin-text)" }}>
          <div className="modal-header" style={{ borderColor: "var(--admin-border)" }}>
            <h5 className="modal-title">Edit Slide</h5>
            <button type="button" className="btn-close" style={{ filter: "invert(1) opacity(0.7)" }} onClick={onClose} />
          </div>
          <div className="modal-body d-grid gap-3">
            <img
              src={slide.image_url}
              alt="slide preview"
              style={{ width: "100%", height: 160, objectFit: "cover", borderRadius: 8 }}
            />
            <div>
              <label className="form-label fw-semibold small" style={{ color: "var(--admin-muted)" }}>Position (lower = first)</label>
              <input
                type="number"
                className="form-control"
                min={0}
                value={position}
                onChange={(e) => setPosition(Number(e.target.value))}
              />
            </div>
            <div className="form-check">
              <input
                type="checkbox"
                className="form-check-input"
                id="slide-active"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              <label className="form-check-label" htmlFor="slide-active">Active (visible in app)</label>
            </div>
          </div>
          <div className="modal-footer" style={{ borderColor: "var(--admin-border)" }}>
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={() => onSave({ position, is_active: isActive })}>Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Upload Zone ──────────────────────────────────────────────────────────────
function UploadZone({ onUpload, uploading }) {
  const inputRef  = useRef(null);
  const [preview, setPreview]   = useState(null);
  const [file, setFile]         = useState(null);
  const [position, setPosition] = useState(0);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = (f) => {
    if (!f || !f.type.startsWith("image/")) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const reset = () => {
    setFile(null);
    setPreview(null);
    setPosition(0);
    if (inputRef.current) inputRef.current.value = "";
  };

  const submit = async () => {
    if (!file) return;
    await onUpload(file, position);
    reset();
  };

  return (
    <div className="admin-card p-3 p-md-4 mb-3">
      <h5 className="mb-1">Upload Hero Slide</h5>
      <p className="text-muted small mb-3">Images are uploaded to the <code>hero_slides</code> bucket and displayed as full-width slides in the app.</p>

      {!preview ? (
        <div
          onClick={() => inputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          style={{
            border: `2px dashed ${dragOver ? "var(--admin-accent)" : "var(--admin-border)"}`,
            borderRadius: 10,
            background: dragOver ? "var(--admin-accent-soft)" : "var(--admin-surface-2)",
            padding: "40px 20px",
            textAlign: "center",
            cursor: "pointer",
            transition: "all 180ms",
          }}
        >
          <span className="material-icons" style={{ fontSize: 40, color: "var(--admin-muted)" }}>add_photo_alternate</span>
          <div className="mt-2 fw-semibold">Click or drag an image here</div>
          <div className="text-muted small mt-1">PNG, JPG, WEBP supported</div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => handleFile(e.target.files[0])}
          />
        </div>
      ) : (
        <div className="row g-3 align-items-end">
          <div className="col-12 col-md-6">
            <img
              src={preview}
              alt="preview"
              style={{ width: "100%", height: 200, objectFit: "cover", borderRadius: 8, border: "1px solid var(--admin-border)" }}
            />
          </div>
          <div className="col-12 col-md-6 d-grid gap-3">
            <div>
              <label className="form-label fw-semibold small" style={{ color: "var(--admin-muted)" }}>File</label>
              <div className="text-muted small">{file.name} ({(file.size / 1024).toFixed(1)} KB)</div>
            </div>
            <div>
              <label className="form-label fw-semibold small" style={{ color: "var(--admin-muted)" }}>Position (lower = first)</label>
              <input
                type="number"
                className="form-control"
                min={0}
                value={position}
                onChange={(e) => setPosition(Number(e.target.value))}
              />
            </div>
            <div className="d-flex gap-2">
              <button className="btn btn-primary" onClick={submit} disabled={uploading}>
                {uploading ? (
                  <><span className="spinner-border spinner-border-sm me-2" />Uploading...</>
                ) : "Upload Slide"}
              </button>
              <button className="btn btn-outline-secondary" onClick={reset} disabled={uploading}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export function HeroSlidesPage() {
  const { config, environment } = useEnvironment();
  const { addToast } = useToast();
  const { addLog } = useAudit();

  const [slides, setSlides]       = useState([]);
  const [loading, setLoading]     = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editSlide, setEditSlide] = useState(null);
  const [deleteSlide, setDeleteSlide] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredSlides = useMemo(
    () => filterRowsBySearch(slides, searchQuery, ["id", "position", "image_url", "is_active"]),
    [slides, searchQuery]
  );

  const searchHint = getSearchResultHint(filteredSlides.length, slides.length, searchQuery);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listTableRows(config, "hero_slides", { limit: 200 });
      setSlides(result.rows || []);
    } catch (err) {
      addToast(err.message || "Failed to load slides", "error");
    } finally {
      setLoading(false);
    }
  }, [config]);

  useEffect(() => { load(); }, [load]);

  const handleUpload = async (file, position) => {
    setUploading(true);
    try {
      const { publicUrl, storagePath } = await uploadHeroSlide(config, file);
      const created = await createTableRow(config, "hero_slides", {
        image_url: publicUrl,
        storage_path: storagePath,
        position,
        is_active: true,
      });
      addLog({ action: "CREATE", entity: "hero_slides", environment, payload: created });
      addToast("Slide uploaded successfully");
      await load();
    } catch (err) {
      addToast(err.message || "Upload failed", "error");
    } finally {
      setUploading(false);
    }
  };

  const handleEdit = async (updates) => {
    try {
      const updated = await updateTableRow(config, "hero_slides", editSlide.id, updates);
      addLog({ action: "UPDATE", entity: "hero_slides", environment, payload: updated });
      addToast("Slide updated");
      setEditSlide(null);
      await load();
    } catch (err) {
      addToast(err.message || "Update failed", "error");
    }
  };

  const handleDelete = async () => {
    try {
      await deleteTableRow(config, "hero_slides", deleteSlide.id);
      await deleteHeroSlideStorage(config, deleteSlide.storage_path);
      addLog({ action: "DELETE", entity: "hero_slides", environment, payload: deleteSlide });
      addToast("Slide deleted");
      setDeleteSlide(null);
      await load();
    } catch (err) {
      addToast(err.message || "Delete failed", "error");
    }
  };

  const toggleActive = async (slide) => {
    try {
      const updated = await updateTableRow(config, "hero_slides", slide.id, { is_active: !slide.is_active });
      addLog({ action: "UPDATE", entity: "hero_slides", environment, payload: updated });
      addToast(slide.is_active ? "Slide hidden" : "Slide activated");
      await load();
    } catch (err) {
      addToast(err.message || "Toggle failed", "error");
    }
  };

  return (
    <div className="d-grid gap-3">
      <UploadZone onUpload={handleUpload} uploading={uploading} />

      <div className="admin-card p-3 p-md-4">
        <div className="d-flex align-items-center justify-content-between mb-3">
          <div>
            <h5 className="mb-0">All Slides</h5>
            <small className="text-muted">{slides.length} slides · ordered by position</small>
          </div>
          <button className="btn btn-outline-primary btn-sm" onClick={load} disabled={loading}>Refresh</button>
        </div>

        <SearchBar
          className="mb-3"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search slides by position or id…"
          hint={searchHint}
          disabled={loading}
        />

        {loading ? (
          <div className="d-flex align-items-center gap-2 text-muted py-3">
            <div className="spinner-border spinner-border-sm" />
            <span>Loading slides...</span>
          </div>
        ) : filteredSlides.length === 0 ? (
          <div className="text-muted text-center py-5">
            {searchQuery.trim() ? "No slides match your search." : "No slides uploaded yet."}
          </div>
        ) : (
          <div className="row g-3">
            {filteredSlides.map((slide) => (
              <div key={slide.id} className="col-12 col-sm-6 col-lg-4">
                <div
                  className="rounded overflow-hidden"
                  style={{
                    border: `1px solid ${slide.is_active ? "var(--admin-border)" : "rgba(239,68,68,0.4)"}`,
                    background: "var(--admin-surface-2)",
                    opacity: slide.is_active ? 1 : 0.65,
                    transition: "opacity 200ms",
                  }}
                >
                  {/* Image preview */}
                  <div style={{ position: "relative", height: 180 }}>
                    <img
                      src={slide.image_url}
                      alt={`Slide #${slide.position}`}
                      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                      onError={(e) => { e.target.style.display = "none"; }}
                    />
                    <span
                      style={{
                        position: "absolute",
                        top: 8,
                        left: 8,
                        background: "rgba(0,0,0,0.65)",
                        color: "#fff",
                        borderRadius: 6,
                        padding: "2px 8px",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                      }}
                    >
                      #{slide.position}
                    </span>
                    <span
                      style={{
                        position: "absolute",
                        top: 8,
                        right: 8,
                        background: slide.is_active ? "rgba(34,197,94,0.85)" : "rgba(239,68,68,0.85)",
                        color: "#fff",
                        borderRadius: 6,
                        padding: "2px 8px",
                        fontSize: "0.72rem",
                        fontWeight: 600,
                      }}
                    >
                      {slide.is_active ? "Active" : "Hidden"}
                    </span>
                  </div>

                  {/* Card footer */}
                  <div className="p-2 d-flex align-items-center gap-1 flex-wrap">
                    <button
                      className="btn btn-sm btn-outline-primary"
                      onClick={() => setEditSlide(slide)}
                    >
                      Edit
                    </button>
                    <button
                      className={`btn btn-sm btn-outline-${slide.is_active ? "warning" : "success"}`}
                      onClick={() => toggleActive(slide)}
                    >
                      {slide.is_active ? "Hide" : "Show"}
                    </button>
                    <button
                      className="btn btn-sm btn-outline-danger ms-auto"
                      onClick={() => setDeleteSlide(slide)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <EditSlideModal
        open={Boolean(editSlide)}
        slide={editSlide}
        onClose={() => setEditSlide(null)}
        onSave={handleEdit}
      />
      <ConfirmModal
        open={Boolean(deleteSlide)}
        title="Delete Slide"
        body="This will permanently delete the image from storage and remove it from the app. Cannot be undone."
        confirmText="Delete"
        onCancel={() => setDeleteSlide(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
