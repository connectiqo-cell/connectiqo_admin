import { test } from "node:test";
import assert from "node:assert/strict";
import { applyPanelSettings, reportStatus, runOnce, startWorker, workerMode } from "../src/worker.js";
import { loadConfig } from "../src/config.js";

const baseEnv = {
  SUPABASE_URL: "https://x.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-key",
  SMTP_USER: "connectiqo@gmail.com",
  SMTP_PASS: "app-password",
};
const config = { ...loadConfig({ ...baseEnv, DRY_RUN: "true" }), dryRun: false, sendDelayMs: 0 };
const silent = { info() {}, error() {} };

/** Fake Supabase: serves `rows` once from claim, records every complete call. */
function fakeSupabase(rows, { claimError = null, completeError = null } = {}) {
  const completed = [];
  let served = false;
  return {
    completed,
    async rpc(name, args) {
      if (name === "claim_email_outbox") {
        if (claimError) return { data: null, error: claimError };
        const data = served ? [] : rows;
        served = true;
        return { data, error: null };
      }
      if (name === "complete_email_outbox") {
        completed.push(args);
        return { data: null, error: completeError };
      }
      throw new Error(`unexpected rpc ${name}`);
    },
  };
}

const row = (over = {}) => ({
  id: "e1",
  audience: "creator",
  template: "creator_welcome",
  recipient_id: "u1",
  payload: {},
  attempts: 1,
  to_email: "asha@x.com",
  to_name: "Asha",
  ...over,
});

test("sends each claimed email and reports success", async () => {
  const sent = [];
  const supabase = fakeSupabase([row(), row({ id: "e2", to_email: "ravi@x.com", to_name: null })]);
  const transporter = { sendMail: async (m) => sent.push(m) };
  const result = await runOnce({ supabase, transporter, config, logger: silent });

  assert.deepEqual(result, { claimed: 2, sent: 2, failed: 0, skipped: 0 });
  assert.equal(sent[0].to.address, "asha@x.com");
  assert.equal(sent[1].to, "ravi@x.com");
  assert.equal(sent[0].from.address, "connectiqo@gmail.com");
  assert.equal(sent[0].replyTo, "contact@connectiqo.com");
  assert.equal(sent[0].headers["X-Connectiqo-Email-Id"], "e1");
  assert.ok(sent[0].html && sent[0].text);
  assert.deepEqual(supabase.completed, [
    { p_id: "e1", p_ok: true, p_error: null, p_skip: false },
    { p_id: "e2", p_ok: true, p_error: null, p_skip: false },
  ]);
});

test("an SMTP failure is reported (for retry) and doesn't stop the batch", async () => {
  const supabase = fakeSupabase([row(), row({ id: "e2" })]);
  let calls = 0;
  const transporter = {
    sendMail: async () => {
      calls += 1;
      if (calls === 1) throw new Error("421 Too many connections");
    },
  };
  const result = await runOnce({ supabase, transporter, config, logger: silent });
  assert.deepEqual(result, { claimed: 2, sent: 1, failed: 1, skipped: 0 });
  assert.deepEqual(supabase.completed[0], { p_id: "e1", p_ok: false, p_error: "421 Too many connections", p_skip: false });
  assert.equal(supabase.completed[1].p_ok, true);
});

test("an unknown template fails that email only", async () => {
  const supabase = fakeSupabase([row({ template: "no_such_email" })]);
  const result = await runOnce({ supabase, transporter: { sendMail: async () => {} }, config, logger: silent });
  assert.equal(result.failed, 1);
  assert.match(supabase.completed[0].p_error, /Unknown email template/);
});

test("dry run sends nothing and closes the rows as skipped", async () => {
  const supabase = fakeSupabase([row()]);
  let sent = 0;
  const logs = [];
  const result = await runOnce({
    supabase,
    transporter: { sendMail: async () => { sent += 1; } },
    config: { ...config, dryRun: true },
    logger: { info: (m) => logs.push(m), error() {} },
  });
  assert.equal(sent, 0);
  assert.equal(result.sent, 0);
  assert.equal(result.skipped, 1);
  assert.match(logs[0], /\[dry-run\] would send "Welcome to Connectiqo, Asha!"/);
  assert.equal(supabase.completed[0].p_ok, false);
  assert.equal(supabase.completed[0].p_skip, true);
});

