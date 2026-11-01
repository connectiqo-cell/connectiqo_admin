import { test } from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { ESSENTIAL_TEMPLATES, escapeHtml, formatDate, formatTime, renderEmail, TEMPLATE_NAMES, validateTemplateFields } from "../src/templates.js";

const ctx = { toName: "Asha Verma", portalUrl: "https://connectiqo.com", supportEmail: "contact@connectiqo.com" };

test("the three creator and five company templates exist (no withdrawal email)", () => {
  assert.deepEqual([...TEMPLATE_NAMES].sort(), [
    "brand_campaign_live",
    "brand_campaign_reminder",
    "brand_new_applications",
    "brand_new_submission",
    "brand_welcome",
    "creator_profile_reminder",
    "creator_session_booked",
    "creator_welcome",
  ]);
});

test("every template renders subject, html and text with the first name and a link", () => {
  const payloads = {
    creator_welcome: {},
    creator_session_booked: { booked_by_name: "Ravi", date: "2026-11-02", start_time: "14:30:00", end_time: "15:30:00" },
    creator_profile_reminder: { completeness: 40, missing: ["Bio"] },
  };
  for (const [template, payload] of Object.entries(payloads)) {
    const email = renderEmail(template, payload, ctx);
    assert.ok(email.subject.length > 5, template);
    assert.match(email.html, /^<!doctype html>/, template);
    assert.match(email.text, /Asha|Hi Asha/, template);
    assert.match(email.html, /https:\/\/connectiqo\.com\//, template);
    assert.match(email.text, /https:\/\/connectiqo\.com\//, template);
  }
});

test("user-supplied values are HTML-escaped", () => {
  const email = renderEmail(
    "creator_session_booked",
    { booked_by_name: `<img src=x onerror="alert(1)">` },
    { ...ctx, toName: "<b>Eve</b>" }
  );
  assert.ok(!email.html.includes("<img"), "booker name must be escaped");
  assert.ok(!email.html.includes("<b>Eve"), "recipient name must be escaped");
  assert.ok(email.html.includes("&lt;img"));
  assert.equal(escapeHtml(`a&b"c'<>`), "a&amp;b&quot;c&#39;&lt;&gt;");
});

test("session booked shows date and time range", () => {
  const email = renderEmail(
    "creator_session_booked",
    { booked_by_name: "Ravi", date: "2026-11-02", start_time: "14:30:00", end_time: "15:30:00" },
    ctx
  );
  assert.match(email.subject, /Ravi/);
  assert.match(email.text, /Mon, 2 Nov 2026/);
  assert.match(email.text, /2:30 pm – 3:30 pm/i);
});

test("session booked without slot info still renders", () => {
  const email = renderEmail("creator_session_booked", { booked_by_name: "Someone" }, ctx);
  assert.equal(email.subject, "New session booked by Someone");
  assert.doesNotMatch(email.text, /When:/);
});

test("dates and times never shift with the server time zone", () => {
  assert.equal(formatDate("2026-11-02"), "Mon, 2 Nov 2026");
  assert.equal(formatDate("garbage"), null);
  assert.match(formatTime("00:05:00"), /12:05 am/i);
  assert.equal(formatTime(""), null);
});

test("profile reminder lists missing fields and clamps the percentage", () => {
  const email = renderEmail("creator_profile_reminder", { completeness: 140, missing: ["Profile photo", "Skills"] }, ctx);
  assert.equal(email.subject, "Your Connectiqo profile is 100% complete");
  assert.match(email.text, /- Profile photo\n- Skills/);
  const none = renderEmail("creator_profile_reminder", { completeness: 60 }, ctx);
  assert.doesNotMatch(none.text, /Still missing/);
});

test("withdrawal emails are not a template", () => {
  assert.throws(() => renderEmail("creator_withdrawal_status", { status: "completed", amount: 5000 }, ctx), /Unknown email template/);
});

test("missing recipient name falls back to a friendly greeting", () => {
  const email = renderEmail("creator_welcome", {}, { ...ctx, toName: null });
  assert.equal(email.subject, "Welcome to Connectiqo, there!");
});

test("unknown template throws", () => {
  assert.throws(() => renderEmail("no_such_email", {}, ctx), /Unknown email template/);
});

test("the essential emails match email_template_is_essential in SQL", () => {
  assert.deepEqual([...ESSENTIAL_TEMPLATES].sort(), ["brand_campaign_live", "brand_new_applications", "brand_new_submission", "creator_session_booked"]);
  const sql = readFileSync(new URL("../../supabase/migrations/20261031150000_brand_email_triggers.sql", import.meta.url), "utf8");
  assert.match(sql, /select p_template in \('creator_session_booked', 'brand_campaign_live', 'brand_new_applications', 'brand_new_submission'\)/);
});

test("reminder footer offers unsubscribe when a link is given", () => {
  const email = renderEmail("creator_profile_reminder", { completeness: 40 }, { ...ctx, unsubscribeUrl: "https://connectiqo.com/unsubscribe?t=abc" });
  assert.match(email.html, /href="https:\/\/connectiqo\.com\/unsubscribe\?t=abc"[^>]*>Unsubscribe<\/a>/);
});

test("saved text replaces the wording and fills placeholders", () => {
  const email = renderEmail("creator_welcome", {}, {
    ...ctx,
    overrides: { subject: "Hello {{first_name}}", heading: "Hey {{ first_name }}", body: "Line one\nLine two\n\nNext", button_label: "Go" },
  });
  assert.equal(email.subject, "Hello Asha");
  assert.ok(email.html.includes(">Hey Asha</h1>"));
  assert.ok(email.html.includes("Line one<br>Line two"));
  assert.ok(email.html.includes(">Go</a>"));
  assert.match(email.text, /Go: https:\/\/connectiqo\.com\/mentor\/profile/);
});

test("blank or broken saved text falls back to the built-in wording", () => {
  const defaults = renderEmail("creator_welcome", {}, ctx);
  for (const subject of ["", "   ", null, "Hi {{unknown_thing}}", "Hi {{ broken", "x".repeat(201)]) {
    assert.equal(renderEmail("creator_welcome", {}, { ...ctx, overrides: { subject } }).subject, defaults.subject);
  }
});

test("saved text can't inject HTML", () => {
  const email = renderEmail("creator_welcome", {}, {
    ...ctx,
    overrides: { heading: "<script>x</script>", body: `<img src=x onerror="y">`, button_label: "<b>Go</b>" },
  });
  for (const raw of ["<script>", "<img", "<b>Go"]) assert.ok(!email.html.includes(raw), raw);
});

test("the footer can't be edited away: unsubscribe stays on optional emails", () => {
  const email = renderEmail("creator_welcome", {}, {
    ...ctx,
    unsubscribeUrl: "https://connectiqo.com/unsubscribe?t=abc",
    overrides: { body: "Only this" },
  });
  assert.ok(email.html.includes(">Unsubscribe</a>"));
  assert.match(email.text, /Unsubscribe: https:/);
});

test("a line whose placeholder has no value is dropped", () => {
  const email = renderEmail("creator_session_booked", { booked_by_name: "Ravi" }, {
    ...ctx,
    overrides: { body: "Booked by {{booked_by}}\nWhen: {{session_when}}\nThanks" },
  });
  assert.doesNotMatch(email.text, /When:/);
  assert.match(email.text, /Booked by Ravi\nThanks/);
});

test("validation reports placeholders this email can't use", () => {
  assert.deepEqual(validateTemplateFields("creator_welcome", { subject: "Hi {{first_name}}" }), {});
  assert.match(validateTemplateFields("creator_welcome", { body: "{{session_when}}" }).body, /session_when/);
  assert.match(validateTemplateFields("creator_welcome", { subject: "Hi {{first name}}" }).subject, /broken/);
  assert.match(validateTemplateFields("creator_welcome", { button_label: "x".repeat(61) }).button_label, /under 60/);
});

test("company emails: right link, wording and footer", () => {
  const brandCtx = { toName: "Owner", portalUrl: "https://app.connectiqo.com", supportEmail: "contact@connectiqo.com", unsubscribeUrl: "https://app.connectiqo.com/unsubscribe?t=abc" };
  const welcome = renderEmail("brand_welcome", { company_name: "Acme" }, brandCtx);
  assert.equal(welcome.subject, "Welcome to Connectiqo, Acme!");
  assert.ok(welcome.html.includes('href="https://app.connectiqo.com/brand/campaigns/new"'));
  assert.ok(welcome.html.includes("company account"));
  assert.ok(welcome.html.includes("Unsubscribe"));
  assert.ok(!welcome.html.includes("creator account"));

  const live = renderEmail("brand_campaign_live", { company_name: "Acme", campaign_id: "c-1", campaign_title: "Summer <b>" }, { ...brandCtx, unsubscribeUrl: undefined });
  assert.equal(live.subject, "Summer <b> is live");
  assert.ok(live.html.includes('href="https://app.connectiqo.com/brand/campaigns/c-1"'));
  assert.ok(live.html.includes("Summer &lt;b&gt;"), "titles are escaped");
  assert.ok(live.html.includes("about your campaigns"));
  assert.ok(!live.html.includes("Unsubscribe"));

  const noCampaign = renderEmail("brand_new_submission", { company_name: "Acme" }, brandCtx);
  assert.ok(noCampaign.html.includes('href="https://app.connectiqo.com/brand/campaigns"'));
  assert.equal(noCampaign.subject, "New video from A creator for Your campaign");

  const one = renderEmail("brand_new_applications", { company_name: "Acme", total: 1, campaigns: [{ title: "Summer", count: 1 }] }, brandCtx);
  assert.equal(one.subject, "You have 1 new application");
  assert.ok(one.html.includes("<li>Summer: 1</li>"));
  assert.ok(one.text.includes("- Summer: 1"));
  const many = renderEmail("brand_new_applications", { total: 5, campaigns: [] }, brandCtx);
  assert.equal(many.subject, "You have 5 new applications");
  assert.ok(!many.html.includes("by campaign"));
});

test("a session ending at midnight shows its end time", () => {
  assert.equal(formatTime("24:00:00"), "12:00 am");
  assert.equal(formatTime("24:30:00"), null);
  const email = renderEmail("creator_session_booked", { booked_by_name: "Ravi", date: "2026-11-04", start_time: "23:30:00", end_time: "24:00:00" }, ctx);
  assert.ok(email.text.includes("When: Wed, 4 Nov 2026, 11:30 pm – 12:00 am"));
});
