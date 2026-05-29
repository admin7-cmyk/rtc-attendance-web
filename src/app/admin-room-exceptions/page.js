'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import AppNav from '@/components/AppNav';

const WEEKDAYS = [
  { value: 0, label: 'อาทิตย์' },
  { value: 1, label: 'จันทร์' },
  { value: 2, label: 'อังคาร' },
  { value: 3, label: 'พุธ' },
  { value: 4, label: 'พฤหัสบดี' },
  { value: 5, label: 'ศุกร์' },
  { value: 6, label: 'เสาร์' },
];

const EXCEPTION_TYPES = [
  { value: 'WEEKDAY', label: 'ทุกสัปดาห์ตามวัน' },
  { value: 'DATE', label: 'เฉพาะวันที่กำหนด' },
];

export default function AdminRoomExceptionsPage() {
  const [currentUser, setCurrentUser] = useState(null);

  const [rooms, setRooms] = useState([]);
  const [terms, setTerms] = useState([]);
  const [exceptions, setExceptions] = useState([]);

  const [form, setForm] = useState(getEmptyForm());

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [pageError, setPageError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
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
      loadData();
    } catch {
      localStorage.removeItem('rtc_attendance_user');
      setPageError('ข้อมูลผู้ใช้ไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่');
      setLoading(false);
    }
  }, []);

  const filteredExceptions = useMemo(() => {
    const keyword = String(searchText || '').trim().toLowerCase();

    if (!keyword) return exceptions;

    return exceptions.filter((item) => {
      const text = [
        item.room_id,
        item.term_id,
        item.exception_type,
        item.weekday,
        item.date,
        item.is_lineup_day,
        item.note,
        item.active,
      ]
        .join(' ')
        .toLowerCase();

      return text.includes(keyword);
    });
  }, [exceptions, searchText]);

  async function loadData() {
    try {
      setLoading(true);
      setPageError('');
      setSuccessMessage('');

      const [roomRes, termRes, exceptionRes] = await Promise.all([
        supabase
          .from('rooms')
          .select('*')
          .order('level', { ascending: true })
          .order('year', { ascending: true })
          .order('room_no', { ascending: true }),

        supabase
          .from('terms')
          .select('*')
          .order('term_id', { ascending: false }),

        supabase
          .from('room_lineup_exceptions')
          .select('*')
          .order('term_id', { ascending: false })
          .order('room_id', { ascending: true }),
      ]);

      if (roomRes.error) throw new Error(roomRes.error.message);
      if (termRes.error) throw new Error(termRes.error.message);
      if (exceptionRes.error) throw new Error(exceptionRes.error.message);

      const roomList = roomRes.data || [];
      const termList = termRes.data || [];
      const exceptionList = exceptionRes.data || [];

      setRooms(roomList);
      setTerms(termList);
      setExceptions(exceptionList);

      setForm((prev) => ({
        ...prev,
        room_id: prev.room_id || roomList[0]?.room_id || '',
        term_id: prev.term_id || termList[0]?.term_id || '',
      }));
    } catch (err) {
      setPageError(err.message || 'โหลดข้อมูลไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }

  function updateForm(key, value) {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  function resetForm() {
    setForm({
      ...getEmptyForm(),
      room_id: rooms[0]?.room_id || '',
      term_id: terms[0]?.term_id || '',
    });
  }

  function editException(item) {
    setForm({
      id: item.id || '',
      room_id: item.room_id || '',
      term_id: item.term_id || '',
      exception_type: item.exception_type || 'WEEKDAY',
      weekday: item.weekday === null || item.weekday === undefined ? 2 : Number(item.weekday),
      date: item.date || '',
      is_lineup_day: item.is_lineup_day || 'FALSE',
      note: item.note || '',
      active: item.active || 'TRUE',
    });

    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  }

  async function saveException(event) {
    event.preventDefault();

    try {
      setSaving(true);
      setPageError('');
      setSuccessMessage('');

      if (!form.room_id) throw new Error('กรุณาเลือกห้องเรียน');
      if (!form.term_id) throw new Error('กรุณาเลือกภาคเรียน');

      if (form.exception_type === 'WEEKDAY') {
        if (form.weekday === '' || form.weekday === null || form.weekday === undefined) {
          throw new Error('กรุณาเลือกวันในสัปดาห์');
        }
      }

      if (form.exception_type === 'DATE') {
        if (!form.date) throw new Error('กรุณาเลือกวันที่');
      }

      const now = new Date().toISOString();

      const id =
        form.id ||
        [
          form.term_id,
          form.room_id,
          form.exception_type,
          form.exception_type === 'WEEKDAY' ? form.weekday : form.date,
          Date.now(),
        ]
          .join('_')
          .replace(/\s+/g, '');

      const payload = {
        id,
        room_id: form.room_id,
        term_id: form.term_id,
        exception_type: form.exception_type,
        weekday: form.exception_type === 'WEEKDAY' ? Number(form.weekday) : null,
        date: form.exception_type === 'DATE' ? form.date : null,
        is_lineup_day: form.is_lineup_day,
        note: form.note,
        active: form.active,
        created_at: form.id ? undefined : now,
        updated_at: now,
      };

      if (form.id) {
        delete payload.created_at;
      }

      const { error } = await supabase
        .from('room_lineup_exceptions')
        .upsert(payload, {
          onConflict: 'id',
        });

      if (error) throw new Error(error.message);

      setSuccessMessage('บันทึกข้อยกเว้นรายห้องสำเร็จ');
      resetForm();
      await loadData();
    } catch (err) {
      setPageError(err.message || 'บันทึกข้อมูลไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(item) {
    try {
      setSaving(true);
      setPageError('');
      setSuccessMessage('');

      const nextActive = isActiveValue(item.active) ? 'FALSE' : 'TRUE';

      const { error } = await supabase
        .from('room_lineup_exceptions')
        .update({
          active: nextActive,
          updated_at: new Date().toISOString(),
        })
        .eq('id', item.id);

      if (error) throw new Error(error.message);

      setSuccessMessage(nextActive === 'TRUE' ? 'เปิดใช้งานข้อยกเว้นแล้ว' : 'ปิดใช้งานข้อยกเว้นแล้ว');
      await loadData();
    } catch (err) {
      setPageError(err.message || 'เปลี่ยนสถานะไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  async function deleteException(item) {
    try {
      const ok = window.confirm(`ต้องการลบข้อยกเว้นของ ${item.room_id} ใช่ไหม?`);

      if (!ok) return;

      setSaving(true);
      setPageError('');
      setSuccessMessage('');

      const { error } = await supabase
        .from('room_lineup_exceptions')
        .delete()
        .eq('id', item.id);

      if (error) throw new Error(error.message);

      setSuccessMessage('ลบข้อยกเว้นเรียบร้อยแล้ว');
      await loadData();
    } catch (err) {
      setPageError(err.message || 'ลบข้อมูลไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
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
        <AppNav currentUser={currentUser} active="admin-room-exceptions" />

        <section className="mb-4 rounded-3xl bg-white p-4 shadow-sm sm:mb-6 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-2xl font-black text-slate-800 sm:text-3xl">
                ข้อยกเว้นวันเข้าแถวรายห้อง
              </h1>
              <p className="mt-1 text-sm text-slate-500 sm:text-base">
                ใช้สำหรับห้องที่ไม่มีเรียนเช้า ไม่ต้องมาเข้าแถวบางวัน หรือมีเงื่อนไขเฉพาะห้อง
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={loadData}
                disabled={loading || saving}
                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700 disabled:opacity-50"
              >
                โหลดข้อมูลใหม่
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

        {successMessage && (
          <section className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 sm:mb-6">
            <div className="font-bold">สำเร็จ</div>
            <div>{successMessage}</div>
          </section>
        )}

        <section className="mb-4 grid gap-4 lg:grid-cols-[420px_1fr]">
          <section className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
            <h2 className="text-xl font-black text-slate-800">
              เพิ่ม / แก้ไขข้อยกเว้น
            </h2>

            <form onSubmit={saveException} className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-bold text-slate-700">
                  ห้องเรียน
                </label>
                <select
                  value={form.room_id}
                  onChange={(e) => updateForm('room_id', e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500"
                >
                  {rooms.map((room) => (
                    <option key={room.room_id} value={room.room_id}>
                      {room.room_name || room.room_id}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-bold text-slate-700">
                  ภาคเรียน
                </label>
                <select
                  value={form.term_id}
                  onChange={(e) => updateForm('term_id', e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500"
                >
                  {terms.map((term) => (
                    <option key={term.term_id} value={term.term_id}>
                      {term.term_name || term.term_id}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-bold text-slate-700">
                  ประเภทข้อยกเว้น
                </label>
                <select
                  value={form.exception_type}
                  onChange={(e) => updateForm('exception_type', e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500"
                >
                  {EXCEPTION_TYPES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>

              {form.exception_type === 'WEEKDAY' ? (
                <div>
                  <label className="mb-1 block text-sm font-bold text-slate-700">
                    วันในสัปดาห์
                  </label>
                  <select
                    value={form.weekday}
                    onChange={(e) => updateForm('weekday', e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500"
                  >
                    {WEEKDAYS.map((day) => (
                      <option key={day.value} value={day.value}>
                        ทุกวัน{day.label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="mb-1 block text-sm font-bold text-slate-700">
                    วันที่
                  </label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => updateForm('date', e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500"
                  />
                </div>
              )}

              <div>
                <label className="mb-1 block text-sm font-bold text-slate-700">
                  ผลลัพธ์ของวันนั้น
                </label>
                <select
                  value={form.is_lineup_day}
                  onChange={(e) => updateForm('is_lineup_day', e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500"
                >
                  <option value="FALSE">ไม่ต้องเข้าแถว</option>
                  <option value="TRUE">ต้องเข้าแถว</option>
                </select>
                <div className="mt-1 text-xs text-slate-400">
                  ปกติกรณีไม่มีเรียนเช้าให้เลือก “ไม่ต้องเข้าแถว”
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-bold text-slate-700">
                  หมายเหตุ
                </label>
                <textarea
                  value={form.note}
                  onChange={(e) => updateForm('note', e.target.value)}
                  className="min-h-[96px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500"
                  placeholder="เช่น ห้องนี้ไม่มีเรียนเช้าวันอังคาร จึงไม่ต้องเข้าแถว"
                />
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

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="submit"
                  disabled={saving || loading}
                  className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {saving ? 'กำลังบันทึก...' : form.id ? 'บันทึกการแก้ไข' : 'เพิ่มข้อยกเว้น'}
                </button>

                <button
                  type="button"
                  onClick={resetForm}
                  disabled={saving}
                  className="rounded-2xl bg-slate-200 px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-300 disabled:opacity-50"
                >
                  ล้างฟอร์ม
                </button>
              </div>
            </form>
          </section>

          <section className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-xl font-black text-slate-800">
                  รายการข้อยกเว้นทั้งหมด
                </h2>
                <p className="text-sm text-slate-500">
                  รวม {filteredExceptions.length} รายการ
                </p>
              </div>

              <input
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500 md:max-w-xs"
                placeholder="ค้นหาห้อง / ภาคเรียน / หมายเหตุ"
              />
            </div>

            {loading ? (
              <div className="rounded-2xl bg-slate-50 p-8 text-center text-slate-500">
                กำลังโหลดข้อมูล...
              </div>
            ) : (
              <>
                <ExceptionMobileCards
                  items={filteredExceptions}
                  onEdit={editException}
                  onToggleActive={toggleActive}
                  onDelete={deleteException}
                  saving={saving}
                />

                <ExceptionDesktopTable
                  items={filteredExceptions}
                  onEdit={editException}
                  onToggleActive={toggleActive}
                  onDelete={deleteException}
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

function ExceptionMobileCards({ items, onEdit, onToggleActive, onDelete, saving }) {
  if (items.length === 0) {
    return (
      <div className="rounded-2xl bg-slate-50 p-8 text-center text-slate-500 md:hidden">
        ยังไม่มีข้อยกเว้น
      </div>
    );
  }

  return (
    <div className="space-y-3 md:hidden">
      {items.map((item) => (
        <div
          key={item.id}
          className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-lg font-black text-slate-800">{item.room_id}</div>
              <div className="text-sm text-slate-500">ภาคเรียน {item.term_id}</div>
            </div>

            <ActiveBadge active={item.active} />
          </div>

          <div className="mt-3 rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">
            <div>
              <span className="font-black text-slate-800">เงื่อนไข: </span>
              {getExceptionText(item)}
            </div>
            <div className="mt-1">
              <span className="font-black text-slate-800">ผลลัพธ์: </span>
              {String(item.is_lineup_day).toUpperCase() === 'TRUE'
                ? 'ต้องเข้าแถว'
                : 'ไม่ต้องเข้าแถว'}
            </div>
            {item.note && <div className="mt-1">หมายเหตุ: {item.note}</div>}
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <button
              onClick={() => onEdit(item)}
              disabled={saving}
              className="rounded-2xl bg-blue-100 px-3 py-2 text-xs font-black text-blue-700 disabled:opacity-50"
            >
              แก้ไข
            </button>

            <button
              onClick={() => onToggleActive(item)}
              disabled={saving}
              className="rounded-2xl bg-amber-100 px-3 py-2 text-xs font-black text-amber-700 disabled:opacity-50"
            >
              เปิด/ปิด
            </button>

            <button
              onClick={() => onDelete(item)}
              disabled={saving}
              className="rounded-2xl bg-red-100 px-3 py-2 text-xs font-black text-red-700 disabled:opacity-50"
            >
              ลบ
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function ExceptionDesktopTable({ items, onEdit, onToggleActive, onDelete, saving }) {
  return (
    <div className="hidden overflow-hidden rounded-2xl border border-slate-200 md:block">
      <table className="w-full border-collapse bg-white text-sm">
        <thead className="bg-slate-900 text-white">
          <tr>
            <th className="px-4 py-3 text-left">ห้อง</th>
            <th className="px-4 py-3 text-left">ภาคเรียน</th>
            <th className="px-4 py-3 text-left">เงื่อนไข</th>
            <th className="px-4 py-3 text-left">ผลลัพธ์</th>
            <th className="px-4 py-3 text-left">หมายเหตุ</th>
            <th className="px-4 py-3 text-center">สถานะ</th>
            <th className="px-4 py-3 text-center">จัดการ</th>
          </tr>
        </thead>

        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan="7" className="px-4 py-8 text-center text-slate-500">
                ยังไม่มีข้อยกเว้น
              </td>
            </tr>
          ) : (
            items.map((item) => (
              <tr
                key={item.id}
                className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
              >
                <td className="px-4 py-3 font-black text-slate-800">{item.room_id}</td>
                <td className="px-4 py-3 text-slate-600">{item.term_id}</td>
                <td className="px-4 py-3 text-slate-600">{getExceptionText(item)}</td>
                <td className="px-4 py-3 text-slate-600">
                  {String(item.is_lineup_day).toUpperCase() === 'TRUE'
                    ? 'ต้องเข้าแถว'
                    : 'ไม่ต้องเข้าแถว'}
                </td>
                <td className="px-4 py-3 text-slate-600">{item.note || '-'}</td>
                <td className="px-4 py-3 text-center">
                  <ActiveBadge active={item.active} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-center gap-2">
                    <button
                      onClick={() => onEdit(item)}
                      disabled={saving}
                      className="rounded-full bg-blue-100 px-3 py-1 text-xs font-black text-blue-700 disabled:opacity-50"
                    >
                      แก้ไข
                    </button>

                    <button
                      onClick={() => onToggleActive(item)}
                      disabled={saving}
                      className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-700 disabled:opacity-50"
                    >
                      เปิด/ปิด
                    </button>

                    <button
                      onClick={() => onDelete(item)}
                      disabled={saving}
                      className="rounded-full bg-red-100 px-3 py-1 text-xs font-black text-red-700 disabled:opacity-50"
                    >
                      ลบ
                    </button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function ActiveBadge({ active }) {
  if (isActiveValue(active)) {
    return (
      <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700">
        เปิดใช้งาน
      </span>
    );
  }

  return (
    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-500">
      ปิดใช้งาน
    </span>
  );
}

function getExceptionText(item) {
  if (item.exception_type === 'DATE') {
    return `เฉพาะวันที่ ${formatThaiDate(item.date)}`;
  }

  const weekday = WEEKDAYS.find((day) => Number(day.value) === Number(item.weekday));

  return `ทุกวัน${weekday?.label || '-'}`;
}

function getEmptyForm() {
  return {
    id: '',
    room_id: '',
    term_id: '',
    exception_type: 'WEEKDAY',
    weekday: 2,
    date: '',
    is_lineup_day: 'FALSE',
    note: '',
    active: 'TRUE',
  };
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

function isActiveValue(value) {
  const text = String(value || '').trim().toUpperCase();

  return text === 'TRUE' || text === '1' || text === 'YES' || text === 'Y';
}