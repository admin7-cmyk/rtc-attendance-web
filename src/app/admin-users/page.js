'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import AppNav from '@/components/AppNav';

const EMPTY_FORM = {
  teacher_id: '',
  username: '',
  pin: '',
  name: '',
  role: 'teacher',
  room_ids: '',
  active: 'TRUE',
};

export default function AdminUsersPage() {
  const [currentUser, setCurrentUser] = useState(null);

  const [users, setUsers] = useState([]);
  const [rooms, setRooms] = useState([]);

  const [form, setForm] = useState(EMPTY_FORM);
  const [selectedRoomIds, setSelectedRoomIds] = useState([]);

  const [searchText, setSearchText] = useState('');
  const [editingTeacherId, setEditingTeacherId] = useState('');

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

  const filteredUsers = useMemo(() => {
    const keyword = String(searchText || '').trim().toLowerCase();

    if (!keyword) return users;

    return users.filter((user) => {
      const combined = [
        user.teacher_id,
        user.username,
        user.name,
        user.role,
        user.room_ids,
        user.active,
      ]
        .join(' ')
        .toLowerCase();

      return combined.includes(keyword);
    });
  }, [users, searchText]);

  const activeCount = useMemo(() => {
    return users.filter((user) => isTrueValue(user.active)).length;
  }, [users]);

  const inactiveCount = useMemo(() => {
    return users.filter((user) => !isTrueValue(user.active)).length;
  }, [users]);

  async function loadPageData() {
    try {
      setLoading(true);
      setPageError('');
      setSuccessMessage('');

      const [
        { data: userData, error: userError },
        { data: roomData, error: roomError },
      ] = await Promise.all([
        supabase
          .from('app_users')
          .select('*')
          .order('role', { ascending: true })
          .order('teacher_id', { ascending: true }),

        supabase
          .from('rooms')
          .select('*')
          .order('level', { ascending: true })
          .order('year', { ascending: true })
          .order('room_no', { ascending: true })
          .order('room_id', { ascending: true }),
      ]);

      if (userError) {
        throw new Error(userError.message);
      }

      if (roomError) {
        throw new Error(roomError.message);
      }

      setUsers(userData || []);
      setRooms(roomData || []);
    } catch (err) {
      setPageError(err.message || 'โหลดข้อมูลไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }

  function startCreate() {
    setEditingTeacherId('');
    setForm({
      ...EMPTY_FORM,
      teacher_id: generateTeacherId(),
    });
    setSelectedRoomIds([]);
    setPageError('');
    setSuccessMessage('');
  }

  function startEdit(user) {
    setEditingTeacherId(user.teacher_id || '');

    const nextForm = {
      teacher_id: user.teacher_id || '',
      username: user.username || '',
      pin: user.pin || '',
      name: user.name || '',
      role: user.role || 'teacher',
      room_ids: user.room_ids || '',
      active: isTrueValue(user.active) ? 'TRUE' : 'FALSE',
    };

    setForm(nextForm);

    if (String(nextForm.room_ids || '').trim().toUpperCase() === 'ALL') {
      setSelectedRoomIds(['ALL']);
    } else {
      setSelectedRoomIds(parseRoomIds(nextForm.room_ids));
    }

    setPageError('');
    setSuccessMessage('');
  }

  function resetForm() {
    setEditingTeacherId('');
    setForm(EMPTY_FORM);
    setSelectedRoomIds([]);
    setPageError('');
    setSuccessMessage('');
  }

  function updateForm(field, value) {
    setForm((prev) => {
      const next = {
        ...prev,
        [field]: value,
      };

      if (field === 'role') {
        if (value === 'admin') {
          next.room_ids = 'ALL';
          setSelectedRoomIds(['ALL']);
        } else {
          next.room_ids = '';
          setSelectedRoomIds([]);
        }
      }

      return next;
    });
  }

  function toggleRoom(roomId) {
    const role = String(form.role || '').toLowerCase();

    if (role === 'admin') {
      setSelectedRoomIds(['ALL']);
      setForm((prev) => ({
        ...prev,
        room_ids: 'ALL',
      }));
      return;
    }

    setSelectedRoomIds((prev) => {
      const exists = prev.includes(roomId);
      const next = exists
        ? prev.filter((item) => item !== roomId)
        : [...prev, roomId];

      setForm((oldForm) => ({
        ...oldForm,
        room_ids: next.join(','),
      }));

      return next;
    });
  }

  function selectAllRooms() {
    const allRoomIds = rooms.map((room) => room.room_id);

    setSelectedRoomIds(allRoomIds);
    setForm((prev) => ({
      ...prev,
      room_ids: allRoomIds.join(','),
    }));
  }

  function clearSelectedRooms() {
    setSelectedRoomIds([]);
    setForm((prev) => ({
      ...prev,
      room_ids: '',
    }));
  }

  async function saveUser(event) {
    event.preventDefault();

    try {
      setSaving(true);
      setPageError('');
      setSuccessMessage('');

      const teacherId = String(form.teacher_id || '').trim();
      const username = String(form.username || '').trim();
      const pin = String(form.pin || '').trim();
      const name = String(form.name || '').trim();
      const role = String(form.role || '').trim().toLowerCase();
      const active = String(form.active || 'TRUE').trim().toUpperCase();

      if (!teacherId) {
        throw new Error('กรุณากรอก teacher_id');
      }

      if (!username) {
        throw new Error('กรุณากรอก Username');
      }

      if (!pin) {
        throw new Error('กรุณากรอก PIN');
      }

      if (!name) {
        throw new Error('กรุณากรอกชื่อครู');
      }

      if (!['admin', 'teacher'].includes(role)) {
        throw new Error('role ต้องเป็น admin หรือ teacher เท่านั้น');
      }

      let roomIdsText = '';

      if (role === 'admin') {
        roomIdsText = 'ALL';
      } else {
        roomIdsText = selectedRoomIds
          .filter((item) => item && item !== 'ALL')
          .join(',');

        if (!roomIdsText) {
          throw new Error('กรุณาเลือกห้องประจำอย่างน้อย 1 ห้องสำหรับครู');
        }
      }

      const row = {
        teacher_id: teacherId,
        username,
        pin,
        name,
        role,
        room_ids: roomIdsText,
        active: active === 'TRUE' ? 'TRUE' : 'FALSE',
      };

      const { error } = await supabase.from('app_users').upsert(row, {
        onConflict: 'teacher_id',
      });

      if (error) {
        throw new Error(error.message);
      }

      setSuccessMessage(
        editingTeacherId
          ? `แก้ไขข้อมูล ${name} สำเร็จ`
          : `เพิ่มผู้ใช้งาน ${name} สำเร็จ`
      );

      await loadPageData();
      resetForm();
    } catch (err) {
      setPageError(err.message || 'บันทึกข้อมูลไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(user) {
    try {
      setSaving(true);
      setPageError('');
      setSuccessMessage('');

      const nextActive = isTrueValue(user.active) ? 'FALSE' : 'TRUE';

      const confirmText =
        nextActive === 'FALSE'
          ? `ต้องการปิดบัญชีของ ${user.name || user.username} ใช่ไหม?`
          : `ต้องการเปิดบัญชีของ ${user.name || user.username} ใช่ไหม?`;

      const ok = window.confirm(confirmText);

      if (!ok) return;

      const { error } = await supabase
        .from('app_users')
        .update({
          active: nextActive,
        })
        .eq('teacher_id', user.teacher_id);

      if (error) {
        throw new Error(error.message);
      }

      setSuccessMessage(
        nextActive === 'TRUE'
          ? `เปิดบัญชี ${user.name || user.username} แล้ว`
          : `ปิดบัญชี ${user.name || user.username} แล้ว`
      );

      await loadPageData();
    } catch (err) {
      setPageError(err.message || 'เปลี่ยนสถานะบัญชีไม่สำเร็จ');
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
        <AppNav currentUser={currentUser} active="admin-users" />

        <section className="mb-4 rounded-3xl bg-white p-4 shadow-sm sm:mb-6 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-2xl font-black text-slate-800 sm:text-3xl">
                จัดการครู / ห้องประจำ
              </h1>
              <p className="mt-1 text-sm text-slate-500 sm:text-base">
                เพิ่ม แก้ไข เปิด/ปิดบัญชี และกำหนดห้องที่ครูดูแล
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={startCreate}
                className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700"
              >
                เพิ่มครูใหม่
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
          <StatCard title="ผู้ใช้ทั้งหมด" value={users.length} unit="บัญชี" />
          <StatCard title="เปิดใช้งาน" value={activeCount} unit="บัญชี" tone="green" />
          <StatCard title="ปิดใช้งาน" value={inactiveCount} unit="บัญชี" tone="red" />
          <StatCard title="ห้องทั้งหมด" value={rooms.length} unit="ห้อง" tone="slate" />
        </section>

        <section className="mb-4 grid gap-4 lg:grid-cols-[420px_1fr]">
          <section className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
            <div className="mb-4">
              <h2 className="text-xl font-black text-slate-800">
                {editingTeacherId ? 'แก้ไขข้อมูลครู' : 'เพิ่ม / แก้ไขผู้ใช้งาน'}
              </h2>
              <p className="text-sm text-slate-500">
                role เป็น admin จะเห็นทุกห้องอัตโนมัติ
              </p>
            </div>

            <form onSubmit={saveUser} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-bold text-slate-700">
                  Teacher ID
                </label>
                <input
                  value={form.teacher_id}
                  onChange={(e) => updateForm('teacher_id', e.target.value)}
                  disabled={Boolean(editingTeacherId)}
                  placeholder="เช่น T001"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500 disabled:bg-slate-100 disabled:text-slate-400"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-bold text-slate-700">
                  Username
                </label>
                <input
                  value={form.username}
                  onChange={(e) => updateForm('username', e.target.value)}
                  placeholder="เช่น teacher01"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-bold text-slate-700">
                  PIN
                </label>
                <input
                  value={form.pin}
                  onChange={(e) => updateForm('pin', e.target.value)}
                  placeholder="เช่น 1234"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-bold text-slate-700">
                  ชื่อ - สกุล
                </label>
                <input
                  value={form.name}
                  onChange={(e) => updateForm('name', e.target.value)}
                  placeholder="เช่น นายตัวอย่าง ทดสอบ"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-bold text-slate-700">
                    Role
                  </label>
                  <select
                    value={form.role}
                    onChange={(e) => updateForm('role', e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500"
                  >
                    <option value="teacher">teacher</option>
                    <option value="admin">admin</option>
                  </select>
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
                    <option value="TRUE">เปิดใช้งาน</option>
                    <option value="FALSE">ปิดใช้งาน</option>
                  </select>
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <label className="block text-sm font-bold text-slate-700">
                    ห้องประจำ
                  </label>

                  {String(form.role || '').toLowerCase() === 'teacher' && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={selectAllRooms}
                        className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 hover:bg-slate-200"
                      >
                        เลือกทั้งหมด
                      </button>

                      <button
                        type="button"
                        onClick={clearSelectedRooms}
                        className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 hover:bg-slate-200"
                      >
                        ล้าง
                      </button>
                    </div>
                  )}
                </div>

                {String(form.role || '').toLowerCase() === 'admin' ? (
                  <div className="rounded-2xl bg-emerald-50 p-4 text-sm font-bold text-emerald-700">
                    Admin เห็นทุกห้องอัตโนมัติ
                  </div>
                ) : (
                  <div className="max-h-[260px] overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    {rooms.length === 0 ? (
                      <div className="p-3 text-sm text-slate-500">
                        ไม่พบข้อมูลห้องเรียน
                      </div>
                    ) : (
                      <div className="grid gap-2">
                        {rooms.map((room) => {
                          const checked = selectedRoomIds.includes(room.room_id);

                          return (
                            <label
                              key={room.room_id}
                              className={`flex cursor-pointer items-center justify-between gap-3 rounded-2xl border px-3 py-2 text-sm transition ${
                                checked
                                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                              }`}
                            >
                              <div>
                                <div className="font-bold">
                                  {room.room_name || room.room_id}
                                </div>
                                <div className="text-xs opacity-70">
                                  {room.schedule_group || '-'}
                                </div>
                              </div>

                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleRoom(room.room_id)}
                                className="h-5 w-5 accent-emerald-600"
                              />
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                <div className="mt-2 rounded-2xl bg-slate-50 p-3 text-xs text-slate-500">
                  room_ids: {form.room_ids || '-'}
                </div>
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
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-black text-slate-800">
                  รายชื่อผู้ใช้งาน
                </h2>
                <p className="text-sm text-slate-500">
                  คลิก “แก้ไข” เพื่อปรับข้อมูลครู
                </p>
              </div>

              <input
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="ค้นหาครู / username / ห้อง"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500 sm:max-w-xs"
              />
            </div>

            {loading ? (
              <div className="rounded-2xl bg-slate-50 p-8 text-center text-slate-500">
                กำลังโหลดข้อมูล...
              </div>
            ) : (
              <>
                <UserMobileCards
                  users={filteredUsers}
                  onEdit={startEdit}
                  onToggleActive={toggleActive}
                  saving={saving}
                />

                <UserDesktopTable
                  users={filteredUsers}
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

function UserMobileCards({ users, onEdit, onToggleActive, saving }) {
  if (users.length === 0) {
    return (
      <div className="rounded-2xl bg-slate-50 p-8 text-center text-slate-500 md:hidden">
        ไม่พบข้อมูลผู้ใช้งาน
      </div>
    );
  }

  return (
    <div className="space-y-3 md:hidden">
      {users.map((user, index) => {
        const active = isTrueValue(user.active);

        return (
          <div
            key={user.teacher_id || index}
            className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-400">
                  {user.teacher_id}
                </div>
                <div className="truncate text-lg font-black text-slate-800">
                  {user.name || '-'}
                </div>
                <div className="mt-1 text-sm text-slate-500">
                  @{user.username || '-'} · {user.role || '-'}
                </div>
              </div>

              <ActiveBadge active={active} />
            </div>

            <div className="mb-3 rounded-2xl bg-slate-50 p-3 text-xs text-slate-600">
              <div className="font-bold text-slate-700">ห้องประจำ</div>
              <div className="mt-1 break-words">{user.room_ids || '-'}</div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onEdit(user)}
                className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white"
              >
                แก้ไข
              </button>

              <button
                onClick={() => onToggleActive(user)}
                disabled={saving}
                className={`rounded-2xl px-4 py-3 text-sm font-bold disabled:opacity-50 ${
                  active
                    ? 'bg-red-50 text-red-700'
                    : 'bg-emerald-50 text-emerald-700'
                }`}
              >
                {active ? 'ปิดบัญชี' : 'เปิดบัญชี'}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function UserDesktopTable({ users, onEdit, onToggleActive, saving }) {
  return (
    <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 md:block">
      <table className="min-w-[900px] w-full border-collapse bg-white text-sm">
        <thead className="bg-slate-900 text-white">
          <tr>
            <th className="whitespace-nowrap px-4 py-3 text-center">ลำดับ</th>
            <th className="whitespace-nowrap px-4 py-3 text-left">Teacher ID</th>
            <th className="whitespace-nowrap px-4 py-3 text-left">ชื่อ</th>
            <th className="whitespace-nowrap px-4 py-3 text-left">Username</th>
            <th className="whitespace-nowrap px-4 py-3 text-center">Role</th>
            <th className="whitespace-nowrap px-4 py-3 text-left">ห้องประจำ</th>
            <th className="whitespace-nowrap px-4 py-3 text-center">สถานะ</th>
            <th className="whitespace-nowrap px-4 py-3 text-center">จัดการ</th>
          </tr>
        </thead>

        <tbody>
          {users.length === 0 ? (
            <tr>
              <td colSpan="8" className="px-4 py-8 text-center text-slate-500">
                ไม่พบข้อมูลผู้ใช้งาน
              </td>
            </tr>
          ) : (
            users.map((user, index) => {
              const active = isTrueValue(user.active);

              return (
                <tr
                  key={user.teacher_id || index}
                  className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
                >
                  <td className="whitespace-nowrap px-4 py-3 text-center font-bold text-slate-500">
                    {index + 1}
                  </td>

                  <td className="whitespace-nowrap px-4 py-3 font-bold text-slate-700">
                    {user.teacher_id || '-'}
                  </td>

                  <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                    {user.name || '-'}
                  </td>

                  <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                    {user.username || '-'}
                  </td>

                  <td className="whitespace-nowrap px-4 py-3 text-center">
                    <RoleBadge role={user.role} />
                  </td>

                  <td className="max-w-[240px] px-4 py-3 text-slate-600">
                    <div className="line-clamp-2 break-words">
                      {user.room_ids || '-'}
                    </div>
                  </td>

                  <td className="whitespace-nowrap px-4 py-3 text-center">
                    <ActiveBadge active={active} />
                  </td>

                  <td className="whitespace-nowrap px-4 py-3 text-center">
                    <div className="flex justify-center gap-2">
                      <button
                        onClick={() => onEdit(user)}
                        className="rounded-full bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-700"
                      >
                        แก้ไข
                      </button>

                      <button
                        onClick={() => onToggleActive(user)}
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

function RoleBadge({ role }) {
  const text = String(role || '').toLowerCase();

  if (text === 'admin') {
    return (
      <span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-black text-purple-700">
        admin
      </span>
    );
  }

  return (
    <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-black text-blue-700">
      teacher
    </span>
  );
}

function ActiveBadge({ active }) {
  if (active) {
    return (
      <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700">
        เปิดใช้งาน
      </span>
    );
  }

  return (
    <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-black text-red-700">
      ปิดใช้งาน
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

function generateTeacherId() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');

  return `T${yyyy}${mm}${dd}${hh}${mi}${ss}`;
}