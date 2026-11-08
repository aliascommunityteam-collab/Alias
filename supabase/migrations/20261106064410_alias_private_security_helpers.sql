-- Keep security-definer lookups in the non-exposed private schema. Public helpers
-- are invoker wrappers so clients can ask about their own session without exposing
-- a privileged function endpoint.
create or replace function private.alias_has_active_invite()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from private.alias_invite_redemptions r
    where r.user_id = (select auth.uid())
  );
$$;

create or replace function private.alias_is_moderator()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from private.alias_moderators m
    where m.user_id = (select auth.uid())
  );
$$;

create or replace function private.alias_user_is_suspended()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from private.alias_suspensions s
    where s.user_id = (select auth.uid())
      and (s.suspended_until is null or s.suspended_until > now())
  );
$$;

grant usage on schema private to authenticated;
revoke all on function private.alias_has_active_invite() from public, anon, authenticated;
revoke all on function private.alias_is_moderator() from public, anon, authenticated;
revoke all on function private.alias_user_is_suspended() from public, anon, authenticated;
grant execute on function private.alias_has_active_invite() to authenticated;
grant execute on function private.alias_is_moderator() to authenticated;
grant execute on function private.alias_user_is_suspended() to authenticated;

create or replace function public.alias_has_active_invite()
returns boolean language sql stable security invoker set search_path = ''
as $$ select private.alias_has_active_invite(); $$;
create or replace function public.alias_is_moderator()
returns boolean language sql stable security invoker set search_path = ''
as $$ select private.alias_is_moderator(); $$;
create or replace function public.alias_user_is_suspended()
returns boolean language sql stable security invoker set search_path = ''
as $$ select private.alias_user_is_suspended(); $$;

revoke all on function public.alias_has_active_invite() from public, anon, authenticated;
revoke all on function public.alias_is_moderator() from public, anon, authenticated;
revoke all on function public.alias_user_is_suspended() from public, anon, authenticated;
grant execute on function public.alias_has_active_invite() to authenticated;
grant execute on function public.alias_is_moderator() to authenticated;
grant execute on function public.alias_user_is_suspended() to authenticated;
notify pgrst, 'reload schema';
