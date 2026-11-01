/**
 * Email definitions and rendering. Pure and browser-safe: the worker uses it to send and the
 * admin panel imports it for previews, so what admins see is what gets sent.
 *
 * Admins may override subject, heading, body and button text as PLAIN text with {{placeholders}}.
 * Everything is HTML-escaped; the layout, links and unsubscribe footer can't be edited.
 */

const BRAND = "#7c3aed";

export const EDITABLE_FIELDS = ["subject", "heading", "body", "button_label"];
export const FIELD_LIMITS = { subject: 200, heading: 200, body: 5000, button_label: 60 };

const FIRST_NAME = { key: "first_name", label: "Creator's first name" };
const COMPANY_NAME = { key: "company_name", label: "Company name" };
const CAMPAIGN_TITLE = { key: "campaign_title", label: "Campaign title" };

/** Opens the campaign when the email is about one; the list of campaigns otherwise. */
const campaignPath = (payload) =>
  payload.campaign_id ? `/brand/campaigns/${encodeURIComponent(payload.campaign_id)}` : "/brand/campaigns";

/** One entry per email. `placeholders` are what its text may use. */
export const TEMPLATE_DEFINITIONS = {
  creator_welcome: {
    label: "Welcome",
    audience: "creator",
    trigger: "Sent when a creator profile is created, once per creator.",
    essential: false,
    path: "/mentor/profile",
    placeholders: [FIRST_NAME],
    samplePayload: {},
    preheader: "Set up your creator profile and start taking bookings.",
    defaults: {
      subject: "Welcome to Connectiqo, {{first_name}}!",
      heading: "Welcome to Connectiqo, {{first_name}}!",
      body:
        "We're glad you're here. Your creator account is ready.\n\n" +
        "To start getting booked:\n" +
        "1. Complete your profile: photo, bio, skills and price\n" +
        "2. Add your available time slots\n" +
        "3. Share your profile link with your audience",
      button_label: "Complete your profile",
    },
  },
  creator_session_booked: {
    label: "Session booked",
    audience: "creator",
    trigger: "Sent when a booking is confirmed after payment. Not sent for reschedules.",
    essential: true,
    path: "/mentor/sessions",
    placeholders: [
      FIRST_NAME,
      { key: "booked_by", label: "Who booked the session" },
      { key: "session_when", label: "Session date and time" },
    ],
    samplePayload: { booked_by_name: "Ravi Kumar", date: "2026-11-02", start_time: "14:30:00", end_time: "15:30:00" },
    preheader: "{{booked_by}} booked a session with you.",
    defaults: {
      subject: "New session booked by {{booked_by}}",
      heading: "You have a new booking",
      body:
        "Hi {{first_name}},\n\n" +
        "{{booked_by}} just booked a session with you.\n\n" +
        "When: {{session_when}}\n\n" +
        "Please be on time. You can see all the details in your sessions.",
      button_label: "View your sessions",
    },
  },
  creator_profile_reminder: {
    label: "Complete your profile",
    audience: "creator",
    trigger: "Sent by a daily check at 10:00 IST to creators with an unfinished profile.",
    essential: false,
    path: "/mentor/profile",
    placeholders: [FIRST_NAME, { key: "completeness", label: "Profile completeness, e.g. 40%" }],
    samplePayload: { completeness: 40, missing: ["Profile photo", "Specialization", "Cover image", "A social link"] },
    preheader: "A complete profile gets more bookings.",
    // The list of missing fields is added automatically after the body.
    defaults: {
      subject: "Your Connectiqo profile is {{completeness}} complete",
      heading: "Your profile is {{completeness}} complete",
      body: "Hi {{first_name}},\n\nCreators with a complete profile get noticed and booked more often.",
      button_label: "Finish your profile",
    },
  },
  brand_welcome: {
    label: "Company welcome",
    audience: "brand",
    trigger: "Sent when a company account is created, once per company.",
    essential: false,
    path: "/brand/campaigns/new",
    placeholders: [COMPANY_NAME],
    samplePayload: { company_name: "Acme Foods" },
    preheader: "Create your first campaign and start working with creators.",
    defaults: {
      subject: "Welcome to Connectiqo, {{company_name}}!",
      heading: "Welcome to Connectiqo, {{company_name}}!",
      body:
        "We're glad you're here. Your company account is ready.\n\n" +
        "To start working with creators:\n" +
        "1. Create a campaign and describe the content you need\n" +
        "2. Review the creators who apply\n" +
        "3. Approve the videos they submit",
      button_label: "Create a campaign",
    },
  },
  brand_campaign_reminder: {
    label: "Create your first campaign",
    audience: "brand",
    trigger: "Sent by a daily check at 10:00 IST if a company hasn't launched a campaign: 3 days after signing up, then every 3 days, 3 at most.",
    essential: false,
    path: "/brand/campaigns/new",
    placeholders: [COMPANY_NAME],
    samplePayload: { company_name: "Acme Foods" },
    preheader: "Creators are ready to apply. Launch your first campaign.",
    defaults: {
      subject: "Ready to launch your first campaign?",
      heading: "Launch your first campaign",
      body:
        "Hi {{company_name}},\n\n" +
        "You haven't launched a campaign yet. It only takes a few minutes, and creators can start applying as soon as it's live.",
      button_label: "Create a campaign",
    },
  },
  brand_campaign_live: {
    label: "Campaign is live",
    audience: "brand",
    trigger: "Sent when a campaign is published, once per campaign.",
    essential: true,
    path: campaignPath,
    placeholders: [COMPANY_NAME, CAMPAIGN_TITLE],
    samplePayload: { company_name: "Acme Foods", campaign_title: "Summer launch" },
    preheader: "Creators can now apply to {{campaign_title}}.",
    defaults: {
      subject: "{{campaign_title}} is live",
      heading: "Your campaign is live",
      body:
        "Hi {{company_name}},\n\n" +
        "{{campaign_title}} is now live, and creators can apply. We'll send you a daily summary when new applications come in.",
      button_label: "View your campaign",
    },
  },
  brand_new_applications: {
    label: "New applications",
    audience: "brand",
    trigger: "Sent once a day at 10:00 IST, only if a company has new applications since the last summary.",
    essential: true,
    path: "/brand/campaigns",
    placeholders: [COMPANY_NAME, { key: "new_applications", label: "How many, e.g. 5 new applications" }],
    samplePayload: {
      company_name: "Acme Foods",
      total: 5,
      campaigns: [{ title: "Summer launch", count: 3 }, { title: "Festive offer", count: 2 }],
    },
    preheader: "You have {{new_applications}} to review.",
    // The list of campaigns is added automatically after the body.
    defaults: {
      subject: "You have {{new_applications}}",
      heading: "You have {{new_applications}}",
      body: "Hi {{company_name}},\n\nCreators have applied to your campaigns.",
      button_label: "Review applications",
    },
  },
  brand_new_submission: {
    label: "New submission",
    audience: "brand",
    trigger: "Sent when a creator's video is ready to review, including resubmissions.",
    essential: true,
    path: campaignPath,
    placeholders: [COMPANY_NAME, CAMPAIGN_TITLE, { key: "creator_name", label: "Creator's name" }],
    samplePayload: { company_name: "Acme Foods", campaign_title: "Summer launch", creator_name: "Asha Verma" },
    preheader: "{{creator_name}} submitted a video for {{campaign_title}}.",
    defaults: {
      subject: "New video from {{creator_name}} for {{campaign_title}}",
      heading: "You have a new submission",
      body:
        "Hi {{company_name}},\n\n" +
        "{{creator_name}} submitted a video for {{campaign_title}}. It's ready for you to review.",
      button_label: "Review the video",
    },
  },
};

