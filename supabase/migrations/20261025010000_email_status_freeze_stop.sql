-- Email status: admins can freeze, unfreeze or permanently stop emails to a creator or brand.
-- This only controls emails; the user's account and app access are unaffected.
-- Adds new columns only (existing columns/values untouched). Safe to run more than once.
-- Run after 20261025000000_email_tracking_creators_and_brands.sql.

-- ── Columns ─────────────────────────────────────────────────────────────────
-- active  = emails go out as normal
-- frozen  = paused; resumes on email_frozen_until (if set) or when an admin unfreezes
-- stopped = never email again (like an unsubscribe); an admin can still reactivate

alter table public.mentor_profiles
  add column if not exists email_status text not null default 'active'
    check (email_status in ('active', 'frozen', 'stopped')),
  add column if not exists email_frozen_until timestamptz,
  add column if not exists email_status_reason text,
  add column if not exists email_status_changed_at timestamptz,
  add column if not exists email_status_changed_by text;

alter table public.brand_email_status
  add column if not exists email_status text not null default 'active'
    check (email_status in ('active', 'frozen', 'stopped')),
  add column if not exists email_frozen_until timestamptz,
  add column if not exists email_status_reason text,
  add column if not exists email_status_changed_at timestamptz,
  add column if not exists email_status_changed_by text;

comment on column public.mentor_profiles.email_status is 'active | frozen | stopped. Only controls emails, not the account.';
comment on column public.mentor_profiles.email_frozen_until is 'When a freeze ends by itself; null = until an admin unfreezes.';
comment on column public.mentor_profiles.email_status_reason is 'Why the admin froze/stopped emails.';
comment on column public.brand_email_status.email_status is 'active | frozen | stopped. Only controls emails, not the account.';
comment on column public.brand_email_status.email_frozen_until is 'When a freeze ends by itself; null = until an admin unfreezes.';
comment on column public.brand_email_status.email_status_reason is 'Why the admin froze/stopped emails.';

-- ── Keep mentors from changing these columns on their own row ───────────────
-- Same trigger as the previous migration, now also covering the email status columns.
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
      new.email_status := 'active';
      new.email_frozen_until := null;
      new.email_status_reason := null;
      new.email_status_changed_at := null;
      new.email_status_changed_by := null;
    else
      new.greeting_mail_sent := old.greeting_mail_sent;
      new.greeting_mail_sent_at := old.greeting_mail_sent_at;
      new.profile_completeness := old.profile_completeness;
      new.open_slots_mail_count := old.open_slots_mail_count;
      new.last_open_slots_mail_at := old.last_open_slots_mail_at;
      new.email_status := old.email_status;
      new.email_frozen_until := old.email_frozen_until;
      new.email_status_reason := old.email_status_reason;
      new.email_status_changed_at := old.email_status_changed_at;
      new.email_status_changed_by := old.email_status_changed_by;
    end if;
  end if;
  return new;
end;
$$;

-- ── Can we email this person right now? (for whatever sends the emails) ─────
create or replace function public.email_sending_allowed(p_status text, p_frozen_until timestamptz)
returns boolean
language sql
stable
as $$
  select case
    when p_status = 'active' then true
    when p_status = 'frozen' then p_frozen_until is not null and p_frozen_until <= now()
    else false
  end;
$$;

-- ── Admin action: freeze / unfreeze / stop ──────────────────────────────────
-- p_target: 'creator' (mentor_profiles.id) or 'brand' (brand_email_status.company_id)
-- p_status: 'active' (unfreeze / reactivate), 'frozen' or 'stopped'
create or replace function public.admin_set_email_status(
  p_target text,
  p_id uuid,
  p_status text,
  p_frozen_until timestamptz default null,
  p_reason text default null,
  p_operator text default null
)
returns table (
  email_status text,
  email_frozen_until timestamptz,
  email_status_reason text,
  email_status_changed_at timestamptz,
  email_status_changed_by text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_until timestamptz := case when p_status = 'frozen' then p_frozen_until else null end;
  v_reason text := case when p_status = 'active' then null else nullif(btrim(coalesce(p_reason, '')), '') end;
  v_operator text := nullif(btrim(coalesce(p_operator, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Access denied: admin only';
  end if;
  if p_status not in ('active', 'frozen', 'stopped') then
    raise exception 'Unknown email status: %', p_status;
  end if;
  if v_until is not null and v_until <= now() then
    raise exception 'Freeze end time must be in the future';
  end if;

  if p_target = 'creator' then
    return query
    update public.mentor_profiles m
    set email_status = p_status,
        email_frozen_until = v_until,
        email_status_reason = v_reason,
        email_status_changed_at = now(),
        email_status_changed_by = v_operator
    where m.id = p_id
    returning m.email_status, m.email_frozen_until, m.email_status_reason,
              m.email_status_changed_at, m.email_status_changed_by;
  elsif p_target = 'brand' then
    return query
    update public.brand_email_status b
    set email_status = p_status,
        email_frozen_until = v_until,
        email_status_reason = v_reason,
        email_status_changed_at = now(),
        email_status_changed_by = v_operator,
        updated_at = now()
    where b.company_id = p_id
    returning b.email_status, b.email_frozen_until, b.email_status_reason,
              b.email_status_changed_at, b.email_status_changed_by;
  else
    raise exception 'Unknown target: % (use creator or brand)', p_target;
  end if;

  if not found then
    raise exception '% not found', initcap(p_target);
  end if;
end;
$$;

revoke all on function public.admin_set_email_status(text, uuid, text, timestamptz, text, text) from public, anon;
grant execute on function public.admin_set_email_status(text, uuid, text, timestamptz, text, text) to authenticated;
revoke all on function public.protect_mentor_email_tracking() from public, anon, authenticated;
