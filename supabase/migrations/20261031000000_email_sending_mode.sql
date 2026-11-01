-- Lets admins choose who receives email from the admin panel instead of the worker's .env.
--
--   dry_run: nothing is sent; emails are closed as skipped.
--   test:    automatic emails go only to test_recipients; everyone else is skipped. Test
--            emails from the template editor go to the address typed there.
--
-- Sending to every user is deliberately not a value here: it still needs
-- SEND_TO_EVERYONE=true on the worker. Requires 20261026000000. Safe to run more than once.

alter table public.email_trigger_settings
  add column if not exists sending_mode text not null default 'test'
    check (sending_mode in ('dry_run', 'test')),
  add column if not exists test_recipients text[] not null default '{}';

-- Dropped first so this file can still be re-run after 20261031120000 changes the return type.
drop function if exists public.email_worker_settings();

-- Read by the worker on every polling cycle (service role only).
create function public.email_worker_settings()
returns table (sending_mode text, test_recipients text[])
language sql
stable
security definer
set search_path = public
as $$
  select s.sending_mode, s.test_recipients from public.email_trigger_settings s where s.id;
$$;

revoke all on function public.email_worker_settings() from public, anon, authenticated;
grant execute on function public.email_worker_settings() to service_role;
