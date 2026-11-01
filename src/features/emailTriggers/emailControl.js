import { EDITABLE_FIELDS, TEMPLATE_DEFINITIONS } from "../../../email-worker/src/templates.js";
import { formatDateTime } from "../../utils/formatters.js";

/** The worker checks in every 30 s by default; a few misses means it has stopped. */
export const WORKER_OFFLINE_AFTER_MS = 3 * 60 * 1000;

export const WORKER_MODES = {
  dry_run: { label: "Practice mode", tone: "neutral", detail: "Emails are only logged. Nothing reaches anyone." },
  test: { label: "Test mode", tone: "warning", detail: "Only addresses on the test list receive automatic emails. Everyone else is skipped." },
  live: { label: "Live", tone: "success", detail: "Emails go to every eligible user." },
};

/** "online" | "offline" | "never" from the worker's last check-in. */
export function workerHealth(worker, now = Date.now()) {
  if (!worker?.last_seen_at) return "never";
  return now - Date.parse(worker.last_seen_at) <= WORKER_OFFLINE_AFTER_MS ? "online" : "offline";
}

/** The one thing an admin most needs to know right now; problems outrank the sending mode. */
export function emailStatusSummary(settings, worker, now = Date.now()) {
  if (settings.emails_paused) {
    const since = settings.emails_paused_at ? ` Paused ${formatDateTime(settings.emails_paused_at)}` : "";
    const by = since && settings.emails_paused_by ? ` by ${settings.emails_paused_by}.` : since ? "." : "";
    return { tone: "danger", icon: "pause_circle", title: "All emails are paused", detail: `Nothing goes out until you resume.${since}${by}` };
  }
  const health = workerHealth(worker, now);
  if (health === "never") {
    return { tone: "neutral", icon: "power_off", title: "Email service isn't running yet", detail: "Emails wait in the queue until it starts." };
  }
  if (health === "offline") {
    return { tone: "danger", icon: "error", title: "Email service has stopped", detail: `Emails wait in the queue until it restarts. Last seen ${formatDateTime(worker.last_seen_at)}.` };
  }
  if (worker.smtp_ok === false) {
    return { tone: "danger", icon: "error", title: "Can't connect to the mail server", detail: "Emails aren't going out. The Setup tab shows the error." };
  }
  if (worker.mode === "live") {
    return { tone: "success", icon: "check_circle", title: "Live", detail: WORKER_MODES.live.detail };
  }
  if (worker.mode === "test") {
    const list = worker.allowed_recipients || [];
    return {
      tone: "warning",
      icon: "science",
      title: "Test mode",
      detail: list.length
        ? `Only ${list.join(", ")} ${list.length === 1 ? "receives" : "receive"} automatic emails. Everyone else is skipped.`
        : "Automatic emails are held back. Test emails go to the address you type.",
    };
  }
  return { tone: "neutral", icon: "science", title: "Practice mode", detail: WORKER_MODES.dry_run.detail };
}

const days = (n) => `${n} day${n === 1 ? "" : "s"}`;

/** The reminder rules as a sentence. */
export function reminderSummary(settings) {
  const max = settings.profile_reminder_max;
  if (max === 0) return "Maximum reminders is 0, so none are sent.";
  return `First reminder after ${days(settings.profile_reminder_after_days)}, then every ${days(settings.profile_reminder_every_days)}, ${max} at most. Stops once the profile is above ${settings.profile_reminder_stop_above}%.`;
}

/** Text shown in the editor: saved text, or the built-in wording where nothing is saved. */
export function draftFromTemplate(template, saved) {
  const { defaults } = TEMPLATE_DEFINITIONS[template];
  return Object.fromEntries(EDITABLE_FIELDS.map((field) => [field, saved?.[field] ?? defaults[field]]));
}

/** What to store: null wherever the text is blank or matches the built-in wording. */
export function overridesFromDraft(template, draft) {
  const { defaults } = TEMPLATE_DEFINITIONS[template];
  return Object.fromEntries(
    EDITABLE_FIELDS.map((field) => {
      const value = String(draft?.[field] ?? "").trim();
      return [field, !value || value === defaults[field] ? null : value];
    })
  );
}

export const hasCustomText = (saved) => EDITABLE_FIELDS.some((field) => saved?.[field]);

const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

/** field → message for the Setup form. Changing the mail server or login needs its password. */
export function validateSetupDetails(details, initial) {
  const errors = {};
  const name = details.sender_name.trim();
  if (!name) errors.sender_name = "Enter a sender name.";
  else if (name.length > 100) errors.sender_name = "Sender name must be 100 characters or fewer.";
  if (!isEmail(details.sender_email.trim())) errors.sender_email = "Enter a valid email address.";
  for (const field of ["reply_to", "support_email"]) {
    const value = details[field].trim();
    if (value && !isEmail(value)) errors[field] = "Enter a valid email address.";
  }
  if (!/^[a-zA-Z0-9.-]+$/.test(details.smtp_host.trim())) errors.smtp_host = "Enter a host, like smtp.hostinger.com.";
  const port = Number(details.smtp_port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) errors.smtp_port = "Enter a port from 1 to 65535.";

  const serverChanged = ["sender_email", "smtp_host", "smtp_port"].some((field) => details[field].trim() !== initial[field]);
  if (serverChanged && !details.smtp_password.trim()) errors.smtp_password = "Enter the password for this account.";
  return errors;
}

/** field → message for the reminder rules form. */
export function validateReminderRules(rules) {
  const errors = {};
  const check = (field, min, max, label) => {
    const n = Number(rules[field]);
    if (String(rules[field]).trim() === "" || !Number.isInteger(n) || n < min || n > max) {
      errors[field] = `${label} must be a whole number from ${min} to ${max}.`;
    }
  };
  check("profile_reminder_stop_above", 0, 99, "Percentage");
  check("profile_reminder_after_days", 0, 90, "Days");
  check("profile_reminder_every_days", 1, 90, "Days");
  check("profile_reminder_max", 0, 20, "Number of reminders");
  return errors;
}
