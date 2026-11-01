import { ESSENTIAL_TEMPLATES, renderEmail } from "./templates.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Unsubscribe links for optional emails. The page asks for a click to confirm (link
 * scanners open links automatically); the one-click URL is for mail apps' built-in
 * Unsubscribe button (RFC 8058, a POST). Both live on the web portal.
 */
export function unsubscribeLinks(portalUrl, token) {
  if (!token) return null;
  const t = encodeURIComponent(token);
  return {
    page: `${portalUrl}/unsubscribe?t=${t}`,
    oneClick: `${portalUrl}/api/email/unsubscribe?t=${t}`,
  };
}

/** Test emails show how the footer looks; this token matches nobody. */
const SAMPLE_UNSUBSCRIBE_TOKEN = "00000000-0000-4000-8000-000000000000";

export function workerMode(config) {
  if (config.dryRun) return "dry_run";
  return config.testMode || config.allowedRecipients?.length ? "test" : "live";
}

/**
 * The admin panel decides who receives email. Until its database setting exists, the .env
 * values apply. Any other read error stops the cycle, so nothing is sent on a guess.
 * SEND_TO_EVERYONE=true on the server is the only way to go live.
 */
export async function applyPanelSettings({ supabase, config }) {
  const { data, error } = await supabase.rpc("email_worker_settings");
  if (error?.code === "PGRST202") return config; // Function not created yet.
  if (error) throw new Error(`email_worker_settings failed: ${error.message}`);
  const settings = Array.isArray(data) ? data[0] : data;
  if (!settings) return config;

  const panelRecipients = (settings.test_recipients || []).map((address) => address.trim().toLowerCase());
  const allowedRecipients = panelRecipients.length ? panelRecipients : config.allowedRecipients || [];
  // Sender details edited in the panel; anything left empty keeps the .env value.
  const current = {
    ...config,
    from: { name: settings.sender_name || config.from?.name, email: settings.sender_email || config.from?.email },
    replyTo: settings.reply_to || config.replyTo,
    supportEmail: settings.support_email || config.supportEmail,
  };
  if (settings.sending_mode === "dry_run") return { ...current, dryRun: true, allowedRecipients };
  if (config.sendToEveryone) return { ...current, dryRun: false };
  return { ...current, dryRun: false, testMode: true, allowedRecipients };
}

/** The mail server saved in the panel, or null to use .env. Other read errors stop the cycle. */
async function loadPanelSmtpLogin(supabase, config) {
  const { data, error } = await supabase.rpc("email_worker_smtp_login");
  if (error?.code === "PGRST202") return null; // Function not created yet.
  if (error) throw new Error(`email_worker_smtp_login failed: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.smtp_user || !row?.smtp_pass) return null;
  return {
    host: row.smtp_host || config.smtp.host,
    port: row.smtp_port || config.smtp.port,
    user: row.smtp_user,
    pass: row.smtp_pass,
  };
}

const SMTP_RETRY_MS = 5 * 60 * 1000; // Repeated failed logins can get a mail account locked.

/**
 * Keeps one mail connection, rebuilt when the saved server or login changes. current() returns it once the
 * login is verified, or null; while null the queue isn't touched, so emails wait instead of failing.
 */
export function smtpConnection({ supabase, config, createTransport, state, logger = console, now = Date.now }) {
  let active = null;
  const close = () => {
    active?.transporter.close?.();
    active = null;
  };
  return {
    close,
    async current() {
      const envLogin = config.smtp.user && config.smtp.pass ? config.smtp : null;
      const login = (await loadPanelSmtpLogin(supabase, config)) || envLogin;
      if (!login) {
        close();
        state.smtpOk = false;
        state.smtpError = "No mail server login is set. Add one in Email Triggers → Setup.";
        return { host: config.smtp.host, port: config.smtp.port, user: config.smtp.user, transporter: null };
      }
      const key = [login.host, login.port, login.user, login.pass].join("\n");
      if (active?.key !== key) {
        close();
        active = { key, host: login.host, port: login.port, user: login.user, transporter: createTransport(login), verified: false, triedAt: null };
      }
      if (!active.verified && (active.triedAt === null || now() - active.triedAt >= SMTP_RETRY_MS)) {
        active.triedAt = now();
        try {
          await active.transporter.verify(); // Logs in without sending anything.
          active.verified = true;
          state.smtpOk = true;
          state.smtpError = null;
          logger.info(`SMTP ready as ${login.user}`);
        } catch (err) {
          state.smtpOk = false;
          state.smtpError = err.message;
          logger.error(`SMTP check failed for ${login.user}: ${err.message}`);
        }
      }
      return { host: active.host, port: active.port, user: active.user, transporter: active.verified ? active.transporter : null };
    },
  };
}

function describeMode(config) {
  const mode = workerMode(config);
  if (mode === "dry_run") return "PRACTICE: nothing is sent (emails are only logged).";
  if (mode === "live") return "LIVE: emails go to every eligible user (SEND_TO_EVERYONE=true).";
  const list = config.allowedRecipients?.join(", ") || "nobody";
  return `TEST: automatic emails go only to ${list}; test emails go to the address typed in the panel.`;
}

/** Tells the admin panel what this worker is using. The SMTP password is never included. */
export async function reportStatus({ supabase, config, state = {}, logger = console }) {
  const { error } = await supabase.rpc("email_worker_heartbeat", {
    p_mode: workerMode(config),
    p_sender_email: config.from.email,
    p_sender_name: config.from.name,
    p_smtp_host: config.smtp.host,
    p_smtp_port: config.smtp.port,
    p_smtp_user: config.smtp.user,
    p_smtp_ok: state.smtpOk ?? null,
    p_smtp_error: state.smtpError ?? null,
    p_allowed_recipients: config.allowedRecipients || [],
    p_reply_to: config.replyTo || null,
    p_support_email: config.supportEmail || null,
  });
  if (error) logger.error(`email_worker_heartbeat failed: ${error.message}`);
}

/**
 * One polling cycle: claim due emails, send each, report the result.
 * Dependencies are injected so it can be tested without Supabase or SMTP.
 *
 * @param {object} deps
 * @param {{ rpc: Function }} deps.supabase   service-role client
 * @param {{ sendMail: Function }} deps.transporter  nodemailer transport
 * @param {object} deps.config                 from loadConfig()
 * @param {object} [deps.state]                updated with the last SMTP result
 * @param {object} [deps.logger]
 * @returns {Promise<{ claimed: number, sent: number, failed: number, skipped: number }>}
 */
export async function runOnce({ supabase, transporter, config, state = {}, logger = console }) {
  const { data: rows, error } = await supabase.rpc("claim_email_outbox", { p_limit: config.batchSize });
  if (error) throw new Error(`claim_email_outbox failed: ${error.message}`);

  const result = { claimed: rows?.length || 0, sent: 0, failed: 0, skipped: 0 };
  for (const [index, row] of (rows || []).entries()) {
    if (index > 0 && config.sendDelayMs) await sleep(config.sendDelayMs);

    // Test mode: anyone not on the allow-list is closed as 'skipped' (never retried).
    // An admin's test email goes to the address they typed, with sample data only.
    const allowList = config.allowedRecipients || [];
    const holdBack = config.testMode || allowList.length > 0; // An empty list in test mode holds back everyone.
    if (!row.is_test && holdBack && !allowList.includes(String(row.to_email || "").trim().toLowerCase())) {
      result.skipped += 1;
      logger.info(`test mode: skipped ${row.template} to ${row.to_email} (not in ALLOWED_RECIPIENTS)`);
      const { error: skipError } = await supabase.rpc("complete_email_outbox", {
        p_id: row.id,
        p_ok: false,
        p_error: "Not sent: test mode, and this address isn't on the test list",
        p_skip: true,
      });
      if (skipError) logger.error(`complete_email_outbox failed for ${row.id}: ${skipError.message}`);
      continue;
    }

    let ok = false;
    let errorMessage = null;
    let notSent = false;
    try {
      const essential = ESSENTIAL_TEMPLATES.has(row.template);
      const links = essential
        ? null
        : unsubscribeLinks(config.portalUrl, row.is_test ? SAMPLE_UNSUBSCRIBE_TOKEN : row.unsubscribe_token);
      const email = renderEmail(row.template, row.payload, {
        toName: row.to_name,
        portalUrl: config.portalUrl,
        supportEmail: config.supportEmail,
        unsubscribeUrl: links?.page,
        overrides: row.overrides,
      });
      const subject = row.is_test ? `[TEST] ${email.subject}` : email.subject;
      const headers = { "X-Connectiqo-Email-Id": row.id, "X-Connectiqo-Template": row.template };
      if (links && !row.is_test) {
        headers["List-Unsubscribe"] = `<${links.oneClick}>, <mailto:${config.supportEmail}?subject=Unsubscribe>`;
        headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
      }
      if (config.dryRun) {
        logger.info(`[dry-run] would send "${subject}" (${row.template}) to ${row.to_email}`);
        notSent = true;
        errorMessage = "Not sent: practice mode (DRY_RUN=true)";
        result.skipped += 1;
      } else {
        await transporter.sendMail({
          from: { name: config.from.name, address: config.from.email },
          to: row.to_name ? { name: row.to_name, address: row.to_email } : row.to_email,
          replyTo: config.replyTo || undefined,
          subject,
          html: email.html,
          text: email.text,
          headers,
        });
        state.smtpOk = true;
        state.smtpError = null;
        logger.info(`sent ${row.template} to ${row.to_email} (${row.id})`);
        ok = true;
        result.sent += 1;
      }
    } catch (err) {
      errorMessage = err?.message || String(err);
      result.failed += 1;
      // A template problem isn't an SMTP problem; only real send errors have these fields.
      if (err?.responseCode || err?.code) {
        state.smtpOk = false;
        state.smtpError = errorMessage;
      }
      logger.error(`failed ${row.template} to ${row.to_email} (${row.id}), attempt ${row.attempts}: ${errorMessage}`);
    }

    // In dry-run the row is closed as skipped: it isn't repeated every cycle, can't be mistaken
    // for a delivered email, and doesn't update the creator's tracking columns.
    const { error: completeError } = await supabase.rpc("complete_email_outbox", {
      p_id: row.id,
      p_ok: ok,
      p_error: errorMessage,
      p_skip: notSent,
    });
    if (completeError) {
      // The row stays 'sending' and is released after 10 minutes, then retried.
      logger.error(`complete_email_outbox failed for ${row.id}: ${completeError.message}`);
    }
  }
  return result;
}

/** Polls forever until stop() is called. */
export function startWorker(deps) {
  const { config, logger = console } = deps;
  const state = deps.state || {};
  let stopped = false;
  let wake = null;
  let lastMode = null;
  const connection = deps.createTransport ? smtpConnection({ ...deps, state, logger }) : null;

  const loop = (async () => {
    while (!stopped) {
      try {
        let current = await applyPanelSettings({ supabase: deps.supabase, config });
        const mode = describeMode(current);
        if (mode !== lastMode) logger.info(mode);
        lastMode = mode;
        let transporter = deps.transporter;
        if (connection) {
          const smtp = await connection.current();
          transporter = smtp.transporter;
          current = {
            ...current,
            smtp: { ...current.smtp, host: smtp.host, port: smtp.port, user: smtp.user },
            from: { ...current.from, email: current.from.email || smtp.user },
          };
        }
        let claimed = 0;
        if (transporter) {
          const result = await runOnce({ ...deps, transporter, config: current, state });
          claimed = result.claimed;
          if (claimed) logger.info(`cycle: ${claimed} claimed, ${result.sent} sent, ${result.failed} failed, ${result.skipped} skipped`);
        }
        await reportStatus({ ...deps, config: current, state });
        // A full batch means more may be waiting — go again right away.
        if (claimed >= config.batchSize) continue;
      } catch (err) {
        logger.error(`cycle error: ${err?.message || err}`);
      }
      await new Promise((resolve) => {
        wake = resolve;
        setTimeout(resolve, config.pollIntervalMs);
      });
    }
  })();

  return {
    async stop() {
      stopped = true;
      wake?.();
      await loop;
      connection?.close();
    },
  };
}
