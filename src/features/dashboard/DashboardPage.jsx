import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SearchBar } from "../../components/common/SearchBar.jsx";
import { NAV_ITEMS } from "../../utils/navigation.js";
import { listDashboardStats, listVideoSdkOverview } from "../../services/adminApi.js";
import { useEnvironment } from "../../app/providers/EnvironmentProvider.jsx";
import { useAuth } from "../../app/providers/AuthProvider.jsx";

const PLATFORM_KPIS = [
  { label: "Total Users", key: "usersCount", icon: "people", to: "/users", hint: "Learner & user profiles" },
  { label: "Bookings", key: "bookingsCount", icon: "event", to: "/bookings", hint: "All booking records" },
  { label: "Mentors", key: "mentorsCount", icon: "school", to: "/mentor-profiles", hint: "Active mentor profiles" },
];

const VIDEO_KPIS = [
  { label: "Live Sessions", icon: "videocam", to: "/sessions", hint: "VideoSDK sessions", sessionsKey: true },
  { label: "Recordings", icon: "fiber_manual_record", to: "/recordings", hint: "Stored session recordings", recordingsKey: true },
];

const QUICK_ACTIONS = [
  { to: "/users", label: "Manage Profiles", icon: "people", desc: "View & edit user accounts" },
  { to: "/bookings", label: "Bookings", icon: "event", desc: "Sessions & scheduling" },
  { to: "/payments", label: "Payments", icon: "payments", desc: "Transactions & wallets" },
  { to: "/database", label: "Database", icon: "storage", desc: "Direct table access" },
  { to: "/hero-slides", label: "Hero Slides", icon: "view_carousel", desc: "Homepage carousel" },
  { to: "/audit-logs", label: "Audit Logs", icon: "history", desc: "Admin activity trail" },
];

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function formatCount(value) {
  if (value === null || value === undefined || value === "—") return "—";
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  return n.toLocaleString();
}

function formatDateTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function KpiSkeleton() {
  return (
    <div className="col-12 col-md-6 col-xl-4">
      <div className="admin-card admin-kpi-panel p-3 dashboard-skeleton">
        <div className="dashboard-skeleton__line dashboard-skeleton__line--sm" />
        <div className="dashboard-skeleton__line dashboard-skeleton__line--lg mt-3" />
      </div>
    </div>
  );
}

