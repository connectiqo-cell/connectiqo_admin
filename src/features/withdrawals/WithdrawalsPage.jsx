import { useCallback, useEffect, useMemo, useState } from "react";
import { callAdminRpc, listWithdrawalRequestRows } from "../../services/adminApi.js";
import { getSupabaseClient } from "../../services/supabaseClientFactory.js";
import { useAudit } from "../../app/providers/AuditProvider.jsx";
import { useAuth } from "../../app/providers/AuthProvider.jsx";
import { useEnvironment } from "../../app/providers/EnvironmentProvider.jsx";
import { useToast } from "../../app/providers/ToastProvider.jsx";
import { SearchBar } from "../../components/common/SearchBar.jsx";
import { ConfirmModal } from "../../components/common/ConfirmModal.jsx";
import { HScroll } from "../../components/common/HScroll.jsx";
import { copyToClipboard } from "../../utils/clipboard.js";

// Admin auth here is a hardcoded email/password check, not real Supabase auth
// (see AuthProvider.jsx) — the service-role key is what actually authorizes
// writes. These RPCs are defensive server-side (status-guarded, non-empty
// UTR/reason required) precisely because this boundary is only as strong as
// who holds the service-role key, not real per-operator auth.

const STATUS_BADGE = {
  pending: "bg-warning-subtle text-warning-emphasis",
  processing: "bg-info-subtle text-info-emphasis",
  completed: "bg-success-subtle text-success-emphasis",
  rejected: "bg-danger-subtle text-danger-emphasis",
};

const STATUS_TABS = [
  { key: "queue", label: "Queue", statuses: ["pending", "processing"] },
  { key: "pending", label: "Pending", statuses: ["pending"] },
  { key: "processing", label: "Processing", statuses: ["processing"] },
  { key: "completed", label: "Completed", statuses: ["completed"] },
  { key: "rejected", label: "Rejected", statuses: ["rejected"] },
  { key: "all", label: "All", statuses: null },
];

const SORT_OPTIONS = [
  { key: "date_desc", label: "Newest first" },
  { key: "date_asc", label: "Oldest first" },
  { key: "amount_desc", label: "Amount: high to low" },
  { key: "amount_asc", label: "Amount: low to high" },
];

const PAYOUT_METHODS = ["upi", "imps", "neft"];
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const PAGE_SIZE = 10;

