/**
 * Runs the real email migration on a real Postgres engine (PGlite, in-process) against a
 * minimal stand-in for the live schema. Touches no external database and sends nothing.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const read = (name) => readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8");
const migration = read("20261026000000_creator_email_triggers.sql");
const sendingMode = read("20261031000000_email_sending_mode.sql");
const senderSettings = read("20261031120000_email_sender_settings.sql");
const smtpLogin = read("20261031130000_email_smtp_login.sql");
const anyProvider = read("20261031140000_email_smtp_any_provider.sql");
const brandEmails = read("20261031150000_brand_email_triggers.sql");
const saumya = read("20261025020000_emails_follow_account_status.sql");
// Only can_email_user() from that migration; the rest drops columns not stubbed here.
const canEmailUser = saumya.slice(
  saumya.indexOf("create or replace function public.can_email_user"),
  saumya.indexOf("comment on function public.can_email_user")
);

const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
let db;
const q = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];
const rowsFor = (template, recipient) =>
  q(
    `select * from email_outbox where template = $1 and ($2::uuid is null or recipient_id = $2::uuid) order by created_at, dedupe_key`,
    [template, recipient ?? null]
  );
const claim = () => q(`select * from claim_email_outbox(50)`);
const closeQueue = () => db.exec(`update email_outbox set status = 'sent', locked_at = null where status in ('pending', 'sending')`);
const asRole = async (role, statements) => {
  const out = {};
  await db.exec(`set role ${role}`);
  for (const [name, sql] of Object.entries(statements)) {
    try {
      await db.exec(sql);
      out[name] = "allowed";
    } catch {
      out[name] = "denied";
    }
  }
  await db.exec(`reset role`);
  return out;
};

let counter = 1000;
/** New user + creator profile, with its welcome email already out of the way. */
async function creator({ name = "Asha", email, daysOld = 0, completeness = null, ...profile } = {}) {
  const id = U(counter++);
  await q(
    `insert into profiles (id, name, email, created_at, is_frozen) values ($1, $2, $3, now() - make_interval(days => $4), $5)`,
    [id, name, email === undefined ? `u${id.slice(-4)}@x.com` : email, daysOld, profile.is_frozen ?? false]
  );
  await q(`insert into mentor_profiles (id, mentor_frozen) values ($1, $2)`, [id, profile.mentor_frozen ?? false]);
  if (completeness !== null) await q(`update mentor_profiles set profile_completeness = $2 where id = $1`, [id, completeness]);
  await db.exec(`update email_outbox set status = 'sent' where recipient_id = '${id}' and template = 'creator_welcome'`);
  return id;
}
const newId = () => U(counter++);

before(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table public.admins (user_id uuid primary key);
    -- is_admin(): driven by a session setting so tests can flip it.
    create function public.is_admin() returns boolean language sql stable as
      $$ select coalesce(nullif(current_setting('test.is_admin', true), ''), 'false')::boolean $$;
    create function public.mentor_freeze_is_active(f boolean, until timestamptz) returns boolean language sql stable as
      $$ select coalesce(f, false) and (until is null or until > now()) $$;
    create table public.profiles (id uuid primary key, name text, email text, avatar_url text,
      is_frozen boolean default false, deleted_at timestamptz, created_at timestamptz default now());
    create table public.mentor_profiles (id uuid primary key references profiles(id),
      specialization text, bio text, category text, experience_years int, price_per_hour numeric,
      skills text[], location text, cover_image_url text, linkedin_url text, instagram_url text,
      youtube_url text, x_url text, twitter_url text, website text,
      mentor_frozen boolean default false, mentor_frozen_until timestamptz,
      greeting_mail_sent boolean not null default false, greeting_mail_sent_at timestamptz,
      profile_completeness smallint, open_slots_mail_count int not null default 0, last_open_slots_mail_at timestamptz);
    create table public.availability_slots (id uuid primary key, mentor_id uuid, date date, start_time time, end_time time);
    create table public.bookings (id uuid primary key, learner_id uuid, mentor_id uuid, slot_id uuid,
      status text default 'pending', original_booking_id uuid);
    create table public.brand_profiles (id uuid primary key references profiles(id), company_name text, work_email text, created_at timestamptz default now());
    create table public.brand_email_status (company_id uuid primary key, greeting_mail_sent boolean not null default false, greeting_mail_sent_at timestamptz, updated_at timestamptz);
    create table public.campaigns (id uuid primary key default gen_random_uuid(), brand_id uuid, title text, status text default 'draft', created_at timestamptz default now());
    create table public.campaign_applications (id uuid primary key default gen_random_uuid(), campaign_id uuid, creator_id uuid, status text default 'pending', applied_at timestamptz default now());
    create table public.campaign_submissions (id uuid primary key default gen_random_uuid(), application_id uuid, creator_id uuid, status text default 'processing');
  `);
  await db.exec(canEmailUser);
  await db.exec(migration); // pg_cron is absent here, so the schedule step is skipped.
  await db.exec(`grant usage on schema public to anon, authenticated, service_role`);
  await db.exec(`grant select, insert, update, delete on all tables in schema public to anon, authenticated`);
  // Re-assert what the migration revokes (Supabase's default grants are broad like the line above).
  await db.exec(migration);
  await db.exec(sendingMode);
  await db.exec(senderSettings);
  // Stand-in for Supabase Vault, which isn't available here (so encryption itself isn't tested).
  await db.exec(`
    create schema vault;
    create table vault.secrets (id uuid primary key default gen_random_uuid(), name text unique, description text, secret text);
    create view vault.decrypted_secrets as select id, name, secret as decrypted_secret from vault.secrets;
    create function vault.create_secret(new_secret text, new_name text, new_description text) returns uuid language sql as
      $$ insert into vault.secrets (name, description, secret) values (new_name, new_description, new_secret) returning id $$;
    create function vault.update_secret(secret_id uuid, new_secret text) returns void language sql as
      $$ update vault.secrets set secret = new_secret where id = secret_id $$;
  `);
  await db.exec(smtpLogin);
  await db.exec(anyProvider);
  await db.exec(brandEmails);
  await db.exec(`update email_trigger_settings set creator_emails_enabled_at = now() - interval '30 days'`);
});

test("welcome is queued once when a creator profile is created", async () => {
  const id = newId();
  await q(`insert into profiles (id, name, email) values ($1, 'New', 'new@x.com')`, [id]);
  await q(`insert into mentor_profiles (id) values ($1)`, [id]);
  assert.equal((await rowsFor("creator_welcome", id)).length, 1);
});

test("session booked: only when confirmed, once, never for reschedules", async () => {
  const mentor = await creator();
  const learner = await creator({ name: "Ravi" });
  const slot = newId();
  await q(`insert into availability_slots values ($1, $2, '2026-11-02', '14:30', '15:30')`, [slot, mentor]);
  const booking = newId();
  await q(`insert into bookings (id, learner_id, mentor_id, slot_id) values ($1, $2, $3, $4)`, [booking, learner, mentor, slot]);
  assert.equal((await rowsFor("creator_session_booked", mentor)).length, 0, "pending booking");
  await q(`update bookings set status = 'confirmed' where id = $1`, [booking]);
  let rows = await rowsFor("creator_session_booked", mentor);
  assert.equal(rows.length, 1);
  assert.deepEqual(
    [rows[0].payload.booked_by_name, rows[0].payload.date, rows[0].payload.start_time, rows[0].payload.end_time],
    ["Ravi", "2026-11-02", "14:30:00", "15:30:00"]
  );
  await q(`update bookings set status = 'confirmed' where id = $1`, [booking]);
  await q(`update bookings set status = 'completed' where id = $1`, [booking]);
  await q(
    `insert into bookings (id, learner_id, mentor_id, slot_id, status, original_booking_id) values ($1, $2, $3, $4, 'confirmed', $5)`,
    [newId(), learner, mentor, slot, booking]
  );
  assert.equal((await rowsFor("creator_session_booked", mentor)).length, 1, "no duplicate, no reschedule email");
  await q(`insert into bookings (id, learner_id, mentor_id, status) values ($1, $2, $3, 'confirmed')`, [newId(), U(999999), mentor]);
  rows = await rowsFor("creator_session_booked", mentor);
  assert.equal(rows.length, 2);
  assert.equal(rows[1].payload.booked_by_name, "Someone");
  await closeQueue();
});

test("reminder defaults: 3 times, 3 days apart, first after 3 days, stop above 75%", async () => {
  const defaults = Object.fromEntries(
    (await q(`select column_name c, column_default d from information_schema.columns
      where table_name = 'email_trigger_settings' and column_name like 'profile_reminder_%'`)).map((r) => [r.c, r.d])
  );
  assert.deepEqual(defaults, {
    profile_reminder_after_days: "3",
    profile_reminder_every_days: "3",
    profile_reminder_max: "3",
    profile_reminder_stop_above: "75",
  });
});

test("reminder eligibility: 75% cut-off, age, and creators from before launch", async () => {
  await closeQueue();
  const at70 = await creator({ daysOld: 4, completeness: 70 });
  const at80 = await creator({ daysOld: 4, completeness: 80 });
  const tooNew = await creator({ daysOld: 1, completeness: 10 });
  const preLaunch = await creator({ daysOld: 60, completeness: 10 });
  await q(`select enqueue_creator_profile_reminders()`);
  assert.equal((await rowsFor("creator_profile_reminder", at70)).length, 1, "70% gets a reminder");
  assert.equal((await rowsFor("creator_profile_reminder", at80)).length, 0, "80% does not");
  assert.equal((await rowsFor("creator_profile_reminder", tooNew)).length, 0, "signed up 1 day ago");
  assert.equal((await rowsFor("creator_profile_reminder", preLaunch)).length, 0, "signed up before launch");
  const [row] = await rowsFor("creator_profile_reminder", at70);
  assert.ok(row.payload.missing.includes("Profile photo"));
  await closeQueue();
});

test("reminders: 3-day gap, then stop after 3, and stop when the profile is completed", async () => {
  await closeQueue();
  const id = await creator({ daysOld: 4, completeness: 30 });
  const count = async () => (await rowsFor("creator_profile_reminder", id)).length;
  const age = (interval) =>
    db.exec(`update email_outbox set created_at = created_at - interval '${interval}', dedupe_key = dedupe_key || ':' || id
             where template = 'creator_profile_reminder' and recipient_id = '${id}'`);
  await q(`select enqueue_creator_profile_reminders()`);
  assert.equal(await count(), 1);
  await q(`select enqueue_creator_profile_reminders()`);
  assert.equal(await count(), 1, "same day");
  await age("2 days");
  await q(`select enqueue_creator_profile_reminders()`);
  assert.equal(await count(), 1, "2 days later");
  await age("1 day 1 minute");
  await q(`select enqueue_creator_profile_reminders()`);
  assert.equal(await count(), 2, "3 days later");
  for (let i = 0; i < 3; i++) {
    await age("3 days 1 minute");
    await q(`select enqueue_creator_profile_reminders()`);
  }
  assert.equal(await count(), 3, "capped at 3");

  const other = await creator({ daysOld: 4, completeness: 30 });
  await q(`update mentor_profiles set profile_completeness = 80 where id = $1`, [other]);
  await q(`select enqueue_creator_profile_reminders()`);
  assert.equal((await rowsFor("creator_profile_reminder", other)).length, 0);
  await closeQueue();
});

test("a skipped reminder (e.g. test mode) doesn't block that creator permanently", async () => {
  await closeQueue();
  const id = await creator({ daysOld: 4, completeness: 30 });
  await q(`select enqueue_creator_profile_reminders()`);
  const [row] = await rowsFor("creator_profile_reminder", id);
  await db.exec(`update email_outbox set status = 'sending' where id = '${row.id}'`);
  await q(`select complete_email_outbox($1, false, 'Not sent: test mode', true)`, [row.id]);
  // The next day's key differs from the skipped row's.
  await db.exec(`update email_outbox set dedupe_key = dedupe_key || ':yesterday' where id = '${row.id}'`);
  await q(`select enqueue_creator_profile_reminders()`);
  const rows = await rowsFor("creator_profile_reminder", id);
  assert.equal(rows.filter((r) => r.status === "pending").length, 1);
  await closeQueue();
});

test("claim skips banned, frozen and address-less recipients with a reason", async () => {
  await closeQueue();
  const fine = await creator();
  const banned = await creator({ is_frozen: true });
  const frozen = await creator({ mentor_frozen: true });
  const noMail = await creator({ email: "  " });
  for (const id of [fine, banned, frozen, noMail]) {
    await q(`insert into bookings (id, learner_id, mentor_id, status) values ($1, $2, $3, 'confirmed')`, [newId(), U(999999), id]);
  }
  const claimed = await claim();
  assert.deepEqual(claimed.map((c) => c.recipient_id), [fine]);
  assert.equal(claimed[0].attempts, 1);
  assert.equal(claimed[0].is_test, false);
  assert.equal((await claim()).length, 0, "claimed rows aren't claimed twice");
  for (const [id, reason] of [[banned, /may not be emailed/], [frozen, /may not be emailed/], [noMail, /no email address/]]) {
    const [row] = await rowsFor("creator_session_booked", id);
    assert.equal(row.status, "skipped");
    assert.match(row.last_error, reason);
  }
  await closeQueue();
});

test("completing updates tracking once; failures back off, then fail; stuck rows are released", async () => {
  await closeQueue();
  const id = await creator();
  await db.exec(`delete from email_outbox where recipient_id = '${id}'`);
  await q(`select enqueue_email('creator', 'creator_welcome', $1, '{}'::jsonb, $2)`, [id, `w:${id}`]);
  await q(`insert into bookings (id, learner_id, mentor_id, status) values ($1, $2, $3, 'confirmed')`, [newId(), U(999999), id]);
  let claimed = await claim();
  for (const c of claimed) await q(`select complete_email_outbox($1, true)`, [c.id]);
  for (const c of claimed) await q(`select complete_email_outbox($1, true)`, [c.id]);
  const mp = await one(`select greeting_mail_sent g, greeting_mail_sent_at is not null at, open_slots_mail_count n from mentor_profiles where id = $1`, [id]);
  assert.deepEqual(mp, { g: true, at: true, n: 1 });

  await q(`insert into bookings (id, learner_id, mentor_id, status) values ($1, $2, $3, 'confirmed')`, [newId(), U(999999), id]);
  [claimed] = [await claim()];
  const rowId = claimed[0].id;
  await q(`select complete_email_outbox($1, false, 'SMTP 421')`, [rowId]);
  let row = await one(`select status, last_error, send_after > now() later from email_outbox where id = $1`, [rowId]);
  assert.deepEqual(row, { status: "pending", last_error: "SMTP 421", later: true });
  for (let i = 0; i < 4; i++) {
    await db.exec(`update email_outbox set send_after = now() - interval '1 second' where id = '${rowId}'`);
    await claim();
    await q(`select complete_email_outbox($1, false, 'still down')`, [rowId]);
  }
  row = await one(`select status, attempts from email_outbox where id = $1`, [rowId]);
  assert.deepEqual(row, { status: "failed", attempts: 5 });

  await db.exec(`set test.is_admin = 'false'`);
  await assert.rejects(() => q(`select admin_retry_email($1)`, [rowId]), /admin only/);
  await db.exec(`set test.is_admin = 'true'`);
  await q(`select admin_retry_email($1)`, [rowId]);
  assert.deepEqual(await one(`select status, attempts from email_outbox where id = $1`, [rowId]), { status: "pending", attempts: 0 });
  await db.exec(`set test.is_admin = 'false'`);

  await db.exec(`update email_outbox set status = 'sending', locked_at = now() - interval '11 minutes' where id = '${rowId}'`);
  assert.ok((await claim()).some((c) => c.id === rowId), "stuck row released and claimed");
  await closeQueue();
});

test("test-mode skip is final and doesn't mark the welcome as sent", async () => {
  await closeQueue();
  const id = newId();
  await q(`insert into profiles (id, name, email) values ($1, 'Skip', 's@x.com')`, [id]);
  await q(`insert into mentor_profiles (id) values ($1)`, [id]);
  const [c] = await claim();
  await q(`select complete_email_outbox($1, false, 'Not sent: test mode', true)`, [c.id]);
  assert.equal((await one(`select status from email_outbox where id = $1`, [c.id])).status, "skipped");
  await db.exec(`update email_outbox set send_after = now() - interval '1 hour' where id = '${c.id}'`);
  assert.equal((await claim()).length, 0);
  assert.equal((await one(`select greeting_mail_sent g from mentor_profiles where id = $1`, [id])).g, false);
});

test("unsubscribe: token only, stops optional emails, keeps booking emails", async () => {
  await closeQueue();
  const id = await creator({ daysOld: 5, completeness: 40 });
  await q(`insert into email_preferences (user_id) values ($1)`, [id]);
  const { t } = await one(`select unsubscribe_token t from email_preferences where user_id = $1`, [id]);

  await db.exec(`set role anon`);
  const ok = (await one(`select email_unsubscribe($1) ok`, [t])).ok;
  const bad = (await one(`select email_unsubscribe($1) ok`, [U(987654)])).ok;
  await db.exec(`reset role`);
  assert.deepEqual([ok, bad], [true, false]);
  // Row-level security: anonymous callers see no one's preferences (or tokens).
  await db.exec(`set role anon`);
  const visible = await q(`select * from email_preferences`);
  await db.exec(`reset role`);
  assert.equal(visible.length, 0);

  const first = (await one(`select unsubscribed_at a from email_preferences where user_id = $1`, [id])).a;
  await q(`select email_unsubscribe($1)`, [t]);
  assert.equal((await one(`select unsubscribed_at a from email_preferences where user_id = $1`, [id])).a.getTime(), first.getTime());

  await q(`select enqueue_creator_profile_reminders()`);
  assert.equal((await rowsFor("creator_profile_reminder", id)).length, 0);
  await q(`select enqueue_email('creator', 'creator_welcome', $1, '{}'::jsonb, $2)`, [id, `w2:${id}`]);
  await q(`insert into bookings (id, learner_id, mentor_id, status) values ($1, $2, $3, 'confirmed')`, [newId(), U(999999), id]);
  const claimed = await claim();
  assert.deepEqual(claimed.map((c) => c.template), ["creator_session_booked"]);
  assert.equal(claimed[0].unsubscribe_token, t);
  const skipped = await one(`select status, last_error from email_outbox where dedupe_key = $1`, [`w2:${id}`]);
  assert.deepEqual(skipped, { status: "skipped", last_error: "Recipient unsubscribed" });
  await closeQueue();
});

test("off switch: skipped with a reason; reminder job queues nothing", async () => {
  await closeQueue();
  const id = newId();
  await db.exec(`update email_templates set enabled = false where template in ('creator_welcome', 'creator_profile_reminder')`);
  await q(`insert into profiles (id, name, email, created_at) values ($1, 'Off', 'o@x.com', now() - interval '4 days')`, [id]);
  await q(`insert into mentor_profiles (id, bio) values ($1, 'x')`, [id]);
  assert.equal((await claim()).length, 0);
  const [row] = await rowsFor("creator_welcome", id);
  assert.deepEqual([row.status, row.last_error], ["skipped", "Email type turned off"]);
  await q(`update mentor_profiles set profile_completeness = 10 where id = $1`, [id]);
  assert.equal((await one(`select enqueue_creator_profile_reminders() n`)).n, 0);
  await db.exec(`update email_templates set enabled = true`);
  assert.equal((await one(`select enqueue_creator_profile_reminders() n`)).n, 1, "turning it back on works");
  await closeQueue();
});

test("saved template text reaches the worker", async () => {
  await closeQueue();
  const id = await creator();
  await db.exec(`update email_templates set subject = 'Custom subject' where template = 'creator_session_booked'`);
  await q(`insert into bookings (id, learner_id, mentor_id, status) values ($1, $2, $3, 'confirmed')`, [newId(), U(999999), id]);
  const [c] = await claim();
  assert.equal(c.overrides.subject, "Custom subject");
  assert.equal(c.overrides.body, null);
  await db.exec(`update email_templates set subject = null`);
  await closeQueue();
});

test("emergency stop, test emails and resume", async () => {
  await closeQueue();
  const id = await creator();
  const denied = { pause: `select admin_set_emails_paused(true)`, test: `select admin_queue_test_email('creator_welcome', 'a@x.com')` };
  await db.exec(`set test.is_admin = 'false'`);
  assert.deepEqual(await asRole("authenticated", denied), { pause: "denied", test: "denied" });
  await db.exec(`set test.is_admin = 'true'`);

  await q(`select admin_set_emails_paused(true, false, 'me@x.com')`);
  const booking = newId();
  await q(`insert into bookings (id, learner_id, mentor_id, status) values ($1, $2, $3, 'confirmed')`, [booking, U(999999), id]);
  const testId = (await one(`select admin_queue_test_email('creator_welcome', ' me@x.com ', '{}'::jsonb, '{"subject":"Draft"}'::jsonb) id`)).id;
  let claimed = await claim();
  assert.deepEqual(claimed.map((c) => [c.id, c.is_test, c.to_email, c.overrides.subject]), [[testId, true, "me@x.com", "Draft"]]);
  assert.equal((await one(`select status from email_outbox where dedupe_key = $1`, [`creator_session_booked:${booking}`])).status, "pending");
  await q(`select complete_email_outbox($1, true)`, [testId]);
  assert.equal((await one(`select open_slots_mail_count n from mentor_profiles where id = $1`, [id])).n, 0);

  await q(`select admin_set_emails_paused(false)`);
  claimed = await claim();
  assert.ok(claimed.some((c) => c.recipient_id === id), "resume and send");
  await closeQueue();

  await q(`select admin_set_emails_paused(true)`);
  const dropped = newId();
  await q(`insert into bookings (id, learner_id, mentor_id, status) values ($1, $2, $3, 'confirmed')`, [dropped, U(999999), id]);
  assert.equal((await one(`select admin_set_emails_paused(false, true) n`)).n, 1);
  assert.deepEqual(await one(`select status, last_error from email_outbox where dedupe_key = $1`, [`creator_session_booked:${dropped}`]), {
    status: "skipped",
    last_error: "Discarded when emails were resumed",
  });
  await assert.rejects(() => q(`select admin_queue_test_email('creator_welcome', 'not-an-email')`), /valid email/);
  await assert.rejects(() => q(`select admin_queue_test_email('nope', 'a@x.com')`), /Unknown email template/);
  await db.exec(`set test.is_admin = 'false'`);
});

test("worker status keeps one row; app users can't touch the worker's functions or tables", async () => {
  await q(`select email_worker_heartbeat('test', 'c@g.com', 'Connectiqo', 'smtp.gmail.com', 465, 'c@g.com', true, null, '{ramvish9923@gmail.com}')`);
  await q(`select email_worker_heartbeat('dry_run', 'c@g.com', 'Connectiqo', 'smtp.gmail.com', 465, 'c@g.com', null, null, '{}')`);
  assert.deepEqual(await q(`select mode, last_seen_at is not null seen from email_worker_status`), [{ mode: "dry_run", seen: true }]);

  const someId = (await one(`select id from email_outbox limit 1`)).id;
  assert.deepEqual(
    await asRole("authenticated", {
      insertOutbox: `insert into email_outbox (audience, template, recipient_id, dedupe_key) values ('creator', 'x', '${U(1)}', 'evil')`,
      updateOutbox: `update email_outbox set status = 'sent'`,
      claim: `select * from claim_email_outbox(1)`,
      complete: `select complete_email_outbox('${someId}', true)`,
      heartbeat: `select email_worker_heartbeat('live', 'x', 'x', 'x', 1, 'x', true, null, '{}')`,
      writeStatus: `update email_worker_status set mode = 'live'`,
      enqueue: `select enqueue_email('creator', 'x', '${U(1)}', '{}'::jsonb, 'evil2')`,
    }),
    {
      insertOutbox: "denied",
      updateOutbox: "denied",
      claim: "denied",
      complete: "denied",
      heartbeat: "denied",
      writeStatus: "denied",
      enqueue: "denied",
    }
  );
});

test("a queueing failure never blocks a signup", async () => {
  await db.exec(`alter table email_outbox rename to email_outbox_gone`);
  const id = newId();
  await q(`insert into profiles (id, name, email) values ($1, 'X', 'x@x.com')`, [id]);
  await q(`insert into mentor_profiles (id) values ($1)`, [id]);
  await db.exec(`alter table email_outbox_gone rename to email_outbox`);
});

test("sending mode: safe default, only admins change it, only the worker's function reads it, never live", async () => {
  const read = () => one(`select sending_mode, test_recipients from email_worker_settings()`);
  assert.deepEqual(await read(), { sending_mode: "test", test_recipients: [] });

  await db.exec(`set test.is_admin = 'false'`);
  assert.deepEqual(
    await asRole("authenticated", { read: `select * from email_worker_settings()` }),
    { read: "denied" }
  );
  assert.deepEqual(await asRole("anon", { read: `select * from email_worker_settings()` }), { read: "denied" });
  assert.deepEqual(await asRole("service_role", { read: `select * from email_worker_settings()` }), { read: "allowed" });
  await asRole("authenticated", { change: `update email_trigger_settings set sending_mode = 'dry_run'` });
  assert.equal((await read()).sending_mode, "test", "a non-admin's update changes nothing");

  await db.exec(`set test.is_admin = 'true'`);
  await asRole("authenticated", { change: `update email_trigger_settings set sending_mode = 'dry_run', test_recipients = '{me@x.com}'` });
  assert.deepEqual(await read(), { sending_mode: "dry_run", test_recipients: ["me@x.com"] });
  await db.exec(`set test.is_admin = 'false'`);

  await assert.rejects(() => db.exec(`update email_trigger_settings set sending_mode = 'live'`), /check/);
  await db.exec(`update email_trigger_settings set sending_mode = 'test', test_recipients = '{}'`);
});

test("sender details: empty by default, only admins change them, bad values rejected, no password column", async () => {
  const read = () => one(`select sender_name, sender_email, reply_to, support_email from email_worker_settings()`);
  const empty = { sender_name: null, sender_email: null, reply_to: null, support_email: null };
  assert.deepEqual(await read(), empty);

  await db.exec(`set test.is_admin = 'false'`);
  await asRole("authenticated", { change: `update email_trigger_settings set sender_name = 'Hacked'` });
  assert.deepEqual(await read(), empty, "a non-admin's update changes nothing");

  await db.exec(`set test.is_admin = 'true'`);
  await asRole("authenticated", { change: `update email_trigger_settings set sender_name = 'Team', sender_email = 'team@x.com', reply_to = 'r@x.com', support_email = 's@x.com'` });
  assert.deepEqual(await read(), { sender_name: "Team", sender_email: "team@x.com", reply_to: "r@x.com", support_email: "s@x.com" });
  await db.exec(`set test.is_admin = 'false'`);

  await assert.rejects(() => db.exec(`update email_trigger_settings set sender_email = 'not-an-email'`), /check/);
  await assert.rejects(() => db.exec(`update email_trigger_settings set sender_name = E'a\\nBcc: x@x.com'`), /check/);

  const columns = await q(`select column_name from information_schema.columns where table_name = 'email_trigger_settings'`);
  assert.equal(columns.some(({ column_name }) => /pass|secret/i.test(column_name)), false);
  await db.exec(`update email_trigger_settings set sender_name = null, sender_email = null, reply_to = null, support_email = null`);
});

test("mail server: admins can replace it for any provider, only the worker can read it", async () => {
  const saved = () => q(`select * from email_worker_smtp_login()`);
  const set = `select admin_set_email_smtp('SMTP.Hostinger.com', 465, 'Hello@Company.com', 'pass word', 'admin@x.com')`;
  assert.deepEqual(await saved(), []);

  await db.exec(`set test.is_admin = 'false'`);
  assert.deepEqual(await asRole("authenticated", { set }), { set: "denied" });
  assert.deepEqual(await asRole("anon", { set }), { set: "denied" });
  assert.deepEqual(await saved(), [], "a non-admin can't save a login");

  await db.exec(`set test.is_admin = 'true'`);
  assert.deepEqual(await asRole("authenticated", { set }), { set: "allowed" });
  assert.deepEqual(await saved(), [{ smtp_host: "smtp.hostinger.com", smtp_port: 465, smtp_user: "Hello@Company.com", smtp_pass: "pass word" }]);
  const settings = await one(`select * from email_trigger_settings`);
  assert.equal(settings.sender_email, "Hello@Company.com");
  assert.equal(settings.smtp_login_saved_by, "admin@x.com");
  assert.equal(JSON.stringify(settings).includes("pass word"), false, "the password isn't in the settings an admin can read");

  // Even an admin can't read it back.
  const read = { read: `select * from email_worker_smtp_login()` };
  assert.deepEqual(await asRole("authenticated", read), { read: "denied" });
  assert.deepEqual(await asRole("anon", read), { read: "denied" });
  assert.deepEqual(await asRole("service_role", read), { read: "allowed" });

  // Gmail's App Passwords are shown with spaces that aren't part of them.
  await asRole("authenticated", { replace: `select admin_set_email_smtp('smtp.gmail.com', 587, 'two@x.com', 'abcd efgh', null)` });
  assert.deepEqual(await saved(), [{ smtp_host: "smtp.gmail.com", smtp_port: 587, smtp_user: "two@x.com", smtp_pass: "abcdefgh" }]);
  assert.equal((await one(`select count(*)::int as n from vault.secrets`)).n, 1);

  await assert.rejects(() => db.exec(`select admin_set_email_smtp('bad host', 465, 'a@x.com', 'x', null)`), /valid host/);
  await assert.rejects(() => db.exec(`select admin_set_email_smtp('h.com', 70000, 'a@x.com', 'x', null)`), /valid port/);
  await assert.rejects(() => db.exec(`select admin_set_email_smtp('h.com', 465, 'nope', 'x', null)`), /valid sender email/);
  await assert.rejects(() => db.exec(`select admin_set_email_smtp('h.com', 465, 'a@x.com', '   ', null)`), /password/);

  await asRole("authenticated", { clear: `select admin_clear_email_smtp_login()` });
  assert.deepEqual(await saved(), []);
  await db.exec(`update email_trigger_settings set sender_email = null`);
  await db.exec(`set test.is_admin = 'false'`);
});

test("the worker reports its reply-to and support addresses; an older worker's call still works", async () => {
  await q(`select email_worker_heartbeat(p_mode => 'test', p_sender_email => 'c@g.com', p_sender_name => 'C', p_smtp_host => 'h', p_smtp_port => 465, p_smtp_user => 'c@g.com', p_smtp_ok => true, p_smtp_error => null, p_allowed_recipients => '{}', p_reply_to => 'r@x.com', p_support_email => 's@x.com')`);
  assert.deepEqual(await one(`select reply_to, support_email from email_worker_status`), { reply_to: "r@x.com", support_email: "s@x.com" });
  await q(`select email_worker_heartbeat(p_mode => 'test', p_sender_email => 'c@g.com', p_sender_name => 'C', p_smtp_host => 'h', p_smtp_port => 465, p_smtp_user => 'c@g.com', p_smtp_ok => true, p_smtp_error => null, p_allowed_recipients => '{}')`);
});

const later = () => db.exec(`update email_trigger_settings set brand_emails_enabled_at = now() - interval '30 days'`);

/** New company with a login; its welcome email is cleared unless asked for. */
async function brand({ name = "Acme", daysOld = 0, keepWelcome = false } = {}) {
  const id = newId();
  await q(`insert into profiles (id, name, email) values ($1, 'Owner', $2)`, [id, `b${id.slice(-4)}@x.com`]);
  await q(`insert into brand_profiles (id, company_name, created_at) values ($1, $2, now() - make_interval(days => $3))`, [id, name, daysOld]);
  await q(`insert into brand_email_status (company_id) values ($1)`, [id]);
  if (!keepWelcome) await db.exec(`update email_outbox set status = 'sent' where recipient_id = '${id}' and template = 'brand_welcome'`);
  return id;
}
const campaign = async (brandId, status = "published", title = "Summer") =>
  (await one(`insert into campaigns (brand_id, title, status) values ($1, $2, $3) returning id`, [brandId, title, status])).id;
const apply = async (campaignId, daysOld = 0) =>
  (await one(`insert into campaign_applications (campaign_id, creator_id, applied_at) values ($1, $2, now() - make_interval(days => $3)) returning id`, [campaignId, U(1), daysOld])).id;

test("company welcome: once per company, marks the status when sent", async () => {
  await closeQueue();
  const id = await brand({ keepWelcome: true });
  const [row] = await rowsFor("brand_welcome", id);
  assert.equal(row.audience, "brand");
  assert.equal(row.payload.company_name, "Acme");
  const claimed = (await claim()).find((c) => c.recipient_id === id);
  assert.match(claimed.to_email, /@x\.com$/);
  assert.ok(claimed.unsubscribe_token, "an optional email carries an unsubscribe token");
  await q(`select complete_email_outbox($1, true)`, [claimed.id]);
  assert.equal((await one(`select greeting_mail_sent from brand_email_status where company_id = $1`, [id])).greeting_mail_sent, true);
});

test("existing companies and campaigns get nothing when the migration runs", async () => {
  await closeQueue();
  await db.exec(brandEmails);
  assert.deepEqual(await claim(), []);
});

test("campaign is live: on publish, once, and not for campaigns from before launch", async () => {
  await closeQueue();
  const id = await brand();
  const draft = await campaign(id, "draft");
  assert.equal((await rowsFor("brand_campaign_live", id)).length, 0, "a draft isn't live");
  await q(`update campaigns set status = 'published' where id = $1`, [draft]);
  const [row] = await rowsFor("brand_campaign_live", id);
  assert.equal(row.payload.campaign_id, draft);
  assert.equal(row.payload.campaign_title, "Summer");
  await q(`update campaigns set status = 'closed' where id = $1`, [draft]);
  await q(`update campaigns set status = 'published' where id = $1`, [draft]);
  assert.equal((await rowsFor("brand_campaign_live", id)).length, 1, "reopening doesn't repeat it");

  const old = (await one(`insert into campaigns (brand_id, title, status, created_at) values ($1, 'Old', 'closed', now() - interval '1 year') returning id`, [id])).id;
  await q(`update campaigns set status = 'published' where id = $1`, [old]);
  assert.equal((await rowsFor("brand_campaign_live", id)).length, 1, "a campaign from before launch is left alone");
});

test("new submission: when the video is ready, again on resubmission, never on the brand's own review", async () => {
  await closeQueue();
  const id = await brand();
  const application = await apply(await campaign(id));
  await db.exec(`update email_outbox set status = 'sent' where recipient_id = '${id}'`);
  const count = async () => (await rowsFor("brand_new_submission", id)).length;
  await q(`insert into profiles (id, name, email) values ($1, 'Asha Verma', 'asha@x.com') on conflict (id) do update set name = 'Asha Verma'`, [U(1)]);

  const submission = (await one(`insert into campaign_submissions (application_id, creator_id) values ($1, $2) returning id`, [application, U(1)])).id;
  assert.equal(await count(), 0, "still processing");
  await q(`update campaign_submissions set status = 'submitted' where id = $1`, [submission]);
  assert.equal(await count(), 1);
  const [row] = await rowsFor("brand_new_submission", id);
  assert.equal(row.payload.creator_name, "Asha Verma");
  assert.equal(row.payload.campaign_title, "Summer");

  await q(`update campaign_submissions set status = 'revision_requested' where id = $1`, [submission]);
  await q(`update campaign_submissions set status = 'approved' where id = $1`, [submission]);
  assert.equal(await count(), 1, "reviewing sends nothing");
  await q(`update campaign_submissions set status = 'processing' where id = $1`, [submission]);
  await q(`update campaign_submissions set status = 'submitted' where id = $1`, [submission]);
  assert.equal(await count(), 2, "a resubmission is a new event");
});

test("company reminder: 3 days after signup, 3 days apart, 3 at most; stops once a campaign launches", async () => {
  await later();
  const id = await brand({ daysOld: 4 });
  const count = async () => (await rowsFor("brand_campaign_reminder", id)).length;
  const tooNew = await brand({ daysOld: 1 });
  await q(`select enqueue_brand_campaign_reminders()`);
  assert.equal(await count(), 1);
  assert.equal((await rowsFor("brand_campaign_reminder", tooNew)).length, 0);

  await q(`select enqueue_brand_campaign_reminders()`);
  assert.equal(await count(), 1, "no second one within 3 days");
  for (let i = 0; i < 4; i += 1) {
    await db.exec(`update email_outbox set status = 'sent', dedupe_key = dedupe_key || ':${i}', created_at = created_at - interval '4 days' where template = 'brand_campaign_reminder' and recipient_id = '${id}'`);
    await q(`select enqueue_brand_campaign_reminders()`);
  }
  assert.equal(await count(), 3, "stops after 3");

  const launched = await brand({ daysOld: 4 });
  await campaign(launched);
  const drafting = await brand({ daysOld: 4 });
  await campaign(drafting, "draft");
  const unsubscribed = await brand({ daysOld: 4 });
  await q(`insert into email_preferences (user_id, unsubscribed_at) values ($1, now())`, [unsubscribed]);
  await q(`select enqueue_brand_campaign_reminders()`);
  assert.equal((await rowsFor("brand_campaign_reminder", launched)).length, 0);
  assert.equal((await rowsFor("brand_campaign_reminder", drafting)).length, 1, "a draft isn't launched");
  assert.equal((await rowsFor("brand_campaign_reminder", unsubscribed)).length, 0);

  const before = await brand({ daysOld: 40 });
  await q(`select enqueue_brand_campaign_reminders()`);
  assert.equal((await rowsFor("brand_campaign_reminder", before)).length, 0, "signed up before launch");
});

test("new applications: one daily summary per company, only what's new, skipped ones roll over", async () => {
  await later();
  const id = await brand({ daysOld: 10 });
  const one1 = await campaign(id, "published", "One");
  const two = await campaign(id, "published", "Two");
  const rows = () => rowsFor("brand_new_applications", id);
  await q(`select enqueue_brand_application_summaries()`);
  assert.equal((await rows()).length, 0, "no applications, no email");

  await apply(one1);
  await apply(one1);
  await apply(two);
  await apply(one1, 60); // Older than launch: not counted.
  await q(`select enqueue_brand_application_summaries()`);
  const [row] = await rows();
  assert.equal(row.payload.total, 3);
  assert.deepEqual(row.payload.campaigns, [{ title: "One", count: 2 }, { title: "Two", count: 1 }]);

  await q(`select enqueue_brand_application_summaries()`);
  assert.equal((await rows()).length, 1, "only one a day");

  await db.exec(`update email_outbox set status = 'skipped', dedupe_key = dedupe_key || ':old' where template = 'brand_new_applications' and recipient_id = '${id}'`);
  await q(`select enqueue_brand_application_summaries()`);
  const again = (await rows()).find((r) => r.status === "pending");
  assert.equal(again.payload.total, 3, "a skipped summary doesn't lose them");

  await db.exec(`update email_outbox set status = 'sent', created_at = now() - interval '1 day', dedupe_key = dedupe_key || ':sent' where id = '${again.id}'`);
  await db.exec(`update campaign_applications set applied_at = now() - interval '2 days' where campaign_id in ('${one1}', '${two}')`);
  await apply(two);
  await q(`select enqueue_brand_application_summaries()`);
  const next = (await rows()).find((r) => r.status === "pending");
  assert.equal(next.payload.total, 1, "only what arrived since the last summary");
});

test("unsubscribing stops the optional company emails but not the campaign ones", async () => {
  await closeQueue();
  await later();
  const id = await brand({ keepWelcome: true });
  await q(`insert into email_preferences (user_id, unsubscribed_at) values ($1, now())`, [id]);
  await campaign(id);
  const claimed = await claim();
  assert.deepEqual(claimed.map((c) => c.template), ["brand_campaign_live"]);
  const [welcome] = await rowsFor("brand_welcome", id);
  assert.equal(welcome.status, "skipped");
  assert.equal(welcome.last_error, "Recipient unsubscribed");
  assert.equal(claimed[0].recipient_id, id);
  await closeQueue();
});

test("frozen companies aren't emailed, and the daily jobs respect the off switch", async () => {
  await closeQueue();
  await later();
  const frozen = await brand();
  await q(`update profiles set is_frozen = true where id = $1`, [frozen]);
  await campaign(frozen);
  assert.deepEqual(await claim(), []);
  assert.equal((await rowsFor("brand_campaign_live", frozen))[0].status, "skipped");

  const id = await brand({ daysOld: 4 });
  await apply(await campaign(id));
  await closeQueue();
  await db.exec(`update email_templates set enabled = false where template in ('brand_campaign_reminder', 'brand_new_applications')`);
  assert.equal((await one(`select enqueue_brand_campaign_reminders() n`)).n, 0);
  assert.equal((await one(`select enqueue_brand_application_summaries() n`)).n, 0);
  await db.exec(`update email_templates set enabled = true where template in ('brand_campaign_reminder', 'brand_new_applications')`);
});

test("queueing a company email never blocks the action", async () => {
  await db.exec(`alter table email_outbox rename to email_outbox_gone`);
  const id = newId();
  await q(`insert into profiles (id, name, email) values ($1, 'X', 'x2@x.com')`, [id]);
  await q(`insert into brand_profiles (id, company_name) values ($1, 'X')`, [id]);
  await q(`insert into campaigns (brand_id, title, status) values ($1, 'T', 'published')`, [id]);
  await db.exec(`alter table email_outbox_gone rename to email_outbox`);
});

test("app users can't call the company email functions", async () => {
  await db.exec(`set test.is_admin = 'false'`);
  const calls = {
    reminders: `select enqueue_brand_campaign_reminders()`,
    summaries: `select enqueue_brand_application_summaries()`,
  };
  assert.deepEqual(await asRole("authenticated", calls), { reminders: "denied", summaries: "denied" });
  assert.deepEqual(await asRole("anon", calls), { reminders: "denied", summaries: "denied" });
});

test("the migrations are safe to run twice", async () => {
  await db.exec(migration);
  await db.exec(sendingMode);
  await db.exec(senderSettings);
  await db.exec(smtpLogin);
  await db.exec(anyProvider);
  await db.exec(brandEmails);
});
