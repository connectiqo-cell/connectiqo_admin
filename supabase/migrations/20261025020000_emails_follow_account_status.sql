-- Emails follow the account: whether someone may be emailed now comes only from the
-- account state the admin already controls (login freeze, creator freeze, delete).
-- Replaces the separate email freeze/stop from 20261025010000, which is removed here.
-- Run after 20261025010000_email_status_freeze_stop.sql. Safe to run more than once.

-- ── Can we email this user right now? ───────────────────────────────────────
-- p_audience: 'creator' or 'brand'.
--   deleted (profiles.deleted_at set or profile gone) → never
--   login frozen (profiles.is_frozen)                  → no
--   creator frozen (mentor_profiles, still in effect)   → no creator emails
create or replace function public.can_email_user(p_user_id uuid, p_audience text default 'creator')
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select p.deleted_at is null
       and not coalesce(p.is_frozen, false)
       and not (
         p_audience = 'creator'
         and exists (
           select 1 from public.mentor_profiles m
           where m.id = p.id and public.mentor_freeze_is_active(m.mentor_frozen, m.mentor_frozen_until)
         )
       )
    from public.profiles p
    where p.id = p_user_id
  ), false);
$$;

comment on function public.can_email_user(uuid, text) is
  'True when the user may be emailed: not deleted, not login-frozen, and (for creators) not creator-frozen.';

revoke all on function public.can_email_user(uuid, text) from public, anon, authenticated;

-- ── Remove the separate email freeze/stop (no longer used) ──────────────────
-- Recreate the protection trigger without the email_status columns first,
-- otherwise dropping the columns would break it.
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

drop function if exists public.admin_set_email_status(text, uuid, text, timestamptz, text, text);
drop function if exists public.email_sending_allowed(text, timestamptz);

alter table public.mentor_profiles
  drop column if exists email_status,
  drop column if exists email_frozen_until,
  drop column if exists email_status_reason,
  drop column if exists email_status_changed_at,
  drop column if exists email_status_changed_by;

alter table public.brand_email_status
  drop column if exists email_status,
  drop column if exists email_frozen_until,
  drop column if exists email_status_reason,
  drop column if exists email_status_changed_at,
  drop column if exists email_status_changed_by;
