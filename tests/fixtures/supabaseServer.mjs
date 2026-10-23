// Standalone, loopback-only synthetic Supabase API for integration checks.
// Never imports .env.local or connects to the school's database.
import http from 'node:http';
import { hashPin } from '../../src/lib/pinHash.mjs';

const port = Number(process.argv[2] || 54329);
const studentCount = process.argv.includes('--small') ? 13 : 1251;
const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
const rows = {
  app_users: [
    { teacher_id: 'T1', username: 'test-teacher', pin: await hashPin('1111'), name: 'Test Teacher', role: 'teacher', room_ids: 'R1', active: 'TRUE' },
    { teacher_id: 'A1', username: 'test-admin', pin: '2222', name: 'Test Admin', role: 'admin', room_ids: 'ALL', active: 'TRUE' },
    { teacher_id: 'D1', username: 'test-disabled', pin: '3333', name: 'Disabled', role: 'teacher', room_ids: 'R1', active: 'FALSE' },
  ],
  rooms: [
    { room_id: 'R1', room_name: 'Test Room 1', level: 'ปวช', year: '1', room_no: '1', schedule_group: 'G1' },
    { room_id: 'R2', room_name: 'Test Room 2', level: 'ปวช', year: '2', room_no: '1', schedule_group: 'G1' },
  ],
  students: Array.from({ length: studentCount }, (_, id) => ({ student_id: String(10000000 + id), prefix: '', first_name: `Student ${id}`, last_name: 'Test', level: 'ปวช', year: '1', room_no: '1', room_id: id === studentCount - 1 ? 'R2' : 'R1', active: 'TRUE' })),
  terms: [{ term_id: 'T1', term_name: 'Test term', start_date: '2026-01-01', end_date: '2026-12-31', total_weeks: 48 }],
  school_days: [{ date, term_id: 'T1', week_no: '1', month_key: date.slice(0, 7), schedule_group: 'G1', level_group: 'ปวช', is_lineup_day: 'TRUE', note: '' }],
  attendance: [], room_lineup_exceptions: [], audit_logs: [], room_term_summary: [], student_term_summary: [],
};
const keys = { app_users: 'teacher_id', students: 'student_id', rooms: 'room_id', terms: 'term_id', attendance: 'att_id', room_lineup_exceptions: 'id' };
const writes = [];
function match(row, params) {
  for (const [key, expression] of params) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(key)) continue;
    const dot = expression.indexOf('.');
    const op = expression.slice(0, dot);
    const value = expression.slice(dot + 1);
    const actual = String(row[key] ?? '');
    if (op === 'eq' && actual !== value) return false;
    if (op === 'neq' && actual === value) return false;
    if (op === 'gte' && actual < value) return false;
    if (op === 'lte' && actual > value) return false;
    if (op === 'in') {
      const list = value.slice(1, -1).split(',').map((item) => item.replace(/^"|"$/g, ''));
      if (!list.includes(actual)) return false;
    }
  }
  return true;
}
function project(row, columns) {
  return !columns || columns === '*' ? row : Object.fromEntries(columns.split(',').map((key) => [key, row[key]]));
}
function send(response, status, data, headers = {}) {
  response.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  response.end(data === undefined ? undefined : JSON.stringify(data));
}

http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://127.0.0.1:${port}`);
    let text = '';
    for await (const chunk of request) text += chunk;
    if (url.pathname === '/__status') return send(response, 200, { fixture: true, date, writes: writes.map((write) => ({ method: write.method, table: write.table })), teacherActive: rows.app_users[0].active });
    if (url.pathname === '/__shutdown' && request.method === 'POST') { send(response, 200, { ok: true }); response.on('finish', () => process.exit(0)); return; }
    if (url.pathname === '/__disable-teacher' && request.method === 'POST') { rows.app_users[0].active = 'FALSE'; return send(response, 200, { ok: true }); }
    if (request.headers.apikey !== 'fixture-service-role-key') return send(response, 401, { message: 'Fixture API key required' });
    if (url.pathname === '/rest/v1/rpc/rtc_promote_students') {
      writes.push({ method: 'RPC', table: 'rtc_promote_students' });
      const body = JSON.parse(text);
      const students = body.student_changes;
      const teachers = body.teacher_changes;
      for (const [changes, table, key] of [[students, 'students', 'student_id'], [teachers, 'app_users', 'teacher_id']]) {
        for (const item of changes) {
          const current = rows[table].find((row) => row[key] === item[key]);
          if (!current || Object.entries(item.before).some(([field, value]) => String(current[field] ?? '') !== value)) return send(response, 409, { code: '40001', message: 'Changed since preview' });
        }
      }
      for (const [changes, table, key] of [[students, 'students', 'student_id'], [teachers, 'app_users', 'teacher_id']]) {
        for (const item of changes) Object.assign(rows[table].find((row) => row[key] === item[key]), item.after);
      }
      return send(response, 200, { students: students.length, teachers: teachers.length });
    }
    const table = url.pathname.replace('/rest/v1/', '');
    if (!Object.hasOwn(rows, table)) return send(response, 404, { message: 'Unknown fixture table' });
    let selected = rows[table].filter((row) => match(row, url.searchParams));
    if (request.method === 'GET' || request.method === 'HEAD') {
      const total = selected.length;
      const order = url.searchParams.get('order')?.split(',') || [];
      selected.sort((a, b) => {
        for (const expression of order) {
          const [field, direction] = expression.split('.');
          const comparison = String(a[field] ?? '').localeCompare(String(b[field] ?? ''));
          if (comparison) return direction === 'desc' ? -comparison : comparison;
        }
        return 0;
      });
      const offset = Number(url.searchParams.get('offset') || 0);
      selected = selected.slice(offset, offset + Math.min(Number(url.searchParams.get('limit') || 137), 137));
      const headers = { 'Content-Range': `${offset}-${offset + selected.length - 1}/${total}` };
      const data = selected.map((row) => project(row, url.searchParams.get('select')));
      if (request.headers.accept?.includes('vnd.pgrst.object')) {
        if (data.length !== 1) return send(response, 406, { code: 'PGRST116', details: `${data.length} rows`, message: 'Single row expected' }, headers);
        return send(response, 200, data[0], headers);
      }
      return send(response, 200, request.method === 'HEAD' ? undefined : data, headers);
    }
    writes.push({ table, method: request.method });
    let changed = [];
    if (request.method === 'POST') {
      const payload = JSON.parse(text);
      changed = Array.isArray(payload) ? payload : [payload];
      for (const item of changed) {
        const existing = rows[table].find((row) => row[keys[table]] === item[keys[table]]);
        if (existing) Object.assign(existing, item);
        else rows[table].push(item);
      }
    } else if (request.method === 'PATCH') {
      const payload = JSON.parse(text);
      selected.forEach((row) => Object.assign(row, payload));
      changed = selected;
    } else if (request.method === 'DELETE') rows[table] = rows[table].filter((row) => !selected.includes(row));
    if (request.headers.prefer?.includes('return=representation')) return send(response, 200, changed.map((row) => project(row, url.searchParams.get('select'))));
    return send(response, 204);
  } catch (error) {
    send(response, 500, { message: error.message });
  }
}).listen(port, '127.0.0.1', () => console.log(`Synthetic Supabase fixture listening on http://127.0.0.1:${port}`));
