-- Alias MVP: invite-only participation, likes, comments, reporting and moderation.
-- Additive migration. Existing posts and private profiles are preserved.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to postgres, service_role;

create table if not exists private.alias_invite_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash bytea not null unique,
  max_uses integer not null default 1 check (max_uses between 1 and 100),
  used_count integer not null default 0 check (used_count >= 0 and used_count <= max_uses),
  active boolean not null default true,
  expires_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists private.alias_invite_redemptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  invite_id uuid references private.alias_invite_codes(id) on delete restrict,
  granted_reason text not null default 'invite' check (granted_reason in ('invite', 'legacy_profile', 'manual_allowlist')),
  created_at timestamptz not null default now()
);

create table if not exists private.alias_invite_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  attempted_at timestamptz not null default now()
);

create index if not exists alias_invite_attempts_user_time_idx
  on private.alias_invite_attempts (user_id, attempted_at desc);

create table if not exists private.alias_moderators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table private.alias_invite_codes enable row level security;
alter table private.alias_invite_redemptions enable row level security;
alter table private.alias_invite_attempts enable row level security;
alter table private.alias_moderators enable row level security;

revoke all on all tables in schema private from public, anon, authenticated;
revoke all on all sequences in schema private from public, anon, authenticated;

-- Grandfather existing completed profiles into the pilot, without exposing their IDs.
insert into private.alias_invite_redemptions (user_id, invite_id, granted_reason)
select p.user_id, null, 'legacy_profile'
from public.private_profiles p
on conflict (user_id) do nothing;

-- Comments expose a nickname, never the internal author UUID.
alter table public.comments
  add column if not exists author_nickname text;

create index if not exists comments_author_id_idx
  on public.comments (author_id);
create index if not exists reports_post_id_idx
  on public.reports (post_id);
create index if not exists reports_comment_id_idx
  on public.reports (comment_id);

create or replace function public.alias_has_active_invite()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.alias_invite_redemptions r
    where r.user_id = (select auth.uid())
  );
$$;

create or replace function public.alias_is_moderator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.alias_moderators m
    where m.user_id = (select auth.uid())
  );
$$;

revoke all on function public.alias_has_active_invite() from public, anon;
grant execute on function public.alias_has_active_invite() to authenticated;
revoke all on function public.alias_is_moderator() from public, anon;
grant execute on function public.alias_is_moderator() to authenticated;

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
  if v_user_id is null then
    raise exception 'Create an anonymous session before joining.';
  end if;

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
  where a.user_id = v_user_id
    and a.attempted_at > now() - interval '10 minutes';

  if v_attempt_count >= 10 then
    raise exception 'Too many invitation attempts. Please try again later.';
  end if;

  insert into private.alias_invite_attempts (user_id) values (v_user_id);

  v_code_hash := extensions.digest(
    convert_to(upper(btrim(coalesce(p_invite_code, ''))), 'UTF8'),
    'sha256'
  );

  select c.id into v_invite_id
  from private.alias_invite_codes c
  where c.code_hash = v_code_hash
    and c.active = true
    and c.used_count < c.max_uses
    and (c.expires_at is null or c.expires_at > now())
  for update;

  if v_invite_id is null then
    raise exception 'That invitation code is invalid, expired, or already used.';
  end if;

  insert into private.alias_invite_redemptions (user_id, invite_id, granted_reason)
  values (v_user_id, v_invite_id, 'invite');

  update private.alias_invite_codes
  set used_count = used_count + 1
  where id = v_invite_id;

  insert into public.private_profiles (user_id, real_name, nickname, age, gender)
  values (v_user_id, v_real_name, v_nickname, p_age, p_gender);

  return true;
end;
$$;

revoke all on function public.complete_alias_onboarding(text, text, text, smallint, text) from public, anon;
grant execute on function public.complete_alias_onboarding(text, text, text, smallint, text) to authenticated;

create or replace function public.create_alias_invite(p_max_uses integer default 1, p_expires_in_days integer default 7)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  if not exists (
    select 1 from private.alias_moderators m where m.user_id = (select auth.uid())
  ) then
    raise exception 'Moderator access required.';
  end if;
  if p_max_uses is null or p_max_uses < 1 or p_max_uses > 100 then
    raise exception 'Invite usage must be between 1 and 100.';
  end if;
  if p_expires_in_days is null or p_expires_in_days < 1 or p_expires_in_days > 90 then
    raise exception 'Invite expiry must be between 1 and 90 days.';
  end if;

  v_code := 'ALIAS-' || upper(encode(extensions.gen_random_bytes(16), 'hex'));
  insert into private.alias_invite_codes (code_hash, max_uses, expires_at, created_by)
  values (
    extensions.digest(convert_to(v_code, 'UTF8'), 'sha256'),
    p_max_uses,
    now() + make_interval(days => p_expires_in_days),
    (select auth.uid())
  );
  return v_code;
end;
$$;

revoke all on function public.create_alias_invite(integer, integer) from public, anon;
grant execute on function public.create_alias_invite(integer, integer) to authenticated;

create or replace function public.get_post_stats(p_post_ids uuid[])
returns table (post_id uuid, like_count bigint, comment_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id as post_id,
    count(distinct l.author_id)::bigint as like_count,
    count(distinct c.id)::bigint as comment_count
  from public.posts p
  left join public.likes l on l.post_id = p.id
  left join public.comments c on c.post_id = p.id and c.status = 'published'
  where p.status = 'published'
    and p.id = any(coalesce(p_post_ids, array[]::uuid[]))
  group by p.id;
$$;

revoke all on function public.get_post_stats(uuid[]) from public;
grant execute on function public.get_post_stats(uuid[]) to anon, authenticated;

create or replace function public.moderate_post(p_post_id uuid, p_action text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from private.alias_moderators m where m.user_id = (select auth.uid())
  ) then
    raise exception 'Moderator access required.';
  end if;
  if p_action is null or p_action not in ('hide', 'remove', 'restore') then
    raise exception 'Unsupported moderation action.';
  end if;

  update public.posts
  set status = case p_action when 'hide' then 'hidden' when 'remove' then 'removed' else 'published' end
  where id = p_post_id;
  return found;
end;
$$;

create or replace function public.moderate_comment(p_comment_id uuid, p_action text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from private.alias_moderators m where m.user_id = (select auth.uid())
  ) then
    raise exception 'Moderator access required.';
  end if;
  if p_action is null or p_action not in ('hide', 'remove', 'restore') then
    raise exception 'Unsupported moderation action.';
  end if;

  update public.comments
  set status = case p_action when 'hide' then 'hidden' when 'remove' then 'removed' else 'published' end
  where id = p_comment_id;
  return found;
end;
$$;

create or replace function public.update_alias_report_status(p_report_id uuid, p_status text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from private.alias_moderators m where m.user_id = (select auth.uid())
  ) then
    raise exception 'Moderator access required.';
  end if;
  if p_status is null or p_status not in ('open', 'reviewing', 'resolved', 'dismissed') then
    raise exception 'Unsupported report status.';
  end if;

  update public.reports set status = p_status where id = p_report_id;
  return found;
end;
$$;

revoke all on function public.moderate_post(uuid, text) from public, anon;
revoke all on function public.moderate_comment(uuid, text) from public, anon;
revoke all on function public.update_alias_report_status(uuid, text) from public, anon;
grant execute on function public.moderate_post(uuid, text) to authenticated;
grant execute on function public.moderate_comment(uuid, text) to authenticated;
grant execute on function public.update_alias_report_status(uuid, text) to authenticated;

create or replace function private.set_alias_comment_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nickname text;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in anonymously before commenting.';
  end if;

  select p.nickname into v_nickname
  from public.private_profiles p
  where p.user_id = (select auth.uid());

  if v_nickname is null then
    raise exception 'Complete private onboarding before commenting.';
  end if;

  new.author_id := (select auth.uid());
  new.author_nickname := v_nickname;
  new.status := 'published';
  return new;
end;
$$;

create or replace function private.set_alias_report_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in before submitting a report.';
  end if;
  new.reporter_id := (select auth.uid());
  new.status := 'open';
  return new;
end;
$$;

create or replace function private.set_alias_like_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in before liking a post.';
  end if;
  new.author_id := (select auth.uid());
  return new;
end;
$$;

create or replace function private.enforce_alias_rate_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_recent_count integer;
  v_limit integer;
  v_window interval;
begin
  if tg_table_name = 'posts' then
    v_user_id := new.author_id;
    v_limit := 3;
    v_window := interval '15 minutes';
    perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));
    select count(*)::integer into v_recent_count from public.posts p
    where p.author_id = v_user_id and p.created_at > now() - v_window;
  elsif tg_table_name = 'comments' then
    v_user_id := new.author_id;
    v_limit := 8;
    v_window := interval '10 minutes';
    perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));
    select count(*)::integer into v_recent_count from public.comments c
    where c.author_id = v_user_id and c.created_at > now() - v_window;
  elsif tg_table_name = 'likes' then
    v_user_id := new.author_id;
    v_limit := 40;
    v_window := interval '1 hour';
    perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));
    select count(*)::integer into v_recent_count from public.likes l
    where l.author_id = v_user_id and l.created_at > now() - v_window;
  elsif tg_table_name = 'reports' then
    v_user_id := (select auth.uid());
    v_limit := 5;
    v_window := interval '1 hour';
    perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));
    select count(*)::integer into v_recent_count from public.reports r
    where r.reporter_id = v_user_id and r.created_at > now() - v_window;
  else
    return new;
  end if;

  if coalesce(v_recent_count, 0) >= v_limit then
    raise exception 'You have reached the action limit. Please wait before trying again.';
  end if;
  return new;
end;
$$;

revoke all on function private.set_alias_comment_identity() from public, anon, authenticated;
revoke all on function private.set_alias_report_identity() from public, anon, authenticated;
revoke all on function private.set_alias_like_identity() from public, anon, authenticated;
revoke all on function private.enforce_alias_rate_limits() from public, anon, authenticated;

-- Replace only the post-create policy so participation requires a redeemed invite.
drop policy if exists "Authenticated users can create their own posts" on public.posts;
create policy "Invited anonymous users can create their own posts"
on public.posts for insert to authenticated
with check (
  author_id = (select auth.uid())
  and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
  and public.alias_has_active_invite()
  and author_nickname is not null
  and author_nickname = (
    select p.nickname from public.private_profiles p
    where p.user_id = (select auth.uid())
  )
);

create policy "Alias moderators can read all posts"
on public.posts for select to authenticated
using (public.alias_is_moderator());

-- Comments: public reads of published content; invited anonymous insert only.
create policy "Anyone can read published comments on published posts"
on public.comments for select to anon, authenticated
using (
  status = 'published'
  and exists (
    select 1 from public.posts p
    where p.id = comments.post_id and p.status = 'published'
  )
);

create policy "Alias moderators can read all comments"
on public.comments for select to authenticated
using (public.alias_is_moderator());

create policy "Invited anonymous users can add comments"
on public.comments for insert to authenticated
with check (
  author_id = (select auth.uid())
  and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
  and public.alias_has_active_invite()
  and status = 'published'
  and exists (
    select 1 from public.posts p
    where p.id = comments.post_id and p.status = 'published'
  )
);

-- Likes: each user can inspect only their own like row; counts are returned by a safe aggregate RPC.
create policy "Users can read their own likes"
on public.likes for select to authenticated
using (author_id = (select auth.uid()));

create policy "Invited anonymous users can like published posts"
on public.likes for insert to authenticated
with check (
  author_id = (select auth.uid())
  and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
  and public.alias_has_active_invite()
  and exists (
    select 1 from public.posts p
    where p.id = likes.post_id and p.status = 'published'
  )
);

create policy "Users can remove their own likes"
on public.likes for delete to authenticated
using (author_id = (select auth.uid()));

-- Reports: users can submit but never read reports; moderators alone can review them.
create policy "Invited anonymous users can report published content"
on public.reports for insert to authenticated
with check (
  reporter_id = (select auth.uid())
  and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
  and public.alias_has_active_invite()
  and (
    (post_id is not null and exists (
      select 1 from public.posts p where p.id = reports.post_id and p.status = 'published'
    ))
    or
    (comment_id is not null and exists (
      select 1 from public.comments c
      join public.posts p on p.id = c.post_id
      where c.id = reports.comment_id and c.status = 'published' and p.status = 'published'
    ))
  )
);

create policy "Only Alias moderators can read reports"
on public.reports for select to authenticated
using (public.alias_is_moderator());

-- Attach identity and spam-friction triggers. Existing rows are not changed.
drop trigger if exists alias_comments_set_identity on public.comments;
create trigger alias_comments_set_identity
before insert on public.comments
for each row execute function private.set_alias_comment_identity();

drop trigger if exists alias_reports_set_identity on public.reports;
create trigger alias_reports_set_identity
before insert on public.reports
for each row execute function private.set_alias_report_identity();

drop trigger if exists alias_likes_set_identity on public.likes;
create trigger alias_likes_set_identity
before insert on public.likes
for each row execute function private.set_alias_like_identity();

drop trigger if exists alias_posts_rate_limit on public.posts;
create trigger alias_posts_rate_limit
before insert on public.posts
for each row execute function private.enforce_alias_rate_limits();

drop trigger if exists alias_comments_rate_limit on public.comments;
create trigger alias_comments_rate_limit
before insert on public.comments
for each row execute function private.enforce_alias_rate_limits();

drop trigger if exists alias_likes_rate_limit on public.likes;
create trigger alias_likes_rate_limit
before insert on public.likes
for each row execute function private.enforce_alias_rate_limits();

drop trigger if exists alias_reports_rate_limit on public.reports;
create trigger alias_reports_rate_limit
before insert on public.reports
for each row execute function private.enforce_alias_rate_limits();

-- Revoke broad permissions and explicitly grant the columns used by the client.
revoke all on public.comments, public.likes, public.reports from anon, authenticated;

grant select (id, post_id, content, author_nickname, created_at, status)
  on public.comments to anon, authenticated;
grant insert (post_id, content) on public.comments to authenticated;

grant select (post_id, author_id, created_at) on public.likes to authenticated;
grant insert (post_id) on public.likes to authenticated;
grant delete on public.likes to authenticated;

grant select (id, reporter_id, post_id, comment_id, reason, details, status, created_at)
  on public.reports to authenticated;
grant insert (post_id, comment_id, reason, details) on public.reports to authenticated;

-- Authenticated moderators may inspect post/comment status and reports, but never private profile data.
grant select (id, category, content, status, created_at, author_nickname)
  on public.posts to authenticated;

notify pgrst, 'reload schema';
