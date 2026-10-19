'use client';

import { useMemo, useState } from 'react';

const LOGO_SRC = '/brand/logo-ep.png';

const MAIN_MENUS = [
  { label: 'หน้าหลัก', path: '/', active: 'attendance' },
  { label: 'เช็กชื่อ', path: '/', active: 'attendance' },
  { label: 'สรุป', path: '/summary', active: 'summary' },
  { label: 'รายงาน', path: '/report', active: 'report' },
];

const ADMIN_MENUS = [
  { label: 'Admin Dashboard', path: '/admin', active: 'admin' },
  { label: 'ตรวจสุขภาพข้อมูล', path: '/admin-health', active: 'admin-health' },
  { label: 'Import Excel/CSV', path: '/admin-import', active: 'admin-import' },
  { label: 'สถานะวันนี้', path: '/daily-status', active: 'daily-status' },
  { label: 'ประวัติรายวัน', path: '/daily-history', active: 'daily-history' },
  { label: 'จัดการครู', path: '/admin-users', active: 'admin-users' },
  { label: 'จัดการนักเรียน', path: '/admin-students', active: 'admin-students' },
  { label: 'เลื่อนชั้นนักเรียน', path: '/admin-promote', active: 'admin-promote' },
  { label: 'จัดการห้องเรียน', path: '/admin-rooms', active: 'admin-rooms' },
  { label: 'ภาคเรียน / วันเข้าแถว', path: '/admin-terms', active: 'admin-terms' },
  { label: 'ข้อยกเว้นรายห้อง', path: '/admin-room-exceptions', active: 'admin-room-exceptions' },
  { label: 'Audit Logs', path: '/audit', active: 'audit' },
  { label: 'Backup', path: '/backup', active: 'backup' },
];

export default function AppNav({ currentUser, active = '' }) {
  const [open, setOpen] = useState(false);

  const isAdmin = useMemo(() => {
    return String(currentUser?.role || '').toLowerCase() === 'admin';
  }, [currentUser]);

  function go(path) {
    window.location.href = path;
  }

  function logout() {
    localStorage.removeItem('rtc_attendance_user');
    window.location.href = '/';
  }

  return (
    <nav className="relative z-50 mb-4 rounded-3xl bg-white shadow-sm ring-1 ring-slate-200">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => go('/')}
          className="flex min-w-0 items-center gap-3 text-left"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-sky-50 ring-1 ring-slate-200">
            <img
              src={LOGO_SRC}
              alt="EP Logo"
              className="h-full w-full object-contain p-0"
              style={{
                transform: 'scale(1.9)',
                transformOrigin: 'center',
              }}
            />
          </div>

          <div className="min-w-0">
            <div className="truncate text-base font-black text-slate-800">
              {currentUser?.name || 'ผู้ใช้งาน'}
            </div>
            <div className="truncate text-xs font-semibold text-slate-500">
              {currentUser?.role || '-'}
            </div>
          </div>
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={logout}
            className="rounded-2xl bg-slate-50 px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-100"
          >
            ออก
          </button>

          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-50 text-xl font-black text-slate-700 hover:bg-slate-100 lg:hidden"
          >
            ☰
          </button>
        </div>
      </div>

      <div className="rounded-b-3xl border-t border-slate-100 bg-sky-50/60 px-4 py-3">
        <div className="hidden flex-wrap items-center gap-2 lg:flex">
          {MAIN_MENUS.map((item, index) => (
            <button
              key={`${item.path}-${index}`}
              type="button"
              onClick={() => go(item.path)}
              className={getMenuClass(active === item.active)}
            >
              {item.label}
            </button>
          ))}

          {isAdmin && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setOpen((prev) => !prev)}
                className={getMenuClass(
                  ADMIN_MENUS.some((item) => item.active === active)
                )}
              >
                เมนูแอดมิน ▾
              </button>

              {open && (
                <div className="absolute right-0 top-[calc(100%+10px)] z-[9999] w-72 rounded-3xl border border-slate-200 bg-white p-2 shadow-2xl">
                  <div className="ep-scrollbar max-h-[70vh] overflow-y-auto pr-1">
                    {ADMIN_MENUS.map((item) => (
                      <button
                        key={item.path}
                        type="button"
                        onClick={() => go(item.path)}
                        className={`mb-1 block w-full rounded-2xl px-4 py-3 text-left text-sm font-bold transition last:mb-0 ${
                          active === item.active
                            ? 'bg-sky-600 text-white'
                            : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 lg:hidden">
          {MAIN_MENUS.map((item, index) => (
            <button
              key={`${item.path}-${index}`}
              type="button"
              onClick={() => go(item.path)}
              className={getMobileMenuClass(active === item.active)}
            >
              {item.label}
            </button>
          ))}

          {isAdmin && (
            <button
              type="button"
              onClick={() => setOpen((prev) => !prev)}
              className={getMobileMenuClass(
                ADMIN_MENUS.some((item) => item.active === active)
              )}
            >
              แอดมิน
            </button>
          )}
        </div>
      </div>

      {open && isAdmin && (
        <div className="rounded-b-3xl border-t border-slate-100 bg-white p-3 lg:hidden">
          <div className="grid gap-2">
            {ADMIN_MENUS.map((item) => (
              <button
                key={item.path}
                type="button"
                onClick={() => go(item.path)}
                className={getMobileMenuClass(active === item.active)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
}

function getMenuClass(isActive) {
  if (isActive) {
    return 'rounded-2xl bg-white px-4 py-2 text-sm font-black text-sky-700 shadow-sm';
  }

  return 'rounded-2xl bg-white/70 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-white';
}

function getMobileMenuClass(isActive) {
  if (isActive) {
    return 'shrink-0 rounded-2xl bg-white px-4 py-2 text-sm font-black text-sky-700 shadow-sm';
  }

  return 'shrink-0 rounded-2xl bg-white/70 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-white';
}