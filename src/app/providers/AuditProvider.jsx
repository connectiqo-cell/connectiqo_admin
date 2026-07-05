import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useEnvironment } from "./EnvironmentProvider.jsx";
import { useAuth } from "./AuthProvider.jsx";
import { getSupabaseClient } from "../../services/supabaseClientFactory.js";

const AuditContext = createContext(null);
const AUDIT_TABLE = "audit_logs";
const MAX_LOGS = 200;

function toClientLog(row) {
  return {
    id: row.id,
    action: row.action,
    entity: row.entity,
    environment: row.environment,
    payload: row.payload,
    actorEmail: row.actor_email,
    timestamp: row.created_at,
  };
}

export function AuditProvider({ children }) {
  const { config } = useEnvironment();
  const { session } = useAuth();
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    let cancelled = false;
    getSupabaseClient(config)
      .from(AUDIT_TABLE)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(MAX_LOGS)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("Failed to load audit logs:", error.message);
          return;
        }
        setLogs((data || []).map(toClientLog));
      });
    return () => {
      cancelled = true;
    };
  }, [config]);

  const addLog = useCallback(
    ({ action, entity, payload, environment }) => {
      const row = {
        action,
        entity,
        environment,
        payload,
        actor_email: session?.user?.email || null,
      };
      getSupabaseClient(config)
        .from(AUDIT_TABLE)
        .insert(row)
        .select()
        .single()
        .then(({ data, error }) => {
          if (error) {
            console.error("Failed to persist audit log:", error.message);
            return;
          }
          setLogs((prev) => [toClientLog(data), ...prev].slice(0, MAX_LOGS));
        });
    },
    [config, session]
  );

  const value = useMemo(() => ({ logs, addLog }), [logs, addLog]);
  return <AuditContext.Provider value={value}>{children}</AuditContext.Provider>;
}

export function useAudit() {
  const ctx = useContext(AuditContext);
  if (!ctx) throw new Error("useAudit must be used within AuditProvider");
  return ctx;
}
