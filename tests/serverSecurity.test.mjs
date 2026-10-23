import assert from 'node:assert/strict';
import test from 'node:test';
import { createSession, readSession, sessionMatchesUser, publicUser, assertSameOrigin, setSessionCookie } from '../src/lib/server/session.mjs';
import { authorizeTable, canAccessRoom, constrainRooms, validateQuery } from '../src/lib/server/access.mjs';
import { readDatabaseRows } from '../src/lib/server/rest.mjs';
import { validatePromotion } from '../src/lib/server/promotion.mjs';

process.env.SESSION_SECRET = 'a-test-only-private-secret-with-at-least-32-characters';
const teacher = { teacher_id: 'T1', username: 'teacher', pin: 'legacy-test-pin', role: 'teacher', room_ids: 'R1', active: 'TRUE' };
const admin = { ...teacher, role: 'admin', room_ids: 'ALL' };

test('signed sessions reject changed identities, invalid signatures, expired cookies, and changed PINs', () => {
  const now = Date.now();
  const token = createSession(teacher, now);
  assert.equal(sessionMatchesUser(readSession(token, now), teacher), true);
  const [payload, mac] = token.split('.');
  const changed = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url')), sub: 'admin' })).toString('base64url');
  assert.equal(readSession(`${changed}.${mac}`, now), null);
  assert.equal(readSession(`${payload}.forged`, now), null);
  assert.equal(readSession(token, now + 8 * 24 * 3600 * 1000), null);
  assert.equal(sessionMatchesUser(readSession(token, now), { ...teacher, pin: 'new-pin' }), false);
  assert.equal(Object.hasOwn(publicUser(teacher), 'pin'), false);
});

test('teacher permissions come from the verified account and reject admin tables and writes', () => {
  assert.throws(() => authorizeTable(teacher, 'app_users', 'GET'), { status: 403 });
  assert.throws(() => authorizeTable(teacher, 'students', 'POST'), { status: 403 });
  assert.throws(() => authorizeTable(teacher, 'attendance', 'DELETE'), { status: 403 });
  assert.throws(() => authorizeTable(admin, 'audit_logs', 'POST'), { status: 403 });
  assert.throws(() => authorizeTable(admin, 'unknown', 'GET'), { status: 404 });
  assert.equal(authorizeTable(teacher, 'attendance', 'GET').roomScoped, true);
  assert.equal(canAccessRoom(teacher, 'R2'), false);
  assert.equal(canAccessRoom({ ...teacher, room_ids: 'ALL' }, 'R2'), true);
  const params = constrainRooms(new URLSearchParams({ room_id: 'eq.R2' }), ['R1']);
  assert.deepEqual(params.getAll('room_id'), ['eq.R2', 'in.("R1")']);
  assert.throws(() => validateQuery(new URLSearchParams({ select: '*,app_users(pin)' })), { status: 400 });
});

test('state-changing requests reject cross-site origins', () => {
  assert.throws(() => assertSameOrigin(new Request('https://attendance.example/api/data/attendance', { headers: { origin: 'https://attacker.example' } })), { status: 403 });
  assert.doesNotThrow(() => assertSameOrigin(new Request('https://attendance.example/api/data/attendance', { headers: { origin: 'https://attendance.example' } })));
  assert.doesNotThrow(() => assertSameOrigin(new Request('http://internal:3000/api/data/attendance', { headers: { host: 'attendance.example', origin: 'https://attendance.example' } })));
});

test('session cookies stay secure when Vercel terminates HTTPS before forwarding the request', () => {
  let options;
  const response = { cookies: { set: (_name, _value, value) => { options = value; } }, headers: new Headers() };
  setSessionCookie(response, teacher, new Request('http://internal:3000/api/session', { headers: { 'x-forwarded-proto': 'https' } }));
  assert.equal(options.secure, true);
  assert.equal(options.httpOnly, true);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});

test('unlimited reads and explicit ranges continue past a small upstream response cap', async () => {
  const rows = Array.from({ length: 1234 }, (_, id) => ({ student_id: String(id) }));
  let calls = 0;
  const fetchPage = async (table, params) => {
    calls += 1;
    const start = Number(params.get('offset'));
    const size = Math.min(Number(params.get('limit')), 137);
    assert.match(params.get('order'), /student_id\.asc/);
    const page = rows.slice(start, start + size);
    return Response.json(page, { headers: { 'Content-Range': `${start}-${start + page.length - 1}/${rows.length}` } });
  };
  const all = await readDatabaseRows('students', new URLSearchParams({ select: '*' }), {}, fetchPage);
  assert.deepEqual(await all.json(), rows);
  assert.ok(calls > 1);
  const range = await readDatabaseRows('students', new URLSearchParams({ offset: '100', limit: '1000' }), {}, fetchPage);
  assert.deepEqual(await range.json(), rows.slice(100, 1100));
});

test('a later page failure does not return a successful but incomplete dataset', async () => {
  let calls = 0;
  const response = await readDatabaseRows('students', new URLSearchParams(), {}, async () => {
    calls += 1;
    return calls === 1 ? Response.json([{ student_id: 'S1' }], { headers: { 'Content-Range': '0-0/2' } }) : Response.json({ message: 'temporarily unavailable' }, { status: 503 });
  });
  assert.equal(response.status, 503);
});

test('promotion requests require an admin, original values, and a unique set of IDs', () => {
  const change = { student_id: 'S1', before: { level: 'L', year: '1', room_no: '1', room_id: 'R1', active: 'TRUE' }, after: { room_id: 'R2', year: '2' } };
  assert.throws(() => validatePromotion(teacher, { students: [change], teachers: [] }), { status: 403 });
  assert.throws(() => validatePromotion(admin, { students: [change, change], teachers: [] }), { status: 400 });
  assert.throws(() => validatePromotion(admin, { students: [{ ...change, after: { first_name: 'overwrite' } }], teachers: [] }), { status: 400 });
  assert.deepEqual(validatePromotion(admin, { students: [change], teachers: [] }).student_changes, [change]);
});
