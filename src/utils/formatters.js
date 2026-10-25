/**
 * Display formatting for raw database values: column labels, value kinds, and
 * locale-aware dates/currency. Used by DataTable, RowDetailsModal and payment views.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Labels that a mechanical snake_case → Title Case conversion would get wrong. */
const LABEL_OVERRIDES = {
  id: "ID",
  is_frozen: "Status",
  is_active: "Status",
  is_booked: "Booked",
  amount_total_paise: "Amount",
  mentor_earning_paise: "Creator earning",
  platform_fee_paise: "Platform fee",
  created_at: "Created",
  updated_at: "Updated",
  deleted_at: "Deleted",
  paid_at: "Paid",
  learner_id: "Booked by",
  mentor_id: "Creator",
  mentor_name: "Creator",
  learner_name: "Booked by",
  mentor_email: "Creator email",
  learner_email: "Booked by email",
  price_per_hour: "Price / hr",
  sort_order: "Sort",
  avatar_url: "Avatar",
  image_url: "Image",
  razorpay_order_id: "Razorpay order",
  razorpay_payment_id: "Razorpay payment",
  upi_id: "UPI ID",
  ifsc: "IFSC",
  kyc_status: "KYC status",
  gst_percent: "GST %",
  platform_fee_percent: "Platform fee %",
  fcm_token: "Push token",
  slot_ids: "Slots",
  linkedin_url: "LinkedIn",
  youtube_url: "YouTube",
  x_url: "X (Twitter)",
};

/** Product wording: the app's mentors are "creators", learners are who "booked". */
const ROLE_WORDS = [
  [/\bmentors\b/gi, "creators"],
  [/\bmentor\b/gi, "creator"],
  [/\blearners\b/gi, "customers"],
  [/\blearner\b/gi, "booked by"],
];

function applyRoleWords(text) {
  const replaced = ROLE_WORDS.reduce((acc, [pattern, word]) => acc.replace(pattern, word), text);
  return replaced.charAt(0).toUpperCase() + replaced.slice(1);
}

/**
 * "amount_total_paise" → "Amount", "booking_id" → "Booking", "mentor_frozen_until" → "Creator frozen until".
 * With `raw`, shows the real column name in title case (Database Explorer).
 */
export function humanizeKey(key, { raw = false } = {}) {
  if (raw) return String(key).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  if (LABEL_OVERRIDES[key]) return LABEL_OVERRIDES[key];
  const words = String(key)
    .replace(/^is_/, "")
    .replace(/_(paise|id|ids|at|url)$/, "")
    .split("_")
    .filter(Boolean);
  if (!words.length) return key;
  return applyRoleWords(words.join(" "));
}

/**
 * Decide how to display a column from its name (and a sample value as fallback).
 * Kinds: person | id | paise | inr | percent | boolean | status | datetime | date | time | json | link | number | text
 */
export function inferKind(key, value, personColumns = {}) {
  // `personColumns` may be null (tables without person columns), not just undefined.
  if (personColumns?.[key]) return "person";
  if (/_paise$/.test(key)) return "paise";
  if (/_percent$/.test(key)) return "percent";
  if (/^(amount|balance|price_per_hour|total_earned|total_withdrawn|unlock_price)$|_amount$/.test(key)) return "inr";
  if (typeof value === "boolean" || /^is_/.test(key)) return "boolean";
  if (key === "status" || /_status$/.test(key)) return "status";
  if (/_at$|_until$|_deadline$/.test(key)) return "datetime";
  if (/_time$/.test(key)) return "time";
  if (key === "date" || /_date$/.test(key)) return "date";
  if (/_url$/.test(key)) return "link";
  // Only real UUIDs get the short copyable ID treatment; upi_id, razorpay_payment_id,
  // meeting_id etc. are meaningful text and must be shown in full.
  if (key === "id" || /_id$/.test(key)) {
    return value === null || value === undefined || UUID_RE.test(String(value)) ? "id" : "text";
  }
  if (value !== null && typeof value === "object") return "json";
  if (typeof value === "number") return "number";
  if (typeof value === "string") {
    if (UUID_RE.test(value)) return "id";
    if (ISO_DATETIME_RE.test(value)) return "datetime";
    if (ISO_DATE_RE.test(value)) return "date";
  }
  return "text";
}

