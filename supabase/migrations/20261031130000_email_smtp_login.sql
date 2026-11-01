-- Lets admins set the Gmail login and App Password from the admin panel (Email Triggers → Setup).
--
-- The login is kept encrypted in Supabase Vault, as a secret named 'email_smtp_login'. Admins can
-- replace or remove it but can't read it back; only the worker's service role can. With no saved
-- login, the worker uses SMTP_USER and SMTP_PASS from its .env. Safe to run more than once.

alter table public.email_trigger_settings
  add column if not exists smtp_login_saved_at timestamptz,
  add column if not exists smtp_login_saved_by text;

create or replace function public.admin_set_email_smtp_login(p_user text, p_password text, p_operator text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user text := lower(btrim(coalesce(p_user, '')));
  -- Google shows App Passwords with spaces; they aren't part of the password.
  v_password text := regexp_replace(coalesce(p_password, ''), '\s', '', 'g');
  v_secret text;
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Access denied: admin only';
  end if;
  if v_user !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'Enter a valid Gmail address';
  end if;
  if v_password = '' then
    raise exception 'Enter the App Password';
  end if;

  v_secret := jsonb_build_object('user', v_user, 'pass', v_password)::text;
  select s.id into v_id from vault.secrets s where s.name = 'email_smtp_login';
  if v_id is null then
    perform vault.create_secret(v_secret, 'email_smtp_login', 'Gmail login for the email worker');
  else
    perform vault.update_secret(v_id, v_secret);
  end if;

  update public.email_trigger_settings
  set smtp_login_saved_at = now(),
      smtp_login_saved_by = nullif(btrim(coalesce(p_operator, '')), '')
  where id;
end;
$$;

create or replace function public.admin_clear_email_smtp_login()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Access denied: admin only';
  end if;
  delete from vault.secrets where name = 'email_smtp_login';
  update public.email_trigger_settings
  set smtp_login_saved_at = null, smtp_login_saved_by = null
  where id;
end;
$$;

-- Dropped first so this file can still be re-run after 20261031140000 changes the return type.
drop function if exists public.email_worker_smtp_login();

-- Read by the worker on every polling cycle (service role only).
create function public.email_worker_smtp_login()
returns table (smtp_user text, smtp_pass text)
language sql
stable
security definer
set search_path = public
as $$
  select d.decrypted_secret::jsonb ->> 'user', d.decrypted_secret::jsonb ->> 'pass'
  from vault.decrypted_secrets d
  where d.name = 'email_smtp_login';
$$;

revoke all on function public.admin_set_email_smtp_login(text, text, text) from public, anon;
grant execute on function public.admin_set_email_smtp_login(text, text, text) to authenticated;
revoke all on function public.admin_clear_email_smtp_login() from public, anon;
grant execute on function public.admin_clear_email_smtp_login() to authenticated;
revoke all on function public.email_worker_smtp_login() from public, anon, authenticated;
grant execute on function public.email_worker_smtp_login() to service_role;

notify pgrst, 'reload schema';
