import { useCallback, useEffect, useState } from "react";
import { TEMPLATE_DEFINITIONS } from "../../../email-worker/src/templates.js";
import { listEmailOutbox, retryEmail } from "../../services/adminApi.js";
import { Badge } from "../../components/common/CellValue.jsx";
import { PaginationBar, paginateRows } from "../../components/common/PaginationBar.jsx";
import { formatDateTime, statusTone } from "../../utils/formatters.js";
import { useOnChange, useUrlNumber, useUrlState } from "../../hooks/useUrlState.js";

const STATUSES = ["all", "pending", "sending", "sent", "failed", "skipped"];
const STATUS_LABELS = { all: "All statuses", pending: "Waiting", sending: "Sending", sent: "Sent", failed: "Failed", skipped: "Skipped" };
const KINDS = { all: "Real and test", real: "Real only", test: "Test only" };
const AUDIENCES = { all: "Creators and companies", creator: "Creators", brand: "Companies" };
const HISTORY_LIMIT = 1000;

function matchesFilters(row, kind, audience, search) {
  if (kind !== "all" && Boolean(row.is_test) !== (kind === "test")) return false;
  if (audience !== "all" && row.audience !== audience) return false;
  const text = search.trim().toLowerCase();
  if (!text) return true;
  return [row.recipient_email, row.recipient_name].some((value) => value?.toLowerCase().includes(text));
}

/** Every queued email with its result and reason; failed and skipped ones can be retried. */
export function EmailLogCard({ config, environment, addLog, addToast, onChanged, unsubscribed = 0 }) {
  const [rows, setRows] = useState(null);
  const [status, setStatus] = useUrlState("status", "all", { allowed: STATUSES });
  const [kind, setKind] = useUrlState("type", "all", { allowed: Object.keys(KINDS) });
  const [audience, setAudience] = useUrlState("audience", "all", { allowed: Object.keys(AUDIENCES) });
  const [search, setSearch] = useUrlState("q", "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retryingId, setRetryingId] = useState(null);
  const [page, setPage] = useUrlNumber("page", 1);
  const [pageSize, setPageSize] = useUrlNumber("size", 25);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows(await listEmailOutbox(config, { status, limit: HISTORY_LIMIT }));
    } catch (err) {
      setError(err.message || "Could not load the email history");
    } finally {
      setLoading(false);
    }
  }, [config, status]);

  useEffect(() => {
    load();
  }, [load]);

  useOnChange(() => setPage(1), [status]);

  const retry = async (row) => {
    setRetryingId(row.id);
    try {
      await retryEmail(config, row.id);
      addLog({ action: "UPDATE", entity: "email_outbox", environment, payload: { _admin_action: "retry_email", id: row.id, template: row.template } });
      addToast("Email queued again");
      await Promise.all([load(), onChanged()]);
    } catch (err) {
      addToast(err.message || "Could not retry", "error");
    } finally {
      setRetryingId(null);
    }
  };

  if (error) {
    return (
      <div className="alert alert-danger small mb-3 d-flex flex-wrap align-items-center gap-2" role="alert">
        <span>{error}</span>
        <button type="button" className="btn btn-sm btn-outline-danger ms-auto" onClick={load}>Retry</button>
      </div>
    );
  }

  const filtered = (rows || []).filter((row) => matchesFilters(row, kind, audience, search));
  const visible = paginateRows(filtered, page, pageSize);
  return (
    <div>
      <h2 className="h5 mb-1">History</h2>
      <p className="text-muted small mb-1">Every email, whether it was sent, and why not if it wasn&apos;t.</p>
      <p className="small mb-3">
        <strong>Unsubscribed: {unsubscribed}</strong>
        <span className="text-muted"> They stop getting Welcome and reminder emails. Session booked emails still go out.</span>
      </p>
      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        <select
          className="form-select form-select-sm"
          style={{ maxWidth: 200 }}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Filter by status"
        >
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
        <select
          className="form-select form-select-sm"
          style={{ maxWidth: 160 }}
          value={kind}
          onChange={(e) => { setKind(e.target.value); setPage(1); }}
          aria-label="Filter by real or test"
        >
          {Object.entries(KINDS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select
          className="form-select form-select-sm"
          style={{ maxWidth: 200 }}
          value={audience}
          onChange={(e) => { setAudience(e.target.value); setPage(1); }}
          aria-label="Filter by creators or companies"
        >
          {Object.entries(AUDIENCES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <input
          type="search"
          className="form-control form-control-sm"
          style={{ maxWidth: 260 }}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search name or email"
          aria-label="Search by name or email"
        />
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary ms-auto"
          onClick={() => Promise.all([load(), onChanged()])}
          disabled={loading}
        >
          Refresh
        </button>
      </div>
      {rows?.length >= HISTORY_LIMIT ? (
        <p className="text-muted small">Showing the newest {HISTORY_LIMIT.toLocaleString()} emails. Older ones aren&apos;t searched.</p>
      ) : null}

      {loading && !rows ? (
        <div className="d-flex align-items-center gap-2 text-muted small" role="status">
          <span className="spinner-border spinner-border-sm" aria-hidden="true" />
          Loading email history…
        </div>
      ) : !visible.length ? (
        <div className="text-muted small py-3 text-center">{rows?.length ? "No emails match these filters." : "No emails here yet."}</div>
      ) : (
        <div className="table-wrap">
          <table className="table table-sm table-hover align-middle mb-0 admin-data-table">
            <thead>
              <tr>
                <th>Created</th>
                <th>Email</th>
                <th>To</th>
                <th>Status</th>
                <th>Details</th>
                <th className="text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.id}>
                  <td className="text-nowrap small">{formatDateTime(row.created_at)}</td>
                  <td className="text-nowrap">
                    {TEMPLATE_DEFINITIONS[row.template]?.label || row.template}
                    {row.is_test ? <span className="ms-2"><Badge tone="info">Test</Badge></span> : null}
                  </td>
                  <td>
                    <div className="small">{row.recipient_name || "—"}</div>
                    <div className="text-muted small">{row.recipient_email || "—"}</div>
                  </td>
                  <td>
                    <Badge tone={statusTone(row.status)}>{STATUS_LABELS[row.status] || row.status}</Badge>
                    {row.sent_at ? <div className="text-muted small">{formatDateTime(row.sent_at)}</div> : null}
                  </td>
                  <td className="small email-log-details">
                    {row.last_error || (row.attempts > 1 ? `${row.attempts} attempts` : "—")}
                  </td>
                  <td className="text-end">
                    {row.status === "failed" || row.status === "skipped" ? (
                      <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => retry(row)} disabled={retryingId === row.id}>
                        Retry
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <PaginationBar
        page={page}
        pageSize={pageSize}
        total={filtered.length}
        onPageChange={setPage}
        onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
      />
    </div>
  );
}
