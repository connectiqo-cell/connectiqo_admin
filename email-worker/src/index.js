import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import { loadConfig } from "./config.js";
import { startWorker } from "./worker.js";

const logger = {
  info: (msg) => console.log(`${new Date().toISOString()} INFO  ${msg}`),
  error: (msg) => console.error(`${new Date().toISOString()} ERROR ${msg}`),
};

let config;
try {
  config = loadConfig();
} catch (err) {
  logger.error(err.message);
  process.exit(1);
}

const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// The server and login come from the panel or .env, and can change while the worker runs.
const createTransport = ({ host, port, user, pass }) =>
  nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // 465 = implicit TLS; 587 upgrades with STARTTLS
    auth: { user, pass },
    pool: true,
    maxConnections: 1,
  });

const state = { smtpOk: null, smtpError: null };

logger.info(`Polling every ${config.pollIntervalMs / 1000}s, batch ${config.batchSize}`);
const worker = startWorker({ supabase, createTransport, config, state, logger });

const shutdown = async (signal) => {
  logger.info(`${signal} received, finishing current email…`);
  await worker.stop();
  process.exit(0);
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
