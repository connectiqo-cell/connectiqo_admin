-- Queues email around the mailbox's daily limit (a Gmail account allows about 500 a day), and
-- extends the profile reminder to creators who signed up before the emails started.
--
-- daily_send_limit: once this many emails went out in the last 24 hours, routine emails wait in
-- the queue and go out when there's room. Booking and campaign emails go first and keep going,
-- which is why the default leaves a margin below 500. Test emails aren't limited.
--
-- profile_reminder_old_daily_limit: how many older creators join the reminders each day, so they
-- aren't all emailed at once and no reminder queues up with an out-of-date percentage. Creators who
-- signed up since the launch aren't limited. 0 turns reminders for older creators off.
--
-- Requires 20261031150000. Safe to run more than once.

alter table public.email_trigger_settings
  add column if not exists daily_send_limit integer not null default 400 check (daily_send_limit >= 1),
  add column if not exists profile_reminder_old_daily_limit integer not null default 50
    check (profile_reminder_old_daily_limit >= 0);

create index if not exists email_outbox_sent_at_idx on public.email_outbox (sent_at) where status = 'sent';

-- Same rules as before, except that older creators are now included, up to the daily limit:
-- fewest reminders so far first, then the profiles closest to finished.
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
    select eligible.id, eligible.profile_completeness
    from (
      select m.id, m.profile_completeness,
             p.created_at < s.creator_emails_enabled_at as is_old,
             row_number() over (
               partition by p.created_at < s.creator_emails_enabled_at
               order by prev.n, coalesce(m.profile_completeness, 0) desc, p.created_at
             ) as position
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
        and p.created_at <= now() - make_interval(days => s.profile_reminder_after_days)
        and coalesce(m.profile_completeness, 0) <= s.profile_reminder_stop_above
        and not exists (
          select 1 from public.email_preferences ep
          where ep.user_id = m.id and ep.unsubscribed_at is not null
        )
        and prev.n < s.profile_reminder_max
        and (prev.last_at is null or prev.last_at <= now() - make_interval(days => s.profile_reminder_every_days))
    ) eligible
    where not eligible.is_old or eligible.position <= s.profile_reminder_old_daily_limit
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

-- Same rules as before, plus the daily limit. Rows left out stay 'pending' for a later cycle.
create or replace function public.claim_email_outbox(p_limit integer default 10)
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
  v_room integer;
begin
  select coalesce(ets.emails_paused, false),
         ets.daily_send_limit - (
           select count(*) from public.email_outbox sent
           where sent.status = 'sent' and sent.sent_at > now() - interval '24 hours' and not sent.is_test
         )
    into v_paused, v_room
    from public.email_trigger_settings ets where ets.id;
  v_paused := coalesce(v_paused, false);
  v_room := coalesce(v_room, 0);

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
    order by o.is_test desc, public.email_template_is_essential(o.template) desc, o.created_at
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
    elsif not r.is_test and not public.email_template_is_essential(r.template) and v_room <= 0 then
      continue;  -- Daily limit reached: stays pending.
    else
      if not r.is_test then
        v_room := v_room - 1;
      end if;

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

revoke all on function public.enqueue_creator_profile_reminders() from public, anon, authenticated;
revoke all on function public.claim_email_outbox(integer) from public, anon, authenticated;
grant execute on function public.claim_email_outbox(integer) to service_role;
