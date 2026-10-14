import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { SearchBar } from "../../components/common/SearchBar.jsx";
import {
  getTrendingBoard,
  setTrendingHidden,
  setTrendingPins,
} from "../../services/adminApi.js";
import { useEnvironment } from "../../app/providers/EnvironmentProvider.jsx";
import { useAudit } from "../../app/providers/AuditProvider.jsx";
import { useToast } from "../../app/providers/ToastProvider.jsx";

/** Must match mentorApi.getTrendingMentors(8) on the app Welcome screen. */
const WELCOME_SLOTS = 8;

const MIGRATION_HINT = "run 20261013100000_trending_mentors.sql if needed";

export function TrendingCreatorsPage() {
  const { config, environment } = useEnvironment();
  const { addLog } = useAudit();
  const { addToast } = useToast();

  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows(await getTrendingBoard(config));
    } catch (err) {
      setRows([]);
      setError(`${err.message || "Failed to load trending board"} — ${MIGRATION_HINT}`);
    } finally {
      setLoading(false);
    }
  }, [config]);

  useEffect(() => {
    load();
  }, [load]);

  const pinnedIds = useMemo(
    () =>
      rows
        .filter((row) => row.pinned_rank != null)
        .sort((a, b) => a.pinned_rank - b.pinned_rank)
        .map((row) => row.id),
    [rows]
  );

  // Position on the Welcome screen is computed before search filtering.
  const positioned = useMemo(() => {
    let position = 0;
    return rows.map((row) => ({
      ...row,
      position: row.hidden ? null : ++position,
    }));
  }, [rows]);

  const visibleRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return positioned;
    return positioned.filter((row) =>
      [row.name, row.email, row.specialization].some((v) =>
        String(v || "").toLowerCase().includes(q)
      )
    );
  }, [positioned, searchQuery]);

  const runAction = async (row, action, fn, toast) => {
    setBusyId(row.id);
    setError("");
    try {
      await fn();
      addLog({
        action: "UPDATE",
        entity: "trending_mentor_overrides",
        environment,
        payload: { mentor_id: row.id, name: row.name, _admin_action: action },
      });
      addToast(toast);
      await load();
    } catch (err) {
      setError(`${err.message || "Update failed"} — ${MIGRATION_HINT}`);
    } finally {
      setBusyId(null);
    }
  };

  const pin = (row) =>
    runAction(row, "pin", () => setTrendingPins(config, [...pinnedIds, row.id]), `Pinned ${row.name || "creator"}`);

  const unpin = (row) =>
    runAction(
      row,
      "unpin",
      () => setTrendingPins(config, pinnedIds.filter((id) => id !== row.id)),
      "Pin removed"
    );

  const movePin = (row, delta) => {
    const from = pinnedIds.indexOf(row.id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= pinnedIds.length) return;
    const next = [...pinnedIds];
    [next[from], next[to]] = [next[to], next[from]];
    runAction(row, delta < 0 ? "pin_move_up" : "pin_move_down", () => setTrendingPins(config, next), "Pin order updated");
  };

  const toggleHidden = (row) =>
    runAction(
      row,
      row.hidden ? "unhide" : "hide",
      () => setTrendingHidden(config, row.id, !row.hidden),
      row.hidden ? "Creator can trend again" : "Creator hidden from trending"
    );

  return (
    <div className="d-grid gap-3">
      <div className="admin-card p-3 p-md-4">
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
          <div>
            <h4 className="mb-1">Trending creators</h4>
            <div className="text-muted small">
              The app Welcome screen shows the first {WELCOME_SLOTS} creators below. Pinned creators
              always come first (in pin order); everyone else is ranked by score from recent
              bookings, customers, reviews and rating. Hidden creators never appear.
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

        <div className="mb-3" style={{ maxWidth: 360 }}>
          <SearchBar
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search creator name, email, specialization…"
          />
        </div>

        {loading && !rows.length ? (
          <div className="d-flex align-items-center gap-2 text-muted py-3">
            <div className="spinner-border spinner-border-sm" role="status" />
            <span>Loading trending board…</span>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table table-sm table-hover align-middle mb-0">
              <thead>
                <tr>
                  <th style={{ width: 56 }}>#</th>
                  <th>Creator</th>
                  <th>Specialization</th>
                  <th title="Trending score">Score</th>
                  <th title="Bookings last 7 days / last 30 days">Bookings 7d / 30d</th>
                  <th title="Distinct customers who booked in the last 30 days">Customers 30d</th>
                  <th title="Reviews in the last 30 days / all time">Reviews 30d / all</th>
                  <th>Rating</th>
                  <th>Status</th>
                  <th style={{ width: 240 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {!visibleRows.length ? (
                  <tr>
                    <td colSpan={10} className="text-muted text-center py-4">
                      {searchQuery ? "No creators match your search." : "No creators found."}
                    </td>
                  </tr>
                ) : (
                  visibleRows.map((row) => {
                    const busy = busyId === row.id;
                    const isPinned = row.pinned_rank != null;
                    const pinIndex = pinnedIds.indexOf(row.id);
                    const onWelcome = row.position != null && row.position <= WELCOME_SLOTS;
                    return (
                      <tr key={row.id} className={row.hidden ? "opacity-50" : undefined}>
                        <td className="fw-semibold">{row.position ?? "—"}</td>
                        <td>
                          <Link to={`/users/${row.id}`} className="text-decoration-none fw-semibold">
                            {row.name || row.email || row.id}
                          </Link>
                          {row.email ? <div className="text-muted small">{row.email}</div> : null}
                        </td>
                        <td className="small">{row.specialization || "—"}</td>
                        <td className="font-monospace">{Number(row.trending_score ?? 0).toFixed(2)}</td>
                        <td>
                          {row.bookings_7d} / {row.bookings_30d}
                        </td>
                        <td>{row.learners_30d}</td>
                        <td>
                          {row.reviews_30d} / {row.review_count}
                        </td>
                        <td>{row.rating != null ? Number(row.rating).toFixed(1) : "—"}</td>
                        <td>
                          <div className="d-flex flex-wrap gap-1">
                            {isPinned ? (
                              <span className="badge rounded-pill text-bg-warning">
                                Pinned #{pinIndex + 1}
                              </span>
                            ) : null}
                            {row.hidden ? (
                              <span className="badge rounded-pill text-bg-secondary">Hidden</span>
                            ) : null}
                            {onWelcome ? (
                              <span className="badge rounded-pill text-bg-success">On Welcome</span>
                            ) : null}
                            {!isPinned && !row.hidden && !onWelcome ? (
                              <span className="text-muted small">Auto</span>
                            ) : null}
                          </div>
                        </td>
                        <td>
                          <div className="btn-group btn-group-sm">
                            {isPinned ? (
                              <>
                                <button
                                  type="button"
                                  className="btn btn-outline-secondary"
                                  onClick={() => movePin(row, -1)}
                                  disabled={busy || pinIndex === 0}
                                  title="Move up"
                                >
                                  <span className="material-icons" style={{ fontSize: 18 }}>
                                    arrow_upward
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-outline-secondary"
                                  onClick={() => movePin(row, 1)}
                                  disabled={busy || pinIndex === pinnedIds.length - 1}
                                  title="Move down"
                                >
                                  <span className="material-icons" style={{ fontSize: 18 }}>
                                    arrow_downward
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-warning"
                                  onClick={() => unpin(row)}
                                  disabled={busy}
                                >
                                  Unpin
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                className="btn btn-outline-warning"
                                onClick={() => pin(row)}
                                disabled={busy || row.hidden}
                                title={row.hidden ? "Unhide first" : "Pin to the top of Trending"}
                              >
                                Pin
                              </button>
                            )}
                            <button
                              type="button"
                              className={`btn ${row.hidden ? "btn-secondary" : "btn-outline-secondary"}`}
                              onClick={() => toggleHidden(row)}
                              disabled={busy}
                            >
                              {busy ? "…" : row.hidden ? "Unhide" : "Hide"}
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
      </div>
    </div>
  );
}
