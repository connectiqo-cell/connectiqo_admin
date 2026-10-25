import { useId, useState } from "react";
import { DEFAULT_EMAIL_SETTINGS, validateEmailSettings } from "./emailSettings.js";
import { CollapsiblePanel } from "./CollapsiblePanel.jsx";

function Field({ id, label, help, error, children }) {
  return (
    <div className="mb-3">
      <label htmlFor={id} className="form-label small fw-semibold mb-1">{label}</label>
      {children}
      {error ? <div className="invalid-feedback d-block">{error}</div> : null}
      {help ? <div id={`${id}-help`} className="text-muted small mt-1">{help}</div> : null}
    </div>
  );
}

export function SmtpSettingsCard() {
  const idBase = useId();
  const id = (name) => `${idBase}-${name}`;
  const [form, setForm] = useState(DEFAULT_EMAIL_SETTINGS);

  const errors = validateEmailSettings(form);
  const set = (name) => (e) => setForm((prev) => ({ ...prev, [name]: e.target.value }));
  const inputClass = (name) => `form-control ${errors[name] ? "is-invalid" : ""}`;
  const port = Number(form.port);

  return (
    <CollapsiblePanel id={id("smtp")} icon="settings" title="SMTP settings" description="Sender details and mail server used for Connectiqo emails.">
      <CollapsiblePanel nested id={id("sender")} icon="mail" title="Sender details" description="Sender email address and name.">
        <Field id={id("senderEmail")} label="Sender email address" help="The email address the emails are sent from." error={errors.senderEmail}>
          <input
            id={id("senderEmail")}
            type="email"
            autoComplete="off"
            className={inputClass("senderEmail")}
            value={form.senderEmail}
            onChange={set("senderEmail")}
            aria-describedby={`${id("senderEmail")}-help`}
          />
        </Field>
        <Field id={id("senderName")} label="Sender name" help="Name displayed in the recipient's inbox." error={errors.senderName}>
          <input
            id={id("senderName")}
            className={inputClass("senderName")}
            value={form.senderName}
            onChange={set("senderName")}
            maxLength={100}
            aria-describedby={`${id("senderName")}-help`}
          />
        </Field>
      </CollapsiblePanel>

      <CollapsiblePanel nested id={id("provider")} icon="dns" title="SMTP provider settings" description="Host, port, username and password of the mail server.">
        <Field id={id("host")} label="Host" help="Hostname or IP address of your SMTP server." error={errors.host}>
          <input
            id={id("host")}
            autoComplete="off"
            spellCheck={false}
            className={inputClass("host")}
            value={form.host}
            onChange={set("host")}
            aria-describedby={`${id("host")}-help`}
          />
        </Field>
        <Field
          id={id("port")}
          label="Port number"
          help="Port used by our SMTP server. Common ports include 465 and 587. Avoid using port 25 as it is often blocked by providers to curb spam."
          error={errors.port || (port === 25 ? "Port 25 is often blocked; use 465 or 587." : null)}
        >
          <input
            id={id("port")}
            type="number"
            inputMode="numeric"
            min={1}
            max={65535}
            className={inputClass("port")}
            value={form.port}
            onChange={set("port")}
            style={{ maxWidth: 160 }}
            aria-describedby={`${id("port")}-help`}
          />
        </Field>
        <Field id={id("username")} label="Username" help="Username for your SMTP server." error={errors.username}>
          <input
            id={id("username")}
            autoComplete="off"
            spellCheck={false}
            className={inputClass("username")}
            value={form.username}
            onChange={set("username")}
            aria-describedby={`${id("username")}-help`}
          />
        </Field>
        <Field
          id={id("password")}
          label="Password"
          help="Password for your SMTP server. For Gmail, use a Google App Password, not the normal account password."
        >
          <input
            id={id("password")}
            type="password"
            autoComplete="new-password"
            className="form-control"
            value={form.password}
            onChange={set("password")}
            placeholder="••••••••••••••••"
            aria-describedby={`${id("password")}-help`}
          />
        </Field>
      </CollapsiblePanel>
    </CollapsiblePanel>
  );
}
