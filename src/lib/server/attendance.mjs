import { applyRoomExceptionToSchoolDay, buildAttendanceId, isTrueValue, normalizeRoomId, normalizeStatus } from '../attendanceLogic.mjs';
import { canAccessRoom } from './access.mjs';
import { readDatabaseRows } from './rest.mjs';

function invalid(message) {
  throw Object.assign(new Error(message), { status: 400 });
}

export async function prepareTeacherAttendance(client, input, user) {
  const rows = Array.isArray(input) ? input : [input];
  if (rows.length === 0 || rows.length > 2000) invalid('จำนวนรายการไม่ถูกต้อง');
  const ids = [...new Set(rows.map((row) => String(row.student_id || '')))];
  const responses = await Promise.all([
    readDatabaseRows('rooms', new URLSearchParams({ select: '*' })),
    ...Array.from({ length: Math.ceil(ids.length / 200) }, (_, index) => readDatabaseRows('students', new URLSearchParams({
      select: 'student_id,room_id,active',
      student_id: `in.(${ids.slice(index * 200, index * 200 + 200).map((id) => JSON.stringify(id)).join(',')})`,
    }))),
  ]);
  if (responses.some((response) => !response.ok)) throw Object.assign(new Error('ไม่สามารถตรวจสอบห้องและรายชื่อนักเรียนได้'), { status: 503 });
  const [rooms, ...studentGroups] = await Promise.all(responses.map((response) => response.json()));
  const students = studentGroups.flat();
  const studentMap = new Map(students.map((student) => [String(student.student_id), student]));
  const days = new Map();
  const result = [];
  for (const row of rows) {
    const room = rooms.find((item) => normalizeRoomId(item.room_id) === normalizeRoomId(row.room_id));
    if (!room || !canAccessRoom(user, room.room_id)) throw Object.assign(new Error('ไม่มีสิทธิ์เช็กชื่อห้องนี้'), { status: 403 });
    const student = studentMap.get(String(row.student_id));
    if (!student || !isTrueValue(student.active) || normalizeRoomId(student.room_id) !== normalizeRoomId(room.room_id)) invalid('นักเรียนไม่ได้อยู่ในห้องที่เลือก');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date) || Number.isNaN(Date.parse(`${row.date}T00:00:00Z`)) || new Date(`${row.date}T00:00:00Z`).toISOString().slice(0, 10) !== row.date) invalid('วันที่ไม่ถูกต้อง');
    const status = normalizeStatus(row.status);
    if (!status) invalid('สถานะเช็กชื่อไม่ถูกต้อง');
    const key = `${room.room_id}|${row.date}|${row.term_id || ''}`;
    if (!days.has(key)) {
      let query = client.from('school_days').select('*').eq('date', row.date).eq('schedule_group', room.schedule_group);
      if (row.term_id) query = query.eq('term_id', row.term_id);
      const { data: day, error } = await query.maybeSingle();
      if (error || !day) invalid('ไม่พบวันเข้าแถวที่ตรงกับห้องและภาคเรียน');
      const exceptionResponse = await readDatabaseRows('room_lineup_exceptions', new URLSearchParams({ select: '*', room_id: `eq.${room.room_id}`, term_id: `eq.${day.term_id}` }));
      if (!exceptionResponse.ok) throw Object.assign(new Error('ไม่สามารถตรวจสอบวันเข้าแถวได้'), { status: 503 });
      const exceptions = await exceptionResponse.json();
      const effective = applyRoomExceptionToSchoolDay({ schoolDay: day, roomExceptions: exceptions });
      if (!isTrueValue(effective.is_lineup_day)) invalid('วันที่เลือกไม่ใช่วันเข้าแถว');
      days.set(key, effective);
    }
    const day = days.get(key);
    result.push({
      att_id: buildAttendanceId(row.date, room.room_id, student.student_id),
      date: row.date, room_id: room.room_id, student_id: student.student_id,
      term_id: day.term_id, week_no: day.week_no || '', month_key: day.month_key || row.date.slice(0, 7),
      status, checked_by: user.teacher_id, checked_at: new Date().toISOString(),
    });
  }
  return Array.isArray(input) ? result : result[0];
}
