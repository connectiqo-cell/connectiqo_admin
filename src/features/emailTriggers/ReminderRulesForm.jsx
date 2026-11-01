import { useState } from "react";
import { updateEmailSettings } from "../../services/adminApi.js";
import { validateReminderRules } from "./emailControl.js";

const RULE_FIELDS = [
  { key: "profile_reminder_after_days", label: "First reminder after (days)" },
  { key: "profile_reminder_every_days", label: "Days between reminders" },
  { key: "profile_reminder_max", label: "Maximum reminders" },
  { key: "profile_reminder_stop_above", label: "Stop when profile is above (%)" },
];

/** When profile reminders go out. Only creators who sign up after launch get them. */
export function ReminderRulesForm({ config, settings, environment, addLog, addToast, onSaved, onClose }) {
  const initial = Object.fromEntries(RULE_FIELDS.map(({ key }) => [key, String(settings[key])]));
  const [rules, setRules] = useState(initial);
  const [saving, setSaving] = useState(false);
  const errors = validateReminderRules(rules);
  const dirty = RULE_FIELDS.some(({ key }) => rules[key] !== initial[key]);

  const save = async (e) => {
    e.preventDefault();
    if (saving || !dirty || Object.keys(errors).length) return;
    setSaving(true);
    try {
      const changes = Object.fromEntries(RULE_FIELDS.map(({ key }) => [key, Number(rules[key])]));
      await updateEmailSettings(config, changes);
      addLog({ action: "UPDATE", entity: "email_trigger_settings", environment, payload: changes });
      addToast("Reminder timing saved");
      await onSaved();
      onClose();
    } catch (err) {
      addToast(err.message || "Could not save the timing", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="email-type-row__panel" onSubmit={save} noValidate>
      <div className="row g-3">
        {RULE_FIELDS.map(({ key, label }) => (
          <div className="col-12 col-sm-6 col-xl-3" key={key}>
            <label htmlFor={`rule-${key}`} className="form-label small fw-semibold mb-1">{label}</label>
            <input
              id={`rule-${key}`}
              type="number"
              inputMode="numeric"
              className={`form-control form-control-sm ${errors[key] ? "is-invalid" : ""}`}
              value={rules[key]}
              onChange={(e) => setRules((prev) => ({ ...prev, [key]: e.target.value }))}
              disabled={saving}
            />
            {errors[key] ? <div className="invalid-feedback">{errors[key]}</div> : null}
          </div>
        ))}
      </div>
      <div className="d-flex gap-2 mt-3">
        <button type="submit" className="btn btn-sm btn-primary" disabled={saving || !dirty || Object.keys(errors).length > 0}>
          {saving ? "Saving…" : "Save timing"}
        </button>
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onClose} disabled={saving}>Cancel</button>
      </div>
    </form>
  );
}
