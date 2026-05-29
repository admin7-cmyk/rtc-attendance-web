'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import AppNav from '@/components/AppNav';

const EMPTY_FORM = {
  student_id: '',
  prefix: '',
  first_name: '',
  last_name: '',
  level: '',
  year: '',
  room_no: '',
  room_id: '',
  active: 'TRUE',
};

export default function AdminStudentsPage() {
  const [currentUser, setCurrentUser] = useState(null);

  const [students, setStudents] = useState([]);
  const [rooms, setRooms] = useState([]);

  const [form, setForm] = useState(EMPTY_FORM);
  const [editingStudentId, setEditingStudentId] = useState('');

  const [searchText, setSearchText] = useState('');
  const [roomFilter, setRoomFilter] = useState('ALL');
  const [activeFilter, setActiveFilter] = useState('ALL');

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

  const filteredStudents = useMemo(() => {
    const keyword = String(searchText || '').trim().toLowerCase();

    return students.filter((student) => {
      if (roomFilter !== 'ALL' && normalizeRoomId(student.room_id) !== normalizeRoomId(roomFilter)) {
        return false;
      }

      if (activeFilter === 'ACTIVE' && !isTrueValue(student.active)) {
        return false;
      }

      if (activeFilter === 'INACTIVE' && isTrueValue(student.active)) {
        return false;
      }

      if (!keyword) return true;

      const combined = [
        student.student_id,
        student.prefix,
        student.first_name,
        student.last_name,
        student.level,
        student.year,
        student.room_no,
        student.room_id,
        student.active,
      ]
        .join(' ')
        .toLowerCase();

      return combined.includes(keyword);
    });
  }, [students, searchText, roomFilter, activeFilter]);

  const activeCount = useMemo(() => {
    return students.filter((student) => isTrueValue(student.active)).length;
  }, [students]);

  const inactiveCount = useMemo(() => {
    return students.filter((student) => !isTrueValue(student.active)).length;
  }, [students]);

  const roomCount = useMemo(() => {
    const uniqueRooms = new Set(
      students
        .filter((student) => isTrueValue(student.active))
        .map((student) => normalizeRoomId(student.room_id))
        .filter(Boolean)
    );

    return uniqueRooms.size;
  }, [students]);

  async function loadPageData() {
    try {
      setLoading(true);
      setPageError('');
      setSuccessMessage('');

      const [
        { data: studentData, error: studentError },
        { data: roomData, error: roomError },
      ] = await Promise.all([
        supabase
          .from('students')
          .select('*')
          .order('level', { ascending: true })
          .order('year', { ascending: true })
          .order('room_no', { ascending: true })
          .order('student_id', { ascending: true }),

        supabase
          .from('rooms')
          .select('*')
          .order('level', { ascending: true })
          .order('year', { ascending: true })
          .order('room_no', { ascending: true })
          .order('room_id', { ascending: true }),
      ]);

      if (studentError) {
        throw new Error(studentError.message);
      }

      if (roomError) {
        throw new Error(roomError.message);
      }

      setStudents(studentData || []);
      setRooms(roomData || []);
    } catch (err) {
      setPageError(err.message || 'โหลดข้อมูลไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }

  function startCreate() {
    setEditingStudentId('');
    setForm(EMPTY_FORM);
    setPageError('');
    setSuccessMessage('');
  }

  function startEdit(student) {
    setEditingStudentId(student.student_id || '');

    setForm({
      student_id: student.student_id || '',
      prefix: student.prefix || '',
      first_name: student.first_name || '',
      last_name: student.last_name || '',
      level: student.level || '',
      year: student.year || '',
      room_no: student.room_no || '',
      room_id: student.room_id || '',
      active: isTrueValue(student.active) ? 'TRUE' : 'FALSE',
    });

    setPageError('');
    setSuccessMessage('');
  }

  function resetForm() {
    setEditingStudentId('');
    setForm(EMPTY_FORM);
    setPageError('');
    setSuccessMessage('');
  }

  function updateForm(field, value) {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  function updateRoom(roomId) {
    const selectedRoom = rooms.find(
      (room) => normalizeRoomId(room.room_id) === normalizeRoomId(roomId)
    );

    setForm((prev) => ({
      ...prev,
      room_id: roomId,
      level: selectedRoom?.level || prev.level || '',
      year: selectedRoom?.year || prev.year || '',
      room_no: selectedRoom?.room_no || prev.room_no || '',
    }));
  }

  async function saveStudent(event) {
    event.preventDefault();

    try {
      setSaving(true);
      setPageError('');
      setSuccessMessage('');

      const studentId = String(form.student_id || '').trim();
      const prefix = String(form.prefix || '').trim();
      const firstName = String(form.first_name || '').trim();
      const lastName = String(form.last_name || '').trim();
      const level = String(form.level || '').trim();
      const year = String(form.year || '').trim();
      const roomNo = String(form.room_no || '').trim();
      const roomId = String(form.room_id || '').trim();
      const active = String(form.active || 'TRUE').trim().toUpperCase();

      if (!studentId) {
        throw new Error('กรุณากรอกรหัสนักเรียน');
      }

      if (!firstName) {
        throw new Error('กรุณากรอกชื่อ');
      }

      if (!lastName) {
        throw new Error('กรุณากรอกนามสกุล');
      }

      if (!roomId) {
        throw new Error('กรุณาเลือกห้องเรียน');
      }

      if (!level || !year || !roomNo) {
        throw new Error('ข้อมูล level / year / room_no ไม่ครบ กรุณาเลือกห้องเรียนอีกครั้ง');
      }

      const row = {
        student_id: studentId,
        prefix,
        first_name: firstName,
        last_name: lastName,
        level,
        year,
        room_no: roomNo,
        room_id: roomId,
        active: active === 'TRUE' ? 'TRUE' : 'FALSE',
      };

      const { error } = await supabase.from('students').upsert(row, {
        onConflict: 'student_id',
      });

      if (error) {
        throw new Error(error.message);
      }

      setSuccessMessage(
        editingStudentId
          ? `แก้ไขข้อมูล ${firstName} ${lastName} สำเร็จ`
          : `เพิ่มนักเรียน ${firstName} ${lastName} สำเร็จ`
      );

      await loadPageData();
      resetForm();
    } catch (err) {
      setPageError(err.message || 'บันทึกข้อมูลไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(student) {
    try {
      setSaving(true);
      setPageError('');
      setSuccessMessage('');

      const nextActive = isTrueValue(student.active) ? 'FALSE' : 'TRUE';

      const studentName = `${student.prefix || ''}${student.first_name || ''} ${
        student.last_name || ''
      }`.trim();

      const confirmText =
        nextActive === 'FALSE'
          ? `ต้องการปิดสถานะของ ${studentName} ใช่ไหม?\n\nระบบจะไม่นับในรายชื่อเช็กชื่อ`
          : `ต้องการเปิดสถานะของ ${studentName} ใช่ไหม?\n\nระบบจะกลับมานับในรายชื่อเช็กชื่อ`;

      const ok = window.confirm(confirmText);

      if (!ok) return;

      const { error } = await supabase
        .from('students')
        .update({
          active: nextActive,
        })
        .eq('student_id', student.student_id);

      if (error) {
        throw new Error(error.message);
      }

      setSuccessMessage(
        nextActive === 'TRUE'
          ? `เปิดสถานะ ${studentName} แล้ว`
          : `ปิดสถานะ ${studentName} แล้ว`
      );

      await loadPageData();
    } catch (err) {
      setPageError(err.message || 'เปลี่ยนสถานะไม่สำเร็จ');
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
        <AppNav currentUser={currentUser} active="admin-students" />

        <section className="mb-4 rounded-3xl bg-white p-4 shadow-sm sm:mb-6 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-2xl font-black text-slate-800 sm:text-3xl">
                จัดการนักเรียน
              </h1>
              <p className="mt-1 text-sm text-slate-500 sm:text-base">
                เพิ่ม แก้ไข ย้ายห้อง และเปิด/ปิดสถานะนักเรียน
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={startCreate}
                className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700"
              >
                เพิ่มนักเรียนใหม่
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
          <StatCard title="นักเรียนทั้งหมด" value={students.length} unit="คน" />
          <StatCard title="เรียนปกติ" value={activeCount} unit="คน" tone="green" />
          <StatCard title="ปิดสถานะ" value={inactiveCount} unit="คน" tone="red" />
          <StatCard title="ห้องที่มีนักเรียน" value={roomCount} unit="ห้อง" />
        </section>

        <section className="mb-4 grid gap-4 lg:grid-cols-[420px_1fr]">
          <section className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
            <div className="mb-4">
              <h2 className="text-xl font-black text-slate-800">
                {editingStudentId ? 'แก้ไขข้อมูลนักเรียน' : 'เพิ่ม / แก้ไขนักเรียน'}
              </h2>
              <p className="text-sm text-slate-500">
                ปิดสถานะ active เมื่อนักเรียนฝึกงาน ลาออก หรือไม่ต้องนับในระบบ
              </p>
            </div>

            <form onSubmit={saveStudent} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-bold text-slate-700">
                  รหัสนักเรียน
                </label>
                <input
                  value={form.student_id}
                  onChange={(e) => updateForm('student_id', e.target.value)}
                  disabled={Boolean(editingStudentId)}
                  placeholder="เช่น 68309010001"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500 disabled:bg-slate-100 disabled:text-slate-400"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-bold text-slate-700">
                  คำนำหน้า
                </label>
                <select
                  value={form.prefix}
                  onChange={(e) => updateForm('prefix', e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500"
                >
                  <option value="">ไม่ระบุ</option>
                  <option value="นาย">นาย</option>
                  <option value="นางสาว">นางสาว</option>
                  <option value="เด็กชาย">เด็กชาย</option>
                  <option value="เด็กหญิง">เด็กหญิง</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-bold text-slate-700">
                    ชื่อ
                  </label>
                  <input
                    value={form.first_name}
                    onChange={(e) => updateForm('first_name', e.target.value)}
                    placeholder="ชื่อ"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-bold text-slate-700">
                    นามสกุล
                  </label>
                  <input
                    value={form.last_name}
                    onChange={(e) => updateForm('last_name', e.target.value)}
                    placeholder="นามสกุล"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-bold text-slate-700">
                  ห้องเรียน
                </label>
                <select
                  value={form.room_id}
                  onChange={(e) => updateRoom(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500"
                >
                  <option value="">เลือกห้องเรียน</option>
                  {rooms.map((room) => (
                    <option key={room.room_id} value={room.room_id}>
                      {room.room_name || room.room_id}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-bold text-slate-700">
                    Level
                  </label>
                  <input
                    value={form.level}
                    onChange={(e) => updateForm('level', e.target.value)}
                    placeholder="ปวช"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-bold text-slate-700">
                    ปี
                  </label>
                  <input
                    value={form.year}
                    onChange={(e) => updateForm('year', e.target.value)}
                    placeholder="1"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500"
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
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-bold text-slate-700">
                  สถานะ
                </label>
                <select
                  value={form.active}
                  onChange={(e) => updateForm('active', e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500"
                >
                  <option value="TRUE">เรียนปกติ / ให้นับในระบบ</option>
                  <option value="FALSE">ปิดสถานะ / ไม่ต้องนับ</option>
                </select>
              </div>

              <div className="rounded-2xl bg-slate-50 p-3 text-xs text-slate-500">
                room_id: {form.room_id || '-'} | level: {form.level || '-'} | year:{' '}
                {form.year || '-'} | room_no: {form.room_no || '-'}
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
                รายชื่อนักเรียน
              </h2>
              <p className="text-sm text-slate-500">
                ค้นหา แก้ไข ย้ายห้อง หรือปิดสถานะนักเรียน
              </p>
            </div>

            <div className="mb-4 grid gap-3 md:grid-cols-3">
              <input
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="ค้นหารหัส / ชื่อ / ห้อง"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500"
              />

              <select
                value={roomFilter}
                onChange={(e) => setRoomFilter(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500"
              >
                <option value="ALL">ทุกห้อง</option>
                {rooms.map((room) => (
                  <option key={room.room_id} value={room.room_id}>
                    {room.room_name || room.room_id}
                  </option>
                ))}
              </select>

              <select
                value={activeFilter}
                onChange={(e) => setActiveFilter(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500"
              >
                <option value="ALL">ทุกสถานะ</option>
                <option value="ACTIVE">เรียนปกติ</option>
                <option value="INACTIVE">ปิดสถานะ</option>
              </select>
            </div>

            {loading ? (
              <div className="rounded-2xl bg-slate-50 p-8 text-center text-slate-500">
                กำลังโหลดข้อมูล...
              </div>
            ) : (
              <>
                <StudentMobileCards
                  students={filteredStudents}
                  onEdit={startEdit}
                  onToggleActive={toggleActive}
                  saving={saving}
                />

                <StudentDesktopTable
                  students={filteredStudents}
                  onEdit={startEdit}
                  onToggleActive={toggleActive}
                  saving={saving}
                />
              </>
            )}
          </section>
        </section>
      </div>
    </main>
  );
}

function StudentMobileCards({ students, onEdit, onToggleActive, saving }) {
  if (students.length === 0) {
    return (
      <div className="rounded-2xl bg-slate-50 p-8 text-center text-slate-500 md:hidden">
        ไม่พบข้อมูลนักเรียน
      </div>
    );
  }

  return (
    <div className="space-y-3 md:hidden">
      {students.map((student, index) => {
        const active = isTrueValue(student.active);
        const fullName = `${student.prefix || ''}${student.first_name || ''} ${
          student.last_name || ''
        }`.trim();

        return (
          <div
            key={student.student_id || index}
            className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-400">
                  {index + 1}. {student.student_id}
                </div>
                <div className="truncate text-lg font-black text-slate-800">
                  {fullName || '-'}
                </div>
                <div className="mt-1 text-sm text-slate-500">
                  {student.level}.{student.year}/{student.room_no}
                </div>
              </div>

              <ActiveBadge active={active} />
            </div>

            <div className="mb-3 rounded-2xl bg-slate-50 p-3 text-xs text-slate-600">
              <div className="font-bold text-slate-700">room_id</div>
              <div className="mt-1 break-words">{student.room_id || '-'}</div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onEdit(student)}
                className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white"
              >
                แก้ไข
              </button>

              <button
                onClick={() => onToggleActive(student)}
                disabled={saving}
                className={`rounded-2xl px-4 py-3 text-sm font-bold disabled:opacity-50 ${
                  active
                    ? 'bg-red-50 text-red-700'
                    : 'bg-emerald-50 text-emerald-700'
                }`}
              >
                {active ? 'ปิดสถานะ' : 'เปิดสถานะ'}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StudentDesktopTable({ students, onEdit, onToggleActive, saving }) {
  return (
    <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 md:block">
      <table className="min-w-[1050px] w-full border-collapse bg-white text-sm">
        <thead className="bg-slate-900 text-white">
          <tr>
            <th className="whitespace-nowrap px-4 py-3 text-center">ลำดับ</th>
            <th className="whitespace-nowrap px-4 py-3 text-left">รหัส</th>
            <th className="whitespace-nowrap px-4 py-3 text-left">ชื่อ - สกุล</th>
            <th className="whitespace-nowrap px-4 py-3 text-center">ระดับ</th>
            <th className="whitespace-nowrap px-4 py-3 text-center">ห้อง</th>
            <th className="whitespace-nowrap px-4 py-3 text-left">room_id</th>
            <th className="whitespace-nowrap px-4 py-3 text-center">สถานะ</th>
            <th className="whitespace-nowrap px-4 py-3 text-center">จัดการ</th>
          </tr>
        </thead>

        <tbody>
          {students.length === 0 ? (
            <tr>
              <td colSpan="8" className="px-4 py-8 text-center text-slate-500">
                ไม่พบข้อมูลนักเรียน
              </td>
            </tr>
          ) : (
            students.map((student, index) => {
              const active = isTrueValue(student.active);
              const fullName = `${student.prefix || ''}${student.first_name || ''} ${
                student.last_name || ''
              }`.trim();

              return (
                <tr
                  key={student.student_id || index}
                  className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
                >
                  <td className="whitespace-nowrap px-4 py-3 text-center font-bold text-slate-500">
                    {index + 1}
                  </td>

                  <td className="whitespace-nowrap px-4 py-3 font-bold text-slate-700">
                    {student.student_id || '-'}
                  </td>

                  <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                    {fullName || '-'}
                  </td>

                  <td className="whitespace-nowrap px-4 py-3 text-center text-slate-700">
                    {student.level || '-'}
                  </td>

                  <td className="whitespace-nowrap px-4 py-3 text-center text-slate-700">
                    {student.year || '-'}/{student.room_no || '-'}
                  </td>

                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                    {student.room_id || '-'}
                  </td>

                  <td className="whitespace-nowrap px-4 py-3 text-center">
                    <ActiveBadge active={active} />
                  </td>

                  <td className="whitespace-nowrap px-4 py-3 text-center">
                    <div className="flex justify-center gap-2">
                      <button
                        onClick={() => onEdit(student)}
                        className="rounded-full bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-700"
                      >
                        แก้ไข
                      </button>

                      <button
                        onClick={() => onToggleActive(student)}
                        disabled={saving}
                        className={`rounded-full px-4 py-2 text-xs font-bold disabled:opacity-50 ${
                          active
                            ? 'bg-red-50 text-red-700 hover:bg-red-100'
                            : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                        }`}
                      >
                        {active ? 'ปิด' : 'เปิด'}
                      </button>
                    </div>
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

function ActiveBadge({ active }) {
  if (active) {
    return (
      <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700">
        เรียนปกติ
      </span>
    );
  }

  return (
    <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-black text-red-700">
      ปิดสถานะ
    </span>
  );
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