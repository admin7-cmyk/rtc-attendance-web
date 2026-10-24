import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/server/supabase.mjs';
import { faceLabAllowed } from '@/lib/face/lab-access.mjs';
import FaceLab from '@/components/face/FaceLab';

export const dynamic = 'force-dynamic';

export default async function FaceLabPage() {
  if (process.env.FACE_LAB_ENABLED !== 'true') notFound();
  let user;
  try {
    const jar = await cookies();
    ({ user } = await requireUser({ cookies: jar }));
  } catch { redirect('/'); }
  if (!faceLabAllowed({ enabled: process.env.FACE_LAB_ENABLED, user })) notFound();
  return <FaceLab />;
}
