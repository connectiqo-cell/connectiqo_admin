import { useState } from "react";
import { SetupForm } from "./SetupForm.jsx";

/** The sender and mail server the email service uses, shown and edited in one place. */
export function EmailSetupCard({ worker, settings, config, environment, operator, addLog, addToast, onChanged }) {
  const [editing, setEditing] = useState(false);
  // The worker reports these columns once migration 20261031140000 is applied.
  const canEdit = "sender_name" in settings && (!worker || "reply_to" in worker);

  // Saved values show straight away; the service reports them back within 30 seconds.
  const values = {
    sender_name: settings.sender_name || worker?.sender_name || "",
    sender_email: settings.sender_email || worker?.sender_email || "",
    smtp_host: worker?.smtp_host || "",
    smtp_port: worker?.smtp_port ? String(worker.smtp_port) : "",
    reply_to: settings.reply_to || worker?.reply_to || "",
    support_email: settings.support_email || worker?.support_email || "",
  };

  const rows = [
    ["Sender Name", values.sender_name],
    ["Sender Email", values.sender_email],
    ["Host", values.smtp_host],
    ["Port", values.smtp_port],
    ["Password", worker?.smtp_user ? "••••••••" : ""],
    ["Reply To Address", values.reply_to],
    ["Support Address", values.support_email],
  ];

  return (
    <section className="admin-card p-3 p-md-4">
      <div className="d-flex align-items-start gap-2 mb-3">
        <h2 className="h5 mb-0">Setup</h2>
        {canEdit && !editing ? (
          <button type="button" className="btn btn-sm btn-primary ms-auto" onClick={() => setEditing(true)}>Edit</button>
        ) : null}
      </div>

      {!canEdit ? (
        <div className="alert alert-warning small mb-3" role="alert">
          To edit these here, apply <code>supabase/migrations/20261031140000_email_smtp_any_provider.sql</code> and refresh this page.
        </div>
      ) : null}
      {worker?.smtp_error ? <div className="alert alert-danger small mb-3 text-break" role="alert">{worker.smtp_error}</div> : null}

      {editing ? (
        <SetupForm
          config={config}
          initial={values}
          environment={environment}
          operator={operator}
          addLog={addLog}
          addToast={addToast}
          onSaved={onChanged}
          onClose={() => setEditing(false)}
        />
      ) : (
        <dl className="details-list mb-0">
          {rows.map(([label, value]) => (
            <div className="details-list__item" key={label}>
              <dt>{label}</dt>
              <dd className="text-break">{value || "—"}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
