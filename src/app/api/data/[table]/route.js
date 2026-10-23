import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/server/supabase.mjs';
import { assertSameOrigin, setSessionCookie } from '@/lib/server/session.mjs';
import { authorizeTable, canAccessRoom, constrainRooms, isAdmin, validateQuery } from '@/lib/server/access.mjs';
import { databaseFetch, readDatabaseRows } from '@/lib/server/rest.mjs';
import { prepareTeacherAttendance } from '@/lib/server/attendance.mjs';
import { normalizeStoredPin } from '@/lib/pinHash.mjs';

export const dynamic = 'force-dynamic';

async function handle(request, context) {
  try {
    const read = request.method === 'GET' || request.method === 'HEAD';
    if (!read) assertSameOrigin(request);
    const { user, client } = await requireUser(request);
    const { table } = await context.params;
    const { roomScoped } = authorizeTable(user, table, request.method);
    let params = new URL(request.url).searchParams;
    validateQuery(params);
    if (!read && ['PATCH', 'DELETE'].includes(request.method) && ![...params.keys()].some((key) => !['select', 'order', 'limit', 'offset', 'on_conflict'].includes(key))) {
      return NextResponse.json({ message: 'A record filter is required' }, { status: 400 });
    }
    if (!read && !isAdmin(user) && request.method !== 'POST') {
      return NextResponse.json({ message: 'ไม่มีสิทธิ์ดำเนินการรายการนี้' }, { status: 403 });
    }
    if (roomScoped) {
      const roomResponse = await readDatabaseRows('rooms', new URLSearchParams({ select: 'room_id' }));
      if (!roomResponse.ok) throw Object.assign(new Error('ไม่สามารถตรวจสอบสิทธิ์ห้องเรียนได้'), { status: 503 });
      const rooms = await roomResponse.json();
      params = constrainRooms(params, rooms.filter((room) => canAccessRoom(user, room.room_id)).map((room) => room.room_id));
    }
    const headers = {};
    for (const name of ['Accept', 'Content-Type', 'Prefer']) {
      if (request.headers.has(name)) headers[name] = request.headers.get(name);
    }
    // Range may be sent as a URL modifier or HTTP header by supabase-js.
    const range = request.headers.get('range');
    if (read && range) {
      const match = range.match(/^(\d+)-(\d+)$/);
      if (!match) return NextResponse.json({ message: 'Invalid range' }, { status: 400 });
      params.set('offset', match[1]);
      params.set('limit', String(Number(match[2]) - Number(match[1]) + 1));
    }
    let body;
    if (!read && request.method !== 'DELETE') {
      if (Number(request.headers.get('content-length') || 0) > 5_000_000) return NextResponse.json({ message: 'Request is too large' }, { status: 413 });
      const text = await request.text();
      if (text.length > 5_000_000) return NextResponse.json({ message: 'Request is too large' }, { status: 413 });
      let payload = JSON.parse(text);
      if (!payload || typeof payload !== 'object' || (Array.isArray(payload) && payload.some((row) => !row || typeof row !== 'object' || Array.isArray(row)))) {
        return NextResponse.json({ message: 'Invalid records' }, { status: 400 });
      }
      if (!isAdmin(user)) payload = await prepareTeacherAttendance(client, payload, user);
      if (table === 'app_users') {
        const normalizeUser = async (row) => Object.hasOwn(row, 'pin') ? { ...row, pin: await normalizeStoredPin(row.pin) } : row;
        payload = Array.isArray(payload) ? await Promise.all(payload.map(normalizeUser)) : await normalizeUser(payload);
      }
      body = JSON.stringify(payload);
      headers['Content-Type'] = 'application/json';
    }
    const options = { method: request.method, headers, body, signal: request.signal };
    const upstream = read ? await readDatabaseRows(table, params, options) : await databaseFetch(table, params, options);
    const outgoingHeaders = new Headers({ 'Cache-Control': 'no-store' });
    for (const name of ['content-type', 'content-range', 'preference-applied']) {
      if (upstream.headers.has(name)) outgoingHeaders.set(name, upstream.headers.get(name));
    }
    const response = new NextResponse(request.method === 'HEAD' || [204, 304].includes(upstream.status) ? null : await upstream.text(), { status: upstream.status, headers: outgoingHeaders });
    return setSessionCookie(response, user, request);
  } catch (error) {
    const status = error.status || (error instanceof SyntaxError ? 400 : 500);
    return NextResponse.json({ message: error.status ? error.message : 'ไม่สามารถดำเนินการได้ กรุณาลองใหม่', code: `RTC_${status}` }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
}

export { handle as GET, handle as HEAD, handle as POST, handle as PATCH, handle as DELETE };