const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 2500 → "₹2,500.00" */
export function formatInr(rupees) {
  const n = Number(rupees);
  return Number.isFinite(n) ? inrFormatter.format(n) : "—";
}

/** 250000 paise → "₹2,500.00" */
export function formatPaise(paise) {
  const n = Number(paise);
  return Number.isFinite(n) ? inrFormatter.format(n / 100) : "—";
}

/** ISO timestamp → "18 Oct 2026, 4:54 pm" (viewer's locale and time zone). */
export function formatDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

/** "2026-10-18" → "18 Oct 2026" (date-only values are not shifted by time zone). */
export function formatDate(value) {
  if (!value) return "—";
  const [y, m, d] = String(value).slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return String(value);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** "14:30:00" → "2:30 pm" */
export function formatTime(value) {
  if (!value) return "—";
  const [h, min] = String(value).split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return String(value);
  return new Date(2000, 0, 1, h, min).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** "Just now", "5 min ago", "3 days ago" — for tooltips next to absolute dates. */
export function formatRelative(value) {
  const d = new Date(value);
  if (!value || Number.isNaN(d.getTime())) return "";
  const diff = (Date.now() - d.getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const steps = [
    [60, "second"],
    [3600, "minute", 60],
    [86400, "hour", 3600],
    [2592000, "day", 86400],
    [31536000, "month", 2592000],
    [Infinity, "year", 31536000],
  ];
  for (const [limit, unit, div = 1] of steps) {
    if (Math.abs(diff) < limit) return rtf.format(-Math.round(diff / div), unit);
  }
  return "";
}

/** "3f2a91bc-1234-…" → "3f2a91bc" */
export function shortId(value) {
  return String(value ?? "").slice(0, 8);
}

/** Badge colour for a status word. */
export function statusTone(status) {
  const s = String(status || "").toLowerCase();
  if (/^(paid|completed|complete|approved|active|success|succeeded|verified|confirmed|done|processed)$/.test(s)) return "success";
  if (/^(pending|created|initiated|processing|scheduled|unpaid|requested|in_progress|awaiting)$/.test(s)) return "warning";
  if (/^(failed|rejected|cancelled|canceled|declined|expired|error|frozen|blocked)$/.test(s)) return "danger";
  if (/^(refunded|rescheduled|reversed|ongoing|live|started)$/.test(s)) return "info";
  return "neutral";
}

/** Text + tone for boolean columns, worded for what the flag means. */
export function booleanBadge(key, value) {
  const on = Boolean(value);
  switch (key) {
    case "is_frozen": // full login ban
      return on ? { text: "Banned", tone: "danger" } : { text: "Active", tone: "success" };
    case "mentor_frozen": // creator freeze (profile/videos hidden)
      return on ? { text: "Frozen", tone: "warning" } : { text: "Active", tone: "success" };
    case "is_active":
      return on ? { text: "Active", tone: "success" } : { text: "Inactive", tone: "neutral" };
    case "is_booked":
      return on ? { text: "Booked", tone: "info" } : { text: "Open", tone: "neutral" };
    default:
      return on ? { text: "Yes", tone: "success" } : { text: "No", tone: "neutral" };
  }
}

/** Plain-text rendering of a value (for search, titles and copy). */
export function formatPlain(kind, value) {
  if (value === null || value === undefined || value === "") return "—";
  switch (kind) {
    case "paise": return formatPaise(value);
    case "inr": return formatInr(value);
    case "percent": return `${value}%`;
    case "datetime": return formatDateTime(value);
    case "date": return formatDate(value);
    case "time": return formatTime(value);
    case "json": return JSON.stringify(value);
    default: return String(value);
  }
}
