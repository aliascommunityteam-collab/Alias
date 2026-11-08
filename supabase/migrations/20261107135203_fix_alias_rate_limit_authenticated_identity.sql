create or replace function private.enforce_alias_rate_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid;
  v_action text;
  v_recent_count integer;
  v_limit integer;
  v_window interval;
begin
  -- Use the authenticated request identity, never a client-supplied row ID.
  -- This function runs before the row-identity triggers, so NEW.author_id
  -- may not yet contain the authenticated user's actual ID.
  v_user_id := (select auth.uid());

  if tg_table_name = 'posts' then
    v_action := 'post';
    v_limit := 3;
    v_window := interval '15 minutes';
  elsif tg_table_name = 'comments' then
    v_action := 'comment';
    v_limit := 8;
    v_window := interval '10 minutes';
  elsif tg_table_name = 'likes' then
    v_action := 'like';
    v_limit := 40;
    v_window := interval '1 hour';
  elsif tg_table_name = 'reports' then
    v_action := 'report';
    v_limit := 5;
    v_window := interval '1 hour';
  else
    return new;
  end if;

  if v_user_id is null then
    raise exception 'An authenticated anonymous account is required.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_user_id::text || ':' || v_action, 0)
  );

  -- Keep a rolling seven-day event history for this account/action.
  -- Unlike/delete cycles cannot reset the like rate limit.
  delete from private.alias_action_events
  where user_id = v_user_id
    and action = v_action
    and attempted_at < now() - interval '7 days';

  select count(*)::integer into v_recent_count
  from private.alias_action_events e
  where e.user_id = v_user_id
    and e.action = v_action
    and e.attempted_at > now() - v_window;

  if coalesce(v_recent_count, 0) >= v_limit then
    raise exception 'You have reached the action limit. Please wait before trying again.';
  end if;

  insert into private.alias_action_events (user_id, action)
  values (v_user_id, v_action);

  return new;
end;
$function$;