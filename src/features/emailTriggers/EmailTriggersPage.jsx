import { useCallback, useEffect, useState } from "react";
import { useAudit } from "../../app/providers/AuditProvider.jsx";
import { useAuth } from "../../app/providers/AuthProvider.jsx";
import { useEnvironment } from "../../app/providers/EnvironmentProvider.jsx";
import { useToast } from "../../app/providers/ToastProvider.jsx";
import { getEmailControl } from "../../services/adminApi.js";
import { CompaniesEmailCard } from "./CompaniesEmailCard.jsx";
import { CreatorsEmailCard } from "./CreatorsEmailCard.jsx";
import { EmailControlCard } from "./EmailControlCard.jsx";
import { EmailLogCard } from "./EmailLogCard.jsx";
import { EmailSetupCard } from "./EmailSetupCard.jsx";
import { EmailTemplatesCard } from "./EmailTemplatesCard.jsx";
import { useUrlState } from "../../hooks/useUrlState.js";

const TABS = [
  { id: "emails", label: "Emails" },
  { id: "history", label: "History" },
  { id: "creators", label: "Creators" },
  { id: "companies", label: "Companies" },
  { id: "setup", label: "Setup" },
];

/** Email triggers: current status and emergency stop, then one tab per job. */
export function EmailTriggersPage() {
  const { config, environment } = useEnvironment();
  const { addLog } = useAudit();
  const { addToast } = useToast();
  const { session } = useAuth();
  const operator = session?.user?.email || "admin";

  const [control, setControl] = useState(null);
  const [state, setState] = useState("loading"); // loading | ready | missing | error
  const [loadError, setLoadError] = useState("");
  const [tab, setTab] = useUrlState("tab", "emails", { allowed: TABS.map((item) => item.id) });
  const [, setHistoryStatus] = useUrlState("status", "all");

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const result = await getEmailControl(config);
      setControl(result);
      setState(result ? "ready" : "missing");
    } catch (err) {
      setLoadError(err.message || "Could not load email settings");
      setState("error");
    }
  }, [config]);

  useEffect(() => {
    load();
  }, [load]);

  const openHistory = (status) => {
    setHistoryStatus(status);
    setTab("history");
  };

  const shared = { config, environment, operator, addLog, addToast, onChanged: load };

  return (
    <div className="d-flex flex-column gap-3">
      {state === "loading" ? (
        <div className="admin-card p-3 d-flex align-items-center gap-2 text-muted small" role="status">
          <span className="spinner-border spinner-border-sm" aria-hidden="true" />
          Loading email settings…
        </div>
      ) : null}
      {state === "missing" ? (
        <div className="alert alert-warning small mb-0" role="alert">
          <strong>Automatic emails aren&apos;t set up in the database yet.</strong> Apply the migration
          <code className="mx-1">supabase/migrations/20261026000000_creator_email_triggers.sql</code>
          and refresh this page. No emails are being queued or sent until then.
        </div>
      ) : null}
      {state === "error" ? (
        <div className="alert alert-danger small mb-0 d-flex flex-wrap align-items-center gap-2" role="alert">
          <span>{loadError}</span>
          <button type="button" className="btn btn-sm btn-outline-danger ms-auto" onClick={load}>Retry</button>
        </div>
      ) : null}

      {state === "ready" ? (
        <>
          <EmailControlCard {...shared} control={control} onOpenHistory={openHistory} />

          <div className="payments-tabs" role="tablist" aria-label="Email sections">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                className={`payments-tab ${tab === item.id ? "is-active" : ""}`}
                onClick={() => setTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          {tab === "emails" ? <EmailTemplatesCard {...shared} control={control} /> : null}
          {tab === "history" ? (
            <section className="admin-card p-3 p-md-4">
              <EmailLogCard {...shared} unsubscribed={control.counts.unsubscribed} />
            </section>
          ) : null}
          {tab === "creators" ? (
            <section className="admin-card p-3 p-md-4">
              <CreatorsEmailCard />
            </section>
          ) : null}
          {tab === "companies" ? (
            <section className="admin-card p-3 p-md-4">
              <CompaniesEmailCard config={config} reminderMax={control.settings.brand_reminder_max} />
            </section>
          ) : null}
          {tab === "setup" ? <EmailSetupCard {...shared} worker={control.worker} settings={control.settings} /> : null}
        </>
      ) : null}

      {state === "missing" || state === "error" ? (
        <section className="admin-card p-3 p-md-4">
          <h2 className="h5 mb-3">Creators</h2>
          <CreatorsEmailCard />
        </section>
      ) : null}
    </div>
  );
}
