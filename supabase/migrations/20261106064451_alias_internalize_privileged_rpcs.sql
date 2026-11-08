-- Move privileged implementation routines into the non-exposed private schema.
-- Public PostgREST functions are narrow SECURITY INVOKER wrappers; authorization
-- stays inside the private SECURITY DEFINER implementation functions.
alter function public.complete_alias_onboarding(text, text, text, smallint, text) set schema private;
alter function public.create_alias_invite(integer, integer) set schema private;
alter function public.get_post_stats(uuid[]) set schema private;
alter function public.moderate_post(uuid, text) set schema private;
alter function public.moderate_comment(uuid, text) set schema private;
alter function public.update_alias_report_status(uuid, text) set schema private;
alter function public.moderate_reported_author(uuid, integer) set schema private;

grant usage on schema private to anon, authenticated;
grant execute on function private.complete_alias_onboarding(text, text, text, smallint, text) to authenticated;
grant execute on function private.create_alias_invite(integer, integer) to authenticated;
grant execute on function private.get_post_stats(uuid[]) to anon, authenticated;
grant execute on function private.moderate_post(uuid, text) to authenticated;
grant execute on function private.moderate_comment(uuid, text) to authenticated;
grant execute on function private.update_alias_report_status(uuid, text) to authenticated;
grant execute on function private.moderate_reported_author(uuid, integer) to authenticated;

create or replace function public.complete_alias_onboarding(
  p_invite_code text, p_real_name text, p_nickname text, p_age smallint, p_gender text
)
returns boolean language sql security invoker set search_path = ''
as $$ select private.complete_alias_onboarding(p_invite_code, p_real_name, p_nickname, p_age, p_gender); $$;

create or replace function public.create_alias_invite(
  p_max_uses integer default 1, p_expires_in_days integer default 7
)
returns text language sql security invoker set search_path = ''
as $$ select private.create_alias_invite(p_max_uses, p_expires_in_days); $$;

create or replace function public.get_post_stats(p_post_ids uuid[])
returns table (post_id uuid, like_count bigint, comment_count bigint)
language sql stable security invoker set search_path = ''
as $$ select * from private.get_post_stats(p_post_ids); $$;

create or replace function public.moderate_post(p_post_id uuid, p_action text)
returns boolean language sql security invoker set search_path = ''
as $$ select private.moderate_post(p_post_id, p_action); $$;

create or replace function public.moderate_comment(p_comment_id uuid, p_action text)
returns boolean language sql security invoker set search_path = ''
as $$ select private.moderate_comment(p_comment_id, p_action); $$;

create or replace function public.update_alias_report_status(p_report_id uuid, p_status text)
returns boolean language sql security invoker set search_path = ''
as $$ select private.update_alias_report_status(p_report_id, p_status); $$;

create or replace function public.moderate_reported_author(p_report_id uuid, p_days integer)
returns boolean language sql security invoker set search_path = ''
as $$ select private.moderate_reported_author(p_report_id, p_days); $$;

revoke all on function public.complete_alias_onboarding(text, text, text, smallint, text) from public, anon, authenticated;
revoke all on function public.create_alias_invite(integer, integer) from public, anon, authenticated;
revoke all on function public.get_post_stats(uuid[]) from public, anon, authenticated;
revoke all on function public.moderate_post(uuid, text) from public, anon, authenticated;
revoke all on function public.moderate_comment(uuid, text) from public, anon, authenticated;
revoke all on function public.update_alias_report_status(uuid, text) from public, anon, authenticated;
revoke all on function public.moderate_reported_author(uuid, integer) from public, anon, authenticated;

grant execute on function public.complete_alias_onboarding(text, text, text, smallint, text) to authenticated;
grant execute on function public.create_alias_invite(integer, integer) to authenticated;
grant execute on function public.get_post_stats(uuid[]) to anon, authenticated;
grant execute on function public.moderate_post(uuid, text) to authenticated;
grant execute on function public.moderate_comment(uuid, text) to authenticated;
grant execute on function public.update_alias_report_status(uuid, text) to authenticated;
grant execute on function public.moderate_reported_author(uuid, integer) to authenticated;
notify pgrst, 'reload schema';
