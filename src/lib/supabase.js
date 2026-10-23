import { createClient } from '@supabase/supabase-js';

// Keep the existing query builders and page templates. Every operation goes
// through our server, which verifies the HTTP-only session and current access.
export const supabase = createClient('https://attendance.invalid', 'server-session', {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: {
    fetch: async (input, init = {}) => {
      const url = new URL(typeof input === 'string' ? input : input.url);
      const table = url.pathname.replace(/^\/rest\/v1\//, '');
      const headers = new Headers(init.headers);
      const forwarded = new Headers();
      for (const name of ['content-type', 'accept', 'prefer', 'range', 'range-unit']) {
        if (headers.has(name)) forwarded.set(name, headers.get(name));
      }
      const response = await fetch(`/api/data/${encodeURIComponent(table)}${url.search}`, {
        ...init, headers: forwarded, credentials: 'same-origin', cache: 'no-store',
      });
      if (response.status === 401 && typeof window !== 'undefined') {
        localStorage.removeItem('rtc_attendance_user');
        window.location.replace('/');
      }
      return response;
    },
  },
});

export async function logoutSession() {
  const response = await fetch('/api/logout', { method: 'POST' });
  if (!response.ok) throw new Error('ออกจากระบบไม่สำเร็จ กรุณาลองใหม่');
  localStorage.removeItem('rtc_attendance_user');
}
