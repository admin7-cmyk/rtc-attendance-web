'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import AppNav from '@/components/AppNav';

const PAGE_SIZE = 1000;

const ADMIN_MENUS = [
  {
    title: 'ตรวจสุขภาพข้อมูล',
    description: 'ตรวจข้อมูลผิดปกติ ห้องหาย นักเรียนไม่มีห้อง และข้อมูล attendance ที่ไม่สัมพันธ์กัน',
    path: '/admin-health',
    tone: 'rose',
  },
  {
    title: 'Import Excel/CSV',
    description: 'นำเข้าข้อมูลนักเรียน ครู ห้องเรียน และประวัติเช็กชื่อ',
    path: '/admin-import',
    tone: 'indigo',
  },
  {
    title: 'สถานะวันนี้',
    description: 'ตรวจสอบห้องที่ยังไม่บันทึกหรือบันทึกไม่ครบ',
    path: '/daily-status',
    tone: 'red',
  },
  {
    title: 'ประวัติรายวัน',
    description: 'ดูว่าแต่ละห้องบันทึกเมื่อไหร่ ใครเป็นคนบันทึก',
    path: '/daily-history',
    tone: 'emerald',
  },
  {
    title: 'จัดการครู',
    description: 'เพิ่มครู แก้ PIN กำหนดห้องประจำ และเปิด/ปิดบัญชี',
    path: '/admin-users',
    tone: 'blue',
  },
  {
    title: 'จัดการนักเรียน',
    description: 'เพิ่มนักเรียน ย้ายห้อง และเปิด/ปิดสถานะนักเรียน',
    path: '/admin-students',
    tone: 'amber',
  },
  {
    title: 'เลื่อนชั้นนักเรียน',
    description: 'เลื่อนชั้นรายกลุ่มหรือทั้งระบบ พร้อมปรับห้องครูที่ปรึกษา',
    path: '/admin-promote',
    tone: 'pink',
  },
  {
    title: 'จัดการห้องเรียน',
    description: 'เพิ่มและแก้ไขห้องเรียน ระดับ ชั้น ปี ห้อง และกลุ่มเวลาเข้าแถว',
    path: '/admin-rooms',
    tone: 'cyan',
  },
  {
    title: 'ภาคเรียน / วันเข้าแถว',
    description: 'จัดการ terms และ school_days สำหรับปีการศึกษา',
    path: '/admin-terms',
    tone: 'purple',
  },
  {
    title: 'ข้อยกเว้นรายห้อง',
    description: 'กำหนดห้องที่ไม่ต้องเข้าแถวบางวัน เช่น ไม่มีเรียนเช้าวันอังคาร',
    path: '/admin-room-exceptions',
    tone: 'orange',
  },
  {
    title: 'Summary',
    description: 'ดูสรุปผลการเข้าแถวและกลุ่มเสี่ยง',
    path: '/summary',
    tone: 'slate',
  },
  {
    title: 'รายงาน',
    description: 'ออกรายงานรายสัปดาห์ รายเดือน และรายภาคเรียน',
    path: '/report',
    tone: 'green',
  },
  {
    title: 'Audit Logs',
    description: 'ตรวจสอบประวัติการเปลี่ยนแปลงข้อมูลเช็กชื่อ',
    path: '/audit',
    tone: 'yellow',
  },
  {
    title: 'Backup',
    description: 'สำรองข้อมูลหลักของระบบเป็นไฟล์ Excel',
    path: '/backup',
    tone: 'teal',
  },
];