test("a claim error is raised so the loop can log and retry", async () => {
  const supabase = fakeSupabase([], { claimError: { message: "permission denied" } });
  await assert.rejects(() => runOnce({ supabase, transporter: {}, config, logger: silent }), /permission denied/);
});

test("nothing to do → no sends", async () => {
  const result = await runOnce({ supabase: fakeSupabase([]), transporter: {}, config, logger: silent });
  assert.deepEqual(result, { claimed: 0, sent: 0, failed: 0, skipped: 0 });
});

test("the loop keeps running after errors and stops cleanly", async () => {
  let cycles = 0;
  const supabase = {
    async rpc() {
      cycles += 1;
      return cycles === 1 ? { data: null, error: { message: "network down" } } : { data: [], error: null };
    },
  };
  const errors = [];
  const worker = startWorker({
    supabase,
    transporter: {},
    config: { ...config, pollIntervalMs: 10 },
    logger: { info() {}, error: (m) => errors.push(m) },
  });
  await new Promise((r) => setTimeout(r, 60));
  await worker.stop();
  assert.ok(cycles >= 2, "kept polling after the error");
  assert.match(errors[0], /network down/);
});

const panel = (settings, error = null) => ({ rpc: async () => ({ data: settings ? [settings] : [], error }) });

test("the panel's mode replaces the .env mode", async () => {
  const fromEnv = { ...config, dryRun: true };
  const test1 = await applyPanelSettings({ supabase: panel({ sending_mode: "test", test_recipients: [" Me@X.com "] }), config: fromEnv });
  assert.equal(workerMode(test1), "test");
  assert.deepEqual(test1.allowedRecipients, ["me@x.com"]);
  const dry = await applyPanelSettings({ supabase: panel({ sending_mode: "dry_run", test_recipients: [] }), config });
  assert.equal(workerMode(dry), "dry_run");
});

/** Runs the real worker loop briefly against a fake database and mail server. */
async function runWorkerWith({ env = {}, savedLogin = null, loginError = null, badPasswords = [], changeLoginTo } = {}) {
  let login = savedLogin;
  const calls = [];
  const heartbeats = [];
  const logs = [];
  const transports = [];
  const supabase = {
    async rpc(name, args) {
      calls.push(name);
      if (name === "email_worker_settings") return { data: [{ sending_mode: "test", test_recipients: [] }], error: null };
      if (name === "email_worker_smtp_login") return { data: loginError ? null : login ? [login] : [], error: loginError };
      if (name === "claim_email_outbox") return { data: [], error: null };
      if (name === "email_worker_heartbeat") heartbeats.push(args);
      return { data: null, error: null };
    },
  };
  const createTransport = (auth) => {
    const transport = {
      auth,
      closed: false,
      verifications: 0,
      close() { this.closed = true; },
      async verify() {
        this.verifications += 1;
        if (badPasswords.includes(auth.pass)) throw new Error("535 Bad credentials");
      },
    };
    transports.push(transport);
    return transport;
  };
  const worker = startWorker({
    supabase,
    createTransport,
    config: { ...loadConfig({ ...baseEnv, DRY_RUN: "true", ...env }), pollIntervalMs: 5 },
    logger: { info: (m) => logs.push(m), error: (m) => logs.push(m) },
  });
  await new Promise((r) => setTimeout(r, 40));
  if (changeLoginTo) {
    login = changeLoginTo;
    await new Promise((r) => setTimeout(r, 40));
  }
  await worker.stop();
  return { calls, heartbeats, logs, transports };
}

