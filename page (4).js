'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import AppNav from '@/components/AppNav';
import { exportDailyHistoryExcel } from '@/lib/exportDailyHistoryExcel';
import { exportDailyHistoryWord } from '@/lib/exportDailyHistoryWord';

const PAGE_SIZE = 1000;

export default function DailyHistoryPage() {
  const [currentUser, setCurrentUser] = useState(null);

  const [selectedDate, setSelectedDate] = useState(getTodayYmd());
  const [searchText, setSearchText] = useState('');

  const [attendanceRows, setAttendanceRows] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [users, setUsers] = useState([]);

  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
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
      loadDailyHistory(selectedDate);
    } catch {
      localStorage.removeItem('rtc_attendance_user');
      setPageError('ข้อมูลผู้ใช้ไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่');
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (currentUser && selectedDate) {
      loadDailyHistory(selectedDate);
    }
  }, [currentUser, selectedDate]);

  const roomMap = useMemo(() => {
    const map = new Map();

    rooms.forEach((room) => {
      map.set(normalizeRoomId(room.room_id), room);
    });

    return map;
  }, [rooms]);

  const userMap = useMemo(() => {
    const map = new Map();

    users.forEach((user) => {
      const keys = [user.teacher_id, user.username]
        .map((item) => String(item || '').trim())
        .filter(Boolean);

      keys.forEach((key) => {
        map.set(key, user);
      });
    });

    return map;
  }, [users]);

  const historyRows = useMemo(() => {
    const grouped = new Map();

    attendanceRows.forEach((item) => {
      const roomKey = normalizeRoomId(item.room_id);
      const room = roomMap.get(roomKey) || null;
      const checkedByKey = String(item.checked_by || '').trim();
      const checkedByUser = userMap.get(checkedByKey) || null;

      if (!grouped.has(roomKey)) {
        grouped.set(roomKey, {
          room_id: item.room_id,
          room_name: room?.room_name || item.room_id || '-',
          level: room?.level || '',
          year: room?.year || '',
          room_no: room?.room_no || '',
          schedule_group: room?.schedule_group || '',
          present_count: 0,
          absent_count: 0,
          total_count: 0,
          checked_by: item.checked_by || '',
          checked_by_name: checkedByUser?.name || item.checked_by || '-',
          checked_at: item.checked_at || '',
          first_checked_at: item.checked_at || '',
          last_checked_at: item.checked_at || '',
          term_id: item.term_id || '',
          week_no: item.week_no || '',
          month_key: item.month_key || '',
        });
      }

      const row = grouped.get(roomKey);
      const status = normalizeStatus(item.status);

      row.total_count += 1;

      if (status === 'P') {
        row.present_count += 1;
      } else if (status === 'A') {
        row.absent_count += 1;
      }

      const checkedAt = String(item.checked_at || '');

      if (checkedAt) {
        if (!row.first_checked_at || checkedAt < row.first_checked_at) {
          row.first_checked_at = checkedAt;
        }

        if (!row.last_checked_at || checkedAt > row.last_checked_at) {
          row.last_checked_at = checkedAt;
          row.checked_at = checkedAt;
          row.checked_by = item.checked_by || row.checked_by;

          const latestUser = userMap.get(String(item.checked_by || '').trim());
          row.checked_by_name =
            latestUser?.name || item.checked_by || row.checked_by_name;
        }
      }
    });

    return Array.from(grouped.values()).sort(sortHistoryRows);
  }, [attendanceRows, roomMap, userMap]);

  const filteredHistoryRows = useMemo(() => {
    const keyword = String(searchText || '').trim().toLowerCase();

    if (!keyword) return historyRows;

    return historyRows.filter((row) => {
      const combined = [
        row.room_id,
        row.room_name,
        row.level,
        row.year,
        row.room_no,
        row.schedule_group,
        row.checked_by,
        row.checked_by_name,
        row.term_id,
        row.week_no,
        row.month_key,
      ]
        .join(' ')
        .toLowerCase();

      return combined.includes(keyword);
    });
  }, [historyRows, searchText]);

  const overview = useMemo(() => {
    const totalRooms = filteredHistoryRows.length;

    const presentCount = filteredHistoryRows.reduce(
      (sum, row) => sum + Number(row.present_count || 0),
      0
    );

    const absentCount = filteredHistoryRows.reduce(
      (sum, row) => sum + Number(row.absent_count || 0),
      0
    );

    const totalRecords = presentCount + absentCount;

    const presentPercent =
      totalRecords > 0
        ? ((presentCount / totalRecords) * 100).toFixed(2)
        : '0.00';

    const absentPercent =
      totalRecords > 0
        ? ((absentCount / totalRecords) * 100).toFixed(2)
        : '0.00';

    return {
      totalRooms,
      presentCount,
      absentCount,
      totalRecords,
      presentPercent,
      absentPercent,
    };
  }, [filteredHistoryRows]);

  async function loadDailyHistory(dateValue) {
    try {
      setLoading(true);
      setPageError('');

      const [attendanceData, roomData, userData] = await Promise.all([
        fetchAllRows((from, to) =>
          supabase
            .from('attendance')
            .select('*')
            .eq('date', dateValue)
            .range(from, to)
        ),

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
          supabase
            .from('app_users')
            .select('*')
            .order('teacher_id', { ascending: true })
            .range(from, to)
        ),
      ]);

      setAttendanceRows(attendanceData || []);
      setRooms(roomData || []);
      setUsers(userData || []);
    } catch (err) {
      setPageError(err.message || 'โหลดประวัติรายวันไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }

  async function copyDailyHistory() {
    if (filteredHistoryRows.length === 0) {
      alert('ไม่มีประวัติการเช็กชื่อของวันที่เลือก');
      return;
    }

    const text = [
      `ประวัติการเช็กชื่อประจำวันที่ ${formatThaiDate(selectedDate)}`,
      `ห้องที่บันทึกแล้ว: ${overview.totalRooms} ห้อง`,
      `มา: ${overview.presentCount} ครั้ง (${overview.presentPercent}%)`,
      `ขาด: ${overview.absentCount} ครั้ง (${overview.absentPercent}%)`,
      '',
      ...filteredHistoryRows.map((row, index) => {
        return `${index + 1}. ${row.room_name} | มา ${row.present_count} | ขาด ${
          row.absent_count
        } | ผู้บันทึก: ${row.checked_by_name} | เวลา: ${formatThaiDateTime(
          row.last_checked_at
        )}`;
      }),
    ].join('\n');

    try {
      await navigator.clipboard.writeText(text);
      alert('คัดลอกประวัติรายวันแล้ว');
    } catch {
      window.prompt('คัดลอกข้อความนี้', text);
    }
  }

  async function handleExportExcel() {
    try {
      setExporting(true);
      setPageError('');

      if (filteredHistoryRows.length === 0) {
        alert('ไม่มีข้อมูลสำหรับ Export');
        return;
      }

      await exportDailyHistoryExcel({
        selectedDate,
        rows: filteredHistoryRows,
        overview,
      });
    } catch (err) {
      setPageError(err.message || 'Export Excel ไม่สำเร็จ');
    } finally {
      setExporting(false);
    }
  }

  async function handleExportWord() {
    try {
      setExporting(true);
      setPageError('');

      if (filteredHistoryRows.length === 0) {
        alert('ไม่มีข้อมูลสำหรับ Export');
        return;
      }

      await exportDailyHistoryWord({
        selectedDate,
        rows: filteredHistoryRows,
        overview,
      });
    } catch (err) {
      setPageError(err.message || 'Export Word ไม่สำเร็จ');
    } finally {
      setExporting(false);
    }
  }

  function goAdmin() {
    window.location.href = '/admin';
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
        <AppNav currentUser={currentUser} active="daily-history" />

        <section className="mb-4 rounded-3xl bg-white p-4 shadow-sm sm:mb-6 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-2xl font-black text-slate-800 sm:text-3xl">
                ประวัติการเช็กชื่อรายวัน
              </h1>
              <p className="mt-1 text-sm text-slate-500 sm:text-base">
                ดูสรุปว่าแต่ละห้องบันทึกเมื่อไหร่ ใครเป็นคนบันทึก มา/ขาดกี่คน
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => loadDailyHistory(selectedDate)}
                disabled={loading}
                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700 disabled:opacity-50"
              >
                โหลดข้อมูลใหม่
              </button>

              <button
                onClick={copyDailyHistory}
                disabled={loading || filteredHistoryRows.length === 0}
                className="rounded-full bg-emerald-100 px-4 py-2 text-sm font-bold text-emerald-700 hover:bg-emerald-200 disabled:opacity-50"
              >
                คัดลอกสรุปรายวัน
              </button>

              <button
                onClick={handleExportExcel}
                disabled={loading || exporting || filteredHistoryRows.length === 0}
                className="rounded-full bg-blue-100 px-4 py-2 text-sm font-bold text-blue-700 hover:bg-blue-200 disabled:opacity-50"
              >
                Export Excel
              </button>

              <button
                onClick={handleExportWord}
                disabled={loading || exporting || filteredHistoryRows.length === 0}
                className="rounded-full bg-purple-100 px-4 py-2 text-sm font-bold text-purple-700 hover:bg-purple-200 disabled:opacity-50"
              >
                Export Word
              </button>

              <button
                onClick={goAdmin}
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

        {exporting && (
          <section className="mb-4 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm font-bold text-blue-700 sm:mb-6">
            กำลังสร้างไฟล์รายงาน...
          </section>
        )}

        <section className="mb-4 rounded-3xl bg-white p-4 shadow-sm sm:mb-6 sm:p-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-bold text-slate-700">
                วันที่
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500 sm:text-base"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-bold text-slate-700">
                ค้นหา
              </label>
              <input
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="ค้นหาห้อง / ผู้บันทึก"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500 sm:text-base"
              />
            </div>

            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
              <div className="font-bold text-slate-800">วันที่แสดงผล</div>
              <div>{formatThaiDate(selectedDate)}</div>
              <div className="mt-1 text-xs text-slate-400">
                Export ตามรายการที่กรองอยู่
              </div>
            </div>
          </div>
        </section>

        <section className="mb-4 grid grid-cols-2 gap-3 sm:mb-6 lg:grid-cols-4 lg:gap-4">
          <StatCard title="ห้องที่บันทึกแล้ว" value={overview.totalRooms} unit="ห้อง" />
          <StatCard
            title="มาเข้าแถวรวม"
            value={overview.presentCount}
            unit={`ครั้ง (${overview.presentPercent}%)`}
            tone="green"
          />
          <StatCard
            title="ขาดรวม"
            value={overview.absentCount}
            unit={`ครั้ง (${overview.absentPercent}%)`}
            tone="red"
          />
          <StatCard title="รายการทั้งหมด" value={overview.totalRecords} unit="รายการ" />
        </section>

        <section className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-black text-slate-800">
                รายการประวัติรายห้อง
              </h2>
              <p className="text-sm text-slate-500">
                แสดงจากตาราง attendance รวมตามห้องของวันที่เลือก
              </p>
              <p className="mt-1 text-xs font-semibold text-slate-400 sm:hidden">
                เลื่อนตารางซ้าย-ขวาเพื่อดูข้อมูลทั้งหมด
              </p>
            </div>

            {loading && (
              <span className="w-fit rounded-full bg-blue-100 px-4 py-2 text-sm font-bold text-blue-700">
                กำลังโหลด...
              </span>
            )}
          </div>

          {loading ? (
            <div className="rounded-2xl bg-slate-50 p-8 text-center text-slate-500">
              กำลังโหลดประวัติรายวัน...
            </div>
          ) : (
            <>
              <DailyHistoryMobileCards rows={filteredHistoryRows} />
              <DailyHistoryDesktopTable rows={filteredHistoryRows} />
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function DailyHistoryMobileCards({ rows }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl bg-slate-50 p-8 text-center text-slate-500 md:hidden">
        ไม่พบประวัติการเช็กชื่อของวันที่เลือก
      </div>
    );
  }

  return (
    <div className="space-y-3 md:hidden">
      {rows.map((row, index) => (
        <div
          key={`${row.room_id}_${index}`}
          className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-bold text-slate-400">
                {index + 1}. {row.room_id}
              </div>
              <div className="text-lg font-black text-slate-800">
                {row.room_name || '-'}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                สัปดาห์ที่ {row.week_no || '-'} · {row.schedule_group || '-'}
              </div>
            </div>

            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700">
              บันทึกแล้ว
            </span>
          </div>

          <div className="mb-3 grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-2xl bg-slate-50 p-3">
              <div className="font-bold text-slate-500">รวม</div>
              <div className="mt-1 text-xl font-black text-slate-800">
                {row.total_count}
              </div>
            </div>

            <div className="rounded-2xl bg-emerald-50 p-3">
              <div className="font-bold text-emerald-600">มา</div>
              <div className="mt-1 text-xl font-black text-emerald-700">
                {row.present_count}
              </div>
            </div>

            <div className="rounded-2xl bg-red-50 p-3">
              <div className="font-bold text-red-600">ขาด</div>
              <div className="mt-1 text-xl font-black text-red-700">
                {row.absent_count}
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">
            <div>
              <span className="font-bold text-slate-800">ผู้บันทึก: </span>
              {row.checked_by_name || '-'}
            </div>
            <div className="mt-1">
              <span className="font-bold text-slate-800">เวลาล่าสุด: </span>
              {formatThaiDateTime(row.last_checked_at)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function DailyHistoryDesktopTable({ rows }) {
  return (
    <div
      className="hidden max-w-full overflow-x-auto rounded-2xl border border-slate-200 md:block"
      style={{
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <table className="min-w-[1120px] w-full border-collapse bg-white text-sm">
        <thead className="bg-slate-900 text-white">
          <tr>
            <th className="whitespace-nowrap px-4 py-3 text-center">ลำดับ</th>
            <th className="whitespace-nowrap px-4 py-3 text-left">ห้อง</th>
            <th className="whitespace-nowrap px-4 py-3 text-center">ภาคเรียน</th>
            <th className="whitespace-nowrap px-4 py-3 text-center">สัปดาห์</th>
            <th className="whitespace-nowrap px-4 py-3 text-center">รวม</th>
            <th className="whitespace-nowrap px-4 py-3 text-center">มา</th>
            <th className="whitespace-nowrap px-4 py-3 text-center">ขาด</th>
            <th className="whitespace-nowrap px-4 py-3 text-left">ผู้บันทึก</th>
            <th className="whitespace-nowrap px-4 py-3 text-center">เวลาล่าสุด</th>
          </tr>
        </thead>

        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan="9" className="px-4 py-8 text-center text-slate-500">
                ไม่พบประวัติการเช็กชื่อของวันที่เลือก
              </td>
            </tr>
          ) : (
            rows.map((row, index) => (
              <tr
                key={`${row.room_id}_${index}`}
                className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
              >
                <td className="whitespace-nowrap px-4 py-3 text-center font-bold text-slate-500">
                  {index + 1}
                </td>

                <td className="whitespace-nowrap px-4 py-3 font-bold text-slate-700">
                  {row.room_name || row.room_id}
                </td>

                <td className="whitespace-nowrap px-4 py-3 text-center text-slate-700">
                  {row.term_id || '-'}
                </td>

                <td className="whitespace-nowrap px-4 py-3 text-center text-slate-700">
                  {row.week_no || '-'}
                </td>

                <td className="whitespace-nowrap px-4 py-3 text-center font-bold text-slate-700">
                  {row.total_count}
                </td>

                <td className="whitespace-nowrap px-4 py-3 text-center font-bold text-emerald-700">
                  {row.present_count}
                </td>

                <td className="whitespace-nowrap px-4 py-3 text-center font-bold text-red-700">
                  {row.absent_count}
                </td>

                <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                  {row.checked_by_name || row.checked_by || '-'}
                </td>

                <td className="whitespace-nowrap px-4 py-3 text-center text-slate-600">
                  {formatThaiDateTime(row.last_checked_at)}
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
  };

  return (
    <div className={`rounded-3xl p-4 shadow-sm sm:p-6 ${toneClass[tone]}`}>
      <div className="text-xs font-medium opacity-70 sm:text-sm">{title}</div>
      <div className="mt-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:gap-2">
        <span className="text-3xl font-black sm:text-4xl">{value}</span>
        <span className="text-xs sm:pb-1 sm:text-sm">{unit}</span>
      </div>
    </div>
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

function sortHistoryRows(a, b) {
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

  const [yearText, monthText, dayText] = String(ymd).slice(0, 10).split('-');

  if (!yearText || !monthText || !dayText) {
    return ymd;
  }

  const buddhistYear = Number(yearText) + 543;

  return `${dayText}/${monthText}/${buddhistYear}`;
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