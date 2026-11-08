-- Return false, rather than raising, for invalid invite codes so attempt records
-- commit and the per-account invite-attempt throttle cannot be bypassed by rollback.
create or replace function public.complete_alias_onboarding(
  p_invite_code text,
  p_real_name text,
  p_nickname text,
  p_age smallint,
  p_gender text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_code_hash bytea;
  v_invite_id uuid;
  v_attempt_count integer;
  v_real_name text := btrim(coalesce(p_real_name, ''));
  v_nickname text := btrim(coalesce(p_nickname, ''));
begin
  if v_user_id is null then raise exception 'Create an anonymous session before joining.'; end if;
  if coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) is not true then
    raise exception 'Onboarding requires an anonymous student session.';
  end if;
  if char_length(v_real_name) < 1 or char_length(v_real_name) > 100 then
    raise exception 'Real name must be between 1 and 100 characters.';
  end if;
  if char_length(v_nickname) < 2 or char_length(v_nickname) > 24 then
    raise exception 'Nickname must be between 2 and 24 characters.';
  end if;
  if p_age is null or p_age < 1 or p_age > 120 then
    raise exception 'Age must be a whole number between 1 and 120.';
  end if;
  if p_gender is null or p_gender not in ('girl', 'boy') then
    raise exception 'Choose Girl or Boy.';
  end if;
  if exists (select 1 from public.private_profiles p where p.user_id = v_user_id) then
    raise exception 'A private profile already exists for this session.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));
  select count(*)::integer into v_attempt_count
  from private.alias_invite_attempts a
  where a.user_id = v_user_id and a.attempted_at > now() - interval '10 minutes';
  if v_attempt_count >= 10 then return false; end if;
  insert into private.alias_invite_attempts (user_id) values (v_user_id);

  v_code_hash := extensions.digest(
    convert_to(upper(btrim(coalesce(p_invite_code, ''))), 'UTF8'), 'sha256'
  );
  select c.id into v_invite_id
  from private.alias_invite_codes c
  where c.code_hash = v_code_hash
    and c.active = true
    and c.used_count < c.max_uses
    and (c.expires_at is null or c.expires_at > now())
  for update;
  if v_invite_id is null then return false; end if;

  insert into private.alias_invite_redemptions (user_id, invite_id, granted_reason)
  values (v_user_id, v_invite_id, 'invite');
  update private.alias_invite_codes set used_count = used_count + 1 where id = v_invite_id;
  insert into public.private_profiles (user_id, real_name, nickname, age, gender)
  values (v_user_id, v_real_name, v_nickname, p_age, p_gender);
  return true;
end;
$$;
revoke all on function public.complete_alias_onboarding(text, text, text, smallint, text) from public, anon;
grant execute on function public.complete_alias_onboarding(text, text, text, smallint, text) to authenticated;