test("a login saved in the panel replaces .env; the password is never logged or reported", async () => {
  const { transports, heartbeats, logs, calls } = await runWorkerWith({ savedLogin: { smtp_host: "smtp.hostinger.com", smtp_port: 587, smtp_user: "panel@x.com", smtp_pass: "panel-secret" } });
  assert.equal(transports.length, 1);
  assert.deepEqual(transports[0].auth, { host: "smtp.hostinger.com", port: 587, user: "panel@x.com", pass: "panel-secret" });
  assert.equal(transports[0].verifications, 1, "logs in once, not every cycle");
  assert.ok(calls.includes("claim_email_outbox"));
  assert.equal(heartbeats.at(-1).p_smtp_user, "panel@x.com");
  assert.equal(heartbeats.at(-1).p_smtp_host, "smtp.hostinger.com");
  assert.equal(heartbeats.at(-1).p_smtp_port, 587);
  assert.equal(heartbeats.at(-1).p_smtp_ok, true);
  assert.equal(JSON.stringify({ heartbeats, logs }).includes("panel-secret"), false);
  assert.equal(transports[0].closed, true, "closed on stop");
});

test("changing only the host reconnects to the new server", async () => {
  const { transports } = await runWorkerWith({
    savedLogin: { smtp_host: "one.example.com", smtp_port: 465, smtp_user: "a@x.com", smtp_pass: "same" },
    changeLoginTo: { smtp_host: "two.example.com", smtp_port: 465, smtp_user: "a@x.com", smtp_pass: "same" },
  });
  assert.deepEqual(transports.map((t) => t.auth.host), ["one.example.com", "two.example.com"]);
});

test("changing the saved login reconnects without a restart", async () => {
  const { transports, heartbeats } = await runWorkerWith({
    savedLogin: { smtp_user: "one@x.com", smtp_pass: "first" },
    changeLoginTo: { smtp_user: "two@x.com", smtp_pass: "second" },
  });
  assert.deepEqual(transports.map((t) => t.auth.user), ["one@x.com", "two@x.com"]);
  assert.equal(transports[0].closed, true);
  assert.equal(heartbeats.at(-1).p_smtp_user, "two@x.com");
});

test("with no saved login the worker uses .env", async () => {
  const { transports } = await runWorkerWith();
  assert.equal(transports[0].auth.host, "smtp.gmail.com");
  assert.equal(transports[0].auth.port, 465);
  assert.equal(transports[0].auth.user, "connectiqo@gmail.com");
  assert.equal(transports[0].auth.pass, "app-password");
});

test("a wrong password leaves the queue untouched and isn't retried every cycle", async () => {
  const { transports, heartbeats, calls } = await runWorkerWith({
    savedLogin: { smtp_user: "panel@x.com", smtp_pass: "wrong" },
    badPasswords: ["wrong"],
  });
  assert.equal(calls.includes("claim_email_outbox"), false);
  assert.equal(transports[0].verifications, 1);
  assert.equal(heartbeats.at(-1).p_smtp_ok, false);
  assert.match(heartbeats.at(-1).p_smtp_error, /Bad credentials/);
});

test("with no login anywhere, emails wait and the panel is told why", async () => {
  const { transports, heartbeats, calls } = await runWorkerWith({ env: { SMTP_USER: "", SMTP_PASS: "" } });
  assert.equal(transports.length, 0);
  assert.equal(calls.includes("claim_email_outbox"), false);
  assert.match(heartbeats.at(-1).p_smtp_error, /No mail server login is set/);
});

test("the .env login applies until the saved-login function exists; other read errors send nothing", async () => {
  const missing = await runWorkerWith({ loginError: { code: "PGRST202", message: "not found" } });
  assert.equal(missing.transports[0].auth.user, "connectiqo@gmail.com");
  const broken = await runWorkerWith({ loginError: { code: "500", message: "vault down" } });
  assert.equal(broken.transports.length, 0);
  assert.equal(broken.calls.includes("claim_email_outbox"), false);
  assert.ok(broken.logs.some((m) => /vault down/.test(m)));
});

test("sender details from the panel replace .env, and empty ones keep it", async () => {
  const fromEnv = { ...config, from: { name: "Env", email: "env@x.com" }, replyTo: "reply@x.com", supportEmail: "help@x.com" };
  const edited = await applyPanelSettings({
    supabase: panel({ sending_mode: "test", test_recipients: [], sender_name: "Panel", sender_email: "panel@x.com", reply_to: null, support_email: "care@x.com" }),
    config: fromEnv,
  });
  assert.deepEqual(edited.from, { name: "Panel", email: "panel@x.com" });
  assert.equal(edited.replyTo, "reply@x.com");
  assert.equal(edited.supportEmail, "care@x.com");
  assert.deepEqual(fromEnv.from, { name: "Env", email: "env@x.com" }, "the .env values stay available");
});

test("test mode uses ALLOWED_RECIPIENTS from .env when the database lists no addresses", async () => {
  const fromEnv = { ...config, dryRun: true, allowedRecipients: ["me@x.com"] };
  const current = await applyPanelSettings({ supabase: panel({ sending_mode: "test", test_recipients: [] }), config: fromEnv });
  assert.equal(workerMode(current), "test");
  assert.deepEqual(current.allowedRecipients, ["me@x.com"]);
});

test("test mode with no addresses holds back every automatic email but sends typed tests", async () => {
  const current = await applyPanelSettings({ supabase: panel({ sending_mode: "test", test_recipients: [] }), config: { ...config, allowedRecipients: [] } });
  assert.equal(workerMode(current), "test");
  const sent = [];
  const result = await runOnce({
    supabase: fakeSupabase([row({ id: "automatic" }), row({ id: "typed", is_test: true, to_email: "me@x.com" })]),
    transporter: { sendMail: async (m) => sent.push(m) },
    config: current,
    logger: silent,
  });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].headers["X-Connectiqo-Email-Id"], "typed");
  assert.equal(result.skipped, 1);
});

test("only SEND_TO_EVERYONE on the server goes live, and the panel can still switch to practice", async () => {
  const everyone = { ...config, sendToEveryone: true, allowedRecipients: [] };
  const live = await applyPanelSettings({ supabase: panel({ sending_mode: "test", test_recipients: [] }), config: everyone });
  assert.equal(workerMode(live), "live");
  const dry = await applyPanelSettings({ supabase: panel({ sending_mode: "dry_run", test_recipients: [] }), config: everyone });
  assert.equal(workerMode(dry), "dry_run");
  const notLive = await applyPanelSettings({ supabase: panel({ sending_mode: "live", test_recipients: [] }), config });
  assert.equal(workerMode(notLive), "test");
});

test("the .env mode applies until the panel setting exists; other read errors send nothing", async () => {
  const fromEnv = { ...config, dryRun: true };
  assert.equal(await applyPanelSettings({ supabase: panel(null, { code: "PGRST202", message: "not found" }), config: fromEnv }), fromEnv);
  await assert.rejects(() => applyPanelSettings({ supabase: panel(null, { code: "500", message: "db down" }), config }), /db down/);
});

test("config: required values and validation", () => {
  assert.throws(() => loadConfig({}), /SUPABASE_URL is required[\s\S]*SUPABASE_SERVICE_ROLE_KEY is required/);
  assert.doesNotThrow(() => loadConfig({ SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "k", DRY_RUN: "true" }));
  assert.throws(() => loadConfig({ ...baseEnv, SMTP_PORT: "70000" }), /SMTP_PORT must be an integer/);
  assert.throws(() => loadConfig({ ...baseEnv, PORTAL_URL: "connectiqo.com" }), /PORTAL_URL must start/);
  const c = loadConfig({ ...baseEnv, PORTAL_URL: "https://example.com/", DRY_RUN: "true" });
  assert.equal(c.portalUrl, "https://example.com");
  assert.equal(loadConfig({ ...baseEnv, DRY_RUN: "true" }).portalUrl, "https://app.connectiqo.com");
  assert.equal(c.smtp.port, 465);
  assert.equal(c.from.email, "connectiqo@gmail.com");
  assert.equal(c.dryRun, true);
});

