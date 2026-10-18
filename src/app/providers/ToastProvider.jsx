import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

const ToastContext = createContext(null);

const ICONS = {
  success: "check_circle",
  error: "error",
  info: "info",
};

// Errors stay longer: they usually need reading, not just noticing.
const DURATION_MS = {
  success: 3500,
  info: 5000,
  error: 7000,
};

const MAX_TOASTS = 4;

function ToastContainer({ toasts, onDismiss }) {
  return (
    <div className="admin-toast-stack" aria-live="polite" aria-relevant="additions">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`admin-toast admin-toast--${t.type}`}
          role={t.type === "error" ? "alert" : "status"}
        >
          <span className="material-icons admin-toast__icon" aria-hidden="true">
            {ICONS[t.type]}
          </span>
          <span className="admin-toast__message">{t.message}</span>
          <button
            type="button"
            className="admin-toast__close"
            onClick={() => onDismiss(t.id)}
            aria-label="Dismiss notification"
          >
            <span className="material-icons" aria-hidden="true">close</span>
          </button>
        </div>
      ))}
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (message, type = "success") => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev, { id, message, type }].slice(-MAX_TOASTS));
      timers.current.set(id, setTimeout(() => dismiss(id), DURATION_MS[type] ?? 4000));
    },
    [dismiss]
  );

  const value = useMemo(() => ({ addToast }), [addToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
