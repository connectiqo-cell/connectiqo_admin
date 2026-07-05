import { useCallback, useEffect, useState, useMemo } from "react";
import {
  createTableRow,
  deleteTableRow,
  listTableRows,
  updateTableRow,
} from "../../services/adminApi.js";
import { useEnvironment } from "../../app/providers/EnvironmentProvider.jsx";
import { useToast } from "../../app/providers/ToastProvider.jsx";
import { useAudit } from "../../app/providers/AuditProvider.jsx";
import { ConfirmModal } from "../../components/common/ConfirmModal.jsx";
import { SearchBar } from "../../components/common/SearchBar.jsx";
import { filterRowsBySearch, getSearchResultHint } from "../../utils/searchUtils.js";
import { useModalAnimation } from "../../hooks/useModalAnimation.js";

// ─── Slug helper ────────────────────────────────────────────────────────────
const toSlug = (name) =>
  name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

// ─── Material Icons list ─────────────────────────────────────────────────────
const ICONS = [
  // Education
  { name: "school",          label: "School" },
  { name: "book",            label: "Book" },
  { name: "menu_book",       label: "Menu Book" },
  { name: "library_books",   label: "Library Books" },
  { name: "local_library",   label: "Local Library" },
  { name: "class",           label: "Class" },
  { name: "assignment",      label: "Assignment" },
  { name: "quiz",            label: "Quiz" },
  { name: "grading",         label: "Grading" },
  { name: "auto_stories",    label: "Auto Stories" },
  { name: "history_edu",     label: "History Edu" },
  { name: "edit_note",       label: "Edit Note" },
  // Technology
  { name: "code",            label: "Code" },
  { name: "computer",        label: "Computer" },
  { name: "terminal",        label: "Terminal" },
  { name: "memory",          label: "Memory" },
  { name: "storage",         label: "Storage" },
  { name: "cloud",           label: "Cloud" },
  { name: "security",        label: "Security" },
  { name: "api",             label: "API" },
  { name: "smartphone",      label: "Smartphone" },
  { name: "devices",         label: "Devices" },
  { name: "developer_mode",  label: "Developer" },
  // AI & Data
  { name: "psychology",      label: "Psychology" },
  { name: "smart_toy",       label: "AI / Smart" },
  { name: "analytics",       label: "Analytics" },
  { name: "bar_chart",       label: "Bar Chart" },
  { name: "pie_chart",       label: "Pie Chart" },
  { name: "trending_up",     label: "Trending Up" },
  { name: "insights",        label: "Insights" },
  { name: "biotech",         label: "Biotech" },
  { name: "science",         label: "Science" },
  { name: "data_object",     label: "Data Object" },
  // Business & Finance
  { name: "business",        label: "Business" },
  { name: "business_center", label: "Business Center" },
  { name: "work",            label: "Work" },
  { name: "account_balance", label: "Account Balance" },
  { name: "monetization_on", label: "Monetization" },
  { name: "attach_money",    label: "Money" },
  { name: "payments",        label: "Payments" },
  { name: "store",           label: "Store" },
  { name: "gavel",           label: "Legal / Gavel" },
  { name: "sell",            label: "Sales" },
  // Design & Creative
  { name: "design_services", label: "Design" },
  { name: "palette",         label: "Palette" },
  { name: "brush",           label: "Brush" },
  { name: "draw",            label: "Draw" },
  { name: "photo_camera",    label: "Camera" },
  { name: "videocam",        label: "Video" },
  { name: "movie",           label: "Movie" },
  { name: "music_note",      label: "Music" },
  // Marketing & Communication
  { name: "campaign",        label: "Campaign" },
  { name: "share",           label: "Share" },
  { name: "forum",           label: "Forum" },
  { name: "record_voice_over", label: "Voice" },
  { name: "language",        label: "Language" },
  { name: "public",          label: "Public" },
  { name: "travel_explore",  label: "Travel" },
  // People & Coaching
  { name: "person",          label: "Person" },
  { name: "people",          label: "People" },
  { name: "groups",          label: "Groups" },
  { name: "manage_accounts", label: "Manage Accounts" },
  { name: "self_improvement",label: "Self Improvement" },
  { name: "supervisor_account", label: "Supervisor" },
  { name: "emoji_people",    label: "Emoji People" },
  // Health & Wellness
  { name: "health_and_safety", label: "Health & Safety" },
  { name: "fitness_center",  label: "Fitness" },
  { name: "spa",             label: "Spa" },
  { name: "favorite",        label: "Favorite" },
  { name: "medical_services",label: "Medical" },
  // General
  { name: "category",        label: "Category" },
  { name: "star",            label: "Star" },
  { name: "explore",         label: "Explore" },
  { name: "lightbulb",       label: "Lightbulb" },
  { name: "rocket_launch",   label: "Rocket" },
  { name: "flag",            label: "Flag" },
  { name: "engineering",     label: "Engineering" },
  { name: "agriculture",     label: "Agriculture" },
  { name: "restaurant",      label: "Restaurant" },
  { name: "home",            label: "Home" },
  { name: "real_estate_agent", label: "Real Estate" },
];

// ─── Icon Picker ─────────────────────────────────────────────────────────────
function IconPicker({ value, onChange }) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return q ? ICONS.filter((i) => i.label.toLowerCase().includes(q) || i.name.includes(q)) : ICONS;
  }, [search]);

  return (
    <div>
      <SearchBar
        size="sm"
        className="mb-2"
        placeholder="Search icons…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        aria-label="Search icons"
      />
      {value && (
        <div className="d-flex align-items-center gap-2 mb-2 p-2 rounded" style={{ background: "var(--admin-accent-soft)", border: "1px solid var(--admin-accent)" }}>
          <span className="material-icons" style={{ fontSize: 22, color: "var(--admin-accent)" }}>{value}</span>
          <span className="small fw-semibold">{value}</span>
          <button type="button" className="btn btn-sm btn-outline-secondary ms-auto py-0" style={{ fontSize: "0.7rem" }} onClick={() => onChange("")}>Clear</button>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(56px, 1fr))", gap: 6, maxHeight: 220, overflowY: "auto", padding: 4 }}>
        {filtered.map((icon) => (
          <button
            key={icon.name}
            type="button"
            title={icon.label}
            onClick={() => onChange(icon.name)}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 2,
              padding: "6px 4px",
              borderRadius: 6,
              border: value === icon.name ? "2px solid var(--admin-accent)" : "1px solid var(--admin-border)",
              background: value === icon.name ? "var(--admin-accent-soft)" : "var(--admin-surface-2)",
              cursor: "pointer",
              transition: "all 140ms",
            }}
          >
            <span className="material-icons" style={{ fontSize: 20, color: value === icon.name ? "var(--admin-accent)" : "var(--admin-text)" }}>{icon.name}</span>
            <span style={{ fontSize: "0.58rem", color: "var(--admin-muted)", lineHeight: 1.1, textAlign: "center" }}>{icon.label}</span>
          </button>
        ))}
        {!filtered.length && <div className="text-muted small">No icons found.</div>}
      </div>
    </div>
  );
}

// ─── Category Modal ───────────────────────────────────────────────────────────
const EMPTY_FORM = { name: "", slug: "", icon: "category", sort_order: 0, is_active: true };

function CategoryModal({ open, title, initialValue, onClose, onSave }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [slugManual, setSlugManual] = useState(false);
  const { isRendered, backdropRef, dialogRef } = useModalAnimation(open);

  useEffect(() => {
    if (initialValue) {
      setForm({ ...EMPTY_FORM, ...initialValue });
      setSlugManual(true); // editing: don't auto-overwrite slug
    } else {
      setForm(EMPTY_FORM);
      setSlugManual(false);
    }
  }, [initialValue, open]);

  if (!isRendered) return null;

  const set = (key, val) => setForm((prev) => ({ ...prev, [key]: val }));

  const handleNameChange = (val) => {
    set("name", val);
    if (!slugManual) set("slug", toSlug(val));
  };

  const handleSlugChange = (val) => {
    setSlugManual(true);
    set("slug", val);
  };

  return (
    <div className="modal modal-futuristic d-block" tabIndex="-1" role="dialog" ref={backdropRef}>
      <div className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable" role="document" ref={dialogRef}>
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">{title}</h5>
            <button type="button" className="btn-close" onClick={onClose} />
          </div>

          <div className="modal-body d-grid gap-3">
            {/* Name */}
            <div>
              <label className="form-label fw-semibold small" style={{ color: "var(--admin-muted)" }}>Name</label>
              <input
                type="text"
                className="form-control"
                value={form.name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="e.g. Software Development"
              />
            </div>

            {/* Slug — auto-filled */}
            <div>
              <label className="form-label fw-semibold small" style={{ color: "var(--admin-muted)" }}>
                Slug
                <span className="fw-normal ms-2" style={{ fontSize: "0.72rem" }}>(auto-filled from name)</span>
              </label>
              <input
                type="text"
                className="form-control font-monospace"
                value={form.slug}
                onChange={(e) => handleSlugChange(e.target.value)}
                placeholder="e.g. software-development"
              />
            </div>

            {/* Icon picker */}
            <div>
              <label className="form-label fw-semibold small" style={{ color: "var(--admin-muted)" }}>Icon (Material Icons)</label>
              <IconPicker value={form.icon} onChange={(v) => set("icon", v)} />
            </div>

            {/* Sort order + Active */}
            <div className="row g-3">
              <div className="col-6">
                <label className="form-label fw-semibold small" style={{ color: "var(--admin-muted)" }}>Sort Order</label>
                <input
                  type="number"
                  className="form-control"
                  value={form.sort_order}
                  onChange={(e) => set("sort_order", Number(e.target.value))}
                  min={0}
                />
              </div>
              <div className="col-6 d-flex align-items-end">
                <div className="form-check mb-2">
                  <input
                    type="checkbox"
                    className="form-check-input"
                    id="cat-is-active"
                    checked={Boolean(form.is_active)}
                    onChange={(e) => set("is_active", e.target.checked)}
                  />
                  <label className="form-check-label" htmlFor="cat-is-active">Active</label>
                </div>
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={() => onSave(form)}>Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export function CategoriesPage() {
  const { config, environment } = useEnvironment();
  const { addToast } = useToast();
  const { addLog } = useAudit();

  const [rows, setRows]         = useState([]);
  const [count, setCount]       = useState(0);
  const [loading, setLoading]   = useState(false);
  const [search, setSearch]     = useState("");
  const [editRow, setEditRow]   = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteRow, setDeleteRow]   = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listTableRows(config, "mentor_categories", { limit: 500 });
      setRows(result.rows || []);
      setCount(result.count || 0);
    } catch (err) {
      addToast(err.message || "Failed to load categories", "error");
    } finally {
      setLoading(false);
    }
  }, [config]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(
    () => filterRowsBySearch(rows, search, ["name", "slug", "icon", "id"]),
    [rows, search]
  );

  const searchHint = getSearchResultHint(filtered.length, rows.length, search);

  const handleSave = async (form) => {
    try {
      const { id, created_at, ...payload } = form;
      if (editRow?.id) {
        const updated = await updateTableRow(config, "mentor_categories", editRow.id, payload);
        addLog({ action: "UPDATE", entity: "mentor_categories", environment, payload: updated });
        addToast(`"${payload.name}" updated`);
        setEditRow(null);
      } else {
        const created = await createTableRow(config, "mentor_categories", payload);
        addLog({ action: "CREATE", entity: "mentor_categories", environment, payload: created });
        addToast(`"${payload.name}" created`);
        setCreateOpen(false);
      }
      await load();
    } catch (err) {
      addToast(err.message || "Save failed", "error");
    }
  };

  const handleDelete = async () => {
    try {
      await deleteTableRow(config, "mentor_categories", deleteRow.id);
      addLog({ action: "DELETE", entity: "mentor_categories", environment, payload: deleteRow });
      addToast(`"${deleteRow.name}" deleted`);
      setDeleteRow(null);
      await load();
    } catch (err) {
      addToast(err.message || "Delete failed", "error");
    }
  };

  const toggleActive = async (row) => {
    try {
      const updated = await updateTableRow(config, "mentor_categories", row.id, { is_active: !row.is_active });
      addLog({ action: "UPDATE", entity: "mentor_categories", environment, payload: updated });
      addToast(`"${row.name}" ${!row.is_active ? "activated" : "deactivated"}`);
      await load();
    } catch (err) {
      addToast(err.message || "Toggle failed", "error");
    }
  };

  return (
    <div className="admin-card p-3 p-md-4">
      {/* Header */}
      <div className="d-flex flex-wrap align-items-start justify-content-between gap-3 mb-3">
        <div>
          <h4 className="mb-1">Mentor Categories</h4>
          <div className="text-muted small">Manage categories shown to mentors and learners. Lower sort order = appears first.</div>
          <small className="text-muted">{count} total categories</small>
        </div>
        <div className="d-flex gap-2">
          <button className="btn btn-outline-primary btn-sm" onClick={load} disabled={loading}>Refresh</button>
          <button className="btn btn-primary btn-sm" onClick={() => setCreateOpen(true)}>+ Add Category</button>
        </div>
      </div>

      <SearchBar
        className="mb-3"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search categories by name, slug, or icon…"
        hint={searchHint}
        disabled={loading}
      />

      {/* Table */}
      {loading ? (
        <div className="d-flex align-items-center gap-2 text-muted py-3">
          <div className="spinner-border spinner-border-sm" role="status" />
          <span>Loading categories...</span>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table table-sm table-hover align-middle">
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>Icon</th>
                <th>Name</th>
                <th>Slug</th>
                <th>Sort</th>
                <th>Active</th>
                <th style={{ width: 220 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, i) => (
                <tr key={row.id}>
                  <td className="text-muted small">{i + 1}</td>
                  <td>
                    <span className="material-icons" title={row.icon} style={{ fontSize: 20, color: "var(--admin-accent)" }}>
                      {row.icon || "category"}
                    </span>
                  </td>
                  <td className="fw-semibold">{row.name}</td>
                  <td><code style={{ fontSize: "0.78rem", color: "var(--admin-muted)" }}>{row.slug}</code></td>
                  <td>{row.sort_order}</td>
                  <td>
                    <span className={`badge ${row.is_active ? "bg-success" : "bg-secondary"}`}>
                      {row.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td>
                    <div className="btn-group btn-group-sm">
                      <button className="btn btn-outline-primary" onClick={() => setEditRow(row)}>Edit</button>
                      <button
                        className={`btn btn-outline-${row.is_active ? "warning" : "success"}`}
                        onClick={() => toggleActive(row)}
                      >
                        {row.is_active ? "Deactivate" : "Activate"}
                      </button>
                      <button className="btn btn-outline-danger" onClick={() => setDeleteRow(row)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!filtered.length && !loading && (
                <tr><td colSpan={7} className="text-muted text-center py-3">No categories found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals */}
      <CategoryModal
        open={createOpen}
        title="Add Category"
        initialValue={null}
        onClose={() => setCreateOpen(false)}
        onSave={handleSave}
      />
      <CategoryModal
        open={Boolean(editRow)}
        title="Edit Category"
        initialValue={editRow}
        onClose={() => setEditRow(null)}
        onSave={handleSave}
      />
      <ConfirmModal
        open={Boolean(deleteRow)}
        title="Delete Category"
        body={`Permanently delete "${deleteRow?.name}"? This cannot be undone.`}
        confirmText="Delete"
        onCancel={() => setDeleteRow(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
