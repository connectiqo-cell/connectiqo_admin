import { useCallback, useEffect, useMemo, useState } from "react";
import { useEnvironment } from "../../app/providers/EnvironmentProvider.jsx";
import { SearchBar } from "../../components/common/SearchBar.jsx";
import { PaginationBar, paginateRows } from "../../components/common/PaginationBar.jsx";
import { listCreatorEmailTracking } from "../../services/adminApi.js";
import { formatDateTime } from "../../utils/formatters.js";
import { accountStatus, filterCreatorRows, summarizeCreatorRows } from "./creatorEmailTracking.js";

const GREETING_FILTERS = [
  { key: "all", label: "All greetings" },
  { key: "sent", label: "Greeting sent" },
  { key: "not_sent", label: "Greeting not sent" },
];

const ACCOUNT_FILTERS = [
  { key: "all", label: "All accounts" },
  { key: "active", label: "Active (receiving emails)" },
  { key: "frozen", label: "Frozen" },
  { key: "deleted", label: "Deleted" },
];

// One status covers both the account and its emails: emails follow the account.
const ACCOUNT_BADGE = {
  active: { label: "Active", className: "bg-success-subtle text-success-emphasis" },
  login_frozen: { label: "Login frozen", className: "bg-warning-subtle text-warning-emphasis" },
  creator_frozen: { label: "Creator frozen", className: "bg-warning-subtle text-warning-emphasis" },
  deleted: { label: "Deleted", className: "bg-danger-subtle text-danger-emphasis" },
};

function Completeness({ value }) {
  if (value == null) return <span className="text-muted small">Not calculated</span>;
  return <span>{value}%</span>;
}

function AccountCell({ row, status }) {
  const badge = ACCOUNT_BADGE[status];
  return (
    <>
      <span className={`badge ${badge.className}`}>{badge.label}</span>
      {status === "creator_frozen" ? (
        <div className="text-muted small">
          No emails {row.mentor_frozen_until ? `until ${formatDateTime(row.mentor_frozen_until)}` : "until unfrozen"}
        </div>
      ) : null}
      {status === "login_frozen" ? <div className="text-muted small">No emails until unfrozen</div> : null}
      {status === "deleted" ? <div className="text-muted small">No emails</div> : null}
      {status === "creator_frozen" && row.mentor_freeze_reason ? (
        <div className="text-muted small text-truncate" style={{ maxWidth: 200 }} title={row.mentor_freeze_reason}>
          {row.mentor_freeze_reason}
        </div>
      ) : null}
    </>
  );
}

/**
 * Email tracking for every creator. Whether a creator receives emails follows their
 * account (login freeze, creator freeze, delete), which admins manage on the Profiles page.
 */
