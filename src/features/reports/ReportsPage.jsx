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

function KpiCard({ label, value, hint, icon, accent }) {
  return (
    <div className="col-12 col-sm-6 col-xl-3">
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
  const [activeTab, setActiveTab] = useState("queue");
  const [search, setSearch] = useState("");
  const [reasonFilter, setReasonFilter] = useState("all");
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
  }, [activeTab, search, reasonFilter]);

  const kpis = useMemo(() => {
    const pending = rows.filter((r) => r.status === "pending").length;
    const reviewing = rows.filter((r) => r.status === "reviewing").length;
    const actioned = rows.filter((r) => r.status === "actioned").length;
    const dismissed = rows.filter((r) => r.status === "dismissed").length;
    return { pending, reviewing, actioned, dismissed };
  }, [rows]);

  const filteredRows = useMemo(() => {
    const tab = STATUS_TABS.find((t) => t.key === activeTab) || STATUS_TABS[0];
    let list = tab.statuses ? rows.filter((r) => tab.statuses.includes(r.status)) : rows;

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
        ]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(q))
      );
    }

    return [...list].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [rows, activeTab, search, reasonFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pageRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const tabCounts = useMemo(() => {
    const counts = {};
    STATUS_TABS.forEach((tab) => {
      counts[tab.key] = tab.statuses
        ? rows.filter((r) => tab.statuses.includes(r.status)).length
        : rows.length;
    });
    return counts;
  }, [rows]);

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

  const openFreezeFromReport = async (reportRow) => {
    setFreezeBusy(true);
    try {
      const mentorRow = await getTableRowById(config, "mentor_profiles", reportRow.reported_user_id);
      setFreezeTarget({
        report: reportRow,
        id: reportRow.reported_user_id,
        name: reportRow.reported_name,
        email: reportRow.reported_email,
        mentor_frozen: mentorRow?.mentor_frozen === true,
        mentor_frozen_until: mentorRow?.mentor_frozen_until ?? null,
        mentor_freeze_reason: mentorRow?.mentor_freeze_reason ?? null,
      });
    } catch (err) {
      addToast(err.message || "Could not load mentor freeze status", "error");
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
        await setStatus(row.report, "actioned", "Mentor frozen and report marked actioned");
      } else {
        addToast("Mentor frozen");
      }
      setFreezeTarget(null);
    } catch (err) {
      addToast(err.message || "Could not freeze mentor", "error");
      setBusyId(null);
    } finally {
      setFreezeBusy(false);
    }
  };

  const copy = async (text, label) => {
    const ok = await copyToClipboard(text);
    addToast(ok ? `${label} copied` : `Could not copy ${label.toLowerCase()}`, ok ? "success" : "error");
  };

  return (
    <div className="d-grid gap-3">
      <div className="admin-card p-3">
        <h4 className="mb-1">Profile reports</h4>
        <p className="text-muted mb-0">
          Review reports submitted from the mobile app. Freeze the mentor side with a duration
          (hides profile/videos, pauses unlocks) while learner access stays open.
        </p>
      </div>

      <div className="row g-3">
        <KpiCard
          label="Pending"
          value={kpis.pending}
          hint="Awaiting first look"
          icon="flag"
          accent="bg-warning-subtle text-warning-emphasis"
        />
        <KpiCard
          label="Reviewing"
          value={kpis.reviewing}
          hint="In progress"
          icon="manage_search"
          accent="bg-info-subtle text-info-emphasis"
        />
        <KpiCard
          label="Actioned"
          value={kpis.actioned}
          hint="Moderation applied"
          icon="gavel"
          accent="bg-success-subtle text-success-emphasis"
        />
        <KpiCard
          label="In queue"
          value={tabCounts.queue}
          hint="Pending + reviewing"
          icon="inbox"
          accent="bg-secondary-subtle text-secondary-emphasis"
        />
      </div>

      <div className="admin-card p-3 p-md-4">
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3">
          <HScroll className="flex-grow-1">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={`btn btn-sm ${activeTab === tab.key ? "btn-primary" : "btn-outline-secondary"}`}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
                <span className="badge rounded-pill bg-secondary-subtle text-secondary-emphasis ms-2">
                  {tabCounts[tab.key] ?? 0}
                </span>
              </button>
            ))}
          </HScroll>
          <button type="button" className="btn btn-sm btn-outline-primary" onClick={load} disabled={loading}>
            Refresh
          </button>
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
            <div className="text-muted">No profile reports match this view.</div>
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
                onFreeze={() => openFreezeFromReport(row)}
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
        onConfirmUnfreeze={async (row) => {
          // Reports flow only freezes; manage unfreeze from Profiles / Mentor profiles.
          setFreezeTarget(null);
          addToast("Unfreeze from Profiles or Mentor profiles if needed");
        }}
      />
    </div>
  );
}

function ReportRow({ row, busy, onCopy, onMarkReviewing, onMarkActioned, onDismiss, onFreeze }) {
  const [expanded, setExpanded] = useState(false);
  const isOpen = row.status === "pending" || row.status === "reviewing";

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
            <span className="badge rounded-pill bg-secondary-subtle text-secondary-emphasis">
              {row.context_type || "profile"}
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
                {row.context_type || "profile"}
                {row.context_id ? ` · ${row.context_id}` : ""}
              </div>
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
                Freeze mentor
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
