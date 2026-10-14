import { useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import gsap from "gsap";
import { getNavItemByPath } from "../../utils/navigation.js";
import { useTheme } from "../providers/ThemeProvider.jsx";
import { useAuth } from "../providers/AuthProvider.jsx";
import { BrandLogo } from "../../components/common/BrandLogo.jsx";
import { SidebarNav } from "../../components/layout/SidebarNav.jsx";

function getInitials(email) {
  if (!email) return "A";
  const part = email.split("@")[0] || "A";
  return part.slice(0, 2).toUpperCase();
}

export function AdminLayout() {
  const { pathname } = useLocation();
  const MotionDiv = motion.div;
  const shellRef = useRef(null);
  const routeRef = useRef(null);
  const { theme, toggleTheme } = useTheme();
  const { session, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  // Side-scroll strips: wheel → horizontal, click-drag / slide → horizontal (taps still work)
  useEffect(() => {
    const SELECTOR = ".admin-h-scroll, .table-wrap";
    let drag = null;
    let suppressClick = false;

    const findScroller = (node) =>
      node instanceof Element ? node.closest(SELECTOR) : null;

    const canScrollX = (el) => el.scrollWidth > el.clientWidth + 1;

    const normalizeDelta = (event, el) => {
      let dy = event.deltaY;
      if (event.deltaMode === 1) dy *= 16;
      else if (event.deltaMode === 2) dy *= el.clientHeight || 1;
      return dy;
    };

    const onWheel = (event) => {
      const target = findScroller(event.target);
      if (!target || !canScrollX(target)) return;
      // Native trackpad horizontal already works
      if (!event.shiftKey && Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      const dy = normalizeDelta(event, target);
      if (!dy) return;
      event.preventDefault();
      target.scrollLeft += dy;
    };

    const onPointerDown = (event) => {
      if (event.button !== 0 || event.pointerType === "touch") return;
      const target = findScroller(event.target);
      if (!target || !canScrollX(target)) return;
      // Keep native caret / select UX
      if (event.target.closest?.("input, textarea, select, option")) return;

      drag = {
        el: target,
        pointerId: event.pointerId,
        startX: event.clientX,
        scrollLeft: target.scrollLeft,
        moved: false,
      };
    };

    const onPointerMove = (event) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      const dx = event.clientX - drag.startX;
      if (!drag.moved) {
        if (Math.abs(dx) < 8) return;
        drag.moved = true;
        drag.el.classList.add("is-drag-scrolling");
        try {
          drag.el.setPointerCapture(event.pointerId);
        } catch {
          /* ignore */
        }
      }
      event.preventDefault();
      drag.el.scrollLeft = drag.scrollLeft - dx;
    };

    const endDrag = (event) => {
      if (!drag) return;
      if (event && event.pointerId !== drag.pointerId) return;
      const { el, moved } = drag;
      drag = null;
      el.classList.remove("is-drag-scrolling");
      try {
        el.releasePointerCapture?.(event?.pointerId);
      } catch {
        /* ignore */
      }
      if (moved) {
        suppressClick = true;
        window.setTimeout(() => {
          suppressClick = false;
        }, 0);
      }
    };

    const onClickCapture = (event) => {
      if (!suppressClick) return;
      if (!findScroller(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
    };

    document.addEventListener("wheel", onWheel, { passive: false, capture: true });
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointermove", onPointerMove, { passive: false, capture: true });
    document.addEventListener("pointerup", endDrag, true);
    document.addEventListener("pointercancel", endDrag, true);
    document.addEventListener("click", onClickCapture, true);

    return () => {
      document.removeEventListener("wheel", onWheel, { capture: true });
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointermove", onPointerMove, { capture: true });
      document.removeEventListener("pointerup", endDrag, true);
      document.removeEventListener("pointercancel", endDrag, true);
      document.removeEventListener("click", onClickCapture, true);
    };
  }, []);

  useEffect(() => {
    if (!shellRef.current) return;
    const ctx = gsap.context(() => {
      gsap.from(".admin-sidebar .sidebar-link", {
        x: -14,
        stagger: 0.03,
        duration: 0.32,
        ease: "power2.out",
      });
      gsap.from(".admin-topbar", {
        opacity: 0,
        y: -10,
        duration: 0.4,
        ease: "power2.out",
      });
    }, shellRef);
    return () => ctx.revert();
  }, []);

  useEffect(() => {
    if (!routeRef.current) return;
    gsap.fromTo(
      routeRef.current,
      { opacity: 0, y: 16, filter: "blur(5px)" },
      { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.45, ease: "power2.out" }
    );
  }, [pathname]);

  const pageTitle = getNavItemByPath(pathname)?.label || "Panel";
  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className="admin-shell" ref={shellRef}>
      {sidebarOpen ? (
        <button
          type="button"
          className="admin-sidebar-backdrop d-lg-none"
          aria-label="Close menu"
          onClick={closeSidebar}
        />
      ) : null}

      <aside className={`admin-sidebar ${sidebarOpen ? "admin-sidebar--open" : ""}`}>
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

          <SidebarNav onNavigate={closeSidebar} />

          <div className="admin-sidebar__footer">
            <small className="text-muted d-block">Connectiqo v1.0</small>
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
                <small className="admin-page-subtitle">
                  Manage your platform data and operations
                </small>
              </div>
            </div>

            <div className="admin-topbar__actions admin-h-scroll">
              <div className="admin-user-chip d-none d-sm-flex align-items-center gap-2">
                <span className="admin-user-chip__avatar">{getInitials(session?.email)}</span>
                <span className="admin-user-chip__email text-truncate">
                  {session?.email}
                </span>
              </div>

              <span className="env-badge env-badge--prod d-none d-md-inline" title="Connected to production">
                Production
              </span>

              <button
                type="button"
                className="btn btn-icon btn-outline-secondary"
                onClick={toggleTheme}
                aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
                title={theme === "light" ? "Dark mode" : "Light mode"}
              >
                <span className="material-icons">
                  {theme === "light" ? "dark_mode" : "light_mode"}
                </span>
              </button>

              <button
                type="button"
                className="btn btn-sm btn-outline-danger admin-topbar__logout"
                onClick={logout}
              >
                <span className="material-icons btn-icon-leading">logout</span>
                <span className="d-none d-md-inline">Logout</span>
              </button>
            </div>
          </div>
        </header>

        <MotionDiv
          key={pathname}
          ref={routeRef}
          className="admin-route-content"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          <Outlet />
        </MotionDiv>
      </div>
    </div>
  );
}