test("test mode: only allow-listed addresses are sent to; others are skipped for good", async () => {
  const sent = [];
  const supabase = fakeSupabase([
    row({ id: "real", to_email: "real.creator@gmail.com" }),
    row({ id: "mine", to_email: "RamVish9923@gmail.com" }),
  ]);
  const testConfig = { ...config, allowedRecipients: ["ramvish9923@gmail.com"] };
  const result = await runOnce({ supabase, transporter: { sendMail: async (m) => sent.push(m) }, config: testConfig, logger: silent });

  assert.deepEqual(result, { claimed: 2, sent: 1, failed: 0, skipped: 1 });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to.address, "RamVish9923@gmail.com");
  assert.deepEqual(supabase.completed[0], {
    p_id: "real",
    p_ok: false,
    p_error: "Not sent: test mode, and this address isn't on the test list",
    p_skip: true,
  });
  assert.equal(supabase.completed[1].p_ok, true);
});

test("config: refuses to email real users without an explicit choice", () => {
  const live = { ...baseEnv, DRY_RUN: "false" };
  assert.throws(() => loadConfig(live), /Refusing to email real users/);
  assert.throws(() => loadConfig({ ...live, ALLOWED_RECIPIENTS: "a@x.com", SEND_TO_EVERYONE: "true" }), /not both/);
  assert.deepEqual(loadConfig({ ...live, ALLOWED_RECIPIENTS: " RamVish9923@gmail.com , b@x.com " }).allowedRecipients, [
    "ramvish9923@gmail.com",
    "b@x.com",
  ]);
  assert.equal(loadConfig({ ...live, SEND_TO_EVERYONE: "true" }).sendToEveryone, true);
  assert.equal(loadConfig({ ...baseEnv, DRY_RUN: "true" }).dryRun, true);
});

test("the shipped .env.example starts in dry-run + test mode", async () => {
  const { readFileSync } = await import("node:fs");
  const env = Object.fromEntries(
    readFileSync(new URL("../.env.example", import.meta.url), "utf8")
      .split(/\r?\n/)
      .filter((l) => /^[A-Z_]+=/.test(l))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])
  );
  const c = loadConfig({ ...env, SUPABASE_SERVICE_ROLE_KEY: "k", SMTP_PASS: "p" });
  assert.equal(c.dryRun, true);
  assert.deepEqual(c.allowedRecipients, ["ramvish9923@gmail.com"]);
  assert.equal(c.sendToEveryone, false);
});

