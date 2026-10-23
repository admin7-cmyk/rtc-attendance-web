# RTC Attendance Web

Next.js app for school lineup attendance, room/student administration, imports,
daily status, audit logs, backups, and Excel/Word reporting.

## Scripts

```bash
npm run dev
npm run lint
npm run test
npm run build
```

## Environment

Copy `.env.example` to `.env.local` and fill in the Supabase values.

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SESSION_SECRET` for stable signed sessions across Vercel instances
- `SUPABASE_SERVICE_ROLE_KEY` for server data access and atomic promotions

Never expose the service role key in client code.

Browser queries now go through verified server routes. See `DEPLOYMENT.md` for
the GitHub/Vercel/Supabase rollout order; public database access must be closed
only after the server-key deployment has been verified.

User PINs are stored in the existing `app_users.pin` column. New saves/imports
write PBKDF2-SHA256 hashes, and legacy plaintext PINs are still accepted during
login for migration.

## Supabase

Database artifacts live in `supabase/`.

- `supabase/migrations/20260805000000_initial_schema.sql` contains the inferred app schema, summary views, indexes, and attendance audit trigger.
- `supabase/rls_hardening_template.sql` contains policy scaffolding for a future authenticated/RLS-backed version of the app.

Review migrations against the live database before applying them to production.
