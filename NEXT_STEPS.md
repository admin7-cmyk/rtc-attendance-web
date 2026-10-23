# Next Steps

Current update: 2026-10-23. Signed server sessions, permission checks, complete
pagination, calendar-aware reports, and an atomic promotion endpoint are now
implemented locally. Follow `DEPLOYMENT.md` for the ordered Vercel/Supabase
rollout. Live configuration and SQL have not been changed automatically.

The notes below describe the earlier snapshot and are retained as history.

Snapshot from 2026-08-06.

## Current State

- App is a Next.js 16 attendance system connected to Supabase.
- Recent changes are uncommitted.
- Validation passed after the latest work:
  - `npm run test` passed, 11/11 tests.
  - `npm run lint` passed with no warnings.
  - `npm run build` passed.
  - `git diff --check` passed, with only Git LF-to-CRLF notices.

## Completed

- Added shared attendance logic in `src/lib/attendanceLogic.mjs`.
- Added PBKDF2-SHA256 PIN hashing in `src/lib/pinHash.mjs`.
- Login route now verifies hashed PINs and legacy plaintext PINs.
- Login route auto-upgrades legacy plaintext PINs when `SUPABASE_SERVICE_ROLE_KEY` is configured.
- Admin user form no longer displays stored PIN/hash when editing.
- Admin user saves and Excel/CSV imports now store hashed PINs.
- Backups hash legacy plaintext PINs before writing Excel output.
- Fixed report room access for users with `room_ids = ALL`.
- Reused shared helpers in report, summary, admin user, and import flows.
- Added Supabase schema/RLS planning files and setup docs.

## Important Remaining Work

- Commit or review the current uncommitted changes before starting new work.
- Set `SUPABASE_SERVICE_ROLE_KEY` in deployment so legacy plaintext PINs can be upgraded after login.
- Migrate any remaining plaintext `app_users.pin` values to the new hash format.
- Do not apply `supabase/rls_hardening_template.sql` yet unless browser reads/writes have been moved to server routes or real Supabase Auth JWT claims.
- The app still relies on `localStorage` user data for page-level role checks; this is UI gating, not production-grade authorization.
- For production security, move sensitive admin writes and attendance writes behind server routes or Supabase Auth/RLS.

## Useful Commands

```bash
npm run test
npm run lint
npm run build
git status --short
```
