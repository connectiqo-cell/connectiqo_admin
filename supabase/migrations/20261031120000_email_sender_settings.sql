-- Lets admins edit the sender details from the admin panel (Email Triggers → Setup).
-- Empty = use the value from the worker's .env. The mail server login and password are
-- deliberately not here: they stay in .env. Requires 20261031000000. Safe to run more than once.

alter table public.email_trigger_settings
  add column if not exists sender_name text
    check (sender_name is null or (length(sender_name) between 1 and 100 and sender_name !~ '[\r\n]')),
  add column if not exists sender_email text
    check (sender_email is null or sender_email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  add column if not exists reply_to text
    check (reply_to is null or reply_to ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  add column if not exists support_email text
    check (support_email is null or support_email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$');

-- The return type changes, so the function has to be recreated.
drop function if exists public.email_worker_settings();

-- Read by the worker on every polling cycle (service role only).
create function public.email_worker_settings()
returns table (
  sending_mode text,
  test_recipients text[],
  sender_name text,
  sender_email text,
  reply_to text,
  support_email text
)
language sql
stable
security definer
set search_path = public
as $$
  select s.sending_mode, s.test_recipients, s.sender_name, s.sender_email, s.reply_to, s.support_email
  from public.email_trigger_settings s
  where s.id;
$$;

revoke all on function public.email_worker_settings() from public, anon, authenticated;
grant execute on function public.email_worker_settings() to service_role;

notify pgrst, 'reload schema';
