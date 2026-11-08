-- New profile rows may only be created through the invite-verifying RPC.
revoke insert on public.private_profiles from anon, authenticated;
drop policy if exists "Anonymous users can create their own private profile"
  on public.private_profiles;
notify pgrst, 'reload schema';