test("optional emails carry the recipient's unsubscribe link and one-click headers", async () => {
  const sent = [];
  const token = "11111111-2222-4333-8444-555555555555";
  const supabase = fakeSupabase([
    row({ id: "w", template: "creator_welcome", unsubscribe_token: token }),
    row({ id: "b", template: "creator_session_booked", payload: { booked_by_name: "Ravi" }, unsubscribe_token: token }),
  ]);
  await runOnce({ supabase, transporter: { sendMail: async (m) => sent.push(m) }, config, logger: silent });

  const [welcome, booked] = sent;
  assert.ok(welcome.html.includes(`href="https://app.connectiqo.com/unsubscribe?t=${token}"`), "unsubscribe link in html");
  assert.match(welcome.text, /Unsubscribe: https:\/\/app\.connectiqo\.com\/unsubscribe\?t=/);
  assert.equal(welcome.headers["List-Unsubscribe"], `<https://app.connectiqo.com/api/email/unsubscribe?t=${token}>, <mailto:contact@connectiqo.com?subject=Unsubscribe>`);
  assert.equal(welcome.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");

  // Booking emails keep going after unsubscribe, so they don't offer it.
  assert.doesNotMatch(booked.html, /unsubscribe/i);
  assert.equal(booked.headers["List-Unsubscribe"], undefined);
  assert.match(booked.text, /booking notification for your Connectiqo creator account/);
});

test("no token → no unsubscribe link or header (never a broken link)", async () => {
  const sent = [];
  const supabase = fakeSupabase([row({ template: "creator_welcome", unsubscribe_token: null })]);
  await runOnce({ supabase, transporter: { sendMail: async (m) => sent.push(m) }, config, logger: silent });
  assert.doesNotMatch(sent[0].html, /\/unsubscribe\?t=/);
  assert.equal(sent[0].headers["List-Unsubscribe"], undefined);
});

test("saved template text from the database is used", async () => {
  const sent = [];
  const supabase = fakeSupabase([row({ overrides: { subject: "Custom for {{first_name}}", heading: null, body: null, button_label: null } })]);
  await runOnce({ supabase, transporter: { sendMail: async (m) => sent.push(m) }, config, logger: silent });
  assert.equal(sent[0].subject, "Custom for Asha");
});

test("test emails are marked [TEST] and have no one-click header", async () => {
  const sent = [];
  const supabase = fakeSupabase([row({ is_test: true, to_name: null, to_email: "me@x.com", unsubscribe_token: null })]);
  await runOnce({ supabase, transporter: { sendMail: async (m) => sent.push(m) }, config, logger: silent });
  assert.match(sent[0].subject, /^\[TEST\] /);
  assert.equal(sent[0].headers["List-Unsubscribe"], undefined);
  assert.match(sent[0].html, /unsubscribe\?t=00000000-0000-4000-8000-000000000000/);
});

test("in test mode an admin's test email goes to the typed address; automatic emails are still held back", async () => {
  const sent = [];
  const supabase = fakeSupabase([
    row({ id: "typed", is_test: true, to_email: "someone.else@x.com" }),
    row({ id: "automatic", is_test: false, to_email: "real.creator@x.com" }),
  ]);
  const result = await runOnce({
    supabase,
    transporter: { sendMail: async (m) => sent.push(m) },
    config: { ...config, allowedRecipients: ["ramvish9923@gmail.com"] },
    logger: silent,
  });
  assert.equal(sent.length, 1);
  assert.match(JSON.stringify(sent[0].to), /someone\.else@x\.com/);
  assert.match(sent[0].subject, /^\[TEST\]/);
  assert.equal(result.skipped, 1);
});

test("dry run still sends nothing, even for an admin's test email", async () => {
  const sent = [];
  const supabase = fakeSupabase([row({ is_test: true, to_email: "someone.else@x.com" })]);
  const result = await runOnce({
    supabase,
    transporter: { sendMail: async (m) => sent.push(m) },
    config: { ...config, dryRun: true },
    logger: silent,
  });
  assert.equal(sent.length, 0);
  assert.deepEqual(result, { claimed: 1, sent: 0, failed: 0, skipped: 1 });
  // Must never show as "sent" when nothing reached the recipient.
  assert.equal(supabase.completed[0].p_ok, false);
  assert.equal(supabase.completed[0].p_skip, true);
  assert.equal(supabase.completed[0].p_error, "Not sent: practice mode (DRY_RUN=true)");
});

test("status report never includes the SMTP password", async () => {
  let args;
  const supabase = { rpc: async (name, a) => { args = a; return { error: null }; } };
  await reportStatus({ supabase, config, state: { smtpOk: false, smtpError: "535 Bad credentials" }, logger: silent });
  assert.ok(!JSON.stringify(args).includes("app-password"));
  assert.equal(args.p_smtp_ok, false);
  assert.equal(args.p_smtp_error, "535 Bad credentials");
  assert.equal(args.p_reply_to, config.replyTo);
  assert.equal(args.p_support_email, config.supportEmail);
});

test("mode comes from the settings", () => {
  assert.equal(workerMode({ dryRun: true, allowedRecipients: ["a@x.com"] }), "dry_run");
  assert.equal(workerMode({ dryRun: false, allowedRecipients: ["a@x.com"] }), "test");
  assert.equal(workerMode({ dryRun: false, allowedRecipients: [] }), "live");
});

test("an SMTP failure is recorded for the panel; a template error is not", async () => {
  const state = {};
  const smtpError = Object.assign(new Error("535 Bad credentials"), { responseCode: 535 });
  await runOnce({ supabase: fakeSupabase([row()]), transporter: { sendMail: async () => { throw smtpError; } }, config, state, logger: silent });
  assert.deepEqual(state, { smtpOk: false, smtpError: "535 Bad credentials" });
  const clean = {};
  await runOnce({ supabase: fakeSupabase([row({ template: "nope" })]), transporter: {}, config, state: clean, logger: silent });
  assert.deepEqual(clean, {});
});
