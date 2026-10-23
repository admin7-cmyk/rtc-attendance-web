import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/server/supabase.mjs';
import { assertSameOrigin } from '@/lib/server/session.mjs';
import { validatePromotion } from '@/lib/server/promotion.mjs';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    assertSameOrigin(request);
    const { user, client } = await requireUser(request);
    const text = await request.text();
    if (text.length > 5_000_000) return NextResponse.json({ error: 'Request is too large' }, { status: 413 });
    const changes = validatePromotion(user, JSON.parse(text));
    const { data, error } = await client.rpc('rtc_promote_students', changes);
    if (error) {
      if (['PGRST202', '42501', '42883'].includes(error.code)) {
        return NextResponse.json({ error: 'ยังไม่ได้เปิดใช้การเลื่อนชั้นแบบปลอดภัย กรุณาให้ผู้ดูแลติดตั้ง SQL และตั้งค่า server key ก่อน (ยังไม่มีข้อมูลถูกเปลี่ยนแปลง)' }, { status: 503 });
      }
      return NextResponse.json({ error: error.code === '40001' ? 'ข้อมูลเปลี่ยนแปลงระหว่างทำรายการ กรุณาโหลดข้อมูลและตรวจสอบอีกครั้ง (ไม่มีข้อมูลถูกเปลี่ยนแปลง)' : error.message }, { status: 409 });
    }
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error.status ? error.message : 'ไม่สามารถเลื่อนชั้นได้ กรุณาลองใหม่' }, { status: error.status || 500 });
  }
}
