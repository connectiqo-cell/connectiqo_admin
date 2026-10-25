-- Email tracking.
-- Creators: new columns on mentor_profiles (existing columns/values untouched).
-- Brands: new table brand_email_status, one row per brand.
-- Safe to run more than once.

-- ── Creators ────────────────────────────────────────────────────────────────
alter table public.mentor_profiles
  add column if not exists greeting_mail_sent boolean not null default false,
  add column if not exists greeting_mail_sent_at timestamptz,
  add column if not exists profile_completeness smallint
    check (profile_completeness between 0 and 100),
  add column if not exists open_slots_mail_count integer not null default 0
    check (open_slots_mail_count >= 0),
  add column if not exists last_open_slots_mail_at timestamptz;

comment on column public.mentor_profiles.greeting_mail_sent is 'Welcome email sent after the creator signed up.';
comment on column public.mentor_profiles.greeting_mail_sent_at is 'When the welcome email was sent.';
comment on column public.mentor_profiles.profile_completeness is 'Profile completeness in percent (0-100); null until first calculated.';
comment on column public.mentor_profiles.open_slots_mail_count is 'Number of "session booked" emails sent to this creator.';
comment on column public.mentor_profiles.last_open_slots_mail_at is 'When the last "session booked" email was sent.';

-- Mentors may update their own row, so stop them from changing the email-tracking
-- columns themselves. Admins and backend (service role / postgres) are unaffected.
create or replace function public.protect_mentor_email_tracking()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated') and not public.is_admin() then
    if tg_op = 'INSERT' then
      new.greeting_mail_sent := false;
      new.greeting_mail_sent_at := null;
      new.profile_completeness := null;
      new.open_slots_mail_count := 0;
      new.last_open_slots_mail_at := null;
    else
      new.greeting_mail_sent := old.greeting_mail_sent;
      new.greeting_mail_sent_at := old.greeting_mail_sent_at;
      new.profile_completeness := old.profile_completeness;
      new.open_slots_mail_count := old.open_slots_mail_count;
      new.last_open_slots_mail_at := old.last_open_slots_mail_at;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists mentor_profiles_protect_email_tracking on public.mentor_profiles;
create trigger mentor_profiles_protect_email_tracking
  before insert or update on public.mentor_profiles
  for each row execute function public.protect_mentor_email_tracking();

-- ── Brands ──────────────────────────────────────────────────────────────────
create table if not exists public.brand_email_status (
  company_id uuid primary key references public.profiles(id) on delete cascade,
  campaign_launch_status text not null default 'not_launched'
    check (campaign_launch_status in ('not_launched', 'launched')),
  greeting_mail_sent boolean not null default false,
  greeting_mail_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.brand_email_status is 'Email tracking per brand (company_id = brand_profiles.id).';
comment on column public.brand_email_status.campaign_launch_status is 'launched once the brand has a published, closed or completed campaign (drafts do not count). Kept in sync by a trigger on campaigns.';
comment on column public.brand_email_status.greeting_mail_sent is 'Welcome email sent after the brand signed up.';

alter table public.brand_email_status enable row level security;

drop policy if exists "Admins read brand email status" on public.brand_email_status;
create policy "Admins read brand email status" on public.brand_email_status
  for select to authenticated using (public.is_admin());

drop policy if exists "Admins update brand email status" on public.brand_email_status;
create policy "Admins update brand email status" on public.brand_email_status
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.brand_campaign_launch_status(p_brand_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (
      select 1 from public.campaigns
      where brand_id = p_brand_id and status in ('published', 'closed', 'completed')
    ) then 'launched'
    else 'not_launched'
  end;
$$;

-- New brand signs up → create its tracking row.
create or replace function public.create_brand_email_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.brand_email_status (company_id, campaign_launch_status)
  values (new.id, public.brand_campaign_launch_status(new.id))
  on conflict (company_id) do nothing;
  return new;
end;
$$;

drop trigger if exists brand_profiles_create_email_status on public.brand_profiles;
create trigger brand_profiles_create_email_status
  after insert on public.brand_profiles
  for each row execute function public.create_brand_email_status();

-- Campaign created / status changed / deleted → refresh the brand's launch status.
create or replace function public.sync_brand_campaign_launch_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_brand uuid := coalesce(new.brand_id, old.brand_id);
begin
  update public.brand_email_status
  set campaign_launch_status = public.brand_campaign_launch_status(v_brand),
      updated_at = now()
  where company_id = v_brand
    and campaign_launch_status is distinct from public.brand_campaign_launch_status(v_brand);
  return null;
end;
$$;

drop trigger if exists campaigns_sync_brand_launch_status on public.campaigns;
create trigger campaigns_sync_brand_launch_status
  after insert or delete or update of status, brand_id on public.campaigns
  for each row execute function public.sync_brand_campaign_launch_status();

revoke all on function public.brand_campaign_launch_status(uuid) from public, anon, authenticated;
revoke all on function public.create_brand_email_status() from public, anon, authenticated;
revoke all on function public.sync_brand_campaign_launch_status() from public, anon, authenticated;
revoke all on function public.protect_mentor_email_tracking() from public, anon, authenticated;

-- Existing brands get their row (new table, so nothing existing changes).
insert into public.brand_email_status (company_id, campaign_launch_status)
select bp.id, public.brand_campaign_launch_status(bp.id)
from public.brand_profiles bp
on conflict (company_id) do nothing;
