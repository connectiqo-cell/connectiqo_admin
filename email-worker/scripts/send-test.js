/**
 * Manual test: sends sample versions of the creator emails to ONE address you type.
 * Doesn't read or write the database — just checks SMTP and how the emails look.
 *
 *   npm run send-test -- --to ramvish9923@gmail.com
 *   npm run send-test -- --to ramvish9923@gmail.com --only creator_welcome
 *
 * Needs SMTP_USER / SMTP_PASS (and optionally the other MAIL_* settings) in .env.
 */
import { readFileSync, existsSync } from "node:fs";
import nodemailer from "nodemailer";
import { ESSENTIAL_TEMPLATES, renderEmail, TEMPLATE_DEFINITIONS, TEMPLATE_NAMES } from "../src/templates.js";

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

// Minimal .env loader (no extra dependency); real environment variables win.
if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const to = String(arg("to") || "").trim();
const only = arg("only");
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
  console.error("Usage: npm run send-test -- --to you@example.com [--only <template>]");
  process.exit(1);
}
if (only && !TEMPLATE_NAMES.includes(only)) {
  console.error(`Unknown template "${only}". Choose one of: ${TEMPLATE_NAMES.join(", ")}`);
  process.exit(1);
}
const { SMTP_USER, SMTP_PASS } = process.env;
if (!SMTP_USER || !SMTP_PASS) {
  console.error("SMTP_USER and SMTP_PASS must be set (in email-worker/.env).");
  process.exit(1);
}

const port = Number(process.env.SMTP_PORT || 465);
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port,
  secure: port === 465,
  auth: { user: SMTP_USER, pass: SMTP_PASS },
});

const ctx = {
  toName: "Test Creator",
  portalUrl: (process.env.PORTAL_URL || "https://app.connectiqo.com").replace(/\/+$/, ""),
  supportEmail: process.env.SUPPORT_EMAIL || "contact@connectiqo.com",
};

await transporter.verify();
console.log(`SMTP OK. Sending to ${to} only…`);
for (const template of only ? [only] : TEMPLATE_NAMES) {
  // Dummy token: the link shows how it looks; on the real page it reports "link not valid".
  const unsubscribeUrl = ESSENTIAL_TEMPLATES.has(template)
    ? undefined
    : `${ctx.portalUrl}/unsubscribe?t=00000000-0000-4000-8000-000000000000`;
  const email = renderEmail(template, TEMPLATE_DEFINITIONS[template].samplePayload, { ...ctx, unsubscribeUrl });
  await transporter.sendMail({
    from: { name: process.env.MAIL_FROM_NAME || "Connectiqo", address: process.env.MAIL_FROM_EMAIL || SMTP_USER },
    to,
    replyTo: process.env.MAIL_REPLY_TO || undefined,
    subject: `[TEST] ${email.subject}`,
    html: email.html,
    text: email.text,
  });
  console.log(`  sent [TEST] ${email.subject}`);
}
transporter.close();
