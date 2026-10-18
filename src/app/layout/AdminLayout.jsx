import { Suspense, useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import gsap from "gsap";
import { getNavItemByPath } from "../../utils/navigation.js";
import { useTheme } from "../providers/ThemeProvider.jsx";
import { useEnvironment } from "../providers/EnvironmentProvider.jsx";
import { useAuth } from "../providers/AuthProvider.jsx";
import { BrandLogo } from "../../components/common/BrandLogo.jsx";
import { SidebarNav } from "../../components/layout/SidebarNav.jsx";
import { ConfirmModal } from "../../components/common/ConfirmModal.jsx";
import { UserMenu } from "../../components/layout/UserMenu.jsx";
import { ErrorBoundary } from "../../components/common/ErrorBoundary.jsx";

function RouteLoading() {
  return (
    <div className="admin-card p-4 d-flex align-items-center gap-2 text-muted" role="status">
      <span className="spinner-border spinner-border-sm" aria-hidden="true" />
      <span>Loading page…</span>
    </div>
  );
}

const SIDEBAR_COLLAPSED_KEY = "admin_sidebar_collapsed";

function readCollapsed() {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function AdminLayout() {
  const { pathname } = useLocation();
  const shellRef = useRef(null);
  const routeRef = useRef(null);
  const { theme, toggleTheme } = useTheme();
  const { environment, switchEnvironment } = useEnvironment();
  const { session, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pendingEnv, setPendingEnv] = useState(null);
  // Desktop-only icon rail; the mobile drawer ignores this.
  const [collapsed, setCollapsed] = useState(readCollapsed);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        /* storage unavailable — keep in-memory state */
      }
      return next;
    });
  };

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!shellRef.current || reducedMotion()) return;
    const ctx = gsap.context(() => {
      gsap.from(".admin-sidebar .sidebar-link", {
        x: -14,
        stagger: 0.03,
        duration: 0.32,
        ease: "power2.out",
        clearProps: "transform,opacity",
      });
      gsap.from(".admin-topbar", {
        opacity: 0,
        y: -10,
        duration: 0.4,
        ease: "power2.out",
        clearProps: "transform,opacity",
      });
    }, shellRef);
    return () => ctx.revert();
  }, []);

  useEffect(() => {
    if (!routeRef.current || reducedMotion()) return;
    gsap.fromTo(
      routeRef.current,
      { opacity: 0, y: 8 },
      { opacity: 1, y: 0, duration: 0.25, ease: "power2.out", clearProps: "transform,opacity" }
    );
  }, [pathname]);

  const pageTitle = getNavItemByPath(pathname)?.label || "Panel";
  const closeSidebar = () => setSidebarOpen(false);

  // Switching into production is the risky direction, so it asks first.
  const requestEnvironment = (next) => {
    if (next === environment) return;
    if (next === "production") setPendingEnv(next);
    else switchEnvironment(next);
  };

  return (
    <div className={`admin-shell ${collapsed ? "admin-shell--collapsed" : ""}`} ref={shellRef}>
      {sidebarOpen ? (
        <button
          type="button"
          className="admin-sidebar-backdrop d-lg-none"
          aria-label="Close menu"
          onClick={closeSidebar}
        />
      ) : null}

      <aside
        className={`admin-sidebar ${sidebarOpen ? "admin-sidebar--open" : ""}`}
        aria-label="Sidebar"
      >
        <div className="admin-sidebar__inner">
          <div className="admin-sidebar__header">
            <BrandLogo size={40} />
            <button
              type="button"
              className="btn btn-icon btn-outline-secondary admin-sidebar__close d-lg-none"
              aria-label="Close menu"
              onClick={closeSidebar}
            >
              <span className="material-icons">close</span>
            </button>
          </div>

          <SidebarNav onNavigate={closeSidebar} collapsed={collapsed} />

          <div className="admin-sidebar__footer">
            <small className="text-muted admin-sidebar__version">Connectiqo v1.0</small>
            <button
              type="button"
              className="admin-sidebar__collapse-btn d-none d-lg-inline-flex"
              onClick={toggleCollapsed}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={!collapsed}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <span className="material-icons" aria-hidden="true">
                {collapsed ? "keyboard_double_arrow_right" : "keyboard_double_arrow_left"}
              </span>
            </button>
          </div>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-card admin-topbar">
          <div className="admin-topbar__row">
            <div className="admin-topbar__title-wrap">
              <button
                type="button"
                className="btn btn-icon btn-outline-secondary admin-topbar__menu-btn d-lg-none"
                aria-label="Open menu"
                onClick={() => setSidebarOpen(true)}
              >
                <span className="material-icons">menu</span>
              </button>
              <div>
                <h1 className="admin-page-title h5 mb-0">{pageTitle}</h1>
              </div>
            </div>

            <div className="admin-topbar__actions">
              <label className={`admin-topbar-control admin-env-switch admin-env-switch--${environment}`}>
                <span className="admin-env-switch__dot" aria-hidden="true" />
                <span className="visually-hidden">Environment</span>
                <select
                  className="admin-env-switch__select"
                  value={environment}
                  onChange={(e) => requestEnvironment(e.target.value)}
                  title="Data environment"
                >
                  <option value="staging">Staging</option>
                  <option value="production">Production</option>
                </select>
                <span className="material-icons admin-env-switch__caret" aria-hidden="true">expand_more</span>
              </label>

              <button
                type="button"
                className="admin-topbar-control admin-topbar-icon-btn"
                onClick={toggleTheme}
                aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
                title={theme === "light" ? "Dark mode" : "Light mode"}
              >
                <span className="material-icons" aria-hidden="true">
                  {theme === "light" ? "dark_mode" : "light_mode"}
                </span>
              </button>

              <UserMenu email={session?.user?.email} onLogout={logout} />
            </div>
          </div>
        </header>

        <div key={pathname} ref={routeRef} className="admin-route-content">
          <ErrorBoundary resetKey={pathname}>
            <Suspense fallback={<RouteLoading />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </div>
      </div>

      <ConfirmModal
        open={Boolean(pendingEnv)}
        title="Switch to Production?"
        body="You'll be viewing and editing live data. If you haven't signed in to Production in this browser, you'll be asked to sign in."
        confirmText="Switch to Production"
        variant="primary"
        onCancel={() => setPendingEnv(null)}
        onConfirm={() => {
          switchEnvironment(pendingEnv);
          setPendingEnv(null);
        }}
      />
    </div>
  );
}