export const TEMPLATE_NAMES = Object.keys(TEMPLATE_DEFINITIONS);

/** Emails that still go out after someone unsubscribes (must match email_template_is_essential). */
export const ESSENTIAL_TEMPLATES = new Set(TEMPLATE_NAMES.filter((name) => TEMPLATE_DEFINITIONS[name].essential));

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * "2026-11-02" → "Mon, 2 Nov 2026". Built by hand: locale output differs between Node/ICU
 * versions (e.g. "Mon, 2 Nov, 2026"), and date-only values must never shift by time zone.
 */
export function formatDate(value) {
  const [y, m, d] = String(value || "").slice(0, 10).split("-").map(Number);
  if (!y || !m || !d || m > 12 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  return `${WEEKDAYS[date.getUTCDay()]}, ${d} ${MONTHS[m - 1]} ${y}`;
}

/** "14:30:00" → "2:30 pm"; "24:00:00" (a slot ending at midnight) → "12:00 am" */
export function formatTime(value) {
  const [parsedHour, min] = String(value || "").split(":").map(Number);
  const h = parsedHour === 24 && min === 0 ? 0 : parsedHour;
  if (!Number.isInteger(h) || !Number.isInteger(min) || h < 0 || h > 23 || min < 0 || min > 59) return null;
  return `${h % 12 || 12}:${String(min).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

const firstName = (name) => String(name || "").trim().split(/\s+/)[0] || "there";

/** Values for every placeholder of an email. An empty string means "not known". */
function placeholderValues(payload, ctx) {
  const date = formatDate(payload.date);
  const start = formatTime(payload.start_time);
  const end = formatTime(payload.end_time);
  const applications = Math.max(0, Number(payload.total) || 0);
  return {
    first_name: firstName(ctx.toName),
    company_name: String(payload.company_name || "").trim() || firstName(ctx.toName),
    campaign_title: String(payload.campaign_title || "").trim() || "Your campaign",
    creator_name: String(payload.creator_name || "").trim() || "A creator",
    new_applications: `${applications} new application${applications === 1 ? "" : "s"}`,
    booked_by: String(payload.booked_by_name || "").trim() || "Someone",
    session_when: [date, start && end ? `${start} – ${end}` : start].filter(Boolean).join(", "),
    completeness: `${Math.max(0, Math.min(100, Number(payload.completeness) || 0))}%`,
  };
}

const PLACEHOLDER_RE = /\{\{\s*([a-z_]+)\s*\}\}/g;

/** Placeholders in `text` that this email can't fill. */
export function unknownPlaceholders(template, text) {
  const known = new Set((TEMPLATE_DEFINITIONS[template]?.placeholders || []).map((item) => item.key));
  const stray = String(text ?? "").replace(PLACEHOLDER_RE, (match, key) => (known.has(key) ? "" : match));
  const found = [...new Set([...stray.matchAll(PLACEHOLDER_RE)].map((match) => match[1]))];
  // Malformed braces such as "{{ Name }}" or "{name}}" would otherwise be sent literally.
  if (/\{\{|\}\}/.test(stray.replace(PLACEHOLDER_RE, ""))) found.push("(broken {{ }} braces)");
  return found;
}

/** field → message for anything an admin must fix before saving. Blank means built-in wording. */
export function validateTemplateFields(template, fields) {
  const errors = {};
  for (const field of EDITABLE_FIELDS) {
    const value = String(fields?.[field] ?? "");
    if (value.length > FIELD_LIMITS[field]) errors[field] = `Keep this under ${FIELD_LIMITS[field]} characters.`;
    const unknown = unknownPlaceholders(template, value);
    if (unknown.length) errors[field] = `Not available in this email: ${unknown.join(", ")}`;
  }
  return errors;
}

/** Override if usable, otherwise the built-in text. A bad saved value can never reach a recipient. */
function resolveText(template, field, overrides) {
  const custom = overrides?.[field];
  if (
    typeof custom === "string" &&
    custom.trim() &&
    custom.length <= FIELD_LIMITS[field] &&
    !unknownPlaceholders(template, custom).length
  ) {
    return custom.trim();
  }
  return TEMPLATE_DEFINITIONS[template].defaults[field];
}

/** Fills placeholders. A line whose placeholder has no value is dropped ("When: " with no date). */
function fill(text, values) {
  return text
    .split("\n")
    .filter((line) => ![...line.matchAll(PLACEHOLDER_RE)].some((match) => !values[match[1]]))
    .join("\n")
    .replace(PLACEHOLDER_RE, (_match, key) => values[key]);
}

function bodyHtml(text) {
  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.6">${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

const FOOTER_NOTES = {
  creator: {
    essential: "This is a booking notification for your Connectiqo creator account.",
    optional: "You're receiving this because you have a creator account on Connectiqo.",
  },
  brand: {
    essential: "This is a notification about your campaigns on Connectiqo.",
    optional: "You're receiving this because you have a company account on Connectiqo.",
  },
};

/** Footer line: unsubscribe link for optional emails, an explanation for essential ones. */
function footerHtml(ctx, essential, audience) {
  if (essential) return `${FOOTER_NOTES[audience].essential}<br>`;
  const unsubscribe = ctx.unsubscribeUrl
    ? ` <a href="${escapeHtml(ctx.unsubscribeUrl)}" style="color:#6b7280">Unsubscribe</a> from these emails.`
    : "";
  return `${FOOTER_NOTES[audience].optional}${unsubscribe}<br>`;
}

function footerText(ctx, essential, audience) {
  return essential
    ? `\n\n—\n${FOOTER_NOTES[audience].essential}\nQuestions? ${ctx.supportEmail}`
    : `\n\n—\n${FOOTER_NOTES[audience].optional}` +
        (ctx.unsubscribeUrl ? `\nUnsubscribe: ${ctx.unsubscribeUrl}` : "") +
        `\nQuestions? ${ctx.supportEmail}`;
}

/** The automatic list after the body: { title, items } or null. */
function emailList(template, data) {
  if (template === "creator_profile_reminder" && Array.isArray(data.missing)) {
    const items = data.missing.map(String).filter(Boolean);
    return items.length ? { title: "Still missing:", items } : null;
  }
  if (template === "brand_new_applications" && Array.isArray(data.campaigns)) {
    const items = data.campaigns
      .filter((campaign) => campaign?.title)
      .map((campaign) => `${campaign.title}: ${Number(campaign.count) || 0}`);
    return items.length ? { title: "New applications by campaign:", items } : null;
  }
  return null;
}

/** Shared branded layout. `content` is trusted HTML built from escaped values. */
function layout({ preheader, heading, content, button, url, ctx, essential, audience }) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(heading)}</title></head>
<body style="margin:0;background:#f4f4f7;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2937">
<span style="display:none;max-height:0;overflow:hidden">${escapeHtml(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:${BRAND};padding:18px 28px;color:#ffffff;font-size:20px;font-weight:700">Connectiqo</td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3">${escapeHtml(heading)}</h1>
${content}
<p style="margin:28px 0 8px"><a href="${escapeHtml(url)}" style="background:${BRAND};color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;display:inline-block">${escapeHtml(button)}</a></p>
</td></tr>
<tr><td style="padding:18px 28px;background:#fafafa;color:#6b7280;font-size:12px;line-height:1.5">
${footerHtml(ctx, essential, audience)}Questions? Write to <a href="mailto:${escapeHtml(ctx.supportEmail)}" style="color:${BRAND}">${escapeHtml(ctx.supportEmail)}</a>.
</td></tr>
</table></td></tr></table></body></html>`;
}

/**
 * Renders one email to { subject, html, text }. Throws for unknown templates.
 * ctx: { toName, portalUrl, supportEmail, unsubscribeUrl?, overrides? }
 */
export function renderEmail(template, payload, ctx) {
  const definition = TEMPLATE_DEFINITIONS[template];
  if (!definition) throw new Error(`Unknown email template: ${template}`);

  const data = payload || {};
  const values = placeholderValues(data, ctx);
  const text = (field) => fill(resolveText(template, field, ctx.overrides), values);

  const subject = text("subject").replace(/\s+/g, " ").trim();
  const heading = text("heading");
  const body = text("body");
  const button = text("button_label");
  const path = typeof definition.path === "function" ? definition.path(data) : definition.path;
  const url = `${ctx.portalUrl}${path}`;

  const list = emailList(template, data);
  const listHtml = list
    ? `<p style="margin:0 0 12px;font-size:15px;line-height:1.6">${escapeHtml(list.title)}</p>
<ul style="margin:0 0 12px 20px;padding:0;font-size:15px;line-height:1.7">${list.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
    : "";
  const listText = list ? `\n\n${list.title}\n${list.items.map((item) => `- ${item}`).join("\n")}` : "";

  return {
    subject,
    html: layout({
      preheader: fill(definition.preheader, values),
      heading,
      content: bodyHtml(body) + listHtml,
      button,
      url,
      ctx,
      essential: definition.essential,
      audience: definition.audience,
    }),
    text: `${heading}\n\n${body}${listText}\n\n${button}: ${url}${footerText(ctx, definition.essential, definition.audience)}`,
  };
}
