import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  freezeMentor,
  getTableRowById,
  listUserReportRows,
  updateUserReportStatus,
} from "../../services/adminApi.js";
import { useAudit } from "../../app/providers/AuditProvider.jsx";
import { useAuth } from "../../app/providers/AuthProvider.jsx";
import { useEnvironment } from "../../app/providers/EnvironmentProvider.jsx";
import { useToast } from "../../app/providers/ToastProvider.jsx";
import { HScroll } from "../../components/common/HScroll.jsx";
import { SearchBar } from "../../components/common/SearchBar.jsx";
import { ConfirmModal } from "../../components/common/ConfirmModal.jsx";
import { MentorFreezeModal } from "../../components/common/MentorFreezeModal.jsx";
import { copyToClipboard } from "../../utils/clipboard.js";

const STATUS_BADGE = {
  pending: "bg-warning-subtle text-warning-emphasis",
  reviewing: "bg-info-subtle text-info-emphasis",
  actioned: "bg-success-subtle text-success-emphasis",
  dismissed: "bg-secondary-subtle text-secondary-emphasis",
};

const STATUS_TABS = [
  { key: "queue", label: "Queue", statuses: ["pending", "reviewing"] },
  { key: "pending", label: "Pending", statuses: ["pending"] },
  { key: "reviewing", label: "Reviewing", statuses: ["reviewing"] },
  { key: "actioned", label: "Actioned", statuses: ["actioned"] },
  { key: "dismissed", label: "Dismissed", statuses: ["dismissed"] },
  { key: "all", label: "All", statuses: null },
];

const CONTEXT_SECTIONS = [
  { key: "all", label: "All reports", icon: "flag", types: null },
  { key: "profile", label: "Profile", icon: "person", types: ["profile"] },
  { key: "video", label: "Video", icon: "movie", types: ["video"] },
  { key: "booking", label: "Booking", icon: "event", types: ["booking"] },
  { key: "call", label: "Call / meeting", icon: "videocam", types: ["call"] },
];

const CONTEXT_LABELS = {
  profile: "Profile",
  video: "Video",
  booking: "Booking",
  call: "Call",
};

const CONTEXT_BADGE = {
  profile: "bg-primary-subtle text-primary-emphasis",
  video: "bg-danger-subtle text-danger-emphasis",
  booking: "bg-warning-subtle text-warning-emphasis",
  call: "bg-info-subtle text-info-emphasis",
};

const REASON_LABELS = {
  harassment: "Harassment or bullying",
  hate_or_abuse: "Hate speech or abuse",
  sexual_content: "Sexual or inappropriate content",
  spam_or_scam: "Spam or scam",
  impersonation: "Impersonation",
  unsafe_behavior: "Unsafe behaviour",
  other: "Other",
};

const PAGE_SIZE = 10;
const TOP_REPORTED_LIMIT = 12;

function normalizeContext(type) {
  return (type || "profile").toLowerCase();
}

