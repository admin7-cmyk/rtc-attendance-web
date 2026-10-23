-- Additive: creates one function; does not change existing attendance or users.
-- Call only from the verified admin server route using a service-role key.
begin;

create or replace function public.rtc_promote_students(student_changes jsonb, teacher_changes jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  change jsonb;
  student public.students%rowtype;
  teacher public.app_users%rowtype;
begin
  if jsonb_typeof(student_changes) is distinct from 'array'
    or jsonb_typeof(teacher_changes) is distinct from 'array'
    or jsonb_array_length(student_changes) = 0
    or jsonb_array_length(student_changes) > 10000
    or jsonb_array_length(teacher_changes) > 10000 then
    raise exception 'Invalid promotion batch';
  end if;
  if (select count(*) from jsonb_array_elements(student_changes)) <>
     (select count(distinct item->>'student_id') from jsonb_array_elements(student_changes) item)
    or (select count(*) from jsonb_array_elements(teacher_changes)) <>
       (select count(distinct item->>'teacher_id') from jsonb_array_elements(teacher_changes) item) then
    raise exception 'Duplicate promotion IDs';
  end if;

  -- Lock every affected row in a stable order before making any changes.
  perform 1 from public.students s
    where s.student_id in (select item->>'student_id' from jsonb_array_elements(student_changes) item)
    order by s.student_id for update;
  perform 1 from public.app_users u
    where u.teacher_id in (select item->>'teacher_id' from jsonb_array_elements(teacher_changes) item)
    order by u.teacher_id for update;

  for change in select value from jsonb_array_elements(student_changes) loop
    select * into student from public.students where student_id = change->>'student_id';
    if not found or jsonb_build_object(
      'level', coalesce(student.level::text, ''), 'year', coalesce(student.year::text, ''),
      'room_no', coalesce(student.room_no::text, ''), 'room_id', coalesce(student.room_id::text, ''),
      'active', coalesce(student.active::text, '')
    ) is distinct from change->'before' then
      raise exception using errcode = '40001', message = 'Student changed since preview; reload and retry';
    end if;
    if jsonb_typeof(change->'after') is distinct from 'object'
      or (change->'after') = '{}'::jsonb
      or exists (select 1 from jsonb_object_keys(change->'after') field where field not in ('level', 'year', 'room_no', 'room_id', 'active')) then
      raise exception 'Invalid student changes';
    end if;
    if change->'after' ? 'room_id' then
      -- Keep target rooms from being removed between validation and update.
      perform 1 from public.rooms where room_id = change->'after'->>'room_id' for key share;
      if not found then raise exception 'Target room does not exist'; end if;
    end if;
  end loop;

  for change in select value from jsonb_array_elements(teacher_changes) loop
    select * into teacher from public.app_users where teacher_id = change->>'teacher_id';
    if not found or jsonb_build_object(
      'room_ids', coalesce(teacher.room_ids::text, ''), 'role', coalesce(teacher.role::text, ''),
      'active', coalesce(teacher.active::text, '')
    ) is distinct from change->'before' then
      raise exception using errcode = '40001', message = 'Teacher changed since preview; reload and retry';
    end if;
    if jsonb_typeof(change->'after') is distinct from 'object'
      or not (change->'after' ? 'room_ids')
      or exists (select 1 from jsonb_object_keys(change->'after') field where field <> 'room_ids') then
      raise exception 'Invalid teacher changes';
    end if;
  end loop;

  for change in select value from jsonb_array_elements(student_changes) loop
    select * into student from public.students where student_id = change->>'student_id';
    -- Cast JSON values through the existing row type, including installations
    -- using integer year/room_no or boolean active columns.
    student := jsonb_populate_record(student, change->'after');
    update public.students set
      level = student.level,
      year = student.year,
      room_no = student.room_no,
      room_id = student.room_id,
      active = student.active
    where student_id = change->>'student_id';
  end loop;
  for change in select value from jsonb_array_elements(teacher_changes) loop
    update public.app_users set room_ids = change->'after'->>'room_ids'
    where teacher_id = change->>'teacher_id';
  end loop;
  return jsonb_build_object('students', jsonb_array_length(student_changes), 'teachers', jsonb_array_length(teacher_changes));
end;
$$;

revoke all on function public.rtc_promote_students(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.rtc_promote_students(jsonb, jsonb) to service_role;

notify pgrst, 'reload schema';

commit;