function fmt(value) {
  return `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(Number(value) || 0)}`;
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

function notifyMentor(config, withdrawalRequestId, status) {
  const supabase = getSupabaseClient(config);
  supabase.functions
    .invoke("notify-withdrawal-status", { body: { withdrawalRequestId, status } })
    .catch(() => {});
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

export function WithdrawalsPage() {
  const { config, environment } = useEnvironment();
  const { addLog } = useAudit();
  const { addToast } = useToast();
  const { session } = useAuth();
  const operator = session?.user?.email || "admin";

  const [rows, setRows] = useState([]);
  const [loadedAt, setLoadedAt] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [activeTab, setActiveTab] = useState("queue");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("date_desc");
  const [page, setPage] = useState(1);

  const [processingConfirmRow, setProcessingConfirmRow] = useState(null);
  const [fulfilRow, setFulfilRow] = useState(null);
  const [rejectRow, setRejectRow] = useState(null);
  const [rejectReason, setRejectReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { rows: data } = await listWithdrawalRequestRows(config, { limit: 500 });
      setRows(data || []);
      setLoadedAt(Date.now());
    } catch (err) {
      setError(err.message || "Failed to load withdrawal requests");
    } finally {
      setLoading(false);
    }
  }, [config]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [activeTab, search, sortBy]);

  const kpis = useMemo(() => {
    const now = loadedAt;
    const pending = rows.filter((r) => r.status === "pending");
    const pendingAmount = pending.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    const completedThisWeek = rows.filter(
      (r) => r.status === "completed" && r.paid_at && now - new Date(r.paid_at).getTime() <= ONE_WEEK_MS
    );
    const completedThisWeekAmount = completedThisWeek.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    const rejectedThisWeek = rows.filter(
      (r) => r.status === "rejected" && r.updated_at && now - new Date(r.updated_at).getTime() <= ONE_WEEK_MS
    );
    return {
      pendingCount: pending.length,
      pendingAmount,
      completedCount: completedThisWeek.length,
      completedAmount: completedThisWeekAmount,
      rejectedCount: rejectedThisWeek.length,
    };
  }, [rows, loadedAt]);

  const filteredRows = useMemo(() => {
    const tab = STATUS_TABS.find((t) => t.key === activeTab) || STATUS_TABS[0];
    let list = tab.statuses ? rows.filter((r) => tab.statuses.includes(r.status)) : rows;

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((r) =>
        [r.mentor_name, r.mentor_email, r.upi_id, r.bank_account]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(q))
      );
    }

    return [...list].sort((a, b) => {
      if (sortBy === "amount_desc") return (Number(b.amount) || 0) - (Number(a.amount) || 0);
      if (sortBy === "amount_asc") return (Number(a.amount) || 0) - (Number(b.amount) || 0);
      const aDate = new Date(a.created_at).getTime();
      const bDate = new Date(b.created_at).getTime();
      return sortBy === "date_asc" ? aDate - bDate : bDate - aDate;
    });
  }, [rows, activeTab, search, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pageRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const tabCounts = useMemo(() => {
    const counts = {};
    STATUS_TABS.forEach((tab) => {
      counts[tab.key] = tab.statuses ? rows.filter((r) => tab.statuses.includes(r.status)).length : rows.length;
    });
    return counts;
  }, [rows]);

  const runRpc = async (row, fnName, args, successMessage, notifyStatus) => {
    setBusyId(row.id);
    setError("");
    try {
      const updated = await callAdminRpc(config, fnName, args);
      addLog({ action: "RPC", entity: "withdrawal_requests", environment, payload: updated });
      addToast(successMessage);
      if (notifyStatus) notifyMentor(config, row.id, notifyStatus);
      await load();
    } catch (err) {
      addToast(err.message || "Action failed", "error");
    } finally {
      setBusyId(null);
    }
  };

  const confirmMarkProcessing = async () => {
    if (!processingConfirmRow) return;
    await runRpc(
      processingConfirmRow,
      "admin_mark_processing",
      { p_id: processingConfirmRow.id, p_operator: operator },
      "Marked processing",
      "processing"
    );
    setProcessingConfirmRow(null);
  };

  const confirmFulfil = async ({ method, reference, note }) => {
    if (!fulfilRow) return;
    await runRpc(
      fulfilRow,
      "admin_complete_withdrawal",
      { p_id: fulfilRow.id, p_method: method, p_reference: reference.trim(), p_operator: operator, p_note: note || null },
      "Marked completed",
      "completed"
    );
    setFulfilRow(null);
  };

  const confirmReject = async () => {
    if (!rejectRow) return;
    if (!rejectReason.trim() || rejectReason.trim().length < 8) {
      addToast("Rejection reason must be at least 8 characters", "error");
      return;
    }
    await runRpc(
      rejectRow,
      "admin_reject_withdrawal",
      { p_id: rejectRow.id, p_reason: rejectReason.trim(), p_operator: operator },
      "Rejected",
      "rejected"
    );
    setRejectRow(null);
    setRejectReason("");
  };

  const copy = async (text, label) => {
    const ok = await copyToClipboard(text);
    addToast(ok ? `${label} copied` : `Could not copy ${label.toLowerCase()}`, ok ? "success" : "error");
  };

  return (
    <div className="d-grid gap-3">
      <div className="admin-card p-3">
        <h4 className="mb-1">Withdrawals</h4>
        <p className="text-muted mb-0">
          Pay creators manually via company UPI / IMPS / NEFT, then record the UTR here. Reject
          restores the held wallet balance automatically — never edit status from the raw
          database explorer.
        </p>
      </div>

      <div className="row g-3">
        <KpiCard
          label="Pending requests"
          value={kpis.pendingCount}
          hint={fmt(kpis.pendingAmount) + " awaiting payout"}
          icon="hourglass_top"
          accent="bg-warning-subtle text-warning-emphasis"
        />
        <KpiCard
          label="Completed this week"
          value={kpis.completedCount}
          hint={fmt(kpis.completedAmount) + " paid out"}
          icon="task_alt"
          accent="bg-success-subtle text-success-emphasis"
        />
        <KpiCard
          label="Rejected this week"
          value={kpis.rejectedCount}
          hint="Balance auto-restored"
          icon="block"
          accent="bg-danger-subtle text-danger-emphasis"
        />
        <KpiCard
          label="Total in queue"
          value={tabCounts.queue}
          hint="Pending + processing"
          icon="inbox"
          accent="bg-info-subtle text-info-emphasis"
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
              placeholder="Search creator name, email, UPI, or account number…"
              size="sm"
              disabled={loading}
            />
          </div>
          <div className="d-flex align-items-center gap-2">
            <label className="small text-muted mb-0">Sort</label>
            <select
              className="form-select form-select-sm"
              style={{ width: 190 }}
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.label}
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
              inbox
            </span>
            <div className="text-muted">No withdrawal requests match this view.</div>
          </div>
        ) : null}

        {!loading
          ? pageRows.map((row) => (
              <WithdrawalRow
                key={row.id}
                row={row}
                busy={busyId === row.id}
                onCopy={copy}
                onMarkProcessing={() => setProcessingConfirmRow(row)}
                onFulfil={() => setFulfilRow(row)}
                onReject={() => setRejectRow(row)}
              />
            ))
          : null}

        {!loading && filteredRows.length > PAGE_SIZE ? (
          <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mt-2 pt-2" style={{ borderTop: "1px solid var(--admin-border)" }}>
            <div className="text-muted small">
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredRows.length)} of {filteredRows.length}
            </div>
            <div className="d-flex align-items-center gap-2">
              <button className="btn btn-sm btn-outline-secondary" disabled={page <= 1} onClick={() => setPage(1)}>«</button>
              <button className="btn btn-sm btn-outline-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹</button>
              <span className="small px-1">Page {page} / {totalPages}</span>
              <button className="btn btn-sm btn-outline-secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>›</button>
              <button className="btn btn-sm btn-outline-secondary" disabled={page >= totalPages} onClick={() => setPage(totalPages)}>»</button>
            </div>
          </div>
        ) : null}
      </div>

      <ConfirmModal
        open={Boolean(processingConfirmRow)}
        title="Mark as processing?"
        body={
          processingConfirmRow
            ? `Lock this ${fmt(processingConfirmRow.amount)} request to ${processingConfirmRow.mentor_name || "this creator"} so another operator doesn't pay it twice.`
            : ""
        }
        confirmText="Mark processing"
        variant="primary"
        onCancel={() => setProcessingConfirmRow(null)}
        onConfirm={confirmMarkProcessing}
      />

      <ConfirmModal
        open={Boolean(rejectRow)}
        title="Reject withdrawal?"
        variant="danger"
        confirmText="Confirm reject"
        onCancel={() => {
          setRejectRow(null);
          setRejectReason("");
        }}
        onConfirm={confirmReject}
        body={
          rejectRow ? (
            <div>
              <p>
                {fmt(rejectRow.amount)} will be returned to {rejectRow.mentor_name || "the creator"}&apos;s wallet.
                This cannot be undone.
              </p>
              <label className="form-label small text-muted mb-1">Reason (min 8 characters)</label>
              <textarea
                className="form-control form-control-sm"
                rows={2}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g. UPI ID bounced, creator requested cancellation…"
                autoFocus
              />
            </div>
          ) : (
            ""
          )
        }
      />

      <FulfilModal row={fulfilRow} busy={busyId === fulfilRow?.id} onCancel={() => setFulfilRow(null)} onConfirm={confirmFulfil} />
    </div>
  );
}

