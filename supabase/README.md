# Supabase Setup

For the current signed-session/server-proxy architecture, follow
`../DEPLOYMENT.md`. Install the additive atomic promotion function first, then
deploy and verify the Vercel server key, and apply `server_access_hardening.sql`
last. Do not apply the older JWT policy template to this architecture.

This folder contains the database shape inferred from the application code.

- `migrations/20260805000000_initial_schema.sql` creates the app tables, summary views, indexes, and attendance audit trigger.
- `rls_hardening_template.sql` is a policy template for the next auth phase. Review it before applying because the current app still performs most reads/writes directly from browser code.

For hardened server-side login, set `SUPABASE_SERVICE_ROLE_KEY` in the deployment environment. Keep that value server-only. The login route currently falls back to the anon key for compatibility with the existing client-side data access pattern; remove that fallback when the RLS template is applied.

The `app_users.pin` column is kept for compatibility, but new app writes store
`pbkdf2_sha256$...` hashes in that column. The login route can still verify
legacy plaintext values and upgrades them after successful login when the
service role key is configured.
