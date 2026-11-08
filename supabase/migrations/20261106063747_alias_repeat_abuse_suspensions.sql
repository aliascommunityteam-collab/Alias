-- Allow moderators to suspend an account associated with a report without
-- exposing the target account UUID to the browser or other students.
create table if not exists private.alias_suspensions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reason text not null,
  suspended_until timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table private.alias_suspensions enable row level security;
revoke all on private.alias_suspensions from public, anon, authenticated;

create or replace function public.alias_user_is_suspended()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.alias_suspensions s
    where s.user_id = (select auth.uid())
      and (s.suspended_until is null or s.suspended_until > now())
  );
$$;
revoke all on function public.alias_user_is_suspended() from public, anon;
grant execute on function public.alias_user_is_suspended() to authenticated;

create or replace function public.moderate_reported_author(p_report_id uuid, p_days integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  if not exists (
    select 1 from private.alias_moderators m
    where m.user_id = (select auth.uid())
  ) then
    raise exception 'Moderator access required.';
  end if;
  if p_days is null or p_days < 0 or p_days > 365 then
    raise exception 'Suspension duration must be between 0 and 365 days; use 0 to unsuspend.';
  end if;

  select
    case
      when r.post_id is not null then (select p.author_id from public.posts p where p.id = r.post_id)
      else (select c.author_id from public.comments c where c.id = r.comment_id)
    end
  into v_user_id
  from public.reports r
  where r.id = p_report_id;

  if v_user_id is null then return false; end if;
  if v_user_id = (select auth.uid()) then
    raise exception 'A moderator cannot suspend their own account through a report.';
  end if;

  if p_days = 0 then
    delete from private.alias_suspensions where user_id = v_user_id;
  else
    insert into private.alias_suspensions (user_id, reason, suspended_until, created_by)
    values (
      v_user_id,
      'Moderation action on report ' || p_report_id::text,
      now() + make_interval(days => p_days),
      (select auth.uid())
    )
    on conflict (user_id) do update
      set reason = excluded.reason,
          suspended_until = excluded.suspended_until,
          created_by = excluded.created_by,
          created_at = now();
  end if;

  return true;
end;
$$;
revoke all on function public.moderate_reported_author(uuid, integer) from public, anon;
grant execute on function public.moderate_reported_author(uuid, integer) to authenticated;

-- Apply a suspension check to every student-generated interaction.
drop policy if exists "Invited anonymous users can create their own posts" on public.posts;
create policy "Invited anonymous users can create their own posts"
on public.posts for insert to authenticated
with check (
  author_id = (select auth.uid())
  and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
  and public.alias_has_active_invite()
  and not public.alias_user_is_suspended()
  and author_nickname is not null
  and author_nickname = (
    select p.nickname from public.private_profiles p
    where p.user_id = (select auth.uid())
  )
);

drop policy if exists "Invited anonymous users can add comments" on public.comments;
create policy "Invited anonymous users can add comments"
on public.comments for insert to authenticated
with check (
  author_id = (select auth.uid())
  and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
  and public.alias_has_active_invite()
  and not public.alias_user_is_suspended()
  and status = 'published'
  and exists (
    select 1 from public.posts p
    where p.id = comments.post_id and p.status = 'published'
  )
);

drop policy if exists "Invited anonymous users can like published posts" on public.likes;
create policy "Invited anonymous users can like published posts"
on public.likes for insert to authenticated
with check (
  author_id = (select auth.uid())
  and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
  and public.alias_has_active_invite()
  and not public.alias_user_is_suspended()
  and exists (
    select 1 from public.posts p
    where p.id = likes.post_id and p.status = 'published'
  )
);

drop policy if exists "Invited anonymous users can report published content" on public.reports;
create policy "Invited anonymous users can report published content"
on public.reports for insert to authenticated
with check (
  reporter_id = (select auth.uid())
  and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
  and public.alias_has_active_invite()
  and not public.alias_user_is_suspended()
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
