# Supabase migrations

The feature migrations in this directory were applied to the connected Alias Supabase project on 6 November 2026. Their filenames match the remote migration-history versions.

The original project already had three earlier migrations (reports table and post access policies) but did not include their original SQL files in the uploaded source archive. Do not run `supabase db push` against a freshly initialized local project until the original migration baseline has been recovered with `supabase db pull` and reconciled. The remote database is already at these feature migrations; do not apply them again manually in the SQL editor.

The latest migrations keep security-definer implementations in the non-exposed `private` schema and expose narrow invoker wrappers to the app. The `private` schema has no direct table grants for `anon` or `authenticated`; the browser only receives permissions needed for its wrappers and RLS policies.

All schema changes were additive or policy/function replacements. The existing test post and existing private profile rows were preserved.

The action-rate-limit event ledger is private and records account/action timestamps so repeated unlike cycles do not reset the like throttle. Old events for a given account/action are pruned lazily when that account next performs the same action.
