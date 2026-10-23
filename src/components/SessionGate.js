'use client';

import { useEffect, useState } from 'react';

export default function SessionGate({ children }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function restoreSession() {
      try {
        const response = await fetch('/api/session', { cache: 'no-store' });
        const payload = await response.json();
        if (cancelled) return;
        if (response.ok) {
          localStorage.setItem('rtc_attendance_user', JSON.stringify(payload.user));
        } else if (response.status === 401) {
          localStorage.removeItem('rtc_attendance_user');
          if (window.location.pathname !== '/') {
            window.location.replace('/');
            return;
          }
        } else {
          throw new Error(payload.error || 'ไม่สามารถเชื่อมต่อระบบได้');
        }
        setReady(true);
      } catch (err) {
        if (!cancelled) setError(err.message || 'ไม่สามารถเชื่อมต่อระบบได้');
      }
    }
    restoreSession();
    return () => { cancelled = true; };
  }, []);

  if (ready) return children;
  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-5xl rounded-3xl bg-white p-8 text-center text-slate-600 shadow-sm">
        {error || 'กำลังโหลดข้อมูล...'}
        {error && <button className="ml-3 rounded-full bg-sky-600 px-4 py-2 text-white" onClick={() => window.location.reload()}>ลองใหม่</button>}
      </div>
    </main>
  );
}
