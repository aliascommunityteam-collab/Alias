-- Tighten SELECT policies to one policy per API role and index invite/report lookups.
create index if not exists alias_invite_codes_created_by_idx
  on private.alias_invite_codes (created_by);
create index if not exists alias_invite_redemptions_invite_id_idx
  on private.alias_invite_redemptions (invite_id);

-- anon can read published posts only. authenticated students can read published
-- posts; moderator accounts may also see hidden/removed content for review.
drop policy if exists "Anyone can read published posts" on public.posts;
drop policy if exists "Alias moderators can read all posts" on public.posts;
create policy "Public can read published posts"
on public.posts for select to anon
using (status = 'published');
create policy "Signed-in users can read published posts and moderators all posts"
on public.posts for select to authenticated
using (status = 'published' or public.alias_is_moderator());

-- Keep the same visibility rule for comments.
drop policy if exists "Anyone can read published comments on published posts" on public.comments;
drop policy if exists "Alias moderators can read all comments" on public.comments;
create policy "Public can read published comments"
on public.comments for select to anon
using (
  status = 'published'
  and exists (
    select 1 from public.posts p
    where p.id = comments.post_id and p.status = 'published'
  )
);
create policy "Signed-in users can read published comments and moderators all comments"
on public.comments for select to authenticated
using (
  (
    status = 'published'
    and exists (
      select 1 from public.posts p
      where p.id = comments.post_id and p.status = 'published'
    )
  )
  or public.alias_is_moderator()
);

-- Anonymous Auth users use the authenticated Postgres role. Restrict likes to
-- the current invited anonymous account for both SELECT and DELETE.
drop policy if exists "Users can read their own likes" on public.likes;
create policy "Invited anonymous users can read their own likes"
on public.likes for select to authenticated
using (
  author_id = (select auth.uid())
  and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
  and public.alias_has_active_invite()
);
drop policy if exists "Users can remove their own likes" on public.likes;
create policy "Invited anonymous users can remove their own likes"
on public.likes for delete to authenticated
using (
  author_id = (select auth.uid())
  and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
  and public.alias_has_active_invite()
);

notify pgrst, 'reload schema';
