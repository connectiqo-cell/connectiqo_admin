-- Automatic creator emails (welcome, session booked, profile reminder).
-- Withdrawal updates are intentionally not emailed (creators get the in-app push notification).
--
-- How it works (no Edge Functions):
--   1. Database triggers only INSERT a row into email_outbox — they never make network
--      calls, so a slow/failing mail server can't block a signup or booking.
--   2. The email-worker service (connectiqo-admin/email-worker, Docker) polls the outbox via
--      claim_email_outbox(), sends through SMTP (Gmail), and reports back with
--      complete_email_outbox(), which also updates the tracking columns from
--      20261025000000 (greeting_mail_sent, open_slots_mail_count, …).
--   3. A daily pg_cron job queues "complete your profile" reminders.
--
-- Only NEW events are emailed: triggers fire on rows changed after this migration, and
-- profile reminders only cover creators who sign up after creator_emails_enabled_at.
--
-- Admin controls: email_templates (on/off per email type, optional text overrides as plain
-- text with {{placeholders}}), email_trigger_settings.emails_paused (emergency stop),
-- email_worker_status (what the worker reports; never includes the SMTP password).
--
-- Unsubscribe: every user gets a private token (email_preferences). Unsubscribing stops
-- non-essential emails (welcome, profile reminders); booking emails (session booked) still
-- go out. email_unsubscribe(token) is callable without login from the unsubscribe page.
-- Requires: 20261025000000 … 20261025030000 (tracking columns, can_email_user,
-- profile completeness). Safe to run more than once.

-- ── Settings ────────────────────────────────────────────────────────────────
create table if not exists public.email_trigger_settings (
  id boolean primary key default true check (id),
  creator_emails_enabled_at timestamptz not null default now(),
  -- Reminders go to creators at or below this completeness; above it they stop.
  profile_reminder_stop_above smallint not null default 75
    check (profile_reminder_stop_above between 0 and 99),
  profile_reminder_after_days integer not null default 3 check (profile_reminder_after_days >= 0),
  profile_reminder_every_days integer not null default 3 check (profile_reminder_every_days >= 1),
  profile_reminder_max integer not null default 3 check (profile_reminder_max >= 0),
  -- Emergency stop: nothing is sent while true (test emails excepted); emails stay queued.
  emails_paused boolean not null default false,
  emails_paused_at timestamptz,
  emails_paused_by text
);

comment on table public.email_trigger_settings is
  'Single row. creator_emails_enabled_at = launch time; profile reminders only go to creators who signed up after it. Reminders: first after profile_reminder_after_days, then every profile_reminder_every_days, at most profile_reminder_max, only while completeness <= profile_reminder_stop_above.';

insert into public.email_trigger_settings (id) values (true) on conflict (id) do nothing;

alter table public.email_trigger_settings enable row level security;
drop policy if exists email_trigger_settings_admin_select on public.email_trigger_settings;
create policy email_trigger_settings_admin_select on public.email_trigger_settings
  for select to authenticated using (public.is_admin());
drop policy if exists email_trigger_settings_admin_update on public.email_trigger_settings;
create policy email_trigger_settings_admin_update on public.email_trigger_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- ── Email preferences / unsubscribe ─────────────────────────────────────────
create table if not exists public.email_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  -- Random, unguessable; goes into unsubscribe links instead of the user id.
  unsubscribe_token uuid not null unique default gen_random_uuid(),
  unsubscribed_at timestamptz,
  updated_at timestamptz not null default now()
);

comment on table public.email_preferences is
  'unsubscribed_at set = no more non-essential emails (welcome, reminders). Booking emails still go out.';

alter table public.email_preferences enable row level security;
drop policy if exists email_preferences_admin_select on public.email_preferences;
create policy email_preferences_admin_select on public.email_preferences
  for select to authenticated using (public.is_admin());
revoke insert, update, delete on public.email_preferences from anon, authenticated;

-- Called by the public unsubscribe page / one-click unsubscribe (no login).
-- Knowing the token is the proof; returns false for an unknown token.
create or replace function public.email_unsubscribe(p_token uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.email_preferences
  set unsubscribed_at = coalesce(unsubscribed_at, now()), updated_at = now()
  where unsubscribe_token = p_token;
  return found;
end;
$$;

-- Templates that keep going out after unsubscribe (about the user's own bookings/money).
create or replace function public.email_template_is_essential(p_template text)
returns boolean
language sql
immutable
as $$ select p_template in ('creator_session_booked') $$;

-- ── Outbox ──────────────────────────────────────────────────────────────────
create table if not exists public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  audience text not null check (audience in ('creator', 'brand')),
  template text not null,
  -- Null only for admin test emails, which go to to_override.
  recipient_id uuid references public.profiles(id) on delete cascade,
  to_override text,
  is_test boolean not null default false,
  -- Draft text for a test email; normal emails use email_templates when claimed.
  overrides jsonb,
  payload jsonb not null default '{}'::jsonb,
  -- One email per event: a second trigger for the same event is ignored.
  dedupe_key text not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0,
  last_error text,
  send_after timestamptz not null default now(),
  locked_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  check (recipient_id is not null or (is_test and to_override is not null))
);

comment on table public.email_outbox is
  'Emails waiting to be sent / already sent by the email-worker service. Written only by triggers and the worker functions.';

create index if not exists email_outbox_due_idx on public.email_outbox (send_after) where status = 'pending';
create index if not exists email_outbox_recipient_idx on public.email_outbox (recipient_id, template, created_at desc);

alter table public.email_outbox enable row level security;
drop policy if exists email_outbox_admin_select on public.email_outbox;
create policy email_outbox_admin_select on public.email_outbox
  for select to authenticated using (public.is_admin());
revoke insert, update, delete on public.email_outbox from anon, authenticated;

-- ── Templates: on/off and optional text overrides ───────────────────────────
-- Null text = the built-in wording in email-worker/src/templates.js. Text is plain, with
-- {{placeholders}}; the worker escapes it and owns the layout and unsubscribe footer.
create table if not exists public.email_templates (
  template text primary key,
  audience text not null check (audience in ('creator', 'brand')),
  enabled boolean not null default true,
  subject text check (char_length(subject) <= 200),
  heading text check (char_length(heading) <= 200),
  body text check (char_length(body) <= 5000),
  button_label text check (char_length(button_label) <= 60),
  updated_at timestamptz,
  updated_by text
);

insert into public.email_templates (template, audience) values
  ('creator_welcome', 'creator'),
  ('creator_session_booked', 'creator'),
  ('creator_profile_reminder', 'creator')
on conflict (template) do nothing;

alter table public.email_templates enable row level security;
drop policy if exists email_templates_admin_select on public.email_templates;
create policy email_templates_admin_select on public.email_templates
  for select to authenticated using (public.is_admin());
drop policy if exists email_templates_admin_update on public.email_templates;
create policy email_templates_admin_update on public.email_templates
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
revoke insert, delete on public.email_templates from anon, authenticated;

-- ── Worker status (read-only for admins; never contains the SMTP password) ──
create table if not exists public.email_worker_status (
  id boolean primary key default true check (id),
  last_seen_at timestamptz,
  mode text check (mode in ('dry_run', 'test', 'live')),
  sender_email text,
  sender_name text,
  smtp_host text,
  smtp_port integer,
  smtp_user text,
  smtp_ok boolean,
  smtp_error text,
  allowed_recipients text[]
);

alter table public.email_worker_status enable row level security;
drop policy if exists email_worker_status_admin_select on public.email_worker_status;
create policy email_worker_status_admin_select on public.email_worker_status
  for select to authenticated using (public.is_admin());
revoke insert, update, delete on public.email_worker_status from anon, authenticated;

-- ── Queue an email (internal) ───────────────────────────────────────────────
create or replace function public.enqueue_email(
  p_audience text,
  p_template text,
  p_recipient_id uuid,
  p_payload jsonb,
  p_dedupe_key text,
  p_send_after timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.email_outbox (audience, template, recipient_id, payload, dedupe_key, send_after)
  values (p_audience, p_template, p_recipient_id, coalesce(p_payload, '{}'::jsonb), p_dedupe_key, p_send_after)
  on conflict (dedupe_key) do nothing;
end;
$$;

-- ── 1. Welcome: a creator profile is created ────────────────────────────────
create or replace function public.trg_email_creator_welcome()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform public.enqueue_email('creator', 'creator_welcome', new.id, '{}'::jsonb,
                                 'creator_welcome:' || new.id);
  exception when others then
    raise warning 'creator_welcome email not queued: %', sqlerrm;  -- never block signup
  end;
  return null;
end;
$$;

drop trigger if exists mentor_profiles_email_welcome on public.mentor_profiles;
create trigger mentor_profiles_email_welcome
  after insert on public.mentor_profiles
  for each row execute function public.trg_email_creator_welcome();

-- ── 2. Session booked: a booking becomes confirmed (paid) ───────────────────
-- Bookings start as 'pending' and are confirmed after payment. Reschedules create a new
-- booking linked via original_booking_id — those are not "new bookings", so skipped.
create or replace function public.trg_email_creator_session_booked()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
begin
  if new.status <> 'confirmed'
     or new.original_booking_id is not null
     or (tg_op = 'UPDATE' and old.status is not distinct from 'confirmed') then
    return null;
  end if;

  begin
    select jsonb_build_object(
             'booking_id', new.id,
             'booked_by_name', coalesce(nullif(btrim(lp.name), ''), 'Someone'),
             'date', s.date,
             'start_time', s.start_time,
             'end_time', s.end_time
           )
      into v_payload
      from (select 1) one
      left join public.availability_slots s on s.id = new.slot_id
      left join public.profiles lp on lp.id = new.learner_id;

    perform public.enqueue_email('creator', 'creator_session_booked', new.mentor_id, v_payload,
                                 'creator_session_booked:' || new.id);
  exception when others then
    raise warning 'creator_session_booked email not queued: %', sqlerrm;  -- never block booking
  end;
  return null;
end;
$$;

drop trigger if exists bookings_email_session_booked on public.bookings;
create trigger bookings_email_session_booked
  after insert or update of status on public.bookings
  for each row execute function public.trg_email_creator_session_booked();

-- ── 3. Profile reminder (daily job) ─────────────────────────────────────────
-- Human-readable list of what's missing; mirrors creator_profile_completeness().
create or replace function public.creator_missing_profile_fields(m public.mentor_profiles)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select array_remove(array[
    case when coalesce((select nullif(btrim(p.avatar_url), '') is null from public.profiles p where p.id = m.id), true)
         then 'Profile photo' end,
    case when nullif(btrim(m.specialization), '') is null then 'Specialization' end,
    case when nullif(btrim(m.bio), '') is null then 'Bio' end,
    case when nullif(btrim(m.category), '') is null then 'Category' end,
    case when coalesce(m.experience_years, 0) <= 0 then 'Years of experience' end,
    case when coalesce(m.price_per_hour, 0) <= 0 then 'Price per hour' end,
    case when coalesce(cardinality(m.skills), 0) = 0 then 'Skills' end,
    case when nullif(btrim(m.location), '') is null then 'Location' end,
    case when nullif(btrim(m.cover_image_url), '') is null then 'Cover image' end,
    case when coalesce(nullif(btrim(m.linkedin_url), ''), nullif(btrim(m.instagram_url), ''),
                       nullif(btrim(m.youtube_url), ''), nullif(btrim(m.x_url), ''),
                       nullif(btrim(m.twitter_url), ''), nullif(btrim(m.website), '')) is null
         then 'A social link' end
  ], null);
$$;

-- Queues one reminder per eligible creator: signed up after launch, at least
-- profile_reminder_after_days ago, completeness still <= profile_reminder_stop_above,
-- not unsubscribed, fewer than profile_reminder_max reminders so far, and none in the
-- last profile_reminder_every_days. Defaults: 3 reminders, 3 days apart, stop above 75%.
-- Returns how many were queued.
create or replace function public.enqueue_creator_profile_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.email_trigger_settings;
  v_count integer := 0;
  r record;
begin
  select * into s from public.email_trigger_settings where id;
  if s is null or s.profile_reminder_max = 0 then
    return 0;
  end if;
  if not coalesce((select t.enabled from public.email_templates t where t.template = 'creator_profile_reminder'), true) then
    return 0;
  end if;

  for r in
    select m.*
    from public.mentor_profiles m
    join public.profiles p on p.id = m.id
    cross join lateral (
      select count(*) as n, max(o.created_at) as last_at
      from public.email_outbox o
      where o.recipient_id = m.id
        and o.template = 'creator_profile_reminder'
        and o.status in ('pending', 'sending', 'sent')
    ) prev
    where p.deleted_at is null
      and p.created_at >= s.creator_emails_enabled_at
      and p.created_at <= now() - make_interval(days => s.profile_reminder_after_days)
      and coalesce(m.profile_completeness, 0) <= s.profile_reminder_stop_above
      and not exists (
        select 1 from public.email_preferences ep
        where ep.user_id = m.id and ep.unsubscribed_at is not null
      )
      and prev.n < s.profile_reminder_max
      and (prev.last_at is null or prev.last_at <= now() - make_interval(days => s.profile_reminder_every_days))
  loop
    perform public.enqueue_email(
      'creator', 'creator_profile_reminder', r.id,
      jsonb_build_object(
        'completeness', coalesce(r.profile_completeness, 0),
        'missing', to_jsonb(public.creator_missing_profile_fields(
          (select m2 from public.mentor_profiles m2 where m2.id = r.id)))
      ),
      'creator_profile_reminder:' || r.id || ':' || to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD'));
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- Daily at 10:00 IST (04:30 UTC). Re-running this migration replaces the job.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'creator-profile-reminders';
    perform cron.schedule('creator-profile-reminders', '30 4 * * *',
                          'select public.enqueue_creator_profile_reminders()');
  end if;
end;
$$;

-- ── Worker API (service role only) ──────────────────────────────────────────
-- Claims up to p_limit due emails. Normal emails are marked 'skipped' instead of returned
-- when their type is turned off, the recipient may not be emailed right now (can_email_user:
-- deleted / login-banned / creator-frozen), unsubscribed (non-essential templates only) or
-- has no address. While emails_paused is on, only test emails are claimed; the rest wait.
-- Rows stuck in 'sending' for 10+ minutes (worker crashed mid-send) are released first.
drop function if exists public.claim_email_outbox(integer);
create function public.claim_email_outbox(p_limit integer default 10)
returns table (
  id uuid,
  audience text,
  template text,
  recipient_id uuid,
  payload jsonb,
  attempts integer,
  to_email text,
  to_name text,
  unsubscribe_token uuid,
  overrides jsonb,
  is_test boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_token uuid;
  v_unsubscribed boolean;
  v_paused boolean;
begin
  select coalesce(ets.emails_paused, false) into v_paused from public.email_trigger_settings ets where ets.id;
  v_paused := coalesce(v_paused, false);

  update public.email_outbox o
  set status = 'pending', locked_at = null
  where o.status = 'sending' and o.locked_at < now() - interval '10 minutes';

  for r in
    select o.*, p.email as p_email, p.name as p_name,
           t.enabled as t_enabled,
           jsonb_build_object('subject', t.subject, 'heading', t.heading, 'body', t.body, 'button_label', t.button_label) as t_overrides
    from public.email_outbox o
    left join public.profiles p on p.id = o.recipient_id
    left join public.email_templates t on t.template = o.template
    where o.status = 'pending' and o.send_after <= now() and (o.is_test or not v_paused)
    order by o.created_at
    limit greatest(1, least(coalesce(p_limit, 10), 50))
    for update of o skip locked
  loop
    v_token := null;
    v_unsubscribed := false;

    if not r.is_test then
      -- Every recipient gets a preferences row (and token) on first email.
      insert into public.email_preferences (user_id) values (r.recipient_id) on conflict (user_id) do nothing;
      select ep.unsubscribe_token, ep.unsubscribed_at is not null
        into v_token, v_unsubscribed
        from public.email_preferences ep where ep.user_id = r.recipient_id;
    end if;

    if not r.is_test and not coalesce(r.t_enabled, true) then
      update public.email_outbox
      set status = 'skipped', last_error = 'Email type turned off'
      where email_outbox.id = r.id;
    elsif not r.is_test and not public.can_email_user(r.recipient_id, r.audience) then
      update public.email_outbox
      set status = 'skipped', last_error = 'Recipient may not be emailed (deleted, login-banned or creator-frozen)'
      where email_outbox.id = r.id;
    elsif not r.is_test and v_unsubscribed and not public.email_template_is_essential(r.template) then
      update public.email_outbox
      set status = 'skipped', last_error = 'Recipient unsubscribed'
      where email_outbox.id = r.id;
    elsif nullif(btrim(coalesce(r.to_override, r.p_email)), '') is null then
      update public.email_outbox
      set status = 'skipped', last_error = 'Recipient has no email address'
      where email_outbox.id = r.id;
    else
      update public.email_outbox
      set status = 'sending', attempts = email_outbox.attempts + 1, locked_at = now()
      where email_outbox.id = r.id;

      id := r.id;
      audience := r.audience;
      template := r.template;
      recipient_id := r.recipient_id;
      payload := r.payload;
      attempts := r.attempts + 1;
      to_email := btrim(coalesce(r.to_override, r.p_email));
      to_name := nullif(btrim(r.p_name), '');
      unsubscribe_token := v_token;
      overrides := coalesce(r.overrides, r.t_overrides);
      is_test := r.is_test;
      return next;
    end if;
  end loop;
end;
$$;

-- Reports the result of one send. Success updates the creator tracking columns.
-- Failure retries with backoff (2, 4, 8, 16 min); after 5 attempts it's 'failed'.
-- p_skip = deliberately not sent (e.g. worker in test mode and the recipient isn't on its
-- allow-list): closed as 'skipped' and never retried, so going live later doesn't flush
-- a backlog of old emails.
create or replace function public.complete_email_outbox(p_id uuid, p_ok boolean, p_error text default null, p_skip boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.email_outbox;
begin
  select * into o from public.email_outbox where id = p_id for update;
  if o.id is null or o.status <> 'sending' then
    return;  -- unknown or already handled
  end if;

  if p_skip then
    update public.email_outbox
    set status = 'skipped', locked_at = null, last_error = left(coalesce(p_error, 'Skipped by worker'), 1000)
    where id = p_id;
  elsif p_ok then
    update public.email_outbox
    set status = 'sent', sent_at = now(), locked_at = null, last_error = null
    where id = p_id;

    if o.template = 'creator_welcome' then
      update public.mentor_profiles
      set greeting_mail_sent = true, greeting_mail_sent_at = now()
      where id = o.recipient_id;
    elsif o.template = 'creator_session_booked' then
      update public.mentor_profiles
      set open_slots_mail_count = open_slots_mail_count + 1, last_open_slots_mail_at = now()
      where id = o.recipient_id;
    end if;
  else
    update public.email_outbox
    set status = case when o.attempts >= 5 then 'failed' else 'pending' end,
        send_after = now() + make_interval(mins => power(2, least(o.attempts, 4))::int),
        locked_at = null,
        last_error = left(coalesce(p_error, 'Unknown error'), 1000)
    where id = p_id;
  end if;
end;
$$;

-- Admin: send a failed/skipped email again.
create or replace function public.admin_retry_email(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Access denied: admin only';
  end if;
  update public.email_outbox
  set status = 'pending', attempts = 0, send_after = now(), locked_at = null, last_error = null
  where id = p_id and status in ('failed', 'skipped');
  if not found then
    raise exception 'Only failed or skipped emails can be retried';
  end if;
end;
$$;

-- Worker reports its state on every polling cycle (service role only).
create or replace function public.email_worker_heartbeat(
  p_mode text,
  p_sender_email text,
  p_sender_name text,
  p_smtp_host text,
  p_smtp_port integer,
  p_smtp_user text,
  p_smtp_ok boolean,
  p_smtp_error text,
  p_allowed_recipients text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.email_worker_status as w
    (id, last_seen_at, mode, sender_email, sender_name, smtp_host, smtp_port, smtp_user, smtp_ok, smtp_error, allowed_recipients)
  values
    (true, now(), p_mode, p_sender_email, p_sender_name, p_smtp_host, p_smtp_port, p_smtp_user, p_smtp_ok, left(p_smtp_error, 1000), p_allowed_recipients)
  on conflict (id) do update set
    last_seen_at = now(), mode = excluded.mode, sender_email = excluded.sender_email,
    sender_name = excluded.sender_name, smtp_host = excluded.smtp_host, smtp_port = excluded.smtp_port,
    smtp_user = excluded.smtp_user, smtp_ok = excluded.smtp_ok, smtp_error = excluded.smtp_error,
    allowed_recipients = excluded.allowed_recipients;
end;
$$;

-- Admin: emergency stop / resume. Resuming can discard what queued up meanwhile, so a long
-- pause doesn't end with a burst of out-of-date emails. Returns how many were discarded.
create or replace function public.admin_set_emails_paused(
  p_paused boolean,
  p_discard_waiting boolean default false,
  p_operator text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_discarded integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Access denied: admin only';
  end if;

  update public.email_trigger_settings
  set emails_paused = coalesce(p_paused, false),
      emails_paused_at = case when p_paused then now() else null end,
      emails_paused_by = case when p_paused then nullif(btrim(coalesce(p_operator, '')), '') else null end
  where id;

  if not coalesce(p_paused, false) and p_discard_waiting then
    update public.email_outbox
    set status = 'skipped', last_error = 'Discarded when emails were resumed', locked_at = null
    where status = 'pending' and not is_test;
    get diagnostics v_discarded = row_count;
  end if;
  return v_discarded;
end;
$$;

-- Admin: queue a test email with draft text to one address. It goes through the worker and
-- is sent to that address even in test mode. Returns the outbox id.
create or replace function public.admin_queue_test_email(
  p_template text,
  p_to text,
  p_payload jsonb default '{}'::jsonb,
  p_overrides jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_audience text;
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Access denied: admin only';
  end if;
  if btrim(coalesce(p_to, '')) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid email address';
  end if;
  select t.audience into v_audience from public.email_templates t where t.template = p_template;
  if v_audience is null then
    raise exception 'Unknown email template: %', p_template;
  end if;

  insert into public.email_outbox (audience, template, to_override, is_test, overrides, payload, dedupe_key)
  values (v_audience, p_template, btrim(p_to), true, p_overrides, coalesce(p_payload, '{}'::jsonb), 'test:' || gen_random_uuid())
  returning id into v_id;
  return v_id;
end;
$$;

-- ── Permissions ─────────────────────────────────────────────────────────────
revoke all on function public.enqueue_email(text, text, uuid, jsonb, text, timestamptz) from public, anon, authenticated;
revoke all on function public.trg_email_creator_welcome() from public, anon, authenticated;
revoke all on function public.trg_email_creator_session_booked() from public, anon, authenticated;
revoke all on function public.creator_missing_profile_fields(public.mentor_profiles) from public, anon, authenticated;
revoke all on function public.enqueue_creator_profile_reminders() from public, anon, authenticated;
revoke all on function public.claim_email_outbox(integer) from public, anon, authenticated;
revoke all on function public.complete_email_outbox(uuid, boolean, text, boolean) from public, anon, authenticated;
revoke all on function public.admin_retry_email(uuid) from public, anon;

grant execute on function public.claim_email_outbox(integer) to service_role;
grant execute on function public.complete_email_outbox(uuid, boolean, text, boolean) to service_role;
grant execute on function public.admin_retry_email(uuid) to authenticated;
revoke all on function public.email_worker_heartbeat(text, text, text, text, integer, text, boolean, text, text[]) from public, anon, authenticated;
grant execute on function public.email_worker_heartbeat(text, text, text, text, integer, text, boolean, text, text[]) to service_role;
revoke all on function public.admin_set_emails_paused(boolean, boolean, text) from public, anon;
grant execute on function public.admin_set_emails_paused(boolean, boolean, text) to authenticated;
revoke all on function public.admin_queue_test_email(text, text, jsonb, jsonb) from public, anon;
grant execute on function public.admin_queue_test_email(text, text, jsonb, jsonb) to authenticated;
revoke all on function public.email_unsubscribe(uuid) from public;
grant execute on function public.email_unsubscribe(uuid) to anon, authenticated;
