import { useEffect, useId, useRef, useState } from "react";

function getInitials(email) {
  if (!email) return "A";
  const part = email.split("@")[0] || "A";
  return part.slice(0, 2).toUpperCase();
}

/** Avatar button that opens a small account menu (email + log out). */
export function UserMenu({ email, onLogout }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="admin-user-menu" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`admin-topbar-control admin-user-menu__trigger ${open ? "is-open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        title={email || "Account"}
      >
        <span className="admin-user-menu__avatar" aria-hidden="true">{getInitials(email)}</span>
        <span className="admin-user-menu__email d-none d-md-inline">{email}</span>
        <span className="material-icons admin-user-menu__caret" aria-hidden="true">expand_more</span>
      </button>

      {open ? (
        <div className="admin-user-menu__panel" id={menuId} role="menu" aria-label="Account">
          <div className="admin-user-menu__header">
            <span className="admin-user-menu__avatar admin-user-menu__avatar--lg" aria-hidden="true">
              {getInitials(email)}
            </span>
            <div className="min-w-0">
              <div className="admin-user-menu__label">Signed in as</div>
              <div className="admin-user-menu__address" title={email}>{email}</div>
            </div>
          </div>
          <button
            type="button"
            role="menuitem"
            className="admin-user-menu__item admin-user-menu__item--danger"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
          >
            <span className="material-icons" aria-hidden="true">logout</span>
            Log out
          </button>
        </div>
      ) : null}
    </div>
  );
}
