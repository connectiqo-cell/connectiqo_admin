-- Automatic emails to companies (brands), sent by the same worker and outbox as creator emails:
--
--   brand_welcome            a brand profile is created
--   brand_campaign_reminder  no campaign launched after 3 days; 3 times at most, 3 days apart (daily job)
--   brand_campaign_live      a campaign is published, once per campaign
--   brand_new_applications   one summary a day of applications since the last one (daily job)
--   brand_new_submission     a creator's video is ready to review (status becomes 'submitted')
--
-- Unsubscribing stops the welcome and the reminder; the other three are about the brand's own
-- campaigns and still go out. Emails go to the login address (profiles.email): work_email isn't
-- verified. Brands and campaigns from before this migration are left alone. Queueing never blocks
-- the action that caused it. Requires 20261026000000. Safe to run more than once.

alter table public.email_trigger_settings
  add column if not exists brand_emails_enabled_at timestamptz not null default now(),
  add column if not exists brand_reminder_after_days integer not null default 3 check (brand_reminder_after_days >= 0),
  add column if not exists brand_reminder_every_days integer not null default 3 check (brand_reminder_every_days >= 1),
  add column if not exists brand_reminder_max integer not null default 3 check (brand_reminder_max >= 0);

insert into public.email_templates (template, audience) values
  ('brand_welcome', 'brand'),
  ('brand_campaign_reminder', 'brand'),
  ('brand_campaign_live', 'brand'),
  ('brand_new_applications', 'brand'),
  ('brand_new_submission', 'brand')
on conflict (template) do nothing;

create or replace function public.email_template_is_essential(p_template text)
returns boolean
language sql
immutable
as $$
  select p_template in ('creator_session_booked', 'brand_campaign_live', 'brand_new_applications', 'brand_new_submission')
$$;

-- ── 1. Welcome: a brand profile is created ──────────────────────────────────
create or replace function public.trg_email_brand_welcome()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform public.enqueue_email('brand', 'brand_welcome', new.id,
                                 jsonb_build_object('company_name', new.company_name),
                                 'brand_welcome:' || new.id);
  exception when others then
    raise warning 'brand_welcome email not queued: %', sqlerrm;  -- never block signup
  end;
  return null;
end;
$$;

drop trigger if exists brand_profiles_email_welcome on public.brand_profiles;
create trigger brand_profiles_email_welcome
  after insert on public.brand_profiles
  for each row execute function public.trg_email_brand_welcome();

-- ── 2. Campaign is live: a campaign created since launch is published ───────
create or replace function public.trg_email_brand_campaign_live()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'published' or (tg_op = 'UPDATE' and old.status is not distinct from 'published') then
    return null;
  end if;

  begin
    if new.created_at >= (select s.brand_emails_enabled_at from public.email_trigger_settings s where s.id) then
      perform public.enqueue_email('brand', 'brand_campaign_live', new.brand_id,
        jsonb_build_object(
          'company_name', (select b.company_name from public.brand_profiles b where b.id = new.brand_id),
          'campaign_id', new.id,
          'campaign_title', new.title
        ),
        'brand_campaign_live:' || new.id);
    end if;
  exception when others then
    raise warning 'brand_campaign_live email not queued: %', sqlerrm;  -- never block publishing
  end;
  return null;
end;
$$;

drop trigger if exists campaigns_email_live on public.campaigns;
create trigger campaigns_email_live
  after insert or update of status on public.campaigns
  for each row execute function public.trg_email_brand_campaign_live();

-- ── 3. New submission: the video finished processing and is ready to review ─
-- Videos go processing -> submitted once watermarked; a resubmission goes through processing
-- again, so it is a new event. A brand's own status changes never come from 'processing'.
create or replace function public.trg_email_brand_new_submission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_brand uuid;
  v_payload jsonb;
begin
  if new.status <> 'submitted' or (tg_op = 'UPDATE' and old.status is distinct from 'processing') then
    return null;
  end if;

  begin
    select c.brand_id,
           jsonb_build_object(
             'company_name', b.company_name,
             'campaign_id', c.id,
             'campaign_title', c.title,
             'creator_name', cp.name
           )
      into v_brand, v_payload
      from public.campaign_applications a
      join public.campaigns c on c.id = a.campaign_id
      left join public.brand_profiles b on b.id = c.brand_id
      left join public.profiles cp on cp.id = new.creator_id
      where a.id = new.application_id;

    if v_brand is not null then
      perform public.enqueue_email('brand', 'brand_new_submission', v_brand, v_payload,
        'brand_new_submission:' || new.id || ':' || extract(epoch from clock_timestamp()));
    end if;
  exception when others then
    raise warning 'brand_new_submission email not queued: %', sqlerrm;  -- never block a submission
  end;
  return null;
end;
$$;

drop trigger if exists campaign_submissions_email_new on public.campaign_submissions;
create trigger campaign_submissions_email_new
  after insert or update of status on public.campaign_submissions
  for each row execute function public.trg_email_brand_new_submission();

