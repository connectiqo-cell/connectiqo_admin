import { useId, useMemo, useState } from "react";
import {
  EDITABLE_FIELDS,
  FIELD_LIMITS,
  renderEmail,
  TEMPLATE_DEFINITIONS,
  TEMPLATE_NAMES,
  validateTemplateFields,
} from "../../../email-worker/src/templates.js";
import { queueTestEmail, updateEmailTemplate } from "../../services/adminApi.js";
import { Badge } from "../../components/common/CellValue.jsx";
import { useModalAnimation } from "../../hooks/useModalAnimation.js";
import { formatDateTime } from "../../utils/formatters.js";
import { draftFromTemplate, hasCustomText, overridesFromDraft, reminderSummary, workerHealth } from "./emailControl.js";
import { ReminderRulesForm } from "./ReminderRulesForm.jsx";

const FIELD_LABELS = { subject: "Subject", heading: "Heading", body: "Message", button_label: "Button text" };

const PREVIEW_CONTEXT = {
  toName: "Asha Verma",
  portalUrl: "https://app.connectiqo.com",
  supportEmail: "contact@connectiqo.com",
  unsubscribeUrl: "https://app.connectiqo.com/unsubscribe?t=example",
};

function TemplateEditor({ template, saved, config, environment, operator, worker, addLog, addToast, onClose, onSaved }) {
  const definition = TEMPLATE_DEFINITIONS[template];
  const titleId = useId();
  const [draft, setDraft] = useState(() => draftFromTemplate(template, saved));
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testTo, setTestTo] = useState("");
  const { isRendered, backdropRef, dialogRef } = useModalAnimation(true, saving || testing ? null : onClose);

  const errors = validateTemplateFields(template, draft);
  const hasErrors = Object.keys(errors).length > 0;
  const overrides = overridesFromDraft(template, draft);
  const testWarning =
    workerHealth(worker) !== "online"
      ? "The email service isn't running, so this test will wait until it starts."
      : worker.mode === "dry_run"
        ? "Practice mode is on, so this test won't really be sent."
        : null;

  // Same code the worker sends with, so the preview is what recipients get.
  const preview = useMemo(
    () => (hasErrors ? null : renderEmail(template, definition.samplePayload, { ...PREVIEW_CONTEXT, overrides })),
    // overrides is derived from draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [template, definition, hasErrors, draft]
  );

  if (!isRendered) return null;

  const save = async () => {
    setSaving(true);
    try {
      await updateEmailTemplate(config, template, overrides, operator);
      addLog({ action: "UPDATE", entity: "email_templates", environment, payload: { template, ...overrides } });
      addToast(`"${definition.label}" saved`);
      await onSaved();
      onClose();
    } catch (err) {
      addToast(err.message || "Could not save", "error");
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    setTesting(true);
    try {
      await queueTestEmail(config, { template, to: testTo, payload: definition.samplePayload, overrides });
      addLog({ action: "CREATE", entity: "email_outbox", environment, payload: { _admin_action: "test_email", template, to: testTo } });
      const health = workerHealth(worker);
      addToast(
        health !== "online"
          ? "Test queued. It will go out when the email service is running."
          : worker.mode === "dry_run"
            ? "Test queued. The email service is in practice mode, so it will only be logged."
            : `Test queued for ${testTo.trim()}.`,
        "info"
      );
    } catch (err) {
      addToast(err.message || "Could not queue the test", "error");
    } finally {
      setTesting(false);
    }
  };

  const busy = saving || testing;
  return (
    <div className="modal modal-futuristic d-block" tabIndex="-1" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={backdropRef}>
      <div className="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable" role="document" ref={dialogRef}>
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title" id={titleId}>Edit “{definition.label}”</h5>
            <button type="button" className="btn-close" onClick={onClose} disabled={busy} aria-label="Close" />
          </div>
          <div className="modal-body">
            <div className="row g-4">
              <div className="col-12 col-lg-6">
                <p className="text-muted small">{definition.trigger}</p>
                {EDITABLE_FIELDS.map((field) => {
                  const id = `${titleId}-${field}`;
                  const Input = field === "body" ? "textarea" : "input";
                  return (
                    <div className="mb-3" key={field}>
                      <label htmlFor={id} className="form-label small fw-semibold mb-1">{FIELD_LABELS[field]}</label>
                      <Input
                        id={id}
                        className={`form-control form-control-sm ${errors[field] ? "is-invalid" : ""}`}
                        rows={field === "body" ? 8 : undefined}
                        value={draft[field]}
                        maxLength={FIELD_LIMITS[field] + 50}
                        onChange={(e) => setDraft((prev) => ({ ...prev, [field]: e.target.value }))}
                        disabled={busy}
                      />
                      {errors[field] ? <div className="invalid-feedback">{errors[field]}</div> : null}
                    </div>
                  );
                })}
                <div className="mb-3">
                  <div className="small fw-semibold mb-1">Personal details you can use</div>
                  {definition.placeholders.map(({ key, label }) => (
                    <div className="small" key={key}><code>{`{{${key}}}`}</code> <span className="text-muted">{label}</span></div>
                  ))}
                  {template === "creator_profile_reminder" ? (
                    <div className="text-muted small mt-1">The list of missing profile fields is added automatically.</div>
                  ) : null}
                  {template === "brand_new_applications" ? (
                    <div className="text-muted small mt-1">The list of campaigns is added automatically.</div>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  onClick={() => setDraft({ ...definition.defaults })}
                  disabled={busy}
                >
                  Use the original wording
                </button>
                <p className="text-muted small mt-3 mb-0">
                  The logo, layout, links and {definition.essential ? "footer" : "unsubscribe footer"} can&apos;t be changed.
                </p>
              </div>

              <div className="col-12 col-lg-6">
                <div className="small fw-semibold mb-1">Preview with sample data</div>
                {preview ? (
                  <>
                    <div className="small mb-2"><span className="text-muted">Subject:</span> {preview.subject}</div>
                    <iframe title="Email preview" sandbox="" srcDoc={preview.html} className="email-preview" />
                  </>
                ) : (
                  <div className="text-muted small">Fix the highlighted fields to see the preview.</div>
                )}
                <label htmlFor={`${titleId}-test`} className="form-label small fw-semibold mt-3 mb-1">Send a test to</label>
                <div className="d-flex gap-2">
                  <input
                    id={`${titleId}-test`}
                    type="email"
                    className="form-control form-control-sm"
                    value={testTo}
                    onChange={(e) => setTestTo(e.target.value)}
                    placeholder="your@email.com"
                    disabled={busy}
                  />
                  <button type="button" className="btn btn-sm btn-outline-primary text-nowrap" onClick={sendTest} disabled={busy || hasErrors || !testTo.trim()}>
                    {testing ? "Queuing…" : "Send test"}
                  </button>
                </div>
                <div className="text-muted small mt-1">Goes only to this address, using this unsaved text and sample data. The subject starts with [TEST].</div>
                {testWarning ? <div className="text-warning-emphasis small fw-semibold mt-1" role="status">{testWarning}</div> : null}
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={save} disabled={busy || hasErrors}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const AUDIENCES = [
  { id: "creator", title: "Emails to creators" },
  { id: "brand", title: "Emails to companies" },
];

/** One row per email type: on/off switch, the template editor, and timing for creator reminders. */
export function EmailTemplatesCard({ config, control, environment, operator, addLog, addToast, onChanged }) {
  const [editing, setEditing] = useState(null);
  const [togglingId, setTogglingId] = useState(null);
  const [editingTiming, setEditingTiming] = useState(false);
  const savedByName = useMemo(() => Object.fromEntries(control.templates.map((row) => [row.template, row])), [control.templates]);

  const toggle = async (template, enabled) => {
    setTogglingId(template);
    try {
      await updateEmailTemplate(config, template, { enabled }, operator);
      addLog({ action: "UPDATE", entity: "email_templates", environment, payload: { template, enabled } });
      addToast(`"${TEMPLATE_DEFINITIONS[template].label}" turned ${enabled ? "on" : "off"}`);
      await onChanged();
    } catch (err) {
      addToast(err.message || "Could not change this email", "error");
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <section className="admin-card p-3 p-md-4 d-grid gap-4">
      {AUDIENCES.map(({ id, title }) => {
        // A group appears once its database rows exist (its migration has been applied).
        const templates = TEMPLATE_NAMES.filter((name) => TEMPLATE_DEFINITIONS[name].audience === id && savedByName[name]);
        return templates.length ? (
          <div key={id}>
      <h2 className="h5 mb-1">{title}</h2>
      <p className="text-muted small mb-3">Turn an email on or off, or change what it says.</p>
      <div className="d-grid gap-3">
        {templates.map((template) => {
          const definition = TEMPLATE_DEFINITIONS[template];
          const saved = savedByName[template];
          const switchId = `email-on-${template}`;
          const isOff = saved?.enabled === false;
          const isReminder = template === "creator_profile_reminder";
          return (
            <div className="email-type-row" key={template}>
              <div className="form-check form-switch mb-0">
                <input
                  id={switchId}
                  type="checkbox"
                  role="switch"
                  className="form-check-input"
                  checked={!isOff}
                  onChange={(e) => toggle(template, e.target.checked)}
                  disabled={togglingId === template || !saved}
                  aria-label={`${definition.label} email`}
                />
              </div>
              <div className="email-row-text">
                <label htmlFor={switchId} className="fw-semibold mb-0">{definition.label}</label>
                {isOff ? <span className="ms-2"><Badge tone="neutral">Off</Badge></span> : null}
                <div className="text-muted small">{definition.trigger}</div>
                {isReminder ? (
                  <div className="text-muted small">
                    {reminderSummary(control.settings)}{" "}
                    <button
                      type="button"
                      className="btn btn-link btn-sm p-0 align-baseline"
                      aria-expanded={editingTiming}
                      onClick={() => setEditingTiming((open) => !open)}
                    >
                      Change timing
                    </button>
                  </div>
                ) : null}
                {definition.essential ? <div className="text-muted small">Still sent after someone unsubscribes.</div> : null}
                {isOff ? <div className="text-muted small">New events are skipped, and turning it back on doesn&apos;t send the skipped ones.</div> : null}
                {hasCustomText(saved) ? (
                  <div className="text-muted small">
                    Your wording{saved.updated_at ? `, updated ${formatDateTime(saved.updated_at)}` : ""}{saved.updated_by ? ` by ${saved.updated_by}` : ""}
                  </div>
                ) : null}
              </div>
              <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => setEditing(template)}>
                Edit email
              </button>
              {isReminder && editingTiming ? (
                <ReminderRulesForm
                  config={config}
                  settings={control.settings}
                  environment={environment}
                  addLog={addLog}
                  addToast={addToast}
                  onSaved={onChanged}
                  onClose={() => setEditingTiming(false)}
                />
              ) : null}
            </div>
          );
        })}
      </div>
          </div>
        ) : null;
      })}

      {editing ? (
        <TemplateEditor
          template={editing}
          saved={savedByName[editing]}
          config={config}
          environment={environment}
          operator={operator}
          worker={control.worker}
          addLog={addLog}
          addToast={addToast}
          onClose={() => setEditing(null)}
          onSaved={onChanged}
        />
      ) : null}
    </section>
  );
}
