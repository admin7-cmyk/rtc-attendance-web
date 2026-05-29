'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import AppNav from '@/components/AppNav';

const PAGE_SIZE = 1000;

export default function AuditPage() {
  const [currentUser, setCurrentUser] = useState(null);

  const [logs, setLogs] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [students, setStudents] = useState([]);
  const [users, setUsers] = useState([]);

  const [selectedDate, setSelectedDate] = useState('');
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [selectedAction, setSelectedAction] = useState('');
  const [searchText, setSearchText] = useState('');

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

      if (String(parsed.role || '').toLowerCase() !== 'admin') {
        setPageError('หน้านี้สำหรับผู้ดูแลระบบเท่านั้น');
        setLoading(false);
        return;
      }

      setCurrentUser(parsed);
      loadBootstrap();
    } catch {
      localStorage.removeItem('rtc_attendance_user');
      setPageError('ข้อมูลผู้ใช้ไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่');
      setLoading(false);
    }
  }, []);

  const roomNameMap = useMemo(() => {
    const map = new Map();

    rooms.forEach((room) => {
      map.set(normalizeRoomId(room.room_id), room.room_name || room.room_id);
    });

    return map;
  }, [rooms]);

  const studentNameMap = useMemo(() => {
    const map = new Map();

    students.forEach((student) => {
      map.set(
        String(student.student_id),
        `${student.prefix || ''}${student.first_name || ''} ${
          student.last_name || ''
        }`.trim()
      );
    });

    return map;
  }, [students]);

  const userNameMap = useMemo(() => {
    const map = new Map();

    users.forEach((user) => {
      map.set(String(user.teacher_id || user.username), user.name || user.username);
      map.set(String(user.username), user.name || user.username);
    });

    return map;
  }, [users]);

  const filteredLogs = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();

    return logs.filter((log) => {
      if (selectedDate && normalizeDate(log.date) !== selectedDate) return false;

      if (
        selectedRoomId &&
        normalizeRoomId(log.room_id) !== normalizeRoomId(selectedRoomId)
      ) {
        return false;
      }

      if (selectedAction && String(log.action) !== String(selectedAction)) {
        return false;
      }

      if (!keyword) return true;

      const roomName =
        roomNameMap.get(normalizeRoomId(log.room_id)) || log.room_id || '';

      const studentName =
        studentNameMap.get(String(log.student_id)) || log.student_id || '';

      const checkedByName =
        userNameMap.get(String(log.checked_by)) || log.checked_by || '';

      const combined = [
        log.att_id,
        log.date,
        log.room_id,
        roomName,
        log.student_id,
        studentName,
        log.checked_by,
        checkedByName,
        log.old_status,
        log.new_status,
      ]
        .join(' ')
        .toLowerCase();

      return combined.includes(keyword);
    });
  }, [
    logs,
    selectedDate,
    selectedRoomId,
    selectedAction,
    searchText,
    roomNameMap,
    studentNameMap,
    userNameMap,
  ]);

  const stats = useMemo(() => {
    const total = filteredLogs.length;
    const insertCount = filteredLogs.filter((item) => item.action === 'INSERT').length;
    const updateCount = filteredLogs.filter((item) => item.action === 'UPDATE').length;
    const deleteCount = filteredLogs.filter((item) => item.action === 'DELETE').length;

    return {
      total,
      insertCount,
      updateCount,
      deleteCount,
    };
  }, [filteredLogs]);

  async function loadBootstrap() {
    try {
      setLoading(true);
      setPageError('');

      const today = getTodayYmd();
      setSelectedDate(today);

      const [roomData, studentData, userData] = await Promise.all([
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
          supabase.from('students').select('*').range(from, to)
        ),

        fetchAllRows((from, to) =>
          supabase.from('app_users').select('*').range(from, to)
        ),
      ]);

      setRooms(roomData);
      setStudents(studentData);
      setUsers(userData);

      await loadLogs(today);
    } catch (err) {
      setPageError(err.message || 'โหลดข้อมูลไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }

  async function loadLogs(dateValue = selectedDate) {
    try {
      setLoading(true);
      setPageError('');

      let queryBuilder = (from, to) => {
        let query = supabase
          .from('audit_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .range(from, to);

        if (dateValue) {
          query = query.eq('date', dateValue);
        }

        return query;
      };

      const logData = await fetchAllRows(queryBuilder);

      setLogs(logData);
    } catch (err) {
      setPageError(err.message || 'โหลด Audit Logs ไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }

  function handleClearFilter() {
    setSelectedDate('');
    setSelectedRoomId('');
    setSelectedAction('');
    setSearchText('');
    loadLogs('');
  }

  function goHome() {
    window.location.href = '/';
  }

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-7xl">
        {currentUser && <AppNav currentUser={currentUser} active="audit" />}

        <section className="mb-6 rounded-3xl bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-3xl font-black text-slate-800">
                Audit Logs
              </h1>
              <p className="mt-1 text-slate-500">
                ประวัติการเพิ่ม แก้ไข และลบข้อมูลเช็กชื่อจากตาราง attendance
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => loadLogs(selectedDate)}
                disabled={loading}
                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700 disabled:opacity-50"
              >
                โหลดข้อมูลใหม่
              </button>

              <button
                onClick={handleClearFilter}
                disabled={loading}
                className="rounded-full bg-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-300 disabled:opacity-50"
              >
                ล้างตัวกรอง
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

        <section className="mb-6 grid gap-4 md:grid-cols-4">
          <SummaryCard title="ทั้งหมด" value={stats.total} unit="รายการ" />
          <SummaryCard title="เพิ่มใหม่" value={stats.insertCount} unit="INSERT" />
          <SummaryCard title="แก้ไข" value={stats.updateCount} unit="UPDATE" />
          <SummaryCard title="ลบ" value={stats.deleteCount} unit="DELETE" />
        </section>

        <section className="mb-6 rounded-3xl bg-white p-6 shadow-sm">
          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <label className="mb-1 block text-sm font-bold text-slate-700">
                วันที่เช็กชื่อ
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={(event) => {
                  const value = event.target.value;
                  setSelectedDate(value);
                  loadLogs(value);
                }}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-slate-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-bold text-slate-700">
                ห้องเรียน
              </label>
              <select
                value={selectedRoomId}
                onChange={(event) => setSelectedRoomId(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-slate-500"
              >
                <option value="">ทุกห้อง</option>
                {rooms.map((room) => (
                  <option key={room.room_id} value={room.room_id}>
                    {room.room_name || room.room_id}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-bold text-slate-700">
                ประเภทการเปลี่ยนแปลง
              </label>
              <select
                value={selectedAction}
                onChange={(event) => setSelectedAction(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-slate-500"
              >
                <option value="">ทั้งหมด</option>
                <option value="INSERT">INSERT</option>
                <option value="UPDATE">UPDATE</option>
                <option value="DELETE">DELETE</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-bold text-slate-700">
                ค้นหา
              </label>
              <input
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="ชื่อ / รหัส / ห้อง / ผู้เช็ก"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-slate-500"
              />
            </div>
          </div>
        </section>

        <section className="rounded-3xl bg-white p-6 shadow-sm">
          <div className="mb-4 flex flex-col gap-1">
            <h2 className="text-xl font-black text-slate-800">
              รายการประวัติ
            </h2>
            <p className="text-sm text-slate-500">
              ถ้าเพิ่งสร้าง Trigger ใหม่ รายการจะเริ่มมีหลังจากมีการบันทึกเช็กชื่อครั้งต่อไป
            </p>
          </div>

          {loading ? (
            <div className="rounded-2xl bg-slate-50 p-8 text-center text-slate-500">
              กำลังโหลด Audit Logs...
            </div>
          ) : (
            <AuditTable
              logs={filteredLogs}
              roomNameMap={roomNameMap}
              studentNameMap={studentNameMap}
              userNameMap={userNameMap}
            />
          )}
        </section>
      </div>
    </main>
  );
}

function AuditTable({ logs, roomNameMap, studentNameMap, userNameMap }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200">
      <table className="w-full min-w-[1200px] border-collapse bg-white text-sm">
        <thead className="bg-slate-900 text-white">
          <tr>
            <th className="border border-slate-700 px-3 py-3 text-left">
              เวลาเกิดรายการ
            </th>
            <th className="border border-slate-700 px-3 py-3 text-center">
              Action
            </th>
            <th className="border border-slate-700 px-3 py-3 text-left">
              วันที่
            </th>
            <th className="border border-slate-700 px-3 py-3 text-left">
              ห้อง
            </th>
            <th className="border border-slate-700 px-3 py-3 text-left">
              นักเรียน
            </th>
            <th className="border border-slate-700 px-3 py-3 text-center">
              เดิม
            </th>
            <th className="border border-slate-700 px-3 py-3 text-center">
              ใหม่
            </th>
            <th className="border border-slate-700 px-3 py-3 text-left">
              ผู้บันทึก
            </th>
            <th className="border border-slate-700 px-3 py-3 text-left">
              checked_at
            </th>
          </tr>
        </thead>

        <tbody>
          {logs.length === 0 ? (
            <tr>
              <td
                colSpan="9"
                className="border border-slate-200 px-3 py-8 text-center text-slate-500"
              >
                ไม่พบประวัติ
              </td>
            </tr>
          ) : (
            logs.map((log) => {
              const roomName =
                roomNameMap.get(normalizeRoomId(log.room_id)) || log.room_id || '-';

              const studentName =
                studentNameMap.get(String(log.student_id)) ||
                log.student_id ||
                '-';

              const checkedByName =
                userNameMap.get(String(log.checked_by)) ||
                log.checked_by ||
                '-';

              return (
                <tr key={log.log_id} className="hover:bg-slate-50">
                  <td className="border border-slate-200 px-3 py-3">
                    {formatThaiDateTime(log.created_at)}
                  </td>

                  <td className="border border-slate-200 px-3 py-3 text-center">
                    <ActionBadge action={log.action} />
                  </td>

                  <td className="border border-slate-200 px-3 py-3">
                    {formatThaiDate(log.date)}
                  </td>

                  <td className="border border-slate-200 px-3 py-3 font-bold">
                    {roomName}
                  </td>

                  <td className="border border-slate-200 px-3 py-3">
                    <div className="font-bold">{studentName}</div>
                    <div className="text-xs text-slate-400">
                      {log.student_id}
                    </div>
                  </td>

                  <td className="border border-slate-200 px-3 py-3 text-center">
                    <StatusBadge status={log.old_status} />
                  </td>

                  <td className="border border-slate-200 px-3 py-3 text-center">
                    <StatusBadge status={log.new_status} />
                  </td>

                  <td className="border border-slate-200 px-3 py-3">
                    {checkedByName}
                  </td>

                  <td className="border border-slate-200 px-3 py-3">
                    {formatThaiDateTime(log.checked_at)}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

function SummaryCard({ title, value, unit }) {
  return (
    <div className="rounded-3xl bg-white p-6 shadow-sm">
      <div className="text-sm font-medium text-slate-500">{title}</div>
      <div className="mt-3 flex items-end gap-2">
        <span className="text-4xl font-black text-slate-800">{value}</span>
        <span className="pb-1 text-slate-500">{unit}</span>
      </div>
    </div>
  );
}

function ActionBadge({ action }) {
  const text = String(action || '-');

  const className =
    text === 'INSERT'
      ? 'bg-emerald-50 text-emerald-700'
      : text === 'UPDATE'
      ? 'bg-blue-50 text-blue-700'
      : text === 'DELETE'
      ? 'bg-red-50 text-red-700'
      : 'bg-slate-50 text-slate-700';

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-black ${className}`}>
      {text}
    </span>
  );
}

function StatusBadge({ status }) {
  const text = normalizeStatus(status);

  if (!text) {
    return <span className="text-slate-400">-</span>;
  }

  const label = text === 'P' ? 'มา' : 'ขาด';

  const className =
    text === 'P'
      ? 'bg-emerald-50 text-emerald-700'
      : 'bg-red-50 text-red-700';

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

function normalizeDate(value) {
  if (!value) return '';
  return String(value).trim().slice(0, 10);
}

function getTodayYmd() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function formatThaiDate(value) {
  const ymd = normalizeDate(value);

  if (!ymd) return '-';

  const [yearText, monthText, dayText] = ymd.split('-');

  if (!yearText || !monthText || !dayText) return value || '-';

  return `${dayText}/${monthText}/${Number(yearText) + 543}`;
}

function formatThaiDateTime(value) {
  if (!value) return '-';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return String(value);

  const pad = (number) => String(number).padStart(2, '0');

  const day = pad(date.getDate());
  const month = pad(date.getMonth() + 1);
  const year = date.getFullYear() + 543;
  const hour = pad(date.getHours());
  const minute = pad(date.getMinutes());
  const second = pad(date.getSeconds());

  return `${day}/${month}/${year} ${hour}:${minute}:${second}`;
}