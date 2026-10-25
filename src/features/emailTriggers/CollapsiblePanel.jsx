import { useState } from "react";

/**
 * A full-width button that shows or hides its contents; starts closed to save space.
 * Contents mount only while open, so sections that load data fetch on first open.
 */
export function CollapsiblePanel({ id, icon, title, description, nested = false, children }) {
  const [open, setOpen] = useState(false);
  return (
    <section className={nested ? "border rounded-3 mb-3" : "admin-card"}>
      <button
        type="button"
        className={`btn w-100 text-start d-flex align-items-center gap-3 border-0 ${nested ? "p-3" : "p-3 p-md-4"}`}
        // Bootstrap's .btn uses its own dark text colour; follow the admin theme instead.
        style={{ color: "var(--admin-text)" }}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="material-icons" style={{ fontSize: 22 }} aria-hidden="true">{icon}</span>
        <span className="flex-grow-1 min-w-0">
          <span className="d-block h6 mb-0">{title}</span>
          <span className="d-block text-muted small">{description}</span>
        </span>
        <span className="material-icons" aria-hidden="true">{open ? "expand_less" : "expand_more"}</span>
      </button>
      {open ? (
        <div id={id} className={`border-top ${nested ? "px-3 pt-3 pb-1" : "px-3 px-md-4 pt-3 pb-1"}`}>
          {children}
        </div>
      ) : null}
    </section>
  );
}
