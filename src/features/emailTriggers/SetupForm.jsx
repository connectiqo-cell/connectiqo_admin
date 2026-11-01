import { useState } from "react";
import { setEmailSmtp, updateEmailSettings } from "../../services/adminApi.js";
import { validateSetupDetails } from "./emailControl.js";

const FIELDS = [
  { key: "sender_name", label: "Sender Name", type: "text" },
  { key: "sender_email", label: "Sender Email", type: "email" },
  { key: "smtp_host", label: "Host", type: "text" },
  { key: "smtp_port", label: "Port", type: "number" },
  {
    key: "smtp_password",
    label: "Password",
    type: "password",
    help: "Leave empty to keep the current password. It's needed if you change Sender Email, Host or Port.",
  },
  { key: "reply_to", label: "Reply To Address", type: "email" },
  { key: "support_email", label: "Support Address", type: "email" },
];

/** Edits the Setup fields. The password is write-only: it never comes back to this page. */
export function SetupForm({ config, initial, environment, operator, addLog, addToast, onSaved, onClose }) {
  const [details, setDetails] = useState({ ...initial, smtp_password: "" });
  const [saving, setSaving] = useState(false);

  const errors = validateSetupDetails(details, initial);
  const changed = FIELDS.some(({ key }) => key !== "smtp_password" && details[key].trim() !== initial[key]);
  const hasPassword = details.smtp_password.trim() !== "";
  const canSave = !saving && (changed || hasPassword) && Object.keys(errors).length === 0;

  const save = async (e) => {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    try {
      const senderEmail = details.sender_email.trim();
      if (hasPassword) {
        await setEmailSmtp(config, {
          host: details.smtp_host.trim(),
          port: Number(details.smtp_port),
          user: senderEmail,
          password: details.smtp_password,
          operator,
        });
      }
      const changes = {
        sender_name: details.sender_name.trim(),
        sender_email: senderEmail,
        reply_to: details.reply_to.trim() || null,
        support_email: details.support_email.trim() || null,
      };
      await updateEmailSettings(config, changes);
      // The password is deliberately left out of the audit log.
      addLog({
        action: "UPDATE",
        entity: "email_trigger_settings",
        environment,
        payload: { ...changes, smtp_host: details.smtp_host.trim(), smtp_port: Number(details.smtp_port), password_changed: hasPassword },
      });
      addToast("Saved. The email service picks this up within 30 seconds.");
      await onSaved();
      onClose();
    } catch (err) {
      addToast(err.message || "Could not save", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} noValidate autoComplete="off">
      <div className="row g-3">
        {FIELDS.map(({ key, label, type, help }) => (
          <div className="col-12 col-md-6" key={key}>
            <label htmlFor={`setup-${key}`} className="form-label small fw-semibold mb-1">{label}</label>
            <input
              id={`setup-${key}`}
              type={type}
              className={`form-control form-control-sm ${errors[key] ? "is-invalid" : ""}`}
              value={details[key]}
              onChange={(e) => setDetails((prev) => ({ ...prev, [key]: e.target.value }))}
              autoComplete={type === "password" ? "new-password" : "off"}
              disabled={saving}
            />
            {errors[key] ? <div className="invalid-feedback">{errors[key]}</div> : help ? <div className="text-muted small mt-1">{help}</div> : null}
          </div>
        ))}
      </div>
      <div className="d-flex flex-wrap gap-2 mt-3">
        <button type="submit" className="btn btn-sm btn-primary" disabled={!canSave}>{saving ? "Saving…" : "Save"}</button>
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onClose} disabled={saving}>Cancel</button>
      </div>
    </form>
  );
}