-- ── 4. Reminder (daily job) ─────────────────────────────────────────────────
-- Brands that signed up after launch, at least brand_reminder_after_days ago, have never launched
-- a campaign (a draft doesn't count), haven't unsubscribed, have had fewer than brand_reminder_max
-- reminders and none in the last brand_reminder_every_days. Returns how many were queued.
create or replace function public.enqueue_brand_campaign_reminders()
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
  if s is null or s.brand_reminder_max = 0 then
    return 0;
  end if;
  if not coalesce((select t.enabled from public.email_templates t where t.template = 'brand_campaign_reminder'), true) then
    return 0;
  end if;

  for r in
    select b.id, b.company_name
    from public.brand_profiles b
    join public.profiles p on p.id = b.id
    cross join lateral (
      select count(*) as n, max(o.created_at) as last_at
      from public.email_outbox o
      where o.recipient_id = b.id
        and o.template = 'brand_campaign_reminder'
        and o.status in ('pending', 'sending', 'sent')
    ) prev
    where p.deleted_at is null
      and b.created_at >= s.brand_emails_enabled_at
      and b.created_at <= now() - make_interval(days => s.brand_reminder_after_days)
      and not exists (select 1 from public.campaigns c where c.brand_id = b.id and c.status <> 'draft')
      and not exists (
        select 1 from public.email_preferences ep
        where ep.user_id = b.id and ep.unsubscribed_at is not null
      )
      and prev.n < s.brand_reminder_max
      and (prev.last_at is null or prev.last_at <= now() - make_interval(days => s.brand_reminder_every_days))
  loop
    perform public.enqueue_email(
      'brand', 'brand_campaign_reminder', r.id,
      jsonb_build_object('company_name', r.company_name),
      'brand_campaign_reminder:' || r.id || ':' || to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD'));
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- ── 5. New applications (daily job) ─────────────────────────────────────────
-- One email per brand with applications since its last summary (or since launch). A skipped
-- summary doesn't count as sent, so those applications are in the next one. Returns how many.
create or replace function public.enqueue_brand_application_summaries()
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
  if s is null then
    return 0;
  end if;
  if not coalesce((select t.enabled from public.email_templates t where t.template = 'brand_new_applications'), true) then
    return 0;
  end if;

  for r in
    select b.id, b.company_name, totals.total, totals.campaigns
    from public.brand_profiles b
    join public.profiles p on p.id = b.id
    cross join lateral (
      select max(o.created_at) as last_at
      from public.email_outbox o
      where o.recipient_id = b.id
        and o.template = 'brand_new_applications'
        and o.status in ('pending', 'sending', 'sent')
    ) prev
    cross join lateral (
      select coalesce(sum(per.n), 0)::integer as total,
             coalesce(jsonb_agg(jsonb_build_object('title', per.title, 'count', per.n) order by per.n desc, per.title), '[]'::jsonb) as campaigns
      from (
        select c.id, c.title, count(*)::integer as n
        from public.campaigns c
        join public.campaign_applications a on a.campaign_id = c.id
        where c.brand_id = b.id
          and a.applied_at > greatest(s.brand_emails_enabled_at, prev.last_at)
        group by c.id, c.title
      ) per
    ) totals
    where p.deleted_at is null
      and totals.total > 0
  loop
    perform public.enqueue_email(
      'brand', 'brand_new_applications', r.id,
      jsonb_build_object('company_name', r.company_name, 'total', r.total, 'campaigns', r.campaigns),
      'brand_new_applications:' || r.id || ':' || to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD'));
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- Daily at 10:00 IST (04:30 UTC), like the creator reminders. Re-running replaces the jobs.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname in ('brand-campaign-reminders', 'brand-application-summaries');
    perform cron.schedule('brand-campaign-reminders', '30 4 * * *', 'select public.enqueue_brand_campaign_reminders()');
    perform cron.schedule('brand-application-summaries', '30 4 * * *', 'select public.enqueue_brand_application_summaries()');
  end if;
end;
$$;

-- ── Tracking: the brand welcome also marks brand_email_status ───────────────
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
    elsif o.template = 'brand_welcome' then
      update public.brand_email_status
      set greeting_mail_sent = true, greeting_mail_sent_at = now(), updated_at = now()
      where company_id = o.recipient_id;
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

-- ── Permissions ─────────────────────────────────────────────────────────────
revoke all on function public.trg_email_brand_welcome() from public, anon, authenticated;
revoke all on function public.trg_email_brand_campaign_live() from public, anon, authenticated;
revoke all on function public.trg_email_brand_new_submission() from public, anon, authenticated;
revoke all on function public.enqueue_brand_campaign_reminders() from public, anon, authenticated;
revoke all on function public.enqueue_brand_application_summaries() from public, anon, authenticated;
revoke all on function public.complete_email_outbox(uuid, boolean, text, boolean) from public, anon, authenticated;
grant execute on function public.complete_email_outbox(uuid, boolean, text, boolean) to service_role;
