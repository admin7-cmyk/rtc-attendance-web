'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import AppNav from '@/components/AppNav';

const EMPTY_FORM = {
  room_id: '',
  room_name: '',
  level: 'ปวช',
  year: '',
  room_no: '',
  schedule_group: 'ปวช',
};

export default function AdminRoomsPage() {
  const [currentUser, setCurrentUser] = useState(null);

  const [rooms, setRooms] = useState([]);
  const [students, setStudents] = useState([]);
  const [users, setUsers] = useState([]);

  const [form, setForm] = useState(EMPTY_FORM);
  const [editingRoomId, setEditingRoomId] = useState('');

  const [searchText, setSearchText] = useState('');
  const [levelFilter, setLevelFilter] = useState('ALL');
  const [scheduleGroupFilter, setScheduleGroupFilter] = useState('ALL');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [pageError, setPageError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

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
      loadPageData();
    } catch {
      localStorage.removeItem('rtc_attendance_user');
      setPageError('ข้อมูลผู้ใช้ไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่');
      setLoading(false);
    }
  }, []);

  const studentCountByRoom = useMemo(() => {
    const map = new Map();

    students.forEach((student) => {
      if (!isTrueValue(student.active)) return;

      const key = normalizeRoomId(student.room_id);
      map.set(key, Number(map.get(key) || 0) + 1);
    });

    return map;
  }, [students]);

  const teacherCountByRoom = useMemo(() => {
    const map = new Map();

    users.forEach((user) => {
      if (!isTrueValue(user.active)) return;

      const role = String(user.role || '').toLowerCase();

      if (role === 'admin') return;

      const roomIds = parseRoomIds(user.room_ids);

      roomIds.forEach((roomId) => {
        const key = normalizeRoomId(roomId);
        if (!key || key === 'ALL') return;
        map.set(key, Number(map.get(key) || 0) + 1);
      });
    });

    return map;
  }, [users]);

  const roomRows = useMemo(() => {
    return rooms.map((room) => {
      const key = normalizeRoomId(room.room_id);

      return {
        ...room,
        active_student_count: Number(studentCountByRoom.get(key) || 0),
        teacher_count: Number(teacherCountByRoom.get(key) || 0),
      };
    });
  }, [rooms, studentCountByRoom, teacherCountByRoom]);

  const filteredRooms = useMemo(() => {
    const keyword = String(searchText || '').trim().toLowerCase();

    return roomRows.filter((room) => {
      if (levelFilter !== 'ALL' && String(room.level || '') !== levelFilter) {
        return false;
      }

      if (
        scheduleGroupFilter !== 'ALL' &&
        String(room.schedule_group || '') !== scheduleGroupFilter
      ) {
        return false;
      }

      if (!keyword) return true;

      const combined = [
        room.room_id,
        room.room_name,
        room.level,
        room.year,
        room.room_no,
        room.schedule_group,
        room.active_student_count,
        room.teacher_count,
      ]
        .join(' ')
        .toLowerCase();

      return combined.includes(keyword);
    });
  }, [roomRows, searchText, levelFilter, scheduleGroupFilter]);

  const overview = useMemo(() => {
    const totalRooms = rooms.length;

    const pvsRooms = rooms.filter((room) =>
      String(room.level || '').includes('ปวส')
    ).length;

    const pvcRooms = rooms.filter((room) =>
      String(room.level || '').includes('ปวช')
    ).length;

    const activeStudentRooms = roomRows.filter(
      (room) => Number(room.active_student_count || 0) > 0
    ).length;

    return {
      totalRooms,
      pvcRooms,
      pvsRooms,
      activeStudentRooms,
    };
  }, [rooms, roomRows]);

  async function loadPageData() {
    try {
      setLoading(true);
      setPageError('');
      setSuccessMessage('');

      const [
        { data: roomData, error: roomError },
        { data: studentData, error: studentError },
        { data: userData, error: userError },
      ] = await Promise.all([
        supabase
          .from('rooms')
          .select('*')
          .order('level', { ascending: true })
          .order('year', { ascending: true })
          .order('room_no', { ascending: true })
          .order('room_id', { ascending: true }),

        supabase
          .from('students')
          .select('student_id, room_id, active'),

        supabase
          .from('app_users')
          .select('teacher_id, username, name, role, room_ids, active'),
      ]);

      if (roomError) {
        throw new Error(roomError.message);
      }

      if (studentError) {
        throw new Error(studentError.message);
      }

      if (userError) {
        throw new Error(userError.message);
      }

      setRooms(roomData || []);
      setStudents(studentData || []);
      setUsers(userData || []);
    } catch (err) {
      setPageError(err.message || 'โหลดข้อมูลห้องเรียนไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }

  function startCreate() {
    setEditingRoomId('');
    setForm(EMPTY_FORM);
    setPageError('');
    setSuccessMessage('');
  }

  function startEdit(room) {
    setEditingRoomId(room.room_id || '');

    setForm({
      room_id: room.room_id || '',
      room_name: room.room_name || room.room_id || '',
      level: room.level || '',
      year: room.year || '',
      room_no: room.room_no || '',
      schedule_group: room.schedule_group || '',
    });

    setPageError('');
    setSuccessMessage('');
  }

  function resetForm() {
    setEditingRoomId('');
    setForm(EMPTY_FORM);
    setPageError('');
    setSuccessMessage('');
  }

  function updateForm(field, value) {
    setForm((prev) => {
      const next = {
        ...prev,
        [field]: value,
      };

      if (field === 'level') {
        if (String(value).includes('ปวช')) {
          next.schedule_group = 'ปวช';
        }

        if (String(value).includes('ปวส') && next.schedule_group === 'ปวช') {
          next.schedule_group = 'ปวส';
        }
      }

      if (['level', 'year', 'room_no'].includes(field)) {
        const level = field === 'level' ? value : next.level;
        const year = field === 'year' ? value : next.year;
        const roomNo = field === 'room_no' ? value : next.room_no;

        if (level && year && roomNo && !editingRoomId) {
          next.room_id = `${level}${year}/${roomNo}`;
          next.room_name = `${level}.${year}/${roomNo}`;
        }
      }

      return next;
    });
  }

  async function saveRoom(event) {
    event.preventDefault();

    try {
      setSaving(true);
      setPageError('');
      setSuccessMessage('');

      const roomId = String(form.room_id || '').trim();
      const roomName = String(form.room_name || '').trim();
      const level = String(form.level || '').trim();
      const year = String(form.year || '').trim();
      const roomNo = String(form.room_no || '').trim();
      const scheduleGroup = String(form.schedule_group || '').trim();

      if (!roomId) {
        throw new Error('กรุณากรอก room_id');
      }

      if (!roomName) {
        throw new Error('กรุณากรอกชื่อห้อง');
      }

      if (!level) {
        throw new Error('กรุณาเลือกระดับชั้น');
      }

      if (!year) {
        throw new Error('กรุณากรอกปี');
      }

      if (!roomNo) {
        throw new Error('กรุณากรอกห้อง');
      }

      if (!scheduleGroup) {
        throw new Error('กรุณาเลือก schedule_group');
      }

      const row = {
        room_id: roomId,
        room_name: roomName,
        level,
        year,
        room_no: roomNo,
        schedule_group: scheduleGroup,
      };

      const { error } = await supabase.from('rooms').upsert(row, {
        onConflict: 'room_id',
      });

      if (error) {
        throw new Error(error.message);
      }

      setSuccessMessage(
        editingRoomId
          ? `แก้ไขข้อมูลห้อง ${roomName} สำเร็จ`
          : `เพิ่มห้อง ${roomName} สำเร็จ`
      );

      await loadPageData();
      resetForm();
    } catch (err) {
      setPageError(err.message || 'บันทึกห้องเรียนไม่สำเร็จ');
    } finally {
      setSaving(false);
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
        <AppNav currentUser={currentUser} active="admin-rooms" />

        <section className="mb-4 rounded-3xl bg-white p-4 shadow-sm sm:mb-6 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-2xl font-black text-slate-800 sm:text-3xl">
                จัดการห้องเรียน
              </h1>
              <p className="mt-1 text-sm text-slate-500 sm:text-base">
                เพิ่ม แก้ไขห้องเรียน และกำหนด schedule_group สำหรับวันเข้าแถว
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={startCreate}
                className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700"
              >
                เพิ่มห้องใหม่
              </button>

              <button
                onClick={loadPageData}
                disabled={loading}
                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700 disabled:opacity-50"
              >
                โหลดข้อมูลใหม่
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

        {successMessage && (
          <section className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 sm:mb-6">
            <div className="font-bold">สำเร็จ</div>
            <div>{successMessage}</div>
          </section>
        )}

        <section className="mb-4 grid grid-cols-2 gap-3 sm:mb-6 lg:grid-cols-4 lg:gap-4">
          <StatCard title="ห้องทั้งหมด" value={overview.totalRooms} unit="ห้อง" />
          <StatCard title="ปวช." value={overview.pvcRooms} unit="ห้อง" tone="green" />
          <StatCard title="ปวส." value={overview.pvsRooms} unit="ห้อง" tone="blue" />
          <StatCard
            title="มีนักเรียน active"
            value={overview.activeStudentRooms}
            unit="ห้อง"
            tone="slate"
          />
        </section>

        <section className="grid gap-4 lg:grid-cols-[420px_1fr]">
          <section className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
            <div className="mb-4">
              <h2 className="text-xl font-black text-slate-800">
                {editingRoomId ? 'แก้ไขห้องเรียน' : 'เพิ่ม / แก้ไขห้องเรียน'}
              </h2>
              <p className="text-sm text-slate-500">
                schedule_group ต้องตรงกับ school_days
              </p>
            </div>

            <form onSubmit={saveRoom} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-bold text-slate-700">
                  Room ID
                </label>
                <input
                  value={form.room_id}
                  onChange={(e) => updateForm('room_id', e.target.value)}
                  disabled={Boolean(editingRoomId)}
                  placeholder="เช่น ปวช1/1"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500 disabled:bg-slate-100 disabled:text-slate-400"
                />
                <p className="mt-1 text-xs text-slate-400">
                  ถ้าแก้ room_id ของห้องที่ใช้งานแล้ว อาจกระทบ students / attendance
                </p>
              </div>

              <div>
                <label className="mb-1 block text-sm font-bold text-slate-700">
                  ชื่อห้อง
                </label>
                <input
                  value={form.room_name}
                  onChange={(e) => updateForm('room_name', e.target.value)}
                  placeholder="เช่น ปวช.1/1"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-bold text-slate-700">
                    Level
                  </label>
                  <select
                    value={form.level}
                    onChange={(e) => updateForm('level', e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none focus:border-slate-500"
                  >
                    <option value="ปวช">ปวช</option>
                    <option value="ปวส">ปวส</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-bold text-slate-700">
                    ปี
                  </label>
                  <input
                    value={form.year}
                    onChange={(e) => updateForm('year', e.target.value)}
                    placeholder="1"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none focus:border-slate-500"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-bold text-slate-700">
                    ห้อง
                  </label>
                  <input
                    value={form.room_no}
                    onChange={(e) => updateForm('room_no', e.target.value)}
                    placeholder="1"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none focus:border-slate-500"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-bold text-slate-700">
                  Schedule Group
                </label>
                <select
                  value={form.schedule_group}
                  onChange={(e) => updateForm('schedule_group', e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500"
                >
                  <option value="ปวช">ปวช</option>
                  <option value="ปวส">ปวส</option>
                  <option value="ปวส_ม6">ปวส_ม6</option>
                </select>
              </div>

              <div className="rounded-2xl bg-slate-50 p-3 text-xs text-slate-500">
                ตัวอย่าง: room_id = {form.room_id || '-'} | room_name ={' '}
                {form.room_name || '-'} | schedule_group ={' '}
                {form.schedule_group || '-'}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white hover:bg-slate-700 disabled:opacity-50"
                >
                  {saving ? 'กำลังบันทึก...' : 'บันทึก'}
                </button>

                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-2xl bg-slate-200 px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-300"
                >
                  ล้างฟอร์ม
                </button>
              </div>
            </form>
          </section>

          <section className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
            <div className="mb-4">
              <h2 className="text-xl font-black text-slate-800">
                รายการห้องเรียน
              </h2>
              <p className="text-sm text-slate-500">
                คลิกแก้ไขเพื่อปรับข้อมูลห้องเรียน
              </p>
            </div>

            <div className="mb-4 grid gap-3 md:grid-cols-3">
              <input
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="ค้นหาห้อง / schedule_group"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500"
              />

              <select
                value={levelFilter}
                onChange={(e) => setLevelFilter(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500"
              >
                <option value="ALL">ทุกระดับ</option>
                <option value="ปวช">ปวช</option>
                <option value="ปวส">ปวส</option>
              </select>

              <select
                value={scheduleGroupFilter}
                onChange={(e) => setScheduleGroupFilter(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500"
              >
                <option value="ALL">ทุก schedule_group</option>
                <option value="ปวช">ปวช</option>
                <option value="ปวส">ปวส</option>
                <option value="ปวส_ม6">ปวส_ม6</option>
              </select>
            </div>

            {loading ? (
              <div className="rounded-2xl bg-slate-50 p-8 text-center text-slate-500">
                กำลังโหลดข้อมูล...
              </div>
            ) : (
              <>
                <RoomMobileCards rooms={filteredRooms} onEdit={startEdit} />
                <RoomDesktopTable rooms={filteredRooms} onEdit={startEdit} />
              </>
            )}
          </section>
        </section>
      </div>
    </main>
  );
}

function RoomMobileCards({ rooms, onEdit }) {
  if (rooms.length === 0) {
    return (
      <div className="rounded-2xl bg-slate-50 p-8 text-center text-slate-500 md:hidden">
        ไม่พบข้อมูลห้องเรียน
      </div>
    );
  }

  return (
    <div className="space-y-3 md:hidden">
      {rooms.map((room, index) => (
        <div
          key={room.room_id || index}
          className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-bold text-slate-400">
                {index + 1}. {room.room_id}
              </div>
              <div className="text-lg font-black text-slate-800">
                {room.room_name || '-'}
              </div>
              <div className="mt-1 text-sm text-slate-500">
                {room.level}.{room.year}/{room.room_no}
              </div>
            </div>

            <ScheduleBadge value={room.schedule_group} />
          </div>

          <div className="mb-3 grid grid-cols-2 gap-2 text-center text-xs">
            <div className="rounded-2xl bg-slate-50 p-3">
              <div className="font-bold text-slate-500">นักเรียน active</div>
              <div className="mt-1 text-xl font-black text-slate-800">
                {room.active_student_count}
              </div>
            </div>

            <div className="rounded-2xl bg-slate-50 p-3">
              <div className="font-bold text-slate-500">ครูที่ดูแล</div>
              <div className="mt-1 text-xl font-black text-slate-800">
                {room.teacher_count}
              </div>
            </div>
          </div>

          <button
            onClick={() => onEdit(room)}
            className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white"
          >
            แก้ไข
          </button>
        </div>
      ))}
    </div>
  );
}

function RoomDesktopTable({ rooms, onEdit }) {
  return (
    <div
      className="hidden max-w-full overflow-x-auto rounded-2xl border border-slate-200 md:block"
      style={{
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <table className="min-w-[920px] w-full border-collapse bg-white text-sm">
        <thead className="bg-slate-900 text-white">
          <tr>
            <th className="whitespace-nowrap px-4 py-3 text-center">ลำดับ</th>
            <th className="whitespace-nowrap px-4 py-3 text-left">Room ID</th>
            <th className="whitespace-nowrap px-4 py-3 text-left">ชื่อห้อง</th>
            <th className="whitespace-nowrap px-4 py-3 text-center">ระดับ</th>
            <th className="whitespace-nowrap px-4 py-3 text-center">ปี/ห้อง</th>
            <th className="whitespace-nowrap px-4 py-3 text-center">
              schedule_group
            </th>
            <th className="whitespace-nowrap px-4 py-3 text-center">
              นักเรียน active
            </th>
            <th className="whitespace-nowrap px-4 py-3 text-center">ครูดูแล</th>
            <th className="whitespace-nowrap px-4 py-3 text-center">จัดการ</th>
          </tr>
        </thead>

        <tbody>
          {rooms.length === 0 ? (
            <tr>
              <td colSpan="9" className="px-4 py-8 text-center text-slate-500">
                ไม่พบข้อมูลห้องเรียน
              </td>
            </tr>
          ) : (
            rooms.map((room, index) => (
              <tr
                key={room.room_id || index}
                className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
              >
                <td className="whitespace-nowrap px-4 py-3 text-center font-bold text-slate-500">
                  {index + 1}
                </td>

                <td className="whitespace-nowrap px-4 py-3 font-bold text-slate-700">
                  {room.room_id || '-'}
                </td>

                <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                  {room.room_name || '-'}
                </td>

                <td className="whitespace-nowrap px-4 py-3 text-center text-slate-700">
                  {room.level || '-'}
                </td>

                <td className="whitespace-nowrap px-4 py-3 text-center text-slate-700">
                  {room.year || '-'}/{room.room_no || '-'}
                </td>

                <td className="whitespace-nowrap px-4 py-3 text-center">
                  <ScheduleBadge value={room.schedule_group} />
                </td>

                <td className="whitespace-nowrap px-4 py-3 text-center font-bold text-slate-700">
                  {room.active_student_count}
                </td>

                <td className="whitespace-nowrap px-4 py-3 text-center font-bold text-slate-700">
                  {room.teacher_count}
                </td>

                <td className="whitespace-nowrap px-4 py-3 text-center">
                  <button
                    onClick={() => onEdit(room)}
                    className="rounded-full bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-700"
                  >
                    แก้ไข
                  </button>
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

function ScheduleBadge({ value }) {
  const text = String(value || '-');

  const className =
    text === 'ปวช'
      ? 'bg-emerald-100 text-emerald-700'
      : text === 'ปวส'
      ? 'bg-blue-100 text-blue-700'
      : text === 'ปวส_ม6'
      ? 'bg-purple-100 text-purple-700'
      : 'bg-slate-100 text-slate-600';

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-black ${className}`}>
      {text}
    </span>
  );
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

function normalizeRoomId(value) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, '')
    .replace(/\./g, '')
    .replace(/-/g, '/');
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