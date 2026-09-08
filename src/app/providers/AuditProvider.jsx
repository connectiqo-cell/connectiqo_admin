import { createContext, useContext, useMemo, useState } from "react";

const AuditContext = createContext(null);

export function AuditProvider({ children }) {
  const [logs, setLogs] = useState([]);

  const addLog = ({ action, entity, payload, environment }) => {
    const next = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      action,
      entity,
      environment,
      payload,
      timestamp: new Date().toISOString(),
    };
    setLogs((prev) => [next, ...prev]);
  };

  const value = useMemo(() => ({ logs, addLog }), [logs]);
  return <AuditContext.Provider value={value}>{children}</AuditContext.Provider>;
}

export function useAudit() {
  const ctx = useContext(AuditContext);
  if (!ctx) throw new Error("useAudit must be used within AuditProvider");
  return ctx;
}
