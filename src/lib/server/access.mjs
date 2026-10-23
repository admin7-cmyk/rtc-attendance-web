import { cleanText, normalizeRoomId, parseRoomIds } from '../attendanceLogic.mjs';

export const TABLE_KEYS = {
  app_users: ['teacher_id'], rooms: ['room_id'], students: ['student_id'], terms: ['term_id'],
  school_days: ['date', 'term_id', 'schedule_group'], attendance: ['att_id'],
  room_lineup_exceptions: ['id'], audit_logs: ['log_id'],
  room_term_summary: ['term_id', 'room_id'], student_term_summary: ['term_id', 'room_id', 'student_id'],
};
const ROOM_TABLES = new Set(['rooms', 'students', 'attendance', 'room_lineup_exceptions', 'room_term_summary', 'student_term_summary']);
const READ_ONLY = new Set(['audit_logs', 'room_term_summary', 'student_term_summary']);

export function isAdmin(user) {
  return cleanText(user?.role).toLowerCase() === 'admin';
}

export function canAccessRoom(user, roomId) {
  const allowed = parseRoomIds(user?.room_ids);
  return isAdmin(user) || allowed.includes('ALL') || allowed.some((id) => normalizeRoomId(id) === normalizeRoomId(roomId));
}

export function authorizeTable(user, table, method) {
  if (!Object.hasOwn(TABLE_KEYS, table)) throw Object.assign(new Error('Unknown table'), { status: 404 });
  const read = method === 'GET' || method === 'HEAD';
  if ((!read && READ_ONLY.has(table)) || (!isAdmin(user) && (table === 'app_users' || table === 'audit_logs' || (!read && table !== 'attendance')))) {
    throw Object.assign(new Error('ไม่มีสิทธิ์ดำเนินการรายการนี้'), { status: 403 });
  }
  // Attendance deletion is an administrative operation.
  if (method === 'DELETE' && !isAdmin(user)) throw Object.assign(new Error('ไม่มีสิทธิ์ลบข้อมูลเช็กชื่อ'), { status: 403 });
  return { roomScoped: ROOM_TABLES.has(table) && !isAdmin(user) && !parseRoomIds(user.room_ids).includes('ALL') };
}

export function constrainRooms(params, roomIds) {
  const next = new URLSearchParams(params);
  const quoted = roomIds.map((id) => `"${String(id).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
  // Append an AND constraint; never replace a caller's narrower room filter.
  next.append('room_id', `in.(${quoted.join(',')})`);
  return next;
}

export function validateQuery(params) {
  for (const [key, value] of params) {
    if (!/^[a-z_][a-z0-9_]*$/.test(key) || value.length > 60000 || ['or', 'and', 'not'].includes(key)) {
      throw Object.assign(new Error('Invalid query'), { status: 400 });
    }
    if (key === 'select' && !/^(\*|[a-z_][a-z0-9_]*(,[a-z_][a-z0-9_]*)*)$/.test(value.replace(/\s/g, ''))) {
      throw Object.assign(new Error('Related-table queries are not supported'), { status: 400 });
    }
  }
}