function initials(name, email) {
  const source = (name || email || "?").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

function timeAgo(iso) {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function formatReason(reason) {
  return REASON_LABELS[reason] || reason || "Unknown";
}

function contextHref(row) {
  const type = normalizeContext(row.context_type);
  if (type === "video" && row.context_id) return `/videos`;
  if ((type === "booking" || type === "call") && row.context_id) return `/bookings`;
  return `/users/${encodeURIComponent(row.reported_user_id)}`;
}

function KpiCard({ label, value, hint, icon, accent }) {
  return (
    <div className="col-6 col-md-4 col-xl">
      <div className="admin-card p-3 h-100 d-flex align-items-start gap-3">
        <span
          className={`material-icons rounded-circle d-flex align-items-center justify-content-center flex-shrink-0 ${accent}`}
          style={{ width: 40, height: 40, fontSize: 20 }}
          aria-hidden="true"
        >
          {icon}
        </span>
        <div>
          <div className="text-muted small">{label}</div>
          <div className="h5 mb-0">{value}</div>
          {hint ? <div className="text-muted" style={{ fontSize: "0.75rem" }}>{hint}</div> : null}
        </div>
      </div>
    </div>
  );
}

function RowSkeleton() {
  return (
    <div className="border rounded p-3 mb-2 d-flex align-items-center gap-3 dashboard-skeleton">
      <div className="dashboard-skeleton__line" style={{ width: 40, height: 40, borderRadius: "50%" }} />
      <div className="flex-grow-1">
        <div className="dashboard-skeleton__line dashboard-skeleton__line--sm" style={{ width: "40%" }} />
        <div className="dashboard-skeleton__line dashboard-skeleton__line--sm mt-2" style={{ width: "25%" }} />
      </div>
      <div className="dashboard-skeleton__line" style={{ width: 80, height: 24 }} />
    </div>
  );
}

export function ReportsPage() {
  const { config, environment } = useEnvironment();
  const { addLog } = useAudit();
  const { addToast } = useToast();
  const { session } = useAuth();
  const operator = session?.user?.email || session?.email || "admin";

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [contextSection, setContextSection] = useState("all");
  const [activeTab, setActiveTab] = useState("queue");
  const [search, setSearch] = useState("");
  const [reasonFilter, setReasonFilter] = useState("all");
  const [focusUserId, setFocusUserId] = useState(null);
  const [page, setPage] = useState(1);

  const [statusConfirm, setStatusConfirm] = useState(null);
  const [freezeTarget, setFreezeTarget] = useState(null);
  const [freezeBusy, setFreezeBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { rows: data } = await listUserReportRows(config, { limit: 500 });
      setRows(data || []);
    } catch (err) {
      setError(err.message || "Failed to load user reports");
    } finally {
      setLoading(false);
    }
  }, [config]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [activeTab, search, reasonFilter, contextSection, focusUserId]);

  const contextCounts = useMemo(() => {
    const counts = { all: rows.length, profile: 0, video: 0, booking: 0, call: 0 };
    rows.forEach((r) => {
      const key = normalizeContext(r.context_type);
      if (counts[key] !== undefined) counts[key] += 1;
      else counts.profile += 1;
    });
    return counts;
  }, [rows]);

  const kpis = useMemo(() => {
    const pending = rows.filter((r) => r.status === "pending").length;
    const reviewing = rows.filter((r) => r.status === "reviewing").length;
    const actioned = rows.filter((r) => r.status === "actioned").length;
    const open = pending + reviewing;
    return { pending, reviewing, actioned, open };
  }, [rows]);

  const mostReported = useMemo(() => {
    const byUser = new Map();
    rows.forEach((r) => {
      const id = r.reported_user_id;
      if (!id) return;
      if (!byUser.has(id)) {
        byUser.set(id, {
          id,
          name: r.reported_name,
          email: r.reported_email,
          total: 0,
          open: 0,
          byContext: { profile: 0, video: 0, booking: 0, call: 0 },
          latestAt: r.created_at,
        });
      }
      const entry = byUser.get(id);
      entry.total += 1;
      if (r.status === "pending" || r.status === "reviewing") entry.open += 1;
      const ctx = normalizeContext(r.context_type);
      if (entry.byContext[ctx] !== undefined) entry.byContext[ctx] += 1;
      else entry.byContext.profile += 1;
      if (r.reported_name) entry.name = r.reported_name;
      if (r.reported_email) entry.email = r.reported_email;
      if (new Date(r.created_at).getTime() > new Date(entry.latestAt || 0).getTime()) {
        entry.latestAt = r.created_at;
      }
    });

    return [...byUser.values()]
      .sort((a, b) => {
        if (b.open !== a.open) return b.open - a.open;
        if (b.total !== a.total) return b.total - a.total;
        return new Date(b.latestAt || 0).getTime() - new Date(a.latestAt || 0).getTime();
      })
      .slice(0, TOP_REPORTED_LIMIT);
  }, [rows]);

  const filteredRows = useMemo(() => {
    const section = CONTEXT_SECTIONS.find((t) => t.key === contextSection) || CONTEXT_SECTIONS[0];
    const tab = STATUS_TABS.find((t) => t.key === activeTab) || STATUS_TABS[0];

    let list = rows;
    if (section.types) {
      list = list.filter((r) => section.types.includes(normalizeContext(r.context_type)));
    }
    if (tab.statuses) {
      list = list.filter((r) => tab.statuses.includes(r.status));
    }
    if (focusUserId) {
      list = list.filter((r) => r.reported_user_id === focusUserId);
    }
    if (reasonFilter !== "all") {
      list = list.filter((r) => r.reason === reasonFilter);
    }

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((r) =>
        [
          r.reported_name,
          r.reported_email,
          r.reporter_name,
          r.reporter_email,
          r.reason,
          r.details,
          r.context_type,
          r.context_id,
        ]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(q))
      );
    }

    return [...list].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [rows, activeTab, search, reasonFilter, contextSection, focusUserId]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pageRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const tabCounts = useMemo(() => {
    const section = CONTEXT_SECTIONS.find((t) => t.key === contextSection) || CONTEXT_SECTIONS[0];
    let base = rows;
    if (section.types) {
      base = base.filter((r) => section.types.includes(normalizeContext(r.context_type)));
    }
    if (focusUserId) {
      base = base.filter((r) => r.reported_user_id === focusUserId);
    }
    const counts = {};
    STATUS_TABS.forEach((tab) => {
      counts[tab.key] = tab.statuses
        ? base.filter((r) => tab.statuses.includes(r.status)).length
        : base.length;
    });
    return counts;
  }, [rows, contextSection, focusUserId]);

  const focusUserLabel = useMemo(() => {
    if (!focusUserId) return null;
    const hit = rows.find((r) => r.reported_user_id === focusUserId);
    return hit?.reported_name || hit?.reported_email || focusUserId;
  }, [focusUserId, rows]);

  const setStatus = async (row, nextStatus, successMessage) => {
    setBusyId(row.id);
    setError("");
    try {
      const updated = await updateUserReportStatus(config, row.id, nextStatus, operator);
      addLog({
        action: "UPDATE",
        entity: "user_reports",
        environment,
        payload: { ...updated, _admin_action: `status:${nextStatus}` },
      });
      addToast(successMessage);
      await load();
    } catch (err) {
      addToast(err.message || "Action failed", "error");
    } finally {
      setBusyId(null);
    }
  };

  const confirmStatusChange = async () => {
    if (!statusConfirm) return;
    await setStatus(statusConfirm.row, statusConfirm.status, statusConfirm.message);
    setStatusConfirm(null);
  };

  const openFreeze = async ({ reportRow = null, userId, name, email }) => {
    setFreezeBusy(true);
    try {
      const mentorRow = await getTableRowById(config, "mentor_profiles", userId);
      setFreezeTarget({
        report: reportRow,
        id: userId,
        name,
        email,
        mentor_frozen: mentorRow?.mentor_frozen === true,
        mentor_frozen_until: mentorRow?.mentor_frozen_until ?? null,
        mentor_freeze_reason: mentorRow?.mentor_freeze_reason ?? null,
      });
    } catch (err) {
      addToast(err.message || "Could not load creator freeze status", "error");
    } finally {
      setFreezeBusy(false);
    }
  };

  const confirmMentorFreezeFromReport = async (row, { until, reason }) => {
    setFreezeBusy(true);
    setBusyId(row.report?.id || row.id);
    try {
      const updated = await freezeMentor(config, row.id, { until, reason, operator });
      addLog({
        action: "UPDATE",
        entity: "mentor_profiles",
        environment,
        payload: { ...updated, _admin_action: "mentor_freeze_from_report" },
      });
      if (row.report) {
        await setStatus(row.report, "actioned", "Creator frozen and report marked actioned");
      } else {
        addToast("Creator frozen");
        await load();
      }
      setFreezeTarget(null);
    } catch (err) {
      addToast(err.message || "Could not freeze creator", "error");
      setBusyId(null);
    } finally {
      setFreezeBusy(false);
    }
  };

  const copy = async (text, label) => {
    const ok = await copyToClipboard(text);
    addToast(ok ? `${label} copied` : `Could not copy ${label.toLowerCase()}`, ok ? "success" : "error");
  };

  const activeSection = CONTEXT_SECTIONS.find((s) => s.key === contextSection) || CONTEXT_SECTIONS[0];

  return (
    <div className="d-grid gap-3">
      <div className="admin-card p-3">
        <h4 className="mb-1">User reports</h4>
        <p className="text-muted mb-0">
          Separate queues for profile, video, booking, and call reports. Prioritize creators with the
          highest open report counts, then freeze or mark actioned.
        </p>
      </div>

      <div className="row g-3">
        <KpiCard
          label="Open queue"
          value={kpis.open}
          hint="Pending + reviewing"
          icon="inbox"
          accent="bg-warning-subtle text-warning-emphasis"
        />
        <KpiCard
          label="Profile"
          value={contextCounts.profile}
          hint="Profile reports"
          icon="person"
          accent="bg-primary-subtle text-primary-emphasis"
        />
        <KpiCard
          label="Video"
          value={contextCounts.video}
          hint="Video reports"
          icon="movie"
          accent="bg-danger-subtle text-danger-emphasis"
        />
        <KpiCard
          label="Booking"
          value={contextCounts.booking}
          hint="Session booking reports"
          icon="event"
          accent="bg-warning-subtle text-warning-emphasis"
        />
        <KpiCard
          label="Call"
          value={contextCounts.call}
          hint="In-meeting reports"
          icon="videocam"
          accent="bg-info-subtle text-info-emphasis"
        />
      </div>

      <div className="admin-card p-3 p-md-4">
        <div className="d-flex flex-wrap align-items-start justify-content-between gap-2 mb-3">
          <div>
            <h5 className="mb-1">Most reported creators</h5>
            <p className="text-muted small mb-0">
              Ranked by open reports first, then total. Use this list to take action quickly.
            </p>
          </div>
          <button type="button" className="btn btn-sm btn-outline-primary" onClick={load} disabled={loading}>
            Refresh
          </button>
        </div>

        {loading ? (
          <>
            <RowSkeleton />
            <RowSkeleton />
          </>
        ) : null}

        {!loading && mostReported.length === 0 ? (
          <div className="text-muted small py-3">No reports yet.</div>
        ) : null}

        {!loading
          ? mostReported.map((mentor, index) => {
              const selected = focusUserId === mentor.id;
              return (
                <div
                  key={mentor.id}
                  className={`border rounded p-3 mb-2 d-flex flex-wrap align-items-center gap-3 ${
                    selected ? "border-primary" : ""
                  }`}
                  style={selected ? { background: "var(--bs-primary-bg-subtle, rgba(13,110,253,.06))" } : undefined}
                >
                  <span
                    className="rounded-circle bg-secondary-subtle text-secondary-emphasis d-flex align-items-center justify-content-center flex-shrink-0 fw-semibold"
                    style={{ width: 40, height: 40, fontSize: 13 }}
                  >
                    {index + 1}
                  </span>
                  <div className="flex-grow-1 min-w-0">
                    <div className="d-flex align-items-center gap-2 flex-wrap">
                      <span className="fw-semibold text-truncate">{mentor.name || "Unknown user"}</span>
                      {mentor.open > 0 ? (
                        <span className="badge rounded-pill bg-danger-subtle text-danger-emphasis">
                          {mentor.open} open
                        </span>
                      ) : (
                        <span className="badge rounded-pill bg-success-subtle text-success-emphasis">
                          Queue clear
                        </span>
                      )}
                    </div>
                    <div className="text-muted small text-truncate">
                      {mentor.email || mentor.id} · {mentor.total} total · latest {timeAgo(mentor.latestAt)}
                    </div>
                    <div className="d-flex flex-wrap gap-1 mt-1">
                      {Object.entries(mentor.byContext)
                        .filter(([, count]) => count > 0)
                        .map(([ctx, count]) => (
                          <span
                            key={ctx}
                            className={`badge rounded-pill ${CONTEXT_BADGE[ctx] || "bg-secondary-subtle"}`}
                          >
                            {CONTEXT_LABELS[ctx] || ctx}: {count}
                          </span>
                        ))}
                    </div>
                  </div>
                  <div className="d-flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={`btn btn-sm ${selected ? "btn-primary" : "btn-outline-primary"}`}
                      onClick={() => {
                        setFocusUserId(selected ? null : mentor.id);
                        setActiveTab("queue");
                      }}
                    >
                      {selected ? "Clear filter" : "View reports"}
                    </button>
                    <Link
                      className="btn btn-sm btn-outline-secondary"
                      to={`/users/${encodeURIComponent(mentor.id)}`}
                    >
                      Profile
                    </Link>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-danger"
                      disabled={freezeBusy}
                      onClick={() =>
                        openFreeze({
                          userId: mentor.id,
                          name: mentor.name,
                          email: mentor.email,
                        })
                      }
                    >
                      Freeze
                    </button>
                  </div>
                </div>
              );
            })
          : null}
      </div>

      <div className="admin-card p-3 p-md-4">
        <div className="mb-3">
          <div className="small text-muted mb-2">Report sections</div>
          <HScroll>
            {CONTEXT_SECTIONS.map((section) => (
              <button
                key={section.key}
                type="button"
                className={`btn btn-sm d-inline-flex align-items-center gap-1 ${
                  contextSection === section.key ? "btn-primary" : "btn-outline-secondary"
                }`}
                onClick={() => setContextSection(section.key)}
              >
                <span className="material-icons" style={{ fontSize: 16 }} aria-hidden="true">
                  {section.icon}
                </span>
                {section.label}
                <span className="badge rounded-pill bg-secondary-subtle text-secondary-emphasis ms-1">
                  {contextCounts[section.key] ?? 0}
                </span>
              </button>
            ))}
          </HScroll>
        </div>

        {focusUserId ? (
          <div className="alert alert-info py-2 d-flex flex-wrap align-items-center justify-content-between gap-2">
            <span>
              Showing reports against <strong>{focusUserLabel}</strong>
            </span>
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setFocusUserId(null)}>
              Clear creator filter
            </button>
          </div>
        ) : null}

        <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3">
          <HScroll className="flex-grow-1">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={`btn btn-sm ${activeTab === tab.key ? "btn-dark" : "btn-outline-secondary"}`}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
                <span className="badge rounded-pill bg-secondary-subtle text-secondary-emphasis ms-2">
                  {tabCounts[tab.key] ?? 0}
                </span>
              </button>
            ))}
          </HScroll>
        </div>

        <div className="d-flex flex-wrap align-items-center gap-3 mb-3">
          <div style={{ minWidth: 240, flex: 1 }}>
            <SearchBar
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search reported user, reporter, reason, or details…"
              size="sm"
              disabled={loading}
            />
          </div>
          <div className="d-flex align-items-center gap-2">
            <label className="small text-muted mb-0">Reason</label>
            <select
              className="form-select form-select-sm"
              style={{ width: 220 }}
              value={reasonFilter}
              onChange={(e) => setReasonFilter(e.target.value)}
            >
              <option value="all">All reasons</option>
              {Object.entries(REASON_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="d-flex align-items-center justify-content-between mb-2">
          <h6 className="mb-0">{activeSection.label}</h6>
          <span className="text-muted small">{filteredRows.length} matching</span>
        </div>

        {error ? <div className="alert alert-danger py-2">{error}</div> : null}

        {loading ? (
          <>
            <RowSkeleton />
            <RowSkeleton />
            <RowSkeleton />
          </>
        ) : null}

        {!loading && filteredRows.length === 0 ? (
          <div className="text-center py-5">
            <span className="material-icons text-muted mb-2" style={{ fontSize: 36 }} aria-hidden="true">
              flag
            </span>
            <div className="text-muted">No reports match this section.</div>
          </div>
        ) : null}

        {!loading
          ? pageRows.map((row) => (
              <ReportRow
                key={row.id}
                row={row}
                busy={busyId === row.id}
                onCopy={copy}
                onMarkReviewing={() =>
                  setStatusConfirm({
                    row,
                    status: "reviewing",
                    message: "Marked reviewing",
                    title: "Mark as reviewing?",
                    body: `Start reviewing the report against ${row.reported_name || "this user"}?`,
                    confirmText: "Mark reviewing",
                    variant: "primary",
                  })
                }
                onMarkActioned={() =>
                  setStatusConfirm({
                    row,
                    status: "actioned",
                    message: "Marked actioned",
                    title: "Mark as actioned?",
                    body: `Confirm that moderation action was taken for ${row.reported_name || "this user"}.`,
                    confirmText: "Mark actioned",
                    variant: "success",
                  })
                }
                onDismiss={() =>
                  setStatusConfirm({
                    row,
                    status: "dismissed",
                    message: "Report dismissed",
                    title: "Dismiss report?",
                    body: `Dismiss this report with no further action against ${row.reported_name || "this user"}?`,
                    confirmText: "Dismiss",
                    variant: "secondary",
                  })
                }
                onFreeze={() =>
                  openFreeze({
                    reportRow: row,
                    userId: row.reported_user_id,
                    name: row.reported_name,
                    email: row.reported_email,
                  })
                }
              />
            ))
          : null}

        {!loading && filteredRows.length > PAGE_SIZE ? (
          <div
            className="d-flex align-items-center justify-content-between flex-wrap gap-2 mt-2 pt-2"
            style={{ borderTop: "1px solid var(--admin-border)" }}
          >
            <div className="text-muted small">
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredRows.length)} of{" "}
              {filteredRows.length}
            </div>
            <div className="d-flex align-items-center gap-2">
              <button className="btn btn-sm btn-outline-secondary" disabled={page <= 1} onClick={() => setPage(1)}>
                «
              </button>
              <button
                className="btn btn-sm btn-outline-secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                ‹
              </button>
              <span className="small px-1">
                Page {page} / {totalPages}
              </span>
              <button
                className="btn btn-sm btn-outline-secondary"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                ›
              </button>
              <button
                className="btn btn-sm btn-outline-secondary"
                disabled={page >= totalPages}
                onClick={() => setPage(totalPages)}
              >
                »
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <ConfirmModal
        open={Boolean(statusConfirm)}
        title={statusConfirm?.title || "Confirm"}
        body={statusConfirm?.body || ""}
        confirmText={statusConfirm?.confirmText || "Confirm"}
        variant={statusConfirm?.variant || "primary"}
        onCancel={() => setStatusConfirm(null)}
        onConfirm={confirmStatusChange}
      />

      <MentorFreezeModal
        open={Boolean(freezeTarget)}
        row={freezeTarget}
        busy={freezeBusy}
        onCancel={() => setFreezeTarget(null)}
        onConfirmFreeze={confirmMentorFreezeFromReport}
        onConfirmUnfreeze={async () => {
          setFreezeTarget(null);
          addToast("Unfreeze from Profiles if needed");
        }}
      />
    </div>
  );
}

