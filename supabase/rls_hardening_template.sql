-- RLS hardening template.
--
-- Do not apply this file to the current app until all browser reads/writes are
-- backed by Supabase Auth JWT claims or server routes. The current UI still
-- reads and writes many tables directly with the anon key, so enabling these
-- policies early will block pages.
--
-- Expected JWT claims:
--   app_role: "admin" or "teacher"
--   teacher_id: teacher/app user id
--   room_ids: comma-separated room ids, or "ALL"

create or replace function public.jwt_app_role()
returns text
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'app_role', '');
$$;

create or replace function public.jwt_teacher_id()
returns text
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'teacher_id', '');
$$;

create or replace function public.normalize_room_id(value text)
returns text
language sql
immutable
as $$
  select replace(replace(regexp_replace(coalesce(value, ''), '\s+', '', 'g'), '.', ''), '-', '/');
$$;

create or replace function public.jwt_room_ids()
returns text[]
language sql
stable
as $$
  select case
    when coalesce(auth.jwt() ->> 'room_ids', '') = '' then array[]::text[]
    else regexp_split_to_array(auth.jwt() ->> 'room_ids', '\s*[,;|]\s*|\s+')
  end;
$$;

create or replace function public.can_access_room(_room_id text)
returns boolean
language sql
stable
as $$
  select
    public.jwt_app_role() = 'admin'
    or 'ALL' = any(public.jwt_room_ids())
    or exists (
      select 1
      from unnest(public.jwt_room_ids()) as allowed_room(room_id)
      where public.normalize_room_id(allowed_room.room_id) = public.normalize_room_id(_room_id)
    );
$$;

alter table public.app_users enable row level security;
alter table public.rooms enable row level security;
alter table public.students enable row level security;
alter table public.terms enable row level security;
alter table public.school_days enable row level security;
alter table public.attendance enable row level security;
alter table public.room_lineup_exceptions enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists app_users_admin_all on public.app_users;
create policy app_users_admin_all
on public.app_users
for all
to authenticated
using (public.jwt_app_role() = 'admin')
with check (public.jwt_app_role() = 'admin');

drop policy if exists rooms_read_accessible on public.rooms;
create policy rooms_read_accessible
on public.rooms
for select
to authenticated
using (public.can_access_room(room_id));

drop policy if exists rooms_admin_write on public.rooms;
create policy rooms_admin_write
on public.rooms
for all
to authenticated
using (public.jwt_app_role() = 'admin')
with check (public.jwt_app_role() = 'admin');

drop policy if exists students_read_accessible on public.students;
create policy students_read_accessible
on public.students
for select
to authenticated
using (public.can_access_room(room_id));

drop policy if exists students_admin_write on public.students;
create policy students_admin_write
on public.students
for all
to authenticated
using (public.jwt_app_role() = 'admin')
with check (public.jwt_app_role() = 'admin');

drop policy if exists terms_read_authenticated on public.terms;
create policy terms_read_authenticated
on public.terms
for select
to authenticated
using (true);

drop policy if exists terms_admin_write on public.terms;
create policy terms_admin_write
on public.terms
for all
to authenticated
using (public.jwt_app_role() = 'admin')
with check (public.jwt_app_role() = 'admin');

drop policy if exists school_days_read_authenticated on public.school_days;
create policy school_days_read_authenticated
on public.school_days
for select
to authenticated
using (true);

drop policy if exists school_days_admin_write on public.school_days;
create policy school_days_admin_write
on public.school_days
for all
to authenticated
using (public.jwt_app_role() = 'admin')
with check (public.jwt_app_role() = 'admin');

drop policy if exists attendance_read_accessible on public.attendance;
create policy attendance_read_accessible
on public.attendance
for select
to authenticated
using (public.can_access_room(room_id));

drop policy if exists attendance_write_accessible on public.attendance;
create policy attendance_write_accessible
on public.attendance
for insert
to authenticated
with check (
  public.jwt_app_role() = 'admin'
  or (
    public.can_access_room(room_id)
    and checked_by = public.jwt_teacher_id()
  )
);

drop policy if exists attendance_update_accessible on public.attendance;
create policy attendance_update_accessible
on public.attendance
for update
to authenticated
using (public.can_access_room(room_id))
with check (
  public.jwt_app_role() = 'admin'
  or (
    public.can_access_room(room_id)
    and checked_by = public.jwt_teacher_id()
  )
);

drop policy if exists room_exceptions_read_accessible on public.room_lineup_exceptions;
create policy room_exceptions_read_accessible
on public.room_lineup_exceptions
for select
to authenticated
using (public.can_access_room(room_id));

drop policy if exists room_exceptions_admin_write on public.room_lineup_exceptions;
create policy room_exceptions_admin_write
on public.room_lineup_exceptions
for all
to authenticated
using (public.jwt_app_role() = 'admin')
with check (public.jwt_app_role() = 'admin');

drop policy if exists audit_logs_admin_read on public.audit_logs;
create policy audit_logs_admin_read
on public.audit_logs
for select
to authenticated
using (public.jwt_app_role() = 'admin');
