import { isAdmin } from './access.mjs';

const STUDENT_FIELDS = ['level', 'year', 'room_no', 'room_id', 'active'];
const TEACHER_FIELDS = ['room_ids'];

export function validatePromotion(user, body) {
  if (!isAdmin(user)) throw Object.assign(new Error('ไม่มีสิทธิ์เลื่อนชั้นนักเรียน'), { status: 403 });
  if (!body || !Array.isArray(body.students) || !Array.isArray(body.teachers) || !body.students.length || body.students.length > 10000 || body.teachers.length > 10000) {
    throw Object.assign(new Error('รายการเลื่อนชั้นไม่ถูกต้อง'), { status: 400 });
  }
  for (const [items, idField, fields, beforeFields] of [
    [body.students, 'student_id', STUDENT_FIELDS, STUDENT_FIELDS],
    [body.teachers, 'teacher_id', TEACHER_FIELDS, ['room_ids', 'role', 'active']],
  ]) {
    const ids = new Set();
    for (const item of items) {
      if (!item || typeof item[idField] !== 'string' || !item[idField] || ids.has(item[idField]) || !item.before || !item.after || Array.isArray(item.before) || Array.isArray(item.after)) {
        throw Object.assign(new Error('พบรายการซ้ำหรือข้อมูลไม่ครบ กรุณาโหลดข้อมูลใหม่'), { status: 400 });
      }
      ids.add(item[idField]);
      if (beforeFields.some((field) => typeof item.before[field] !== 'string') || !Object.keys(item.after).length ||
        Object.entries(item.after).some(([key, value]) => !fields.includes(key) || typeof value !== 'string' || value.length > 10000)) {
        throw Object.assign(new Error('ข้อมูลเลื่อนชั้นไม่ถูกต้อง'), { status: 400 });
      }
      if (item.after.active !== undefined && !['TRUE', 'FALSE'].includes(item.after.active)) throw Object.assign(new Error('สถานะนักเรียนไม่ถูกต้อง'), { status: 400 });
      if (Object.hasOwn(item.after, 'room_id') && !item.after.room_id.trim()) throw Object.assign(new Error('ไม่พบห้องปลายทาง'), { status: 400 });
    }
  }
  return { student_changes: body.students, teacher_changes: body.teachers };
}
