-- Creator profile completeness (mentor_profiles.profile_completeness, 0-100).
-- 10 public profile fields, 10% each:
--   profile photo, specialization, bio, category, years of experience,
--   price per hour, skills, location, cover image, at least one social link.
-- Kept up to date automatically when the creator edits their profile or photo.
-- Safe to run more than once.

-- ── The calculation ─────────────────────────────────────────────────────────
create or replace function public.creator_profile_completeness(m public.mentor_profiles)
returns smallint
language sql
stable
security definer
set search_path = public
as $$
  select (10 * (
      coalesce((select nullif(btrim(p.avatar_url), '') is not null from public.profiles p where p.id = m.id), false)::int
    + (nullif(btrim(m.specialization), '') is not null)::int
    + (nullif(btrim(m.bio), '') is not null)::int
    + (nullif(btrim(m.category), '') is not null)::int
    + (coalesce(m.experience_years, 0) > 0)::int
    + (coalesce(m.price_per_hour, 0) > 0)::int
    + (coalesce(cardinality(m.skills), 0) > 0)::int
    + (nullif(btrim(m.location), '') is not null)::int
    + (nullif(btrim(m.cover_image_url), '') is not null)::int
    + (coalesce(
        nullif(btrim(m.linkedin_url), ''),
        nullif(btrim(m.instagram_url), ''),
        nullif(btrim(m.youtube_url), ''),
        nullif(btrim(m.x_url), ''),
        nullif(btrim(m.twitter_url), ''),
        nullif(btrim(m.website), '')
      ) is not null)::int
  ))::smallint;
$$;

comment on function public.creator_profile_completeness(public.mentor_profiles) is
  'Profile completeness 0-100: 10% each for photo, specialization, bio, category, experience, price, skills, location, cover image, social link.';

-- ── Recalculate whenever the creator's profile row changes ──────────────────
-- Runs after mentor_profiles_protect_email_tracking (same-timing triggers fire in
-- name order), so the creator can't overwrite the value themselves.
create or replace function public.set_creator_profile_completeness()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.profile_completeness := public.creator_profile_completeness(new);
  return new;
end;
$$;

drop trigger if exists mentor_profiles_set_profile_completeness on public.mentor_profiles;
create trigger mentor_profiles_set_profile_completeness
  before insert or update on public.mentor_profiles
  for each row execute function public.set_creator_profile_completeness();

-- ── Recalculate when the profile photo changes (it lives on profiles) ───────
create or replace function public.refresh_creator_completeness_from_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.mentor_profiles m
  set profile_completeness = public.creator_profile_completeness(m)
  where m.id = new.id
    and m.profile_completeness is distinct from public.creator_profile_completeness(m);
  return null;
end;
$$;

drop trigger if exists profiles_refresh_creator_completeness on public.profiles;
create trigger profiles_refresh_creator_completeness
  after update of avatar_url on public.profiles
  for each row
  when (old.avatar_url is distinct from new.avatar_url)
  execute function public.refresh_creator_completeness_from_profile();

revoke all on function public.creator_profile_completeness(public.mentor_profiles) from public, anon, authenticated;
revoke all on function public.set_creator_profile_completeness() from public, anon, authenticated;
revoke all on function public.refresh_creator_completeness_from_profile() from public, anon, authenticated;

-- ── Fill in existing creators ───────────────────────────────────────────────
-- Writes only profile_completeness (currently empty); no other column changes.
update public.mentor_profiles m
set profile_completeness = public.creator_profile_completeness(m)
where m.profile_completeness is distinct from public.creator_profile_completeness(m);
