-- Makes the mail server editable for any provider (Gmail, Hostinger, a company domain, ...).
--
-- Host, port, login and password are saved together, encrypted in Supabase Vault. They can only
-- be changed together, so an admin can't send the saved password to a different server without
-- knowing it. The Sender Email is the login. The worker also reports its reply-to and support
-- addresses, so the panel can show what is really in use. Requires 20261031130000. Safe to run
-- more than once.

alter table public.email_worker_status
  add column if not exists reply_to text,
  add column if not exists support_email text;

-- Worker reports its state on every polling cycle (service role only).
drop function if exists public.email_worker_heartbeat(text, text, text, text, integer, text, boolean, text, text[]);
create or replace function public.email_worker_heartbeat(
  p_mode text,
  p_sender_email text,
  p_sender_name text,
  p_smtp_host text,
  p_smtp_port integer,
  p_smtp_user text,
  p_smtp_ok boolean,
  p_smtp_error text,
  p_allowed_recipients text[],
  p_reply_to text default null,
  p_support_email text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.email_worker_status as w
    (id, last_seen_at, mode, sender_email, sender_name, smtp_host, smtp_port, smtp_user, smtp_ok, smtp_error, allowed_recipients, reply_to, support_email)
  values
    (true, now(), p_mode, p_sender_email, p_sender_name, p_smtp_host, p_smtp_port, p_smtp_user, p_smtp_ok, left(p_smtp_error, 1000), p_allowed_recipients, p_reply_to, p_support_email)
  on conflict (id) do update set
    last_seen_at = now(), mode = excluded.mode, sender_email = excluded.sender_email,
    sender_name = excluded.sender_name, smtp_host = excluded.smtp_host, smtp_port = excluded.smtp_port,
    smtp_user = excluded.smtp_user, smtp_ok = excluded.smtp_ok, smtp_error = excluded.smtp_error,
    allowed_recipients = excluded.allowed_recipients, reply_to = excluded.reply_to,
    support_email = excluded.support_email;
end;
$$;

drop function if exists public.admin_set_email_smtp_login(text, text, text);

create or replace function public.admin_set_email_smtp(
  p_host text,
  p_port integer,
  p_user text,
  p_password text,
  p_operator text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_host text := lower(btrim(coalesce(p_host, '')));
  v_user text := btrim(coalesce(p_user, ''));
  v_password text := coalesce(p_password, '');
  v_secret text;
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Access denied: admin only';
  end if;
  if v_host !~ '^[a-z0-9.-]+$' then
    raise exception 'Enter a valid host';
  end if;
  if p_port is null or p_port not between 1 and 65535 then
    raise exception 'Enter a valid port';
  end if;
  if v_user !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'Enter a valid sender email';
  end if;
  if btrim(v_password) = '' then
    raise exception 'Enter the password';
  end if;
  -- Google shows App Passwords with spaces that aren't part of them; other providers' can have spaces.
  if v_host like '%gmail.com' then
    v_password := regexp_replace(v_password, '\s', '', 'g');
  end if;

  v_secret := jsonb_build_object('host', v_host, 'port', p_port, 'user', v_user, 'pass', v_password)::text;
  select s.id into v_id from vault.secrets s where s.name = 'email_smtp_login';
  if v_id is null then
    perform vault.create_secret(v_secret, 'email_smtp_login', 'Mail server login for the email worker');
  else
    perform vault.update_secret(v_id, v_secret);
  end if;

  update public.email_trigger_settings
  set sender_email = v_user,
      smtp_login_saved_at = now(),
      smtp_login_saved_by = nullif(btrim(coalesce(p_operator, '')), '')
  where id;
end;
$$;

-- The return type changes, so the function has to be recreated.
drop function if exists public.email_worker_smtp_login();

-- Read by the worker on every polling cycle (service role only).
create function public.email_worker_smtp_login()
returns table (smtp_host text, smtp_port integer, smtp_user text, smtp_pass text)
language sql
stable
security definer
set search_path = public
as $$
  select
    d.decrypted_secret::jsonb ->> 'host',
    (d.decrypted_secret::jsonb ->> 'port')::integer,
    d.decrypted_secret::jsonb ->> 'user',
    d.decrypted_secret::jsonb ->> 'pass'
  from vault.decrypted_secrets d
  where d.name = 'email_smtp_login';
$$;

revoke all on function public.email_worker_heartbeat(text, text, text, text, integer, text, boolean, text, text[], text, text) from public, anon, authenticated;
grant execute on function public.email_worker_heartbeat(text, text, text, text, integer, text, boolean, text, text[], text, text) to service_role;
revoke all on function public.admin_set_email_smtp(text, integer, text, text, text) from public, anon;
grant execute on function public.admin_set_email_smtp(text, integer, text, text, text) to authenticated;
revoke all on function public.email_worker_smtp_login() from public, anon, authenticated;
grant execute on function public.email_worker_smtp_login() to service_role;

notify pgrst, 'reload schema';
