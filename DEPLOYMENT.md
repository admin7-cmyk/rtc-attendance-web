# GitHub → Vercel → Supabase rollout

The page designs, Thai labels, scanner, and Word/Excel templates are retained.
Sessions use a signed HTTP-only cookie; every data request checks the current
Supabase account's active status, role, and rooms. Vercel needs no writable disk
or process-local session store.

## Before deploying

1. In Vercel, confirm the project's **Root Directory** points to the directory
   containing this app's `package.json` (in this workspace:
   `mainApp/rtc-attendance-web`). Keep the existing root if GitHub already has
   this directory as its repository root.
2. Keep the existing `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` values.
3. Add **server-only** `SUPABASE_SERVICE_ROLE_KEY` for this Supabase project.
   Never prefix it with `NEXT_PUBLIC_` or commit it to GitHub.
4. Add **server-only** `SESSION_SECRET`: at least 32 random characters. Generate
   one locally with:

   ```powershell
   node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
   ```

   Give every Vercel instance the same secret. Changing it signs everyone out.
   `.env.local` is ignored by Git and does not configure Vercel. A local secret
   was added for local development; do not publish that file.
5. In Supabase SQL Editor, review and run only
   `supabase/migrations/20261023000000_atomic_promotion.sql` against the existing
   database. This adds the transaction function without rewriting app data.
   It checks each student's and teacher's original values before updating, and
   rolls back the entire operation on a conflict or error.
   Do not rerun the inferred initial-schema migration on an existing database.

## Deploy and verify

1. Review and commit the changed app files, new API routes, shared helpers,
   tests, and SQL files to the existing GitHub repository. Exclude `.env.local`,
   `node_modules`, and `.next`.
2. Deploy the revision through the project's existing Vercel Git integration.
   Environment variable changes require a new deployment.
3. Sign in using the same username/PIN form. Existing browser-only sessions
   require one fresh login. Sessions then renew with use for seven days.
4. Confirm teacher room access, admin reads, the scanner's existing workflow,
   and report/export previews. Exercise writes using a test room/account;
   avoid using a real class to test promotion.
5. Check a room holiday and a room-added attendance day. Partially recorded
   days keep their real present/absent counts and show an incomplete note;
   they do not receive a misleading percentage or invented absences.

## Close direct database access last

After the deployed app works using the server role key, review and run
`supabase/server_access_hardening.sql`. It enables RLS and revokes table/view
access from `anon` and `authenticated`; server access continues via
`service_role`. It does not delete or rewrite records.

Run this **after** the server-key deployment is verified: otherwise the old
browser-based app, or a deployment still using the public-key fallback, loses
database access. Refresh old browser tabs after the rollout. Coordinate this
step with any other app that uses the same Supabase tables.

The server retains the existing public-key fallback for transition only. Until
the final database restriction is applied, direct use of a previously published
Supabase public key may still access the database independently of this app.
Do not use the old `rls_hardening_template.sql` for this server-proxy design.

Promotion has no unsafe fallback to separate browser updates. If its SQL
function or service-role permission is missing, it stops before changing data.

## Validation and limits

```powershell
npm run test
npm run lint
npm run build
```

Tests use synthetic data; they do not modify the live Supabase database. The
SQL transaction must also be exercised in a staging Supabase project before
the promotion rollout; a local PostgreSQL engine is not included here.

The production-build API smoke test can be repeated without a live database.
After `npm run build`, start each fixture in a separate terminal:

```powershell
node tests/fixtures/supabaseServer.mjs 54329
node tests/fixtures/appServer.mjs
```

Then run `node tests/integration.mjs` from another terminal. All traffic is
forced to the loopback fixture, including a synthetic 1,250-student room and
an upstream page cap of 137 rows. Stop both fixture processes when finished.
For a small browser preview, start the database fixture with `--small` instead;
the 1,250-row integration check requires the default, large fixture.

Historical rosters are reconstructed from saved attendance for the selected
term, instead of today's active students. Past membership that was never
recorded cannot be recovered automatically. Smaller daily record sets are
marked incomplete; existing attendance is never backfilled or deleted.

The login throttle is best-effort within each Vercel instance. A global login
rate limit must be configured at the deployment edge for cross-instance
protection. Signed sessions and permission checks do not depend on that cache.

To roll back code, keep the server-proxy deployment while investigating if
direct database access has already been restricted. Rolling back to the old
browser client requires a deliberate review of the previous database grants;
do not re-open public access as an automatic rollback step.