export default function AdminPage() {
  const [currentUser, setCurrentUser] = useState(null);

  const [users, setUsers] = useState([]);
  const [students, setStudents] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [terms, setTerms] = useState([]);
  const [schoolDays, setSchoolDays] = useState([]);
  const [attendanceRows, setAttendanceRows] = useState([]);
  const [roomExceptions, setRoomExceptions] = useState([]);

  const [selectedDate, setSelectedDate] = useState(getTodayYmd());

  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');

  useEffect(() => {
    const savedUser = localStorage.getItem('rtc_attendance_user');

    if (!savedUser) {
      setPageError('กรุณาเข้าสู่ระบบจากหน้าแรกก่อน');
      setLoading(false);
      return;
    }

    try {
      const parsed = JSON.parse(savedUser);
      const role = String(parsed.role || '').toLowerCase();

      if (role !== 'admin') {
        setPageError('หน้านี้สำหรับผู้ดูแลระบบเท่านั้น');
        setLoading(false);
        return;
      }

      setCurrentUser(parsed);
      loadDashboard(selectedDate);
    } catch {
      localStorage.removeItem('rtc_attendance_user');
      setPageError('ข้อมูลผู้ใช้ไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่');
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (currentUser && selectedDate) {
      loadDashboard(selectedDate);
    }
  }, [currentUser, selectedDate]);

  const overview = useMemo(() => {
    const activeUsers = users.filter((user) => isTrueValue(user.active)).length;
    const activeStudents = students.filter((student) =>
      isTrueValue(student.active)
    ).length;

    const lineupDays = schoolDays.filter((day) =>
      isTrueValue(day.is_lineup_day)
    ).length;

    const activeRoomExceptionCount = roomExceptions.filter((item) =>
      isTrueValue(item.active)
    ).length;

    const attendanceRooms = new Set(
      attendanceRows
        .map((row) => normalizeRoomId(row.room_id))
        .filter(Boolean)
    );

    const activeRoomIds = new Set(
      students
        .filter((student) => isTrueValue(student.active))
        .map((student) => normalizeRoomId(student.room_id))
        .filter(Boolean)
    );

    const checkedRoomCount = attendanceRooms.size;
    const totalActiveRoomCount = activeRoomIds.size;
    const missingRoomCount = Math.max(totalActiveRoomCount - checkedRoomCount, 0);

    let presentCount = 0;
    let absentCount = 0;

    attendanceRows.forEach((row) => {
      const status = normalizeStatus(row.status);

      if (status === 'P') presentCount++;
      if (status === 'A') absentCount++;
    });

    const totalAttendance = presentCount + absentCount;

    const presentPercent =
      totalAttendance > 0
        ? ((presentCount / totalAttendance) * 100).toFixed(2)
        : '0.00';

    return {
      users: users.length,
      activeUsers,
      students: students.length,
      activeStudents,
      rooms: rooms.length,
      terms: terms.length,
      schoolDays: schoolDays.length,
      lineupDays,
      roomExceptions: roomExceptions.length,
      activeRoomExceptionCount,
      checkedRoomCount,
      totalActiveRoomCount,
      missingRoomCount,
      presentCount,
      absentCount,
      totalAttendance,
      presentPercent,
    };
  }, [users, students, rooms, terms, schoolDays, attendanceRows, roomExceptions]);

  async function loadDashboard(dateValue) {
    try {
      setLoading(true);
      setPageError('');

      const [
        userData,
        studentData,
        roomData,
        termData,
        schoolDayData,
        attendanceData,
        exceptionData,
      ] = await Promise.all([
        fetchAllRows((from, to) =>
          supabase
            .from('app_users')
            .select('*')
            .order('teacher_id', { ascending: true })
            .range(from, to)
        ),

        fetchAllRows((from, to) =>
          supabase
            .from('students')
            .select('*')
            .order('room_id', { ascending: true })
            .order('student_id', { ascending: true })
            .range(from, to)
        ),

        fetchAllRows((from, to) =>
          supabase
            .from('rooms')
            .select('*')
            .order('level', { ascending: true })
            .order('year', { ascending: true })
            .order('room_no', { ascending: true })
            .range(from, to)
        ),

        fetchAllRows((from, to) =>
          supabase
            .from('terms')
            .select('*')
            .order('term_id', { ascending: false })
            .range(from, to)
        ),

        fetchAllRows((from, to) =>
          supabase
            .from('school_days')
            .select('*')
            .range(from, to)
        ),

        fetchAllRows((from, to) =>
          supabase
            .from('attendance')
            .select('*')
            .eq('date', dateValue)
            .range(from, to)
        ),

        fetchAllRows((from, to) =>
          supabase
            .from('room_lineup_exceptions')
            .select('*')
            .order('term_id', { ascending: false })
            .order('room_id', { ascending: true })
            .range(from, to)
        ),
      ]);

      setUsers(userData || []);
      setStudents(studentData || []);
      setRooms(roomData || []);
      setTerms(termData || []);
      setSchoolDays(schoolDayData || []);
      setAttendanceRows(attendanceData || []);
      setRoomExceptions(exceptionData || []);
    } catch (err) {
      setPageError(err.message || 'โหลดข้อมูล Admin Dashboard ไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }

  function go(path) {
    window.location.href = path;
  }

  if (!currentUser && pageError) {
    return (
      <main className="min-h-screen bg-slate-100 p-6">
        <div className="mx-auto max-w-5xl">
          <section className="rounded-3xl border border-red-200 bg-red-50 p-6 text-red-700">
            <div className="text-xl font-black">เข้าใช้งานไม่ได้</div>
            <div className="mt-2">{pageError}</div>
            <button
              onClick={() => (window.location.href = '/')}
              className="mt-4 rounded-full bg-red-600 px-5 py-2 text-sm font-bold text-white"
            >
              กลับหน้าแรก
            </button>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 px-3 py-4 sm:px-5 sm:py-5 lg:px-6 lg:py-6">
      <div className="mx-auto max-w-7xl">
        <AppNav currentUser={currentUser} active="admin" />

        <section className="mb-4 rounded-3xl bg-white p-4 shadow-sm sm:mb-6 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-2xl font-black text-slate-800 sm:text-3xl">
                Admin Dashboard
              </h1>
              <p className="mt-1 text-sm text-slate-500 sm:text-base">
                ศูนย์รวมเมนูหลังบ้านและภาพรวมระบบเช็กชื่อเข้าแถว
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => loadDashboard(selectedDate)}
                disabled={loading}
                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700 disabled:opacity-50"
              >
                โหลดข้อมูลใหม่
              </button>

              <button
                onClick={() => go('/')}
                className="rounded-full bg-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-300"
              >
                กลับหน้าเช็กชื่อ
              </button>
            </div>
          </div>
        </section>

        {pageError && (
          <section className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 sm:mb-6">
            <div className="font-bold">เกิดข้อผิดพลาด</div>
            <div>{pageError}</div>
          </section>
        )}

        <section className="mb-4 rounded-3xl bg-white p-4 shadow-sm sm:mb-6 sm:p-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-bold text-slate-700">
                วันที่ดูสถานะวันนี้
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500 sm:text-base"
              />
            </div>

            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
              <div className="font-bold text-slate-800">ผู้ดูแลระบบ</div>
              <div>{currentUser?.name || '-'}</div>
              <div className="mt-1 inline-block rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
                {currentUser?.role || '-'}
              </div>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
              <div className="font-bold text-slate-800">วันที่</div>
              <div>{formatThaiDate(selectedDate)}</div>
              <div className="mt-1 text-xs text-slate-400">
                ใช้สรุปเฉพาะข้อมูล attendance ของวันนั้น
              </div>
            </div>
          </div>
        </section>

        <section className="mb-4 grid grid-cols-2 gap-3 sm:mb-6 lg:grid-cols-4 lg:gap-4">
          <StatCard title="ครู/ผู้ใช้" value={overview.users} unit="บัญชี" />
          <StatCard
            title="บัญชีเปิดใช้งาน"
            value={overview.activeUsers}
            unit="บัญชี"
            tone="green"
          />
          <StatCard title="นักเรียนทั้งหมด" value={overview.students} unit="คน" />
          <StatCard
            title="นักเรียน active"
            value={overview.activeStudents}
            unit="คน"
            tone="green"
          />
        </section>

        <section className="mb-4 grid grid-cols-2 gap-3 sm:mb-6 lg:grid-cols-4 lg:gap-4">
          <StatCard title="ห้องเรียน" value={overview.rooms} unit="ห้อง" />
          <StatCard title="ภาคเรียน" value={overview.terms} unit="รายการ" />
          <StatCard title="วันเข้าแถวทั้งหมด" value={overview.lineupDays} unit="รายการ" />
          <StatCard
            title="ข้อยกเว้นรายห้อง"
            value={overview.activeRoomExceptionCount}
            unit={`เปิดใช้ / ${overview.roomExceptions} รายการ`}
            tone="orange"
          />
        </section>

        <section className="mb-4 grid gap-4 lg:grid-cols-[1fr_1fr]">
          <section className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
            <div className="mb-4">
              <h2 className="text-xl font-black text-slate-800">
                สถานะการบันทึกวันนี้
              </h2>
              <p className="text-sm text-slate-500">
                วันที่ {formatThaiDate(selectedDate)}
              </p>
            </div>

            {loading ? (
              <div className="rounded-2xl bg-slate-50 p-8 text-center text-slate-500">
                กำลังโหลดข้อมูล...
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-3">
                <MiniStatus
                  label="ห้องที่มีข้อมูล"
                  value={overview.checkedRoomCount}
                  unit="ห้อง"
                  tone="green"
                />
                <MiniStatus
                  label="ห้อง active โดยประมาณ"
                  value={overview.totalActiveRoomCount}
                  unit="ห้อง"
                  tone="slate"
                />
                <MiniStatus
                  label="ยังไม่พบข้อมูล"
                  value={overview.missingRoomCount}
                  unit="ห้อง"
                  tone="red"
                />
              </div>
            )}

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <MiniStatus
                label="มา"
                value={overview.presentCount}
                unit="ครั้ง"
                tone="green"
              />
              <MiniStatus
                label="ขาด"
                value={overview.absentCount}
                unit="ครั้ง"
                tone="red"
              />
              <MiniStatus
                label="เปอร์เซ็นต์มา"
                value={overview.presentPercent}
                unit="%"
                tone="blue"
              />
            </div>

            <button
              onClick={() => go('/daily-status')}
              className="mt-4 w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white hover:bg-slate-700"
            >
              เปิดหน้าสถานะวันนี้
            </button>
          </section>

          <section className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
            <div className="mb-4">
              <h2 className="text-xl font-black text-slate-800">
                งานที่แนะนำสำหรับแอดมิน
              </h2>
              <p className="text-sm text-slate-500">
                ใช้เป็นเช็กลิสต์ก่อนเริ่มใช้งานแต่ละวัน
              </p>
            </div>

            <div className="space-y-3">
              <ChecklistItem
                title="ตรวจห้องที่ยังไม่บันทึก"
                description="เปิดสถานะวันนี้หลังช่วงเช้า เพื่อตามห้องที่ยังไม่ส่งข้อมูล"
              />
              <ChecklistItem
                title="ตรวจข้อยกเว้นรายห้อง"
                description="เช็กห้องที่ไม่มีเรียนเช้า เพื่อไม่ให้นับขาดผิดวัน"
              />
              <ChecklistItem
                title="สำรองข้อมูล"
                description="ควร Backup เป็นระยะ โดยเฉพาะก่อนแก้ข้อมูลจำนวนมาก"
              />
              <ChecklistItem
                title="ตรวจข้อมูลภาคเรียน"
                description="เมื่อมีวันหยุดพิเศษ ให้แก้ในเมนูภาคเรียน / วันเข้าแถว"
              />
            </div>
          </section>
        </section>

        <section className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-4">
            <h2 className="text-xl font-black text-slate-800">
              เมนูหลังบ้าน
            </h2>
            <p className="text-sm text-slate-500">
              เลือกเมนูที่ต้องการจัดการ
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {ADMIN_MENUS.map((item) => (
              <button
                key={item.path}
                onClick={() => go(item.path)}
                className={`rounded-3xl border p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${getMenuToneClass(
                  item.tone
                )}`}
              >
                <div className="text-lg font-black">{item.title}</div>
                <div className="mt-2 text-sm opacity-75">{item.description}</div>
              </button>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function StatCard({ title, value, unit, tone = 'slate' }) {
  const toneClass = {
    slate: 'bg-white text-slate-800',
    green: 'bg-emerald-50 text-emerald-800',
    red: 'bg-red-50 text-red-800',
    blue: 'bg-blue-50 text-blue-800',
    orange: 'bg-orange-50 text-orange-800',
  };

  return (
    <div className={`rounded-3xl p-4 shadow-sm sm:p-6 ${toneClass[tone] || toneClass.slate}`}>
      <div className="text-xs font-medium opacity-70 sm:text-sm">{title}</div>
      <div className="mt-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:gap-2">
        <span className="text-3xl font-black sm:text-4xl">{value}</span>
        <span className="text-xs sm:pb-1 sm:text-sm">{unit}</span>
      </div>
    </div>
  );
}

function MiniStatus({ label, value, unit, tone = 'slate' }) {
  const toneClass = {
    slate: 'bg-slate-50 text-slate-800',
    green: 'bg-emerald-50 text-emerald-800',
    red: 'bg-red-50 text-red-800',
    blue: 'bg-blue-50 text-blue-800',
  };

  return (
    <div className={`rounded-3xl p-4 ${toneClass[tone] || toneClass.slate}`}>
      <div className="text-xs font-bold opacity-70">{label}</div>
      <div className="mt-2 flex items-end gap-1">
        <span className="text-3xl font-black">{value}</span>
        <span className="pb-1 text-xs">{unit}</span>
      </div>
    </div>
  );
}

function ChecklistItem({ title, description }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <div className="font-black text-slate-800">✓ {title}</div>
      <div className="mt-1 text-sm text-slate-500">{description}</div>
    </div>
  );
}

function getMenuToneClass(tone) {
  const map = {
    red: 'border-red-100 bg-red-50 text-red-800 hover:bg-red-100',
    emerald: 'border-emerald-100 bg-emerald-50 text-emerald-800 hover:bg-emerald-100',
    blue: 'border-blue-100 bg-blue-50 text-blue-800 hover:bg-blue-100',
    amber: 'border-amber-100 bg-amber-50 text-amber-800 hover:bg-amber-100',
    purple: 'border-purple-100 bg-purple-50 text-purple-800 hover:bg-purple-100',
    slate: 'border-slate-100 bg-slate-50 text-slate-800 hover:bg-slate-100',
    cyan: 'border-cyan-100 bg-cyan-50 text-cyan-800 hover:bg-cyan-100',
    orange: 'border-orange-100 bg-orange-50 text-orange-800 hover:bg-orange-100',
    green: 'border-green-100 bg-green-50 text-green-800 hover:bg-green-100',
    indigo: 'border-indigo-100 bg-indigo-50 text-indigo-800 hover:bg-indigo-100',
    pink: 'border-pink-100 bg-pink-50 text-pink-800 hover:bg-pink-100',
    rose: 'border-rose-100 bg-rose-50 text-rose-800 hover:bg-rose-100',
    yellow: 'border-yellow-100 bg-yellow-50 text-yellow-800 hover:bg-yellow-100',
    teal: 'border-teal-100 bg-teal-50 text-teal-800 hover:bg-teal-100',
  };

  return map[tone] || map.slate;
}

async function fetchAllRows(buildQuery) {
  let allRows = [];
  let from = 0;

  while (true) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await buildQuery(from, to);

    if (error) throw new Error(error.message);

    const rows = data || [];
    allRows = allRows.concat(rows);

    if (rows.length < PAGE_SIZE) break;

    from += PAGE_SIZE;
  }

  return allRows;
}

function normalizeRoomId(value) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, '')
    .replace(/\./g, '')
    .replace(/-/g, '/');
}

function normalizeStatus(status) {
  const text = String(status || '').trim().toUpperCase();

  if (text === 'P' || text === 'PRESENT' || text === 'มา' || text === 'TRUE') {
    return 'P';
  }

  if (text === 'A' || text === 'ABSENT' || text === 'ขาด' || text === 'FALSE') {
    return 'A';
  }

  return '';
}

function isTrueValue(value) {
  const text = String(value || '').trim().toUpperCase();

  return (
    value === true ||
    text === 'TRUE' ||
    text === '1' ||
    text === 'YES' ||
    text === 'Y'
  );
}

function getTodayYmd() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');

  return `${yyyy}-${mm}-${dd}`;
}

function formatThaiDate(ymd) {
  if (!ymd) return '-';

  const [yearText, monthText, dayText] = String(ymd).split('-');

  if (!yearText || !monthText || !dayText) {
    return ymd;
  }

  const buddhistYear = Number(yearText) + 543;

  return `${dayText}/${monthText}/${buddhistYear}`;
}