/** Reads and validates the worker's settings from environment variables. */
export function loadConfig(env = process.env) {
  const errors = [];
  const required = (name) => {
    const value = String(env[name] ?? "").trim();
    if (!value) errors.push(`${name} is required`);
    return value;
  };
  const integer = (name, fallback, min, max) => {
    const raw = env[name];
    if (raw === undefined || raw === "") return fallback;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < min || n > max) errors.push(`${name} must be an integer between ${min} and ${max}`);
    return n;
  };
  const flag = (name) => /^(1|true|yes)$/i.test(String(env[name] ?? "").trim());

  const config = {
    supabaseUrl: required("SUPABASE_URL"),
    supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
    smtp: {
      host: String(env.SMTP_HOST || "smtp.gmail.com").trim(),
      port: integer("SMTP_PORT", 465, 1, 65535),
      // Optional: a mail server saved in the admin panel takes priority over these.
      user: String(env.SMTP_USER || "").trim(),
      pass: String(env.SMTP_PASS || "").trim(),
    },
    from: {
      email: String(env.MAIL_FROM_EMAIL || env.SMTP_USER || "").trim(),
      name: String(env.MAIL_FROM_NAME || "Connectiqo").trim(),
    },
    replyTo: String(env.MAIL_REPLY_TO || "contact@connectiqo.com").trim(),
    portalUrl: String(env.PORTAL_URL || "https://app.connectiqo.com").trim().replace(/\/+$/, ""),
    supportEmail: String(env.SUPPORT_EMAIL || "contact@connectiqo.com").trim(),
    pollIntervalMs: integer("POLL_INTERVAL_MS", 30000, 5000, 3600000),
    batchSize: integer("BATCH_SIZE", 10, 1, 50),
    // Gmail allows ~500 emails/day; spacing sends keeps us well clear of rate limits.
    sendDelayMs: integer("SEND_DELAY_MS", 1500, 0, 60000),
    // Log what would be sent instead of sending (safe first deploy).
    dryRun: flag("DRY_RUN"),
    // Test mode: only these addresses ever receive mail; everyone else is skipped.
    allowedRecipients: String(env.ALLOWED_RECIPIENTS || "")
      .split(",")
      .map((address) => address.trim().toLowerCase())
      .filter(Boolean),
    // Going live to every user must be an explicit decision.
    sendToEveryone: flag("SEND_TO_EVERYONE"),
  };

  if (!config.dryRun && !config.allowedRecipients.length && !config.sendToEveryone) {
    errors.push(
      "Refusing to email real users: set ALLOWED_RECIPIENTS (test mode, e.g. your own address) " +
        "or SEND_TO_EVERYONE=true (live), or use DRY_RUN=true"
    );
  }
  if (config.allowedRecipients.length && config.sendToEveryone) {
    errors.push("Set either ALLOWED_RECIPIENTS (test) or SEND_TO_EVERYONE=true (live), not both");
  }

  if (config.from.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.from.email)) {
    errors.push("MAIL_FROM_EMAIL must be a valid email address");
  }
  if (!/^https?:\/\//.test(config.portalUrl)) errors.push("PORTAL_URL must start with http:// or https://");

  if (errors.length) {
    const err = new Error(`Invalid configuration:\n  - ${errors.join("\n  - ")}`);
    err.configErrors = errors;
    throw err;
  }
  return config;
}
