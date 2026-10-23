-- Run ONLY AFTER deploying the server-proxy app to Vercel, setting a private
-- SUPABASE_SERVICE_ROLE_KEY and SESSION_SECRET, and verifying login + table reads.
-- This removes direct public API access, including old published anon keys.
-- It does not delete or rewrite any table, row, PIN, attendance, or audit log.
-- The old JWT-based rls_hardening_template.sql is not used by this architecture.
begin;

alter table public.app_users enable row level security;
alter table public.rooms enable row level security;
alter table public.students enable row level security;
alter table public.terms enable row level security;
alter table public.school_days enable row level security;
alter table public.attendance enable row level security;
alter table public.room_lineup_exceptions enable row level security;
alter table public.audit_logs enable row level security;

revoke all privileges on table
  public.app_users, public.rooms, public.students, public.terms,
  public.school_days, public.attendance, public.room_lineup_exceptions,
  public.audit_logs, public.room_term_summary, public.student_term_summary
from anon, authenticated;

grant select, insert, update, delete on table
  public.app_users, public.rooms, public.students, public.terms,
  public.school_days, public.attendance, public.room_lineup_exceptions,
  public.audit_logs, public.room_term_summary, public.student_term_summary
to service_role;

commit;