export function CreatorsEmailCard() {
  const { config } = useEnvironment();
  const [rows, setRows] = useState([]);
  const [state, setState] = useState("loading"); // loading | ready | error
  const [loadError, setLoadError] = useState("");
  const [loadedAt, setLoadedAt] = useState(() => Date.now());
  const [query, setQuery] = useState("");
  const [greeting, setGreeting] = useState("all");
  const [account, setAccount] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const load = useCallback(async () => {
    setState("loading");
    setLoadError("");
    try {
      setRows(await listCreatorEmailTracking(config));
      setLoadedAt(Date.now());
      setState("ready");
    } catch (err) {
      setLoadError(err.message || "Could not load creators");
      setState("error");
    }
  }, [config]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(
    () => filterCreatorRows(rows, { query, greeting, account, now: loadedAt }),
    [rows, query, greeting, account, loadedAt]
  );
  const summary = useMemo(() => summarizeCreatorRows(rows, loadedAt), [rows, loadedAt]);
  const visible = paginateRows(filtered, page, pageSize);

  if (state === "error") {
    return (
      <div className="alert alert-danger small d-flex flex-wrap align-items-center gap-2" role="alert">
        <span>{loadError}</span>
        <button type="button" className="btn btn-sm btn-outline-danger ms-auto" onClick={load}>Retry</button>
      </div>
    );
  }

  const resetPage = (setter) => (e) => { setter(e.target.value); setPage(1); };

  return (
    <div className="pb-3">
      <p className="text-muted small mb-3">
        Emails follow the account: frozen creators get no emails until unfrozen, and deleted accounts never do.
        Freeze, unfreeze or delete accounts from <strong>Profiles</strong>.
      </p>

      <div className="d-flex flex-wrap align-items-center gap-3 small mb-3">
        <span><strong>{summary.total}</strong> creators</span>
        <span className="text-muted">·</span>
        <span><strong>{summary.receiving}</strong> receiving emails</span>
        <span className="text-muted">·</span>
        <span><strong>{summary.frozen}</strong> frozen</span>
        <span className="text-muted">·</span>
        <span><strong>{summary.deleted}</strong> deleted</span>
        <span className="text-muted">·</span>
        <span><strong>{summary.greetingSent}</strong> greeted</span>
        <span className="text-muted">·</span>
        <span><strong>{summary.sessionMails}</strong> session booked mails sent</span>
        <span className="ms-auto text-muted d-flex align-items-center gap-2">
          {state === "ready" ? `Updated ${formatDateTime(new Date(loadedAt).toISOString())}` : null}
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={load} disabled={state === "loading"}>
            <span className="material-icons align-middle" style={{ fontSize: 16 }} aria-hidden="true">refresh</span>
            <span className="ms-1">Refresh</span>
          </button>
        </span>
      </div>

      <div className="d-flex flex-wrap gap-2 mb-3">
        <SearchBar
          className="flex-grow-1"
          value={query}
          onChange={resetPage(setQuery)}
          placeholder="Search by name or email…"
        />
        <select className="form-select" style={{ maxWidth: 220 }} value={account} onChange={resetPage(setAccount)} aria-label="Filter by account status">
          {ACCOUNT_FILTERS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>
        <select className="form-select" style={{ maxWidth: 200 }} value={greeting} onChange={resetPage(setGreeting)} aria-label="Filter by greeting mail">
          {GREETING_FILTERS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>
      </div>

      {state === "loading" && !rows.length ? (
        <div className="d-flex align-items-center gap-2 text-muted small py-3" role="status">
          <span className="spinner-border spinner-border-sm" aria-hidden="true" />
          Loading creators…
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="table table-sm table-hover align-middle mb-0">
              <thead>
                <tr>
                  <th>Creator</th>
                  <th>Status</th>
                  <th>Greeting mail</th>
                  <th>Profile completeness</th>
                  <th className="text-center">Session booked mails</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const status = accountStatus(row, loadedAt);
                  return (
                    <tr key={row.id} className={status === "deleted" ? "opacity-50" : undefined}>
                      <td>
                        <div className="fw-semibold">{row.name || "Unnamed creator"}</div>
                        <div className="text-muted small">{row.email || row.id}</div>
                      </td>
                      <td><AccountCell row={row} status={status} /></td>
                      <td>
                        {row.greeting_mail_sent ? (
                          <>
                            <span className="badge bg-success-subtle text-success-emphasis">Sent</span>
                            {row.greeting_mail_sent_at ? (
                              <div className="text-muted small">{formatDateTime(row.greeting_mail_sent_at)}</div>
                            ) : null}
                          </>
                        ) : (
                          <span className="badge bg-secondary-subtle text-secondary-emphasis">Not sent</span>
                        )}
                      </td>
                      <td><Completeness value={row.profile_completeness} /></td>
                      <td className="text-center">
                        {row.open_slots_mail_count ?? 0}
                        {row.last_open_slots_mail_at ? (
                          <div className="text-muted small">Last {formatDateTime(row.last_open_slots_mail_at)}</div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!filtered.length ? (
            <div className="text-muted py-3 text-center small">
              {rows.length ? "No creators match your filters." : "No creators yet."}
            </div>
          ) : null}
          <div className="mt-3">
            <PaginationBar
              page={page}
              pageSize={pageSize}
              total={filtered.length}
              onPageChange={setPage}
              onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
            />
          </div>
        </>
      )}
    </div>
  );
}
