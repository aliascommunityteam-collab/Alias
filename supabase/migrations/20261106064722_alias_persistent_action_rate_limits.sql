-- Persist per-account action events so deleting a like cannot reset its throttle.
create table if not exists private.alias_action_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('post', 'comment', 'like', 'report')),
  attempted_at timestamptz not null default now()
);
create index if not exists alias_action_events_user_action_time_idx
  on private.alias_action_events (user_id, action, attempted_at desc);
alter table private.alias_action_events enable row level security;
revoke all on private.alias_action_events from public, anon, authenticated;
revoke all on sequence private.alias_action_events_id_seq from public, anon, authenticated;

create or replace function private.enforce_alias_rate_limits()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid;
  v_action text;
  v_recent_count integer;
  v_limit integer;
  v_window interval;
begin
  if tg_table_name = 'posts' then
    v_user_id := new.author_id; v_action := 'post'; v_limit := 3; v_window := interval '15 minutes';
  elsif tg_table_name = 'comments' then
    v_user_id := new.author_id; v_action := 'comment'; v_limit := 8; v_window := interval '10 minutes';
  elsif tg_table_name = 'likes' then
    v_user_id := new.author_id; v_action := 'like'; v_limit := 40; v_window := interval '1 hour';
  elsif tg_table_name = 'reports' then
    v_user_id := (select auth.uid()); v_action := 'report'; v_limit := 5; v_window := interval '1 hour';
  else
    return new;
  end if;

  if v_user_id is null then raise exception 'An authenticated anonymous account is required.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || v_action, 0));

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
$$;
revoke all on function private.enforce_alias_rate_limits() from public, anon, authenticated;