function KpiCard({ label, value, icon, hint, to }) {
  return (
    <div className="col-12 col-md-6 col-xl-4">
      <Link to={to} className="dashboard-kpi-link text-decoration-none">
        <div className="admin-card admin-kpi-panel p-3 h-100 position-relative dashboard-kpi-card">
          <span className="material-icons admin-kpi-icon" aria-hidden="true">
            {icon}
          </span>
          <div className="admin-kpi-label small">{label}</div>
          <div className="dashboard-kpi-value fw-semibold mb-1">{formatCount(value)}</div>
          <small className="text-muted d-block">{hint}</small>
          <span className="dashboard-kpi-arrow material-icons" aria-hidden="true">
            arrow_forward
          </span>
        </div>
      </Link>
    </div>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { config, environment } = useEnvironment();
  const { session } = useAuth();
  const [navSearch, setNavSearch] = useState("");
  const [stats, setStats] = useState(null);
  const [videoStats, setVideoStats] = useState({ recordings: [], sessions: [] });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [dbStats, sdkStats] = await Promise.all([
        listDashboardStats(config),
        listVideoSdkOverview(config),
      ]);
      setStats(dbStats);
      setVideoStats(sdkStats);
    } catch (err) {
      setError(err.message || "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  }, [config]);

  useEffect(() => {
    load();
  }, [load]);

  const envClass = environment === "production" ? "env-badge--prod" : "env-badge--staging";
  const envLabel = environment === "production" ? "Production" : "Staging";

  const videoValues = useMemo(
    () => ({
      sessions: videoStats.sessions?.length ?? 0,
      recordings: videoStats.recordings?.length ?? 0,
    }),
    [videoStats]
  );

  const systemChecks = useMemo(
    () => [
      {
        label: "Supabase",
        ok: Boolean(config.supabaseUrl && config.supabaseAnonKey),
        detail: config.supabaseUrl ? "Connected" : "URL not configured",
      },
      {
        label: "Auth server",
        ok: Boolean(config.authServerUrl),
        detail: config.authServerUrl ? "Configured" : "Missing auth server URL",
      },
      {
        label: "VideoSDK API",
        ok: Boolean(config.videoSdkBaseUrl),
        detail: config.videoSdkBaseUrl || "Default endpoint",
      },
    ],
    [config]
  );

  const allSystemsOk = systemChecks.every((c) => c.ok);

  const navMatches = useMemo(() => {
    const q = navSearch.trim().toLowerCase();
    if (!q) return [];
    return NAV_ITEMS.filter(
      (item) =>
        item.label.toLowerCase().includes(q) || item.to.toLowerCase().includes(q)
    ).slice(0, 6);
  }, [navSearch]);

  return (
    <div className="dashboard d-grid gap-3">
      {/* Welcome */}
      <section className="admin-card dashboard-hero p-3 p-md-4">
        <SearchBar
          className="mb-3"
          value={navSearch}
          onChange={(e) => setNavSearch(e.target.value)}
          placeholder="Search pages (profiles, bookings, payments…)"
          aria-label="Search admin pages"
        />
        {navMatches.length ? (
          <div className="dashboard-nav-matches mb-3 d-flex flex-wrap gap-2">
            {navMatches.map((item) => (
              <button
                key={item.to}
                type="button"
                className="btn btn-sm btn-outline-primary"
                onClick={() => {
                  setNavSearch("");
                  navigate(item.to);
                }}
              >
                <span className="material-icons align-middle me-1" style={{ fontSize: 16 }}>
                  {item.icon}
                </span>
                {item.label}
              </button>
            ))}
          </div>
        ) : null}
        <div className="d-flex flex-wrap align-items-start justify-content-between gap-3">
          <div className="d-flex align-items-start gap-3">
            <div className="dashboard-hero__icon-wrap d-none d-sm-flex">
              <span className="material-icons">dashboard</span>
            </div>
            <div>
              <p className="dashboard-hero__eyebrow mb-1">{getGreeting()}</p>
              <h4 className="mb-1">
                {session?.user?.email ? (
                  <>
                    Welcome, <span className="dashboard-hero__name">{session.user.email.split("@")[0]}</span>
                  </>
                ) : (
                  "Admin Overview"
                )}
              </h4>
              <p className="text-muted mb-0 small">
                Monitor platform health, user activity, and video services at a glance.
              </p>
            </div>
          </div>
          <div className="d-flex flex-wrap align-items-center gap-2">
            <span className={`env-badge ${envClass}`}>{envLabel}</span>
            <button
              type="button"
              className="btn btn-sm btn-outline-primary d-inline-flex align-items-center gap-1"
              onClick={load}
              disabled={loading}
            >
              <span className="material-icons" style={{ fontSize: 18 }}>
                refresh
              </span>
              Refresh
            </button>
          </div>
        </div>
        {error ? (
          <div className="alert alert-danger mt-3 mb-0 d-flex align-items-center gap-2" role="alert">
            <span className="material-icons" style={{ fontSize: 20 }}>error_outline</span>
            <span>{error}</span>
          </div>
        ) : null}
      </section>

      {/* Platform metrics */}
      <section>
        <div className="dashboard-section-head mb-2">
          <h5 className="mb-0">Platform metrics</h5>
          <span className="text-muted small">Supabase database counts</span>
        </div>
        <div className="row g-3">
          {loading
            ? PLATFORM_KPIS.map((item) => <KpiSkeleton key={item.key} />)
            : PLATFORM_KPIS.map((item) => (
                <KpiCard
                  key={item.key}
                  label={item.label}
                  value={stats?.[item.key]}
                  icon={item.icon}
                  hint={item.hint}
                  to={item.to}
                />
              ))}
        </div>
      </section>

      {/* Video metrics */}
      <section>
        <div className="dashboard-section-head mb-2">
          <h5 className="mb-0">Video services</h5>
          <span className="text-muted small">VideoSDK live data</span>
        </div>
        <div className="row g-3">
          {loading
            ? VIDEO_KPIS.map((item) => <KpiSkeleton key={item.label} />)
            : VIDEO_KPIS.map((item) => (
                <KpiCard
                  key={item.label}
                  label={item.label}
                  value={item.sessionsKey ? videoValues.sessions : videoValues.recordings}
                  icon={item.icon}
                  hint={item.hint}
                  to={item.to}
                />
              ))}
        </div>
      </section>

      <div className="row g-3">
        {/* Quick actions */}
        <div className="col-12 col-xl-8">
          <section className="admin-card p-3 p-md-4 h-100">
            <div className="dashboard-section-head mb-3">
              <h5 className="mb-0">Quick actions</h5>
              <span className="text-muted small">Jump to common admin tasks</span>
            </div>
            <div className="row g-2">
              {QUICK_ACTIONS.map((action) => (
                <div className="col-12 col-sm-6" key={action.to}>
                  <Link to={action.to} className="dashboard-quick-action">
                    <span className="material-icons dashboard-quick-action__icon">{action.icon}</span>
                    <span className="dashboard-quick-action__body">
                      <span className="dashboard-quick-action__label">{action.label}</span>
                      <span className="dashboard-quick-action__desc">{action.desc}</span>
                    </span>
                    <span className="material-icons dashboard-quick-action__arrow">chevron_right</span>
                  </Link>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* System status */}
        <div className="col-12 col-xl-4">
          <section className="admin-card p-3 p-md-4 h-100">
            <div className="dashboard-section-head mb-3">
              <h5 className="mb-0">System status</h5>
              <span className={`dashboard-status-pill ${allSystemsOk ? "is-ok" : "is-warn"}`}>
                {allSystemsOk ? "All configured" : "Check config"}
              </span>
            </div>
            <ul className="dashboard-status-list list-unstyled mb-3">
              {systemChecks.map((check) => (
                <li key={check.label} className="dashboard-status-item">
                  <span
                    className={`dashboard-status-dot ${check.ok ? "is-ok" : "is-warn"}`}
                    aria-hidden="true"
                  />
                  <div>
                    <div className="fw-semibold small">{check.label}</div>
                    <div className="text-muted" style={{ fontSize: "0.75rem" }}>
                      {check.detail}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <hr style={{ borderColor: "var(--admin-border)" }} />
            <dl className="dashboard-meta mb-0 small">
              <div className="d-flex justify-content-between gap-2 py-1">
                <dt className="text-muted">Environment</dt>
                <dd className="mb-0 fw-semibold text-capitalize">{environment}</dd>
              </div>
              <div className="d-flex justify-content-between gap-2 py-1">
                <dt className="text-muted">Last login</dt>
                <dd className="mb-0 text-end">{formatDateTime(session?.loggedInAt)}</dd>
              </div>
              {!loading && stats ? (
                <div className="d-flex justify-content-between gap-2 py-1">
                  <dt className="text-muted">Total records</dt>
                  <dd className="mb-0 fw-semibold">
                    {formatCount(
                      (stats.usersCount || 0) +
                        (stats.bookingsCount || 0) +
                        (stats.mentorsCount || 0)
                    )}
                  </dd>
                </div>
              ) : null}
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}
