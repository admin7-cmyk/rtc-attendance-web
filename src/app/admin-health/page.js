'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import AppNav from '@/components/AppNav';

const PAGE_SIZE = 1000;
const WAITING_ROOM_TEXT = 'รอจัดห้อง';

export default function AdminHealthPage() {
  const [currentUser, setCurrentUser] = useState(null);

  const [students, setStudents] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [users, setUsers] = useState([]);
  const [terms, setTerms] = useState([]);
  const [schoolDays, setSchoolDays] = useState([]);
  const [attendanceRows, setAttendanceRows] = useState([]);

  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [selectedSeverity, setSelectedSeverity] = useState('ALL');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [searchText, setSearchText] = useState('');

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
      loadHealthData();
    } catch {
      localStorage.removeItem('rtc_attendance_user');
      setPageError('ข้อมูลผู้ใช้ไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่');
      setLoading(false);
    }
  }, []);

  const roomMap = useMemo(() => {
    const map = new Map();

    rooms.forEach((room) => {
      map.set(normalizeRoomId(room.room_id), room);
    });

    return map;
  }, [rooms]);

  const studentMap = useMemo(() => {
    const map = new Map();

    students.forEach((student) => {
      map.set(String(student.student_id || '').trim(), student);
    });

    return map;
  }, [students]);

  const schoolDayKeySet = useMemo(() => {
    const set = new Set();

    schoolDays.forEach((day) => {
      set.add(makeSchoolDayKey(day));
    });

    return set;
  }, [schoolDays]);

  const issues = useMemo(() => {
    const list = [];

    list.push(...checkActiveStudentsMissingRoom(students, roomMap));
    list.push(...checkTeachersWaitingRoom(users));
    list.push(...checkTeachersMissingRooms(users, roomMap));
    list.push(...checkDuplicateSchoolDays(schoolDays));
    list.push(...checkAttendanceMissingStudents(attendanceRows, studentMap));
    list.push(...checkAttendanceMissingRooms(attendanceRows, roomMap));
    list.push(
      ...checkAttendanceWithoutSchoolDay(attendanceRows, roomMap, schoolDayKeySet)
    );

    return list.sort(sortIssues);
  }, [students, users, schoolDays, attendanceRows, roomMap, studentMap, schoolDayKeySet]);

  const filteredIssues = useMemo(() => {
    const keyword = String(searchText || '').trim().toLowerCase();

    return issues.filter((issue) => {
      if (selectedSeverity !== 'ALL' && issue.severity !== selectedSeverity) {
        return false;
      }

      if (selectedCategory !== 'ALL' && issue.category !== selectedCategory) {
        return false;
      }

      if (!keyword) return true;

      const combined = [
        issue.severity,
        issue.category,
        issue.title,
        issue.detail,
        issue.ref,
        issue.fix,
      ]
        .join(' ')
        .toLowerCase();

      return combined.includes(keyword);
    });
  }, [issues, selectedSeverity, selectedCategory, searchText]);

  const overview = useMemo(() => {
    const critical = issues.filter((issue) => issue.severity === 'CRITICAL').length;
    const warning = issues.filter((issue) => issue.severity === 'WARNING').length;
    const info = issues.filter((issue) => issue.severity === 'INFO').length;

    return {
      total: issues.length,
      critical,
      warning,
      info,
      passed: issues.length === 0,
    };
  }, [issues]);

  const categoryOptions = useMemo(() => {
    const set = new Set();

    issues.forEach((issue) => {
      set.add(issue.category);
    });

    return Array.from(set).sort((a, b) => String(a).localeCompare(String(b), 'th'));
  }, [issues]);

  async function loadHealthData() {
    try {
      setLoading(true);
      setPageError('');

      const [
        studentData,
        roomData,
        userData,
        termData,
        schoolDayData,
        attendanceData,
      ] = await Promise.all([
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
            .from('app_users')
            .select('*')
            .order('teacher_id', { ascending: true })
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
            .order('date', { ascending: true })
            .order('schedule_group', { ascending: true })
            .range(from, to)
        ),

        fetchAllRows((from, to) =>
          supabase
            .from('attendance')
            .select('*')
            .order('date', { ascending: false })
            .range(from, to)
        ),
      ]);

      setStudents(studentData || []);
      setRooms(roomData || []);
      setUsers(userData || []);
      setTerms(termData || []);
      setSchoolDays(schoolDayData || []);
      setAttendanceRows(attendanceData || []);
    } catch (err) {
      setPageError(err.message || 'โหลดข้อมูลตรวจสุขภาพไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }

  function copyHealthReport() {
    const lines = [
      'รายงานตรวจสุขภาพข้อมูลระบบเช็กชื่อ',
      `วันที่ตรวจ: ${formatThaiDateTime(new Date().toISOString())}`,
      '',
      `ปัญหาทั้งหมด: ${overview.total}`,
      `รุนแรง: ${overview.critical}`,
      `ควรตรวจ: ${overview.warning}`,
      `หมายเหตุ: ${overview.info}`,
      '',
      ...filteredIssues.map((issue, index) => {
        return [
          `${index + 1}. [${getSeverityLabel(issue.severity)}] ${issue.title}`,
          `หมวด: ${issue.category}`,
          `อ้างอิง: ${issue.ref || '-'}`,
          `รายละเอียด: ${issue.detail || '-'}`,
          `แนวทางแก้: ${issue.fix || '-'}`,
        ].join('\n');
      }),
    ].join('\n');

    navigator.clipboard
      .writeText(lines)
      .then(() => alert('คัดลอกรายงานตรวจสุขภาพแล้ว'))
      .catch(() => window.prompt('คัดลอกข้อความนี้', lines));
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
        <AppNav currentUser={currentUser} active="admin-health" />

        <section className="mb-4 rounded-3xl bg-white p-4 shadow-sm sm:mb-6 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-2xl font-black text-slate-800 sm:text-3xl">
                ตรวจสุขภาพข้อมูล
              </h1>
              <p className="mt-1 text-sm text-slate-500 sm:text-base">
                ตรวจข้อมูลผิดปกติ ก่อนเปิดเทอม ก่อนเลื่อนชั้น หรือก่อนออกรายงาน
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={loadHealthData}
                disabled={loading}
                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700 disabled:opacity-50"
              >
                ตรวจใหม่
              </button>

              <button
                onClick={copyHealthReport}
                disabled={loading || filteredIssues.length === 0}
                className="rounded-full bg-emerald-100 px-4 py-2 text-sm font-bold text-emerald-700 hover:bg-emerald-200 disabled:opacity-50"
              >
                คัดลอกรายงาน
              </button>

              <button
                onClick={() => (window.location.href = '/admin')}
                className="rounded-full bg-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-300"
              >
                กลับ Admin
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

        <section className="mb-4 grid grid-cols-2 gap-3 sm:mb-6 lg:grid-cols-4 lg:gap-4">
          <StatCard
            title="ปัญหาทั้งหมด"
            value={overview.total}
            unit="รายการ"
            tone={overview.total === 0 ? 'green' : 'slate'}
          />
          <StatCard
            title="รุนแรง"
            value={overview.critical}
            unit="รายการ"
            tone="red"
          />
          <StatCard
            title="ควรตรวจ"
            value={overview.warning}
            unit="รายการ"
            tone="amber"
          />
          <StatCard
            title="หมายเหตุ"
            value={overview.info}
            unit="รายการ"
            tone="blue"
          />
        </section>

        {overview.passed && !loading && (
          <section className="mb-4 rounded-3xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-800 shadow-sm sm:mb-6">
            <div className="text-xl font-black">ข้อมูลดูเรียบร้อยดี ✅</div>
            <div className="mt-1 text-sm">
              ไม่พบปัญหาจากชุดตรวจเบื้องต้นตอนนี้
            </div>
          </section>
        )}

        <section className="mb-4 rounded-3xl bg-white p-4 shadow-sm sm:mb-6 sm:p-6">
          <div className="grid gap-3 md:grid-cols-4">
            <select
              value={selectedSeverity}
              onChange={(e) => setSelectedSeverity(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500"
            >
              <option value="ALL">ทุกระดับ</option>
              <option value="CRITICAL">รุนแรง</option>
              <option value="WARNING">ควรตรวจ</option>
              <option value="INFO">หมายเหตุ</option>
            </select>

            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500"
            >
              <option value="ALL">ทุกหมวด</option>
              {categoryOptions.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>

            <input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="ค้นหา เช่น ห้อง / รหัส / ชื่อ"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500 md:col-span-2"
            />
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-6">
            <MiniData title="นักเรียน" value={students.length} unit="คน" />
            <MiniData title="ห้องเรียน" value={rooms.length} unit="ห้อง" />
            <MiniData title="ครู/ผู้ใช้" value={users.length} unit="บัญชี" />
            <MiniData title="ภาคเรียน" value={terms.length} unit="รายการ" />
            <MiniData title="School Days" value={schoolDays.length} unit="รายการ" />
            <MiniData title="Attendance" value={attendanceRows.length} unit="รายการ" />
          </div>
        </section>

        <section className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-4">
            <h2 className="text-xl font-black text-slate-800">
              รายการที่พบ
            </h2>
            <p className="text-sm text-slate-500">
              แสดงเฉพาะรายการที่เข้าเงื่อนไขตัวกรอง
            </p>
          </div>

          {loading ? (
            <div className="rounded-2xl bg-slate-50 p-8 text-center text-slate-500">
              กำลังตรวจสุขภาพข้อมูล...
            </div>
          ) : (
            <>
              <IssueMobileCards issues={filteredIssues} />
              <IssueDesktopTable issues={filteredIssues} />
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function IssueMobileCards({ issues }) {
  if (issues.length === 0) {
    return (
      <div className="rounded-2xl bg-slate-50 p-8 text-center text-slate-500 md:hidden">
        ไม่พบรายการตามเงื่อนไข
      </div>
    );
  }

  return (
    <div className="space-y-3 md:hidden">
      {issues.map((issue, index) => (
        <div
          key={issue.id}
          className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-bold text-slate-400">
                {index + 1}. {issue.category}
              </div>
              <div className="text-base font-black text-slate-800">
                {issue.title}
              </div>
            </div>

            <SeverityBadge severity={issue.severity} />
          </div>

          <div className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">
            <div>
              <span className="font-black text-slate-800">อ้างอิง: </span>
              {issue.ref || '-'}
            </div>
            <div className="mt-1">
              <span className="font-black text-slate-800">รายละเอียด: </span>
              {issue.detail || '-'}
            </div>
            <div className="mt-1">
              <span className="font-black text-slate-800">แนวทางแก้: </span>
              {issue.fix || '-'}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function IssueDesktopTable({ issues }) {
  return (
    <div
      className="hidden max-w-full overflow-x-auto rounded-2xl border border-slate-200 md:block"
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
      <table className="min-w-[1120px] w-full border-collapse bg-white text-sm">
        <thead className="bg-slate-900 text-white">
          <tr>
            <th className="whitespace-nowrap px-4 py-3 text-center">ลำดับ</th>
            <th className="whitespace-nowrap px-4 py-3 text-center">ระดับ</th>
            <th className="whitespace-nowrap px-4 py-3 text-left">หมวด</th>
            <th className="whitespace-nowrap px-4 py-3 text-left">ปัญหา</th>
            <th className="whitespace-nowrap px-4 py-3 text-left">อ้างอิง</th>
            <th className="whitespace-nowrap px-4 py-3 text-left">รายละเอียด</th>
            <th className="whitespace-nowrap px-4 py-3 text-left">แนวทางแก้</th>
          </tr>
        </thead>

        <tbody>
          {issues.length === 0 ? (
            <tr>
              <td colSpan="7" className="px-4 py-8 text-center text-slate-500">
                ไม่พบรายการตามเงื่อนไข
              </td>
            </tr>
          ) : (
            issues.map((issue, index) => (
              <tr
                key={issue.id}
                className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
              >
                <td className="whitespace-nowrap px-4 py-3 text-center font-bold text-slate-500">
                  {index + 1}
                </td>

                <td className="whitespace-nowrap px-4 py-3 text-center">
                  <SeverityBadge severity={issue.severity} />
                </td>

                <td className="whitespace-nowrap px-4 py-3 font-bold text-slate-700">
                  {issue.category}
                </td>

                <td className="min-w-[220px] px-4 py-3 font-bold text-slate-800">
                  {issue.title}
                </td>

                <td className="min-w-[160px] px-4 py-3 text-slate-600">
                  {issue.ref || '-'}
                </td>

                <td className="min-w-[260px] px-4 py-3 text-slate-600">
                  {issue.detail || '-'}
                </td>

                <td className="min-w-[260px] px-4 py-3 text-slate-600">
                  {issue.fix || '-'}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function StatCard({ title, value, unit, tone = 'slate' }) {
  const toneClass = {
    slate: 'bg-white text-slate-800',
    green: 'bg-emerald-50 text-emerald-800',
    red: 'bg-red-50 text-red-800',
    amber: 'bg-amber-50 text-amber-800',
    blue: 'bg-blue-50 text-blue-800',
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

function MiniData({ title, value, unit }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3 text-slate-700">
      <div className="text-xs font-bold text-slate-500">{title}</div>
      <div className="mt-1 flex items-end gap-1">
        <span className="text-2xl font-black text-slate-800">{value}</span>
        <span className="pb-1 text-xs text-slate-500">{unit}</span>
      </div>
    </div>
  );
}

function SeverityBadge({ severity }) {
  if (severity === 'CRITICAL') {
    return (
      <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-black text-red-700">
        รุนแรง
      </span>
    );
  }

  if (severity === 'WARNING') {
    return (
      <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-700">
        ควรตรวจ
      </span>
    );
  }

  return (
    <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-black text-blue-700">
      หมายเหตุ
    </span>
  );
}

function checkActiveStudentsMissingRoom(students, roomMap) {
  return students
    .filter((student) => {
      if (!isTrueValue(student.active)) return false;

      const roomKey = normalizeRoomId(student.room_id);

      return roomKey && !roomMap.has(roomKey);
    })
    .map((student) =>
      makeIssue({
        severity: 'CRITICAL',
        category: 'นักเรียน',
        title: 'นักเรียน active แต่ไม่พบห้องใน rooms',
        ref: `${student.student_id || '-'} ${student.prefix || ''}${student.first_name || ''} ${student.last_name || ''}`,
        detail: `room_id = ${student.room_id || '-'}`,
        fix: 'ไปที่เมนูจัดการนักเรียนเพื่อแก้ห้อง หรือไปที่จัดการห้องเรียนเพื่อสร้างห้องนี้',
      })
    );
}

function checkTeachersWaitingRoom(users) {
  return users
    .filter((user) => {
      if (!isTrueValue(user.active)) return false;

      const role = String(user.role || '').toLowerCase();
      if (role === 'admin') return false;

      const roomIds = parseRoomIds(user.room_ids);

      return roomIds.some((roomId) => roomId === WAITING_ROOM_TEXT);
    })
    .map((user) =>
      makeIssue({
        severity: 'WARNING',
        category: 'ครู',
        title: 'ครูยังอยู่สถานะรอจัดห้อง',
        ref: `${user.teacher_id || '-'} ${user.name || user.username || '-'}`,
        detail: `room_ids = ${user.room_ids || '-'}`,
        fix: 'ไปที่เมนูจัดการครู แล้วกำหนดห้องใหม่ให้ครูคนนี้',
      })
    );
}

function checkTeachersMissingRooms(users, roomMap) {
  const issues = [];

  users.forEach((user) => {
    if (!isTrueValue(user.active)) return;

    const role = String(user.role || '').toLowerCase();
    if (role === 'admin') return;

    const roomIds = parseRoomIds(user.room_ids);

    roomIds.forEach((roomId) => {
      const upper = String(roomId || '').toUpperCase();

      if (!roomId || upper === 'ALL' || roomId === WAITING_ROOM_TEXT) return;

      const roomKey = normalizeRoomId(roomId);

      if (!roomMap.has(roomKey)) {
        issues.push(
          makeIssue({
            severity: 'CRITICAL',
            category: 'ครู',
            title: 'ครูมี room_ids ที่ไม่พบใน rooms',
            ref: `${user.teacher_id || '-'} ${user.name || user.username || '-'}`,
            detail: `room_ids มี ${roomId} แต่ไม่มีห้องนี้ในตาราง rooms`,
            fix: 'ไปที่เมนูจัดการครูเพื่อแก้ room_ids หรือไปที่จัดการห้องเรียนเพื่อสร้างห้อง',
          })
        );
      }
    });
  });

  return issues;
}

function checkDuplicateSchoolDays(schoolDays) {
  const map = new Map();

  schoolDays.forEach((day) => {
    const key = makeSchoolDayKey(day);
    map.set(key, Number(map.get(key) || 0) + 1);
  });

  return Array.from(map.entries())
    .filter(([, count]) => count > 1)
    .map(([key, count]) =>
      makeIssue({
        severity: 'WARNING',
        category: 'วันเข้าแถว',
        title: 'พบ school_days ซ้ำ',
        ref: key,
        detail: `พบซ้ำ ${count} รายการ จาก key date + term_id + schedule_group`,
        fix: 'ตรวจในเมนูภาคเรียน / วันเข้าแถว แล้วลบหรือแก้รายการซ้ำใน Supabase หากจำเป็น',
      })
    );
}

function checkAttendanceMissingStudents(attendanceRows, studentMap) {
  return attendanceRows
    .filter((row) => {
      const studentId = String(row.student_id || '').trim();

      return studentId && !studentMap.has(studentId);
    })
    .slice(0, 300)
    .map((row) =>
      makeIssue({
        severity: 'CRITICAL',
        category: 'Attendance',
        title: 'attendance มี student_id ที่ไม่พบใน students',
        ref: `${row.date || '-'} / ${row.room_id || '-'} / ${row.student_id || '-'}`,
        detail: `ไม่พบ student_id = ${row.student_id || '-'}`,
        fix: 'ตรวจประวัติ attendance หรือเพิ่ม/แก้ข้อมูลนักเรียนให้ตรงกัน',
      })
    );
}

function checkAttendanceMissingRooms(attendanceRows, roomMap) {
  return attendanceRows
    .filter((row) => {
      const roomKey = normalizeRoomId(row.room_id);

      return roomKey && !roomMap.has(roomKey);
    })
    .slice(0, 300)
    .map((row) =>
      makeIssue({
        severity: 'CRITICAL',
        category: 'Attendance',
        title: 'attendance มี room_id ที่ไม่พบใน rooms',
        ref: `${row.date || '-'} / ${row.room_id || '-'}`,
        detail: `ไม่พบ room_id = ${row.room_id || '-'}`,
        fix: 'ไปที่จัดการห้องเรียนเพื่อสร้างห้อง หรือแก้ room_id ในข้อมูล attendance/students ให้ตรงกัน',
      })
    );
}

function checkAttendanceWithoutSchoolDay(attendanceRows, roomMap, schoolDayKeySet) {
  return attendanceRows
    .filter((row) => {
      const room = roomMap.get(normalizeRoomId(row.room_id));

      if (!room) return false;

      const key = [
        normalizeDate(row.date),
        String(row.term_id || '').trim(),
        String(room.schedule_group || '').trim(),
      ].join('|');

      return !schoolDayKeySet.has(key);
    })
    .slice(0, 300)
    .map((row) => {
      const room = roomMap.get(normalizeRoomId(row.room_id));

      return makeIssue({
        severity: 'WARNING',
        category: 'Attendance',
        title: 'attendance มีวันที่ไม่พบใน school_days',
        ref: `${row.date || '-'} / ${row.term_id || '-'} / ${row.room_id || '-'}`,
        detail: `schedule_group ของห้องคือ ${room?.schedule_group || '-'} แต่ไม่พบวันเข้าแถว key ตรงกัน`,
        fix: 'ตรวจเมนูภาคเรียน / วันเข้าแถว ว่ามีวันที่และ schedule_group นี้หรือไม่',
      });
    });
}

function makeIssue({ severity, category, title, ref, detail, fix }) {
  return {
    id: `${severity}_${category}_${title}_${ref}_${detail}_${Math.random()
      .toString(36)
      .slice(2)}`,
    severity,
    category,
    title,
    ref,
    detail,
    fix,
  };
}

function sortIssues(a, b) {
  const severityA = getSeverityWeight(a.severity);
  const severityB = getSeverityWeight(b.severity);

  if (severityA !== severityB) return severityA - severityB;

  return String(a.category).localeCompare(String(b.category), 'th');
}

function getSeverityWeight(severity) {
  if (severity === 'CRITICAL') return 1;
  if (severity === 'WARNING') return 2;

  return 3;
}

function getSeverityLabel(severity) {
  if (severity === 'CRITICAL') return 'รุนแรง';
  if (severity === 'WARNING') return 'ควรตรวจ';

  return 'หมายเหตุ';
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

function parseRoomIds(roomIdsText) {
  const text = String(roomIdsText || '').trim();

  if (!text) return [];

  if (text.toUpperCase() === 'ALL') return ['ALL'];

  return text
    .split(/[,;|\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function makeSchoolDayKey(day) {
  return [
    normalizeDate(day.date),
    String(day.term_id || '').trim(),
    String(day.schedule_group || '').trim(),
  ].join('|');
}

function normalizeRoomId(value) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, '')
    .replace(/\./g, '')
    .replace(/-/g, '/');
}

function normalizeDate(value) {
  if (!value) return '';

  return String(value).trim().slice(0, 10);
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

function formatThaiDateTime(value) {
  if (!value) return '-';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear() + 543;
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');

  return `${day}/${month}/${year} ${hour}:${minute} น.`;
}
