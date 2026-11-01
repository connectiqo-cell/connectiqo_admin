const ACTIONS = {
  CREATE: { label: "Created", tone: "success" },
  UPDATE: { label: "Updated", tone: "info" },
  RPC: { label: "Updated", tone: "info" },
  DELETE: { label: "Deleted", tone: "danger" },
};

/** "email_trigger_settings" → "Email trigger settings" */
export function humanize(value) {
  const text = String(value ?? "").replace(/[_-]+/g, " ").trim();
  return text ? text[0].toUpperCase() + text.slice(1) : "";
}

/** { label, tone } for the action badge. */
export function describeAction(action) {
  if (ACTIONS[action]) return ACTIONS[action];
  const payment = String(action ?? "").match(/^webhook_reconciled_(.+)$/);
  if (payment) return { label: `Payment confirmed: ${humanize(payment[1]).toLowerCase()}`, tone: "neutral" };
  return { label: humanize(action) || "Unknown", tone: "neutral" };
}

function displayValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** The payload as [label, value] rows; the specific action is shown separately. */
export function payloadRows(payload) {
  if (payload === null || payload === undefined) return [];
  if (typeof payload !== "object" || Array.isArray(payload)) return [["Details", displayValue(payload)]];
  return Object.entries(payload)
    .filter(([key]) => key !== "_admin_action")
    .map(([key, value]) => [humanize(key), displayValue(value)]);
}

/** Sorted [value, label] options for a filter, from what the log really contains. */
export function filterOptions(logs, field, toLabel) {
  const values = [...new Set(logs.map((log) => log[field]).filter(Boolean))];
  return values.map((value) => [value, toLabel(value)]).sort((a, b) => a[1].localeCompare(b[1]));
}
