import { createContext, useCallback, useContext, useState } from "react";

const ToastContext = createContext(null);

const ICONS = {
  success: "✓",
  error: "✕",
  info: "i",
};

const COLORS = {
  success: "var(--admin-success)",
  error: "#ef4444",
  info: "var(--admin-accent-2)",
};

function ToastContainer({ toasts }) {
  if (!toasts.length) return null;
  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        pointerEvents: "none",
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "var(--admin-surface)",
            border: `1px solid ${COLORS[t.type]}`,
            borderLeft: `4px solid ${COLORS[t.type]}`,
            borderRadius: 12,
            padding: "10px 16px",
            boxShadow: "var(--admin-shadow)",
            color: "var(--admin-text)",
            fontSize: 14,
            minWidth: 240,
            maxWidth: 360,
            animation: "toastIn 0.25s ease",
            pointerEvents: "auto",
          }}
        >
          <span style={{ color: COLORS[t.type], fontWeight: 700, fontSize: 16 }}>
            {ICONS[t.type]}
          </span>
          {t.message}
        </div>
      ))}
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = "success") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <ToastContainer toasts={toasts} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
