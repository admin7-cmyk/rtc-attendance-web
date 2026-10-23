import { NextResponse } from 'next/server';
import { isTrueValue } from '@/lib/attendanceLogic.mjs';
import { hashPin, isHashedPin, verifyPin } from '@/lib/pinHash.mjs';
import { createServerSupabaseClient } from '@/lib/server/supabase.mjs';
import { assertSameOrigin, publicUser, setSessionCookie } from '@/lib/server/session.mjs';
import { allowLoginAttempt, clearLoginAttempts } from '@/lib/server/loginLimit.mjs';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    assertSameOrigin(request);
    if (Number(request.headers.get('content-length') || 0) > 4096) {
      return NextResponse.json({ error: 'Invalid login request' }, { status: 413 });
    }
    const body = await request.json();
    const username = String(body?.username || '').trim();
    const pin = String(body?.pin || '').trim();
    // Validate signing configuration before any legacy-PIN upgrade can write.
    if (!(process.env.SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY) || (process.env.SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY).length < 32) {
      throw new Error('Server session configuration is missing');
    }

    if (!username || !pin || username.length > 128 || pin.length > 256) {
      return NextResponse.json(
        { error: 'Username and PIN are required' },
        { status: 400 }
      );
    }

    const attemptKey = `username:${username.toLowerCase()}`;
    const ipKey = `ip:${request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local'}`;
    if (!allowLoginAttempt(attemptKey) || !allowLoginAttempt(ipKey, Date.now(), 100)) {
      return NextResponse.json({ error: 'ลองเข้าสู่ระบบหลายครั้งเกินไป กรุณาลองใหม่ภายหลัง' }, { status: 429, headers: { 'Retry-After': '900' } });
    }

    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from('app_users')
      .select('teacher_id, username, pin, name, role, room_ids, active')
      .eq('username', username)
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!data || !(await verifyPin(pin, data.pin))) {
      return NextResponse.json(
        { error: 'Username or PIN is incorrect' },
        { status: 401 }
      );
    }

    if (!isTrueValue(data.active)) {
      return NextResponse.json(
        { error: 'This account is disabled' },
        { status: 403 }
      );
    }

    if (!isHashedPin(data.pin) && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const upgradedPin = await hashPin(pin);
        const { data: upgraded, error: upgradeError } = await supabase
          .from('app_users')
          .update({ pin: upgradedPin })
          .eq('teacher_id', data.teacher_id)
          .eq('pin', data.pin)
          .select('pin')
          .maybeSingle();
        if (!upgradeError && upgraded) data.pin = upgraded.pin;
        // Another successful login can have upgraded the same legacy PIN.
        if (!upgradeError && !upgraded) {
          const { data: latest } = await supabase.from('app_users').select('pin').eq('teacher_id', data.teacher_id).maybeSingle();
          if (latest && await verifyPin(pin, latest.pin)) data.pin = latest.pin;
        }
      } catch {
        // Keep login available even if legacy PIN migration cannot complete.
      }
    }

    clearLoginAttempts(attemptKey);
    return setSessionCookie(NextResponse.json({ user: publicUser(data) }), data, request);
  } catch (err) {
    return NextResponse.json(
      { error: err.status ? err.message : 'ไม่สามารถเข้าสู่ระบบได้ กรุณาลองใหม่' },
      { status: err.status || 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
