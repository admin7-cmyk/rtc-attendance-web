import { createClient } from '@supabase/supabase-js';
import { isTrueValue } from '../attendanceLogic.mjs';
import { readSession, SESSION_COOKIE, sessionMatchesUser } from './session.mjs';

export function serverConfig() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase server environment is not configured');
  return { url, key };
}

export function createServerSupabaseClient() {
  const { url, key } = serverConfig();
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
}

export async function requireUser(request) {
  const claims = readSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!claims) throw Object.assign(new Error('กรุณาเข้าสู่ระบบใหม่'), { status: 401 });
  const client = createServerSupabaseClient();
  const { data: user, error } = await client.from('app_users')
    .select('teacher_id, username, pin, name, role, room_ids, active')
    .eq('teacher_id', claims.sub).maybeSingle();
  if (error) throw Object.assign(new Error('ไม่สามารถตรวจสอบผู้ใช้งานได้ กรุณาลองใหม่'), { status: 503 });
  if (!user || !isTrueValue(user.active) || !sessionMatchesUser(claims, user)) {
    throw Object.assign(new Error('กรุณาเข้าสู่ระบบใหม่'), { status: 401 });
  }
  return { user, client };
}