function ReportRow({ row, busy, onCopy, onMarkReviewing, onMarkActioned, onDismiss, onFreeze }) {
  const [expanded, setExpanded] = useState(false);
  const isOpen = row.status === "pending" || row.status === "reviewing";
  const ctx = normalizeContext(row.context_type);

  return (
    <div className="border rounded mb-2 overflow-hidden">
      <button
        type="button"
        className="w-100 d-flex align-items-center gap-3 p-3 border-0 bg-transparent text-start"
        onClick={() => setExpanded((v) => !v)}
        style={{ cursor: "pointer" }}
      >
        <span
          className="rounded-circle bg-secondary-subtle text-secondary-emphasis d-flex align-items-center justify-content-center flex-shrink-0 fw-semibold"
          style={{ width: 40, height: 40, fontSize: 13 }}
        >
          {initials(row.reported_name, row.reported_email)}
        </span>
        <div className="flex-grow-1 min-w-0">
          <div className="d-flex align-items-center gap-2 flex-wrap">
            <span className="fw-semibold text-truncate">{row.reported_name || "Unknown user"}</span>
            <span className={`badge rounded-pill ${CONTEXT_BADGE[ctx] || "bg-secondary-subtle"}`}>
              {CONTEXT_LABELS[ctx] || ctx}
            </span>
          </div>
          <div className="text-muted small text-truncate">
            {formatReason(row.reason)} · reported {timeAgo(row.created_at)}
          </div>
        </div>
        <div className="text-end flex-shrink-0">
          <span className={`badge rounded-pill ${STATUS_BADGE[row.status] || "bg-secondary-subtle"}`}>
            {row.status}
          </span>
          <div className="text-muted small mt-1">
            <span className="material-icons align-middle" style={{ fontSize: 16 }}>
              {expanded ? "expand_less" : "expand_more"}
            </span>
          </div>
        </div>
      </button>

      {expanded ? (
        <div className="px-3 pb-3 pt-0" style={{ borderTop: "1px solid var(--admin-border)" }}>
          <div className="row g-3 mt-1">
            <div className="col-12 col-md-6">
              <div className="small text-muted mb-1">Reported user</div>
              <div className="fw-semibold">{row.reported_name || "—"}</div>
              <div className="small text-muted">{row.reported_email || row.reported_user_id}</div>
              <div className="d-flex flex-wrap gap-2 mt-2">
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  onClick={() => onCopy(row.reported_user_id, "Reported user ID")}
                >
                  Copy ID
                </button>
                <Link
                  className="btn btn-sm btn-outline-primary"
                  to={`/users/${encodeURIComponent(row.reported_user_id)}`}
                >
                  View profile
                </Link>
              </div>
            </div>
            <div className="col-12 col-md-6">
              <div className="small text-muted mb-1">Reporter</div>
              <div className="fw-semibold">{row.reporter_name || "—"}</div>
              <div className="small text-muted">{row.reporter_email || row.reporter_id}</div>
              <div className="d-flex flex-wrap gap-2 mt-2">
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  onClick={() => onCopy(row.reporter_id, "Reporter ID")}
                >
                  Copy reporter ID
                </button>
                <Link
                  className="btn btn-sm btn-outline-primary"
                  to={`/users/${encodeURIComponent(row.reporter_id)}`}
                >
                  View profile
                </Link>
              </div>
            </div>
            <div className="col-12">
              <div className="small text-muted mb-1">Details</div>
              <div className="small">{row.details?.trim() ? row.details : "No extra details provided."}</div>
            </div>
            <div className="col-12 col-md-6">
              <div className="small text-muted mb-1">Context</div>
              <div className="small">
                {CONTEXT_LABELS[ctx] || ctx}
                {row.context_id ? ` · ${row.context_id}` : ""}
              </div>
              {row.context_id ? (
                <div className="mt-2 d-flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    onClick={() => onCopy(row.context_id, "Context ID")}
                  >
                    Copy context ID
                  </button>
                  <Link className="btn btn-sm btn-outline-primary" to={contextHref(row)}>
                    Open related
                  </Link>
                </div>
              ) : null}
            </div>
            <div className="col-12 col-md-6">
              <div className="small text-muted mb-1">Submitted</div>
              <div className="small">{row.created_at ? new Date(row.created_at).toLocaleString() : "—"}</div>
            </div>
          </div>

          {isOpen ? (
            <div className="d-flex flex-wrap gap-2 mt-3">
              {row.status === "pending" ? (
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  disabled={busy}
                  onClick={onMarkReviewing}
                >
                  Mark reviewing
                </button>
              ) : null}
              <button
                type="button"
                className="btn btn-sm btn-success"
                disabled={busy}
                onClick={onMarkActioned}
              >
                Mark actioned
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                disabled={busy}
                onClick={onDismiss}
              >
                Dismiss
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline-danger"
                disabled={busy}
                onClick={onFreeze}
              >
                Freeze creator
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
