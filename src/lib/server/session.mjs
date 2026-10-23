import { createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'rtc_attendance_session';
export const SESSION_SECONDS = 60 * 60 * 24 * 7;

function signingKey() {
  const key = process.env.SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || key.length < 32) throw new Error('Configure SESSION_SECRET (at least 32 characters) on the server');
  return key;
}

function signature(value) {
  return createHmac('sha256', signingKey()).update(value).digest('base64url');
}

function equal(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createSession(user, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({
    sub: user.teacher_id,
    exp: Math.floor(now / 1000) + SESSION_SECONDS,
    pv: signature(String(user.pin)),
  })).toString('base64url');
  return `${payload}.${signature(payload)}`;
}

export function readSession(token, now = Date.now()) {
  try {
    if (typeof token !== 'string' || token.length > 2048) return null;
    const [payload, mac, extra] = token.split('.');
    if (extra || !payload || !equal(mac, signature(payload))) return null;
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof claims.sub !== 'string' || !claims.sub || !Number.isFinite(claims.exp) || claims.exp <= now / 1000) return null;
    return claims;
  } catch {
    return null;
  }
}

export function sessionMatchesUser(claims, user) {
  return Boolean(claims && user && claims.sub === user.teacher_id && equal(claims.pv, signature(String(user.pin))));
}

export function publicUser(user) {
  return Object.fromEntries(['teacher_id', 'username', 'name', 'role', 'room_ids', 'active'].map((field) => [field, user[field]]));
}

export function setSessionCookie(response, user, request) {
  response.cookies.set(SESSION_COOKIE, createSession(user), {
    httpOnly: true,
    sameSite: 'lax',
    secure: new URL(request.url).protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https',
    path: '/',
    maxAge: SESSION_SECONDS,
  });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export function assertSameOrigin(request) {
  const origin = request.headers.get('origin');
  // Next's internal request URL may use an internal host behind a proxy.
  // Browsers cannot override Host; compare Origin with the actual Host header.
  const host = request.headers.get('host') || new URL(request.url).host;
  if (request.headers.get('sec-fetch-site') === 'cross-site' || (origin && new URL(origin).host !== host)) {
    throw Object.assign(new Error('Cross-site request rejected'), { status: 403 });
  }
}
