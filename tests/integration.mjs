import assert from 'node:assert/strict';

const base = process.argv[2] || 'http://127.0.0.1:3107';
const fixture = process.argv[3] || 'http://127.0.0.1:54329';
for (const url of [base, fixture]) assert.equal(new URL(url).hostname, '127.0.0.1', 'Integration checks are loopback-only');
const status = await (await fetch(`${fixture}/__status`)).json();
assert.equal(status.fixture, true, 'A synthetic fixture server is required');
const date = status.date;
let checks = 0;
const pass = (message) => { checks += 1; console.log(`PASS ${message}`); };

async function request(path, { cookie, body, headers, ...options } = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json', Origin: base } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { response, data, cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
const login = (username, pin) => request('/api/login', { method: 'POST', body: { username, pin } });

assert.equal((await request('/api/data/rooms?select=*')).response.status, 401);
pass('anonymous table reads require a signed session');
assert.equal((await login('test-teacher', '9999')).response.status, 401);
assert.equal((await login('test-disabled', '3333')).response.status, 403);
pass('incorrect PINs and disabled accounts are rejected');

const teacherLogin = await login('test-teacher', '1111');
assert.equal(teacherLogin.response.status, 200);
assert.ok(teacherLogin.cookie);
assert.match(teacherLogin.response.headers.get('set-cookie'), /HttpOnly/i);
assert.match(teacherLogin.response.headers.get('set-cookie'), /SameSite=Lax/i);
assert.equal(Object.hasOwn(teacherLogin.data.user, 'pin'), false);
const teacherCookie = teacherLogin.cookie;
assert.equal((await request('/api/session', { cookie: teacherCookie })).data.user.role, 'teacher');
pass('the same username/PIN flow establishes an HTTP-only session');

assert.equal((await request('/api/data/app_users?select=*', { cookie: teacherCookie })).response.status, 403);
assert.equal((await request('/api/data/students', { method: 'POST', cookie: teacherCookie, body: { student_id: 'forged', room_id: 'R1' } })).response.status, 403);
assert.equal((await request('/api/data/rooms', { cookie: `${teacherCookie}x`, headers: { 'x-user-role': 'admin' } })).response.status, 401);
pass('forged roles/cookies and teacher admin operations are blocked');

const students = await request('/api/data/students?select=*&order=student_id.asc', { cookie: teacherCookie });
assert.equal(students.response.status, 200);
assert.equal(students.data.length, 1250);
assert.ok(students.data.every((student) => student.room_id === 'R1'));
const range = await request('/api/data/students?select=*&offset=100&limit=1000', { cookie: teacherCookie });
assert.equal(range.data.length, 1000);
assert.equal((await request('/api/data/students?select=*&room_id=eq.R2', { cookie: teacherCookie })).data.length, 0);
pass('full and paginated reads pass 1,000 rows while enforcing room permissions');

const forgedAttendance = { att_id: 'forged', date, term_id: 'T1', room_id: 'R1', student_id: '10000000', status: 'P', checked_by: 'A1', checked_at: '1900-01-01' };
const saved = await request('/api/data/attendance?on_conflict=att_id', { method: 'POST', cookie: teacherCookie, headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: [forgedAttendance] });
assert.equal(saved.response.status, 200);
assert.equal(saved.data[0].checked_by, 'T1');
assert.equal(saved.data[0].att_id, `${date}_R1_10000000`);
assert.notEqual(saved.data[0].checked_at, '1900-01-01');
const wrongRoom = await request('/api/data/attendance', { method: 'POST', cookie: teacherCookie, body: [{ ...forgedAttendance, room_id: 'R2', student_id: '10001250' }] });
assert.equal(wrongRoom.response.status, 403);
const crossSite = await request('/api/data/attendance', { method: 'POST', cookie: teacherCookie, body: [forgedAttendance], headers: { Origin: 'https://attacker.example' } });
assert.equal(crossSite.response.status, 403);
pass('attendance writes verify student/room/calendar and use the server-confirmed author');

const adminLogin = await login('test-admin', '2222');
assert.equal(adminLogin.response.status, 200);
const adminCookie = adminLogin.cookie;
assert.equal((await request('/api/session', { cookie: adminCookie })).response.status, 200);
const users = await request('/api/data/app_users?select=teacher_id,username,pin', { cookie: adminCookie });
assert.equal(users.data.length, 3);
assert.match(users.data.find((user) => user.teacher_id === 'A1').pin, /^pbkdf2_sha256\$/);
const counts = await request('/api/data/students?select=*', { method: 'HEAD', cookie: adminCookie, headers: { Prefer: 'count=exact' } });
assert.match(counts.response.headers.get('content-range'), /\/1251$/);
pass('legacy-PIN upgrade, admin reads, and exact backup counts work');

const original = students.data[0];
const before = Object.fromEntries(['level', 'year', 'room_no', 'room_id', 'active'].map((field) => [field, String(original[field] ?? '')]));
const batch = { students: [{ student_id: original.student_id, before, after: { room_id: 'R2', year: '2' } }], teachers: [] };
assert.equal((await request('/api/promote', { method: 'POST', cookie: teacherCookie, body: batch })).response.status, 403);
assert.equal((await request('/api/promote', { method: 'POST', cookie: adminCookie, body: batch })).response.status, 200);
assert.equal((await request('/api/promote', { method: 'POST', cookie: adminCookie, body: batch })).response.status, 409);
pass('promotion is one RPC and rejects a stale preview');

await fetch(`${fixture}/__disable-teacher`, { method: 'POST' });
assert.equal((await request('/api/data/rooms?select=*', { cookie: teacherCookie })).response.status, 401);
const logout = await request('/api/logout', { method: 'POST', cookie: adminCookie, headers: { Origin: base } });
assert.equal(logout.response.status, 200);
assert.match(logout.response.headers.get('set-cookie'), /Max-Age=0/i);
pass('account deactivation takes effect immediately and logout clears the session cookie');
console.log(`Integration checks passed: ${checks}. Only synthetic fixture data was used.`);