function WithdrawalRow({ row, busy, onCopy, onMarkProcessing, onFulfil, onReject }) {
  const [expanded, setExpanded] = useState(false);
  const isTerminal = row.status === "completed" || row.status === "rejected";
  const methodBadge = row.upi_id
    ? { icon: "phone_android", label: "UPI" }
    : row.bank_account
      ? { icon: "account_balance", label: "Bank" }
      : null;

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
          {initials(row.mentor_name, row.mentor_email)}
        </span>
        <div className="flex-grow-1 min-w-0">
          <div className="d-flex align-items-center gap-2">
            <span className="fw-semibold text-truncate">{row.mentor_name || "Unknown creator"}</span>
            {methodBadge ? (
              <span className="badge rounded-pill bg-secondary-subtle text-secondary-emphasis d-inline-flex align-items-center gap-1">
                <span className="material-icons" style={{ fontSize: 12 }}>{methodBadge.icon}</span>
                {methodBadge.label}
              </span>
            ) : null}
          </div>
          <div className="text-muted small text-truncate">
            {row.mentor_email || row.mentor_id} · requested {timeAgo(row.created_at)}
          </div>
        </div>
        <div className="text-end flex-shrink-0">
          <div className="h6 mb-0">{fmt(row.amount)}</div>
          <span className={`badge rounded-pill ${STATUS_BADGE[row.status] || "bg-secondary-subtle"}`}>
            {row.status}
          </span>
        </div>
        <span className="material-icons text-muted flex-shrink-0">
          {expanded ? "expand_less" : "expand_more"}
        </span>
      </button>

      {expanded ? (
        <div className="px-3 pb-3">
          <div className="text-muted small mb-2">
            Wallet balance: {row.wallet_balance != null ? fmt(row.wallet_balance) : "—"}
          </div>

          <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
            <span className="small text-muted">UPI:</span>
            <code>{row.upi_id || "—"}</code>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              disabled={!row.upi_id}
              onClick={() => onCopy(row.upi_id, "UPI ID")}
            >
              Copy UPI
            </button>
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => onCopy(row.amount, "Amount")}>
              Copy amount
            </button>
          </div>

          {row.bank_account ? (
            <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
              <span className="small text-muted">Bank:</span>
              <code>{row.bank_account}</code>
              <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => onCopy(row.bank_account, "Account number")}>
                Copy account
              </button>
              <span className="small text-muted ms-2">IFSC:</span>
              <code>{row.ifsc || "—"}</code>
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                disabled={!row.ifsc}
                onClick={() => onCopy(row.ifsc, "IFSC")}
              >
                Copy IFSC
              </button>
            </div>
          ) : null}

          {isTerminal ? (
            <div className="small text-muted border-top pt-2 mt-1">
              {row.status === "completed" ? (
                <>
                  Paid via {row.payout_method?.toUpperCase() || "—"} · Ref {row.payout_reference || "—"} ·{" "}
                  {row.paid_at ? new Date(row.paid_at).toLocaleString() : "—"} · by {row.processed_by || "—"}
                </>
              ) : (
                <>
                  Rejected: {row.rejected_reason || "—"} · by {row.processed_by || "—"}
                </>
              )}
            </div>
          ) : (
            <div className="d-flex flex-wrap gap-2 mt-2">
              {row.status === "pending" ? (
                <button type="button" className="btn btn-sm btn-outline-info" disabled={busy} onClick={onMarkProcessing}>
                  Mark processing
                </button>
              ) : null}
              <button type="button" className="btn btn-sm btn-success" disabled={busy} onClick={onFulfil}>
                Fulfil (mark completed)
              </button>
              <button type="button" className="btn btn-sm btn-outline-danger" disabled={busy} onClick={onReject}>
                Reject
              </button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function FulfilModal({ row, busy, onCancel, onConfirm }) {
  const [method, setMethod] = useState("upi");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [amountConfirm, setAmountConfirm] = useState("");

  useEffect(() => {
    if (row) {
      setMethod(row.upi_id ? "upi" : "neft");
      setReference("");
      setNote("");
      setAmountConfirm("");
    }
  }, [row]);

  if (!row) return null;

  const amountMatches = Number(amountConfirm) === Number(row.amount);
  const canSubmit = reference.trim().length > 0 && amountMatches && !busy;

  return (
    <div className="modal modal-futuristic d-block" tabIndex="-1" role="dialog">
      <div className="modal-dialog modal-dialog-centered" role="document">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">Mark payout completed</h5>
            <button type="button" className="btn-close" onClick={onCancel} />
          </div>
          <div className="modal-body d-flex flex-column gap-3">
            <div className="d-flex justify-content-between align-items-center">
              <span className="text-muted small">Creator</span>
              <span className="fw-semibold">{row.mentor_name || row.mentor_id}</span>
            </div>
            <div className="d-flex justify-content-between align-items-center">
              <span className="text-muted small">Amount</span>
              <span className="fw-semibold">{fmt(row.amount)}</span>
            </div>

            <div>
              <label className="form-label small text-muted mb-1">Method</label>
              <select className="form-select form-select-sm" value={method} onChange={(e) => setMethod(e.target.value)} disabled={busy}>
                {PAYOUT_METHODS.map((m) => (
                  <option key={m} value={m}>{m.toUpperCase()}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="form-label small text-muted mb-1">UTR / payout reference (required)</label>
              <input
                type="text"
                className="form-control form-control-sm"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="e.g. 401234567890"
                disabled={busy}
                autoFocus
              />
            </div>

            <div>
              <label className="form-label small text-muted mb-1">Note (optional)</label>
              <input
                type="text"
                className="form-control form-control-sm"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={busy}
              />
            </div>

            <div>
              <label className="form-label small text-muted mb-1">
                Type the exact amount ({fmt(row.amount)}) to confirm you sent it
              </label>
              <input
                type="number"
                className={`form-control form-control-sm ${amountConfirm && !amountMatches ? "is-invalid" : ""}`}
                value={amountConfirm}
                onChange={(e) => setAmountConfirm(e.target.value)}
                placeholder="0.00"
                disabled={busy}
              />
              {amountConfirm && !amountMatches ? (
                <div className="invalid-feedback d-block">Doesn't match the request amount</div>
              ) : null}
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-success"
              disabled={!canSubmit}
              onClick={() => onConfirm({ method, reference, note })}
            >
              {busy ? "Saving…" : "Confirm payout"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
