'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import AppNav from '@/components/AppNav';

const PAGE_SIZE = 1000;

export default function DailyStatusPage() {
  const [currentUser, setCurrentUser] = useState(null);

  const [selectedDate, setSelectedDate] = useState(getTodayYmd());
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchText, setSearchText] = useState('');

  const [rooms, setRooms] = useState([]);
  const [students, setStudents] = useState([]);
  const [schoolDays, setSchoolDays] = useState([]);
  const [attendanceRows, setAttendanceRows] = useState([]);

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
      loadDailyStatus(parsed, selectedDate);
    } catch {
      localStorage.removeItem('rtc_attendance_user');
      setPageError('ข้อมูลผู้ใช้ไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่');
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (currentUser && selectedDate) {
      loadDailyStatus(currentUser, selectedDate);
    }
  }, [currentUser, selectedDate]);

  const roomStatusRows = useMemo(() => {
    const activeStudentCountByRoom = new Map();

    students
      .filter((student) => isTrueValue(student.active))
      .forEach((student) => {
        const key = normalizeRoomId(student.room_id);

        activeStudentCountByRoom.set(
          key,
          Number(activeStudentCountByRoom.get(key) || 0) + 1
        );
      });

    const attendanceCountByRoom = new Map();
    const presentCountByRoom = new Map();
    const absentCountByRoom = new Map();

    attendanceRows.forEach((item) => {
      const key = normalizeRoomId(item.room_id);
      const status = normalizeStatus(item.status);

      attendanceCountByRoom.set(
        key,
        Number(attendanceCountByRoom.get(key) || 0) + 1
      );

      if (status === 'P') {
        presentCountByRoom.set(
          key,
          Number(presentCountByRoom.get(key) || 0) + 1
        );
      }

      if (status === 'A') {
        absentCountByRoom.set(
          key,
          Number(absentCountByRoom.get(key) || 0) + 1
        );
      }
    });

    const schoolDayByScheduleGroup = new Map();

    schoolDays.forEach((day) => {
      if (normalizeDate(day.date) !== selectedDate) return;

      schoolDayByScheduleGroup.set(String(day.schedule_group || ''), day);
    });

    return rooms
      .map((room) => {
        const roomKey = normalizeRoomId(room.room_id);

        const totalStudents = Number(activeStudentCountByRoom.get(roomKey) || 0);
        const checkedCount = Number(attendanceCountByRoom.get(roomKey) || 0);
        const presentCount = Number(presentCountByRoom.get(roomKey) || 0);
        const absentCount = Number(absentCountByRoom.get(roomKey) || 0);

        const schoolDay = schoolDayByScheduleGroup.get(
          String(room.schedule_group || '')
        );

        const hasSchoolDay = Boolean(schoolDay);
        const isLineupDay = hasSchoolDay && isTrueValue(schoolDay.is_lineup_day);

        let status = 'not_scheduled';
        let statusLabel = 'ไม่มีข้อมูลวันเข้าแถว';
        let note = 'ไม่พบข้อมูลใน school_days';

        if (hasSchoolDay && !isLineupDay) {
          status = 'holiday';
          statusLabel = 'ไม่ต้องเข้าแถว';
          note = schoolDay.note || 'วันนี้ไม่ใช่วันเข้าแถว';
        }

        if (isLineupDay) {
          if (checkedCount === 0) {
            status = 'missing';
            statusLabel = 'ยังไม่บันทึก';
            note = 'ยังไม่มีข้อมูลเช็กชื่อของห้องนี้';
          } else if (checkedCount < totalStudents) {
            status = 'partial';
            statusLabel = 'บันทึกไม่ครบ';
            note = `บันทึกแล้ว ${checkedCount}/${totalStudents} คน`;
          } else {
            status = 'done';
            statusLabel = 'บันทึกแล้ว';
            note = `ครบ ${checkedCount}/${totalStudents} คน`;
          }
        }

        return {
          room_id: room.room_id,
          room_name: room.room_name || room.room_id,
          level: room.level,
          year: room.year,
          room_no: room.room_no,
          schedule_group: room.schedule_group,
          total_students: totalStudents,
          checked_count: checkedCount,
          present_count: presentCount,
          absent_count: absentCount,
          status,
          statusLabel,
          note,
          schoolDay,
        };
      })
      .filter((row) => row.total_students > 0)
      .sort(sortRoomStatusRows);
  }, [rooms, students, schoolDays, attendanceRows, selectedDate]);

  const filteredRoomStatusRows = useMemo(() => {
    const keyword = String(searchText || '').trim().toLowerCase();

    return roomStatusRows.filter((row) => {
      if (statusFilter !== 'ALL' && row.status !== statusFilter) {
        return false;
      }

      if (!keyword) return true;

      const combined = [
        row.room_id,
        row.room_name,
        row.level,
        row.year,
        row.room_no,
        row.schedule_group,
        row.statusLabel,
        row.note,
      ]
        .join(' ')
        .toLowerCase();

      return combined.includes(keyword);
    });
  }, [roomStatusRows, statusFilter, searchText]);

  const overview = useMemo(() => {
    const done = roomStatusRows.filter((row) => row.status === 'done').length;
    const partial = roomStatusRows.filter((row) => row.status === 'partial').length;
    const missing = roomStatusRows.filter((row) => row.status === 'missing').length;
    const holiday = roomStatusRows.filter((row) => row.status === 'holiday').length;
    const notScheduled = roomStatusRows.filter(
      (row) => row.status === 'not_scheduled'
    ).length;

    const needCheck = done + partial + missing;

    return {
      totalRooms: roomStatusRows.length,
      needCheck,
      done,
      partial,
      missing,
      holiday,
      notScheduled,
    };
  }, [roomStatusRows]);

  async function loadDailyStatus(user, dateValue) {
    try {
      setLoading(true);
      setPageError('');

      const [roomData, studentData, schoolDayData, attendanceData] =
        await Promise.all([
          fetchAllRows((from, to) =>
            supabase
              .from('rooms')
              .select('*')
              .order('level', { ascending: true })
              .order('year', { ascending: true })
              .order('room_no', { ascending: true })
              .order('room_id', { ascending: true })
              .range(from, to)
          ),

          fetchAllRows((from, to) =>
            supabase.from('students').select('*').range(from, to)
          ),

          fetchAllRows((from, to) =>
            supabase
              .from('school_days')
              .select('*')
              .eq('date', dateValue)
              .range(from, to)
          ),

          fetchAllRows((from, to) =>
            supabase
              .from('attendance')
              .select('*')
              .eq('date', dateValue)
              .range(from, to)
          ),
        ]);

      setRooms(roomData || []);
      setStudents(studentData || []);
      setSchoolDays(schoolDayData || []);
      setAttendanceRows(attendanceData || []);
    } catch (err) {
      setPageError(err.message || 'โหลดสถานะเช็กชื่อไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }

  async function copyMissingRooms() {
    const missingRows = roomStatusRows.filter(
      (row) => row.status === 'missing' || row.status === 'partial'
    );

    if (missingRows.length === 0) {
      alert('ไม่มีห้องที่ยังไม่บันทึกหรือบันทึกไม่ครบ');
      return;
    }

    const text = [
      `แจ้งเตือนสถานะเช็กชื่อประจำวันที่ ${formatThaiDate(selectedDate)}`,
      '',
      ...missingRows.map((row, index) => {
        const statusText =
          row.status === 'missing' ? 'ยังไม่บันทึก' : 'บันทึกไม่ครบ';

        return `${index + 1}. ${row.room_name} - ${statusText} (${row.checked_count}/${row.total_students} คน)`;
      }),
    ].join('\n');

    try {
      await navigator.clipboard.writeText(text);
      alert('คัดลอกรายชื่อห้องที่ยังไม่บันทึกแล้ว');
    } catch {
      window.prompt('คัดลอกข้อความนี้', text);
    }
  }

  function goHome() {
    window.location.href = '/';
  }

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-7xl">
        {currentUser && (
          <AppNav currentUser={currentUser} active="daily-status" />
        )}

        <section className="mb-6 rounded-3xl bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-3xl font-black text-slate-800">
                สถานะการเช็กชื่อประจำวัน
              </h1>
              <p className="mt-1 text-slate-500">
                ตรวจสอบว่าห้องไหนบันทึกแล้ว ห้องไหนยังไม่บันทึก
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => loadDailyStatus(currentUser, selectedDate)}
                disabled={loading || !currentUser}
                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700 disabled:opacity-50"
              >
                โหลดข้อมูลใหม่
              </button>

              <button
                onClick={copyMissingRooms}
                disabled={loading || !currentUser}
                className="rounded-full bg-red-100 px-4 py-2 text-sm font-bold text-red-700 hover:bg-red-200 disabled:opacity-50"
              >
                คัดลอกห้องที่ยังไม่บันทึก
              </button>

              <button
                onClick={goHome}
                className="rounded-full bg-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-300"
              >
                กลับหน้าเช็กชื่อ
              </button>
            </div>
          </div>
        </section>

        {pageError && (
          <section className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">
            <div className="font-bold">เกิดข้อผิดพลาด</div>
            <div>{pageError}</div>
          </section>
        )}

        {currentUser && (
          <>
            <section className="mb-6 rounded-3xl bg-white p-6 shadow-sm">
              <div className="grid gap-4 md:grid-cols-5">
                <div>
                  <label className="mb-1 block text-sm font-bold text-slate-700">
                    วันที่ตรวจสอบ
                  </label>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(event) => setSelectedDate(event.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-slate-500"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-bold text-slate-700">
                    กรองสถานะ
                  </label>
                  <select
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-slate-500"
                  >
                    <option value="ALL">ทั้งหมด</option>
                    <option value="missing">ยังไม่บันทึก</option>
                    <option value="partial">บันทึกไม่ครบ</option>
                    <option value="done">บันทึกแล้ว</option>
                    <option value="holiday">ไม่ต้องเข้าแถว</option>
                    <option value="not_scheduled">ไม่มีข้อมูลวันเข้าแถว</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-bold text-slate-700">
                    ค้นหาห้อง
                  </label>
                  <input
                    value={searchText}
                    onChange={(event) => setSearchText(event.target.value)}
                    placeholder="เช่น ปวช.1/1"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-slate-500"
                  />
                </div>

                <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                  <div className="font-bold text-slate-800">ผู้ใช้งาน</div>
                  <div>{currentUser?.name || '-'}</div>
                  <div className="mt-1 inline-block rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
                    {currentUser?.role || '-'}
                  </div>
                </div>

                <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                  <div className="font-bold text-slate-800">วันที่</div>
                  <div>{formatThaiDate(selectedDate)}</div>
                  <div className="mt-1 text-xs text-slate-400">
                    เฉพาะผู้ดูแลระบบ
                  </div>
                </div>
              </div>
            </section>

            <section className="mb-6 grid gap-4 md:grid-cols-4">
              <StatusCard
                title="ต้องเช็กชื่อ"
                value={overview.needCheck}
                unit="ห้อง"
                tone="slate"
              />
              <StatusCard
                title="บันทึกแล้ว"
                value={overview.done}
                unit="ห้อง"
                tone="green"
              />
              <StatusCard
                title="บันทึกไม่ครบ"
                value={overview.partial}
                unit="ห้อง"
                tone="amber"
              />
              <StatusCard
                title="ยังไม่บันทึก"
                value={overview.missing}
                unit="ห้อง"
                tone="red"
              />
            </section>

            <section className="mb-6 grid gap-4 md:grid-cols-2">
              <StatusCard
                title="ไม่ต้องเข้าแถว"
                value={overview.holiday}
                unit="ห้อง"
                tone="blue"
              />
              <StatusCard
                title="ไม่มีข้อมูลวันเข้าแถว"
                value={overview.notScheduled}
                unit="ห้อง"
                tone="gray"
              />
            </section>

            <section className="rounded-3xl bg-white p-6 shadow-sm">
              <div className="mb-4 flex flex-col gap-1">
                <h2 className="text-xl font-black text-slate-800">
                  รายการสถานะรายห้อง
                </h2>
                <p className="text-sm text-slate-500">
                  หน้านี้สำหรับผู้ดูแลระบบ เพื่อติดตามห้องที่ยังไม่ได้บันทึกประจำวัน
                </p>
              </div>

              {loading ? (
                <div className="rounded-2xl bg-slate-50 p-8 text-center text-slate-500">
                  กำลังโหลดสถานะ...
                </div>
              ) : (
                <DailyStatusTable rows={filteredRoomStatusRows} />
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function DailyStatusTable({ rows }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200">
      <table className="w-full min-w-[1000px] border-collapse bg-white text-sm">
        <thead className="bg-slate-900 text-white">
          <tr>
            <th className="border border-slate-700 px-3 py-3 text-left">ห้อง</th>
            <th className="border border-slate-700 px-3 py-3 text-center">
              กลุ่มเวลา
            </th>
            <th className="border border-slate-700 px-3 py-3 text-center">
              นักเรียนทั้งหมด
            </th>
            <th className="border border-slate-700 px-3 py-3 text-center">
              บันทึกแล้ว
            </th>
            <th className="border border-slate-700 px-3 py-3 text-center">มา</th>
            <th className="border border-slate-700 px-3 py-3 text-center">ขาด</th>
            <th className="border border-slate-700 px-3 py-3 text-center">สถานะ</th>
            <th className="border border-slate-700 px-3 py-3 text-left">หมายเหตุ</th>
          </tr>
        </thead>

        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan="8"
                className="border border-slate-200 px-3 py-8 text-center text-slate-500"
              >
                ไม่พบข้อมูลห้องเรียนตามตัวกรอง
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.room_id} className="hover:bg-slate-50">
                <td className="border border-slate-200 px-3 py-3 font-bold text-slate-800">
                  {row.room_name}
                </td>

                <td className="border border-slate-200 px-3 py-3 text-center">
                  {row.schedule_group || '-'}
                </td>

                <td className="border border-slate-200 px-3 py-3 text-center">
                  {row.total_students}
                </td>

                <td className="border border-slate-200 px-3 py-3 text-center">
                  {row.checked_count}
                </td>

                <td className="border border-slate-200 px-3 py-3 text-center font-bold text-emerald-700">
                  {row.present_count}
                </td>

                <td className="border border-slate-200 px-3 py-3 text-center font-bold text-red-700">
                  {row.absent_count}
                </td>

                <td className="border border-slate-200 px-3 py-3 text-center">
                  <StatusBadge status={row.status} label={row.statusLabel} />
                </td>

                <td className="border border-slate-200 px-3 py-3 text-slate-600">
                  {row.note}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function StatusCard({ title, value, unit, tone = 'slate' }) {
  const toneClass = {
    slate: 'bg-white text-slate-800',
    green: 'bg-emerald-50 text-emerald-800',
    amber: 'bg-amber-50 text-amber-800',
    red: 'bg-red-50 text-red-800',
    blue: 'bg-blue-50 text-blue-800',
    gray: 'bg-slate-50 text-slate-700',
  };

  return (
    <div className={`rounded-3xl p-6 shadow-sm ${toneClass[tone] || toneClass.slate}`}>
      <div className="text-sm font-medium opacity-70">{title}</div>
      <div className="mt-3 flex items-end gap-2">
        <span className="text-4xl font-black">{value}</span>
        <span className="pb-1">{unit}</span>
      </div>
    </div>
  );
}

function StatusBadge({ status, label }) {
  const className =
    status === 'done'
      ? 'bg-emerald-100 text-emerald-700'
      : status === 'partial'
      ? 'bg-amber-100 text-amber-700'
      : status === 'missing'
      ? 'bg-red-100 text-red-700'
      : status === 'holiday'
      ? 'bg-blue-100 text-blue-700'
      : 'bg-slate-100 text-slate-600';

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-black ${className}`}>
      {label}
    </span>
  );
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

function normalizeDate(value) {
  if (!value) return '';
  return String(value).trim().slice(0, 10);
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

function sortRoomStatusRows(a, b) {
  const statusWeight = {
    missing: 1,
    partial: 2,
    done: 3,
    holiday: 4,
    not_scheduled: 5,
  };

  const weightA = statusWeight[a.status] || 99;
  const weightB = statusWeight[b.status] || 99;

  if (weightA !== weightB) return weightA - weightB;

  const levelA = getLevelWeight(a.level);
  const levelB = getLevelWeight(b.level);

  if (levelA !== levelB) return levelA - levelB;

  const yearA = Number(a.year || 0);
  const yearB = Number(b.year || 0);

  if (yearA !== yearB) return yearA - yearB;

  const roomA = Number(a.room_no || 0);
  const roomB = Number(b.room_no || 0);

  if (roomA !== roomB) return roomA - roomB;

  return String(a.room_id).localeCompare(String(b.room_id), 'th');
}

function getLevelWeight(level) {
  const text = String(level || '');

  if (text.includes('ปวช')) return 1;
  if (text.includes('ปวส')) return 2;

  return 99;
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