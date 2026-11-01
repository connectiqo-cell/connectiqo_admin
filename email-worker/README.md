# Connectiqo email worker

Sends Connectiqo's automatic emails. It is a small Node.js service, separate from the admin site.

```
Event in the database (signup, booking confirmed, daily profile check)
   │  database trigger inserts a row — no network calls, never blocks the app
   ▼
email_outbox table (Supabase)
   │  this worker polls every 30 s: claim_email_outbox() → send → complete_email_outbox()
   ▼
Gmail SMTP → recipient
```

The database side lives in `../supabase/migrations/20261026000000_creator_email_triggers.sql`.

## Creator emails

Withdrawal/payout updates are not emailed (creators get the in-app push notification).

| Template | Sent when | Link |
|---|---|---|
| `creator_welcome` | A creator profile is created | /mentor/profile |
| `creator_session_booked` | A booking becomes `confirmed` (paid). Reschedules are skipped | /mentor/sessions |
| `creator_profile_reminder` | Daily 10:00 IST: creators who joined 3+ days ago, profile not above 75%. Max 3, 3 days apart. Creators from before launch join at 50 a day | /mentor/profile |

Company emails (migration `20261031150000_brand_email_triggers.sql`) go to the login address:

| Template | When | Links to |
|---|---|---|
| `brand_welcome` | A brand profile is created | /brand/campaigns/new |
| `brand_campaign_reminder` | Daily at 10:00 IST: no campaign launched 3 days after signing up, then every 3 days, 3 at most | /brand/campaigns/new |
| `brand_campaign_live` | A campaign is published, once per campaign | The campaign |
| `brand_new_applications` | Daily at 10:00 IST: applications since the last summary, if any | /brand/campaigns |
| `brand_new_submission` | A video is ready to review (`processing` to `submitted`), including resubmissions | The campaign |

Unsubscribing stops the welcome and the reminder; the other three still go out. Companies and
campaigns from before the migration are left alone.

Rules applied to every email:
- Only events after the migration is applied are emailed (no backlog).
- Recipients who are deleted, login-banned or creator-frozen are skipped (`can_email_user()`).
- One email per event (`dedupe_key`), so retries never send duplicates.
- Failed sends retry after 2, 4, 8, 16 minutes; after 5 attempts the email is marked `failed`
  and an admin can queue it again with **Retry** in the admin Email log.

The admin Email Triggers page controls the emergency stop, each email's on/off switch and wording,
and the reminder thresholds. The launch time is in the `email_trigger_settings` table.

## Safety: who receives email

Nothing goes to real users until you decide so. The mode is set in `.env`; restart the worker
after changing it. To stop sending straight away, use **Pause all emails** in the admin panel.

| Mode | Set in | What happens |
|---|---|---|
| Test (default) | `SEND_TO_EVERYONE=false` | Only `ALLOWED_RECIPIENTS` receive automatic mail; leave it empty to hold back all automatic mail. Everyone else is marked `skipped` and never retried, so no backlog is sent later. A test sent from the admin editor goes to the address typed there. |
| Live | `SEND_TO_EVERYONE=true`, `ALLOWED_RECIPIENTS` empty | All eligible users. |

`DRY_RUN` only applies until migration `20261031000000_email_sending_mode.sql` is applied. With
`DRY_RUN=false` the worker refuses to start unless `ALLOWED_RECIPIENTS` or `SEND_TO_EVERYONE=true`
is set, so keep `DRY_RUN=true` unless you're using one of them.

## Daily sending limit

A Gmail account allows about 500 emails a day. Once `daily_send_limit` (default 400, in
`email_trigger_settings`) went out in the last 24 hours, routine emails stay queued until there's
room. Booking and campaign emails go first and aren't held back, and test emails aren't counted.
Change it after moving to a provider with a different limit:

```sql
update public.email_trigger_settings set daily_send_limit = 400 where id;
```

## Sender and mail server

Admins edit these in **Email Triggers → Setup**, for any provider (Gmail, Hostinger, a company
domain), and the worker picks them up within one polling cycle, with no restart: Sender Name,
Sender Email (also the login), Host, Port, Password, Reply To Address and Support Address.
Anything not set there falls back to `.env`.

Host, port, login and password are saved together, encrypted in Supabase Vault (migration
`20261031140000_email_smtp_any_provider.sql`), so changing the email, host or port needs the
password again. Admins can't read the password back through the panel. The service role key, and
anyone with SQL access to the project, can read it, so treat both as equally sensitive. If a login
fails, emails stay queued and the worker retries it every 5 minutes, or straight away when new
details are saved.

## Manual testing (before going live)

1. **SMTP + how the emails look** — no database involved. Create a Google App Password for
   the sending Gmail account, put it in `.env` as `SMTP_PASS`, then:
   ```bash
   npm install
   npm run send-test -- --to ramvish9923@gmail.com
   ```
   Three emails arrive, subjects prefixed `[TEST]`. Send one type with
   `--only creator_welcome`.
2. **Real triggers, still only to you** — after the migration is applied, run the worker with
   `SEND_TO_EVERYONE=false` and `ALLOWED_RECIPIENTS=ramvish9923@gmail.com`, then create events on that
   account (e.g. confirm a booking where it is the creator). Other creators' events are
   skipped and logged as `test mode: skipped …`.
3. **Go live** only after both look right: remove `ALLOWED_RECIPIENTS`, set `SEND_TO_EVERYONE=true`.

## Run

```bash
cp .env.example .env    # fill in SUPABASE_SERVICE_ROLE_KEY and SMTP_PASS
docker compose up -d --build email-worker      # from the repo root
docker compose logs -f email-worker
```

Start with `DRY_RUN=true`: the worker logs `[dry-run] would send …` instead of sending.
When the log looks right, set `DRY_RUN=false` and restart:
`docker compose up -d email-worker`.

Note: in dry-run mode emails are marked as `skipped` in the outbox (so they aren't repeated)
and nothing reaches the recipient. They can be sent later with **Retry** in the admin History tab.

## Gmail limits

Gmail allows roughly 500 emails per day. The worker sends one email every 1.5 s at most
(`SEND_DELAY_MS`). If volume grows, switch to a transactional provider by changing
`SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` — no code changes needed.

## Develop

```bash
npm install
npm test
```
