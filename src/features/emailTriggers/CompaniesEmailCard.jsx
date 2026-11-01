import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "../../components/common/CellValue.jsx";
import { PaginationBar, paginateRows } from "../../components/common/PaginationBar.jsx";
import { SearchBar } from "../../components/common/SearchBar.jsx";
import { listCompanyEmailTracking } from "../../services/adminApi.js";
import { formatDateTime } from "../../utils/formatters.js";
import { accountStatus, filterCreatorRows } from "./creatorEmailTracking.js";
import { useUrlNumber, useUrlState } from "../../hooks/useUrlState.js";

const ACCOUNT_FILTERS = [
  { key: "all", label: "All accounts" },
  { key: "active", label: "Active (receiving emails)" },
  { key: "frozen", label: "Frozen" },
  { key: "deleted", label: "Deleted" },
];

const ACCOUNT_BADGE = {
  active: { label: "Active", tone: "success", note: null },
  login_frozen: { label: "Frozen", tone: "warning", note: "No emails until unfrozen" },
  deleted: { label: "Deleted", tone: "danger", note: "No emails" },
};

/** Read-only email status for every company. Emails follow the account, like creators'. */
export function CompaniesEmailCard({ config, reminderMax = 3 }) {
  const [rows, setRows] = useState([]);
  const [state, setState] = useState("loading"); // loading | ready | error
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useUrlState("company_q", "");
  const [account, setAccount] = useUrlState("company_status", "all", { allowed: ACCOUNT_FILTERS.map((f) => f.key) });
  const [page, setPage] = useUrlNumber("company_page", 1);
  const [pageSize, setPageSize] = useUrlNumber("company_size", 10);

  const load = useCallback(async () => {
    setState("loading");
    setLoadError("");
    try {
      setRows(await listCompanyEmailTracking(config));
      setState("ready");
    } catch (err) {
      setLoadError(err.message || "Could not load companies");
      setState("error");
    }
  }, [config]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => filterCreatorRows(rows, { query, account }), [rows, query, account]);
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
      <div className="d-flex flex-wrap align-items-center gap-3 small mb-3">
        <span><strong>{rows.length}</strong> companies</span>
        <span className="text-muted">·</span>
        <span><strong>{rows.filter((row) => row.campaign_launched).length}</strong> launched a campaign</span>
        <span className="text-muted">·</span>
        <span><strong>{rows.filter((row) => row.unsubscribed).length}</strong> unsubscribed</span>
        <button type="button" className="btn btn-sm btn-outline-secondary ms-auto" onClick={load} disabled={state === "loading"}>
          Refresh
        </button>
      </div>

      <div className="d-flex flex-wrap gap-2 mb-3">
        <SearchBar className="flex-grow-1" value={query} onChange={resetPage(setQuery)} placeholder="Search by company or email…" />
        <select className="form-select" style={{ maxWidth: 220 }} value={account} onChange={resetPage(setAccount)} aria-label="Filter by account status">
          {ACCOUNT_FILTERS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>
      </div>

      {state === "loading" && !rows.length ? (
        <div className="d-flex align-items-center gap-2 text-muted small py-3" role="status">
          <span className="spinner-border spinner-border-sm" aria-hidden="true" />
          Loading companies…
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="table table-sm table-hover align-middle mb-0">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Status</th>
                  <th>Welcome email</th>
                  <th>Campaign launched</th>
                  <th>Reminders sent</th>
                  <th>Unsubscribed</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const badge = ACCOUNT_BADGE[accountStatus(row)];
                  return (
                    <tr key={row.id} className={badge === ACCOUNT_BADGE.deleted ? "opacity-50" : undefined}>
                      <td>
                        <div className="fw-semibold">{row.name || "Unnamed company"}</div>
                        <div className="text-muted small">{row.email || row.id}</div>
                      </td>
                      <td>
                        <Badge tone={badge.tone}>{badge.label}</Badge>
                        {badge.note ? <div className="text-muted small">{badge.note}</div> : null}
                      </td>
                      <td>
                        <Badge tone={row.greeting_mail_sent ? "success" : "neutral"}>{row.greeting_mail_sent ? "Sent" : "Not sent"}</Badge>
                        {row.greeting_mail_sent_at ? <div className="text-muted small">{formatDateTime(row.greeting_mail_sent_at)}</div> : null}
                      </td>
                      <td>{row.campaign_launched ? "Yes" : "No"}</td>
                      <td>
                        {row.reminders_sent} of {reminderMax}
                        {row.last_reminder_at ? <div className="text-muted small">Last {formatDateTime(row.last_reminder_at)}</div> : null}
                      </td>
                      <td>{row.unsubscribed ? "Yes" : "No"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!filtered.length ? (
            <div className="text-muted py-3 text-center small">
              {rows.length ? "No companies match your filters." : "No companies yet."}
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
