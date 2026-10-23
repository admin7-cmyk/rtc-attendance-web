import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/server/supabase.mjs';
import { publicUser, setSessionCookie } from '@/lib/server/session.mjs';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { user } = await requireUser(request);
    return setSessionCookie(NextResponse.json({ user: publicUser(user) }), user, request);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
