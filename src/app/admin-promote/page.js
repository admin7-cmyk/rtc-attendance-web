'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import AppNav from '@/components/AppNav';

const WAITING_ROOM_TEXT = 'รอจัดห้อง';

const EMPTY_FORM = {
  source_level: 'ปวช',
  source_year: '1',
  source_room_no: 'ALL',
  action: 'PROMOTE',
  target_level: 'ปวช',
  target_year: '2',
  graduate_note: 'จบการศึกษา',
};

const PROMOTION_RULES = [
  {
    source_level: 'ปวช',
    source_year: '1',
    action: 'PROMOTE',
    target_level: 'ปวช',
    target_year: '2',
    label: 'ปวช.1 → ปวช.2',
  },
  {
    source_level: 'ปวช',
    source_year: '2',
    action: 'PROMOTE',
    target_level: 'ปวช',
    target_year: '3',
    label: 'ปวช.2 → ปวช.3',
  },
  {
    source_level: 'ปวช',
    source_year: '3',
    action: 'GRADUATE',
    target_level: 'ปวช',
    target_year: '3',
    label: 'ปวช.3 → จบการศึกษา',
  },
  {
    source_level: 'ปวส',
    source_year: '1',
    action: 'PROMOTE',
    target_level: 'ปวส',
    target_year: '2',
    label: 'ปวส.1 → ปวส.2',
  },
  {
    source_level: 'ปวส',
    source_year: '2',
    action: 'GRADUATE',
    target_level: 'ปวส',
    target_year: '2',
    label: 'ปวส.2 → จบการศึกษา',
  },
];

export default function AdminPromotePage() {
  const [currentUser, setCurrentUser] = useState(null);

  const [students, setStudents] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [users, setUsers] = useState([]);

  const [mode, setMode] = useState('GROUP');
  const [form, setForm] = useState(EMPTY_FORM);
  const [confirmText, setConfirmText] = useState('');

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

  const availableRoomNos = useMemo(() => {
    const set = new Set();

    students.forEach((student) => {
      if (!isTrueValue(student.active)) return;

      if (String(student.level || '') !== form.source_level) return;
      if (String(student.year || '') !== String(form.source_year)) return;

      const roomNo = String(student.room_no || '').trim();

      if (roomNo) set.add(roomNo);
    });

    return Array.from(set).sort((a, b) => Number(a) - Number(b));
  }, [students, form.source_level, form.source_year]);

  const groupPreviewRows = useMemo(() => {
    return students
      .filter((student) => {
        if (!isTrueValue(student.active)) return false;

        if (String(student.level || '') !== form.source_level) return false;
        if (String(student.year || '') !== String(form.source_year)) return false;

        if (
          form.source_room_no !== 'ALL' &&
          String(student.room_no || '') !== String(form.source_room_no)
        ) {
          return false;
        }

        return true;
      })
      .map((student) => buildGroupPreviewRow(student, form, rooms))
      .sort(sortPreviewRows);
  }, [students, rooms, form]);

  const autoPreviewRows = useMemo(() => {
    return students
      .filter((student) => isTrueValue(student.active))
      .map((student) => buildAutoPreviewRow(student, rooms))
      .filter(Boolean)
      .sort(sortAutoPreviewRows);
  }, [students, rooms]);

  const previewRows = useMemo(() => {
    if (mode === 'AUTO') return autoPreviewRows;

    return groupPreviewRows;
  }, [mode, autoPreviewRows, groupPreviewRows]);

  const roomActionMap = useMemo(() => {
    const map = new Map();

    previewRows.forEach((row) => {
      const sourceRoomId = String(row.room_id || '').trim();

      if (!sourceRoomId) return;

      const key = normalizeRoomId(sourceRoomId);

      if (row.action === 'PROMOTE') {
        if (!row.target_room_exists) return;

        map.set(key, {
          source_room_id: sourceRoomId,
          target_room_id: String(row.next_room_id || '').trim(),
          action: 'PROMOTE',
          reason: row.rule_label || 'เลื่อนชั้น',
        });

        return;
      }

      if (row.action === 'GRADUATE') {
        map.set(key, {
          source_room_id: sourceRoomId,
          target_room_id: WAITING_ROOM_TEXT,
          action: 'WAITING',
          reason: 'ห้องจบการศึกษา / รอจัดห้องใหม่',
        });
      }
    });

    return map;
  }, [previewRows]);

  const teacherPreviewRows = useMemo(() => {
    return buildTeacherPreviewRows(users, roomActionMap);
  }, [users, roomActionMap]);

  const missingTargetRooms = useMemo(() => {
    const set = new Set();

    previewRows.forEach((row) => {
      if (row.target_room_exists) return;
      if (row.action === 'GRADUATE') return;
      set.add(row.next_room_id);
    });

    return Array.from(set).sort((a, b) =>
      String(a).localeCompare(String(b), 'th')
    );
  }, [previewRows]);

  const overview = useMemo(() => {
    const total = previewRows.length;
    const promote = previewRows.filter((row) => row.action === 'PROMOTE').length;
    const graduate = previewRows.filter(
      (row) => row.action === 'GRADUATE'
    ).length;

    const teachersFollowRoom = teacherPreviewRows.filter(
      (teacher) => teacher.teacher_action === 'PROMOTE'
    ).length;

    const teachersWaiting = teacherPreviewRows.filter(
      (teacher) => teacher.teacher_action === 'WAITING'
    ).length;

    return {
      total,
      promote,
      graduate,
      missingRooms: missingTargetRooms.length,
      teacherMoveCount: teacherPreviewRows.length,
      teachersFollowRoom,
      teachersWaiting,
    };
  }, [previewRows, missingTargetRooms, teacherPreviewRows]);

  const autoRuleOverview = useMemo(() => {
    return PROMOTION_RULES.map((rule) => {
      const count = autoPreviewRows.filter(
        (row) =>
          row.source_level === rule.source_level &&
          String(row.source_year) === String(rule.source_year)
      ).length;

      return {
        ...rule,
        count,
      };
    });
  }, [autoPreviewRows]);

  async function loadPageData() {
    try {
      setLoading(true);
      setPageError('');
      setSuccessMessage('');
      setConfirmText('');

      const [
        { data: studentData, error: studentError },
        { data: roomData, error: roomError },
        { data: userData, error: userError },
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
          .order('room_no', { ascending: true }),

        supabase
          .from('app_users')
          .select('*')
          .order('teacher_id', { ascending: true }),
      ]);

      if (studentError) {
        throw new Error(studentError.message);
      }

      if (roomError) {
        throw new Error(roomError.message);
      }

      if (userError) {
        throw new Error(userError.message);
      }

      setStudents(studentData || []);
      setRooms(roomData || []);
      setUsers(userData || []);
    } catch (err) {
      setPageError(err.message || 'โหลดข้อมูลไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }

  function updateMode(nextMode) {
    setMode(nextMode);
    setConfirmText('');
    setPageError('');
    setSuccessMessage('');
  }

  function updateForm(field, value) {
    setForm((prev) => {
      const next = {
        ...prev,
        [field]: value,
      };

      if (field === 'source_level' || field === 'source_year') {
        next.source_room_no = 'ALL';
      }

      if (field === 'source_level' || field === 'source_year') {
        const sourceLevel = field === 'source_level' ? value : next.source_level;
        const sourceYear = field === 'source_year' ? value : next.source_year;

        const matchedRule = PROMOTION_RULES.find(
          (rule) =>
            rule.source_level === sourceLevel &&
            String(rule.source_year) === String(sourceYear)
        );

        if (matchedRule) {
          next.action = matchedRule.action;
          next.target_level = matchedRule.target_level;
          next.target_year = matchedRule.target_year;
        }
      }

      return next;
    });

    setConfirmText('');
  }

  async function executePromotion() {
    try {
      setSaving(true);
      setPageError('');
      setSuccessMessage('');

      if (previewRows.length === 0) {
        throw new Error('ไม่พบนักเรียนสำหรับดำเนินการ');
      }

      if (missingTargetRooms.length > 0) {
        throw new Error(
          `ยังไม่พบห้องปลายทาง: ${missingTargetRooms.join(
            ', '
          )} กรุณาสร้างห้องในเมนูจัดการห้องเรียนก่อน`
        );
      }

      if (String(confirmText || '').trim() !== 'ยืนยัน') {
        throw new Error('กรุณาพิมพ์คำว่า “ยืนยัน” ก่อนดำเนินการจริง');
      }

      const actionText =
        mode === 'AUTO'
          ? 'เลื่อนชั้นอัตโนมัติทั้งระบบ'
          : form.action === 'GRADUATE'
          ? 'ตั้งนักเรียนเป็นจบการศึกษา / ครูรอจัดห้อง'
          : `เลื่อนชั้นเป็น ${form.target_level}.${form.target_year}`;

      const confirmMessage = [
        'ยืนยันดำเนินการ',
        '',
        `โหมด: ${
          mode === 'AUTO'
            ? 'เลื่อนชั้นอัตโนมัติทั้งระบบ'
            : 'เลื่อนชั้นรายกลุ่ม'
        }`,
        `รายการ: ${actionText}`,
        `จำนวนนักเรียนทั้งหมด: ${previewRows.length} คน`,
        `เลื่อนชั้น: ${overview.promote} คน`,
        `จบการศึกษา/ปิดสถานะ: ${overview.graduate} คน`,
        `ครูที่ตามห้องใหม่: ${overview.teachersFollowRoom} คน`,
        `ครูรอจัดห้อง: ${overview.teachersWaiting} คน`,
        '',
        'คำเตือน: ควร Backup ก่อนดำเนินการทุกครั้ง',
        '',
        'ต้องการดำเนินการต่อใช่ไหม?',
      ].join('\n');

      const ok = window.confirm(confirmMessage);

      if (!ok) return;

      const studentUpdateRows = previewRows.map((student) => {
        if (student.action === 'GRADUATE') {
          return {
            student_id: student.student_id,
            active: 'FALSE',
          };
        }

        return {
          student_id: student.student_id,
          level: student.next_level,
          year: student.next_year,
          room_no: student.next_room_no,
          room_id: student.next_room_id,
          active: 'TRUE',
        };
      });

      for (const row of studentUpdateRows) {
        const { student_id, ...updateData } = row;

        const { error } = await supabase
          .from('students')
          .update(updateData)
          .eq('student_id', student_id);

        if (error) {
          throw new Error(error.message);
        }
      }

      for (const teacher of teacherPreviewRows) {
        const { error } = await supabase
          .from('app_users')
          .update({
            room_ids: teacher.new_room_ids,
          })
          .eq('teacher_id', teacher.teacher_id);

        if (error) {
          throw new Error(error.message);
        }
      }

      setSuccessMessage(
        `ดำเนินการสำเร็จ นักเรียน ${studentUpdateRows.length} รายการ / ครูตามห้องใหม่ ${overview.teachersFollowRoom} คน / ครูรอจัดห้อง ${overview.teachersWaiting} คน ${
          mode === 'AUTO' ? '(เลื่อนชั้นอัตโนมัติทั้งระบบ)' : ''
        }`
      );

      setConfirmText('');
      await loadPageData();
    } catch (err) {
      setPageError(err.message || 'ดำเนินการไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  function goBackup() {
    window.location.href = '/backup';
  }

  function goRooms() {
    window.location.href = '/admin-rooms';
  }

  function goUsers() {
    window.location.href = '/admin-users';
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
        <AppNav currentUser={currentUser} active="admin-promote" />

        <section className="mb-4 rounded-3xl bg-white p-4 shadow-sm sm:mb-6 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-2xl font-black text-slate-800 sm:text-3xl">
                เลื่อนชั้นนักเรียน
              </h1>
              <p className="mt-1 text-sm text-slate-500 sm:text-base">
                นักเรียนเลื่อนชั้น ครูตามห้องใหม่ และครูของห้องที่จบการศึกษาจะเป็น “รอจัดห้อง”
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={goBackup}
                className="rounded-full bg-blue-100 px-4 py-2 text-sm font-bold text-blue-700 hover:bg-blue-200"
              >
                ไป Backup ก่อน
              </button>

              <button
                onClick={goRooms}
                className="rounded-full bg-purple-100 px-4 py-2 text-sm font-bold text-purple-700 hover:bg-purple-200"
              >
                จัดการห้องเรียน
              </button>

              <button
                onClick={goUsers}
                className="rounded-full bg-amber-100 px-4 py-2 text-sm font-bold text-amber-700 hover:bg-amber-200"
              >
                จัดการครู
              </button>

              <button
                onClick={loadPageData}
                disabled={loading}
                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700 disabled:opacity-50"
              >
                โหลดข้อมูลใหม่
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

        <section className="mb-4 rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 sm:mb-6 sm:p-6">
          <div className="font-black">คำเตือนสำคัญ</div>
          <div className="mt-1">
            ก่อนกดดำเนินการจริง ควร Backup ก่อนทุกครั้ง เพราะระบบจะอัปเดตทั้งนักเรียนและครูประจำห้องพร้อมกัน
          </div>
        </section>

        <section className="mb-4 grid gap-3 sm:mb-6 md:grid-cols-2">
          <button
            onClick={() => updateMode('GROUP')}
            className={`rounded-3xl border p-5 text-left shadow-sm transition ${
              mode === 'GROUP'
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <div className="text-xl font-black">เลื่อนชั้นรายกลุ่ม</div>
            <div
              className={`mt-1 text-sm ${
                mode === 'GROUP' ? 'text-slate-200' : 'text-slate-500'
              }`}
            >
              เลือกเฉพาะระดับ/ชั้นปี/ห้อง แล้ว Preview ก่อนกดจริง
            </div>
          </button>

          <button
            onClick={() => updateMode('AUTO')}
            className={`rounded-3xl border p-5 text-left shadow-sm transition ${
              mode === 'AUTO'
                ? 'border-pink-600 bg-pink-600 text-white'
                : 'border-pink-100 bg-pink-50 text-pink-800 hover:bg-pink-100'
            }`}
          >
            <div className="text-xl font-black">เลื่อนชั้นอัตโนมัติทั้งระบบ</div>
            <div
              className={`mt-1 text-sm ${
                mode === 'AUTO' ? 'text-pink-100' : 'text-pink-700'
              }`}
            >
              นักเรียนเลื่อนชั้น ครูตามห้องใหม่ และครูห้องจบเป็น “รอจัดห้อง”
            </div>
          </button>
        </section>

        <section className="mb-4 grid grid-cols-2 gap-3 sm:mb-6 lg:grid-cols-5 lg:gap-4">
          <StatCard title="รายการ Preview" value={overview.total} unit="คน" />
          <StatCard title="เลื่อนชั้น" value={overview.promote} unit="คน" tone="green" />
          <StatCard title="จบการศึกษา" value={overview.graduate} unit="คน" tone="blue" />
          <StatCard title="ครูตามห้องใหม่" value={overview.teachersFollowRoom} unit="คน" tone="purple" />
          <StatCard title="ครูรอจัดห้อง" value={overview.teachersWaiting} unit="คน" tone="amber" />
        </section>

        <section className="mb-4 grid gap-4 lg:grid-cols-[420px_1fr]">
          <section className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
            {mode === 'GROUP' ? (
              <GroupSettingPanel
                form={form}
                availableRoomNos={availableRoomNos}
                updateForm={updateForm}
              />
            ) : (
              <AutoSettingPanel autoRuleOverview={autoRuleOverview} />
            )}

            {teacherPreviewRows.length > 0 && (
              <div className="mt-4 rounded-2xl border border-purple-200 bg-purple-50 p-4 text-sm text-purple-800">
                <div className="font-black">
                  ครูที่จะถูกอัปเดต {teacherPreviewRows.length} คน
                </div>
                <div className="mt-2 max-h-48 space-y-2 overflow-y-auto pr-1">
                  {teacherPreviewRows.map((teacher) => (
                    <div
                      key={teacher.teacher_id}
                      className="rounded-xl bg-white px-3 py-2 text-xs shadow-sm"
                    >
                      <div className="font-black text-slate-800">
                        {teacher.name || teacher.username || teacher.teacher_id}
                      </div>
                      <div className="mt-1 text-slate-500">
                        เดิม: {teacher.old_room_ids || '-'}
                      </div>
                      <div className="font-bold text-purple-700">
                        ใหม่: {teacher.new_room_ids || '-'}
                      </div>
                      <div className="mt-1 text-slate-400">
                        เหตุผล: {teacher.reason || '-'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {missingTargetRooms.length > 0 && (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                <div className="font-black">ยังไม่พบห้องปลายทาง</div>
                <div className="mt-1 break-words">
                  {missingTargetRooms.join(', ')}
                </div>
                <button
                  onClick={goRooms}
                  className="mt-3 rounded-full bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700"
                >
                  ไปสร้างห้องเรียน
                </button>
              </div>
            )}

            <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
              <div className="font-black text-slate-800">
                ยืนยันก่อนดำเนินการจริง
              </div>
              <div className="mt-1 text-xs text-slate-500">
                พิมพ์คำว่า <span className="font-black text-slate-800">ยืนยัน</span> เพื่อปลดล็อกปุ่มดำเนินการ
              </div>

              <input
                value={confirmText}
                onChange={(event) => setConfirmText(event.target.value)}
                placeholder="พิมพ์คำว่า ยืนยัน"
                className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-slate-500"
              />
            </div>

            <button
              onClick={executePromotion}
              disabled={
                saving ||
                loading ||
                previewRows.length === 0 ||
                missingTargetRooms.length > 0 ||
                String(confirmText || '').trim() !== 'ยืนยัน'
              }
              className="mt-4 w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {saving
                ? 'กำลังดำเนินการ...'
                : mode === 'AUTO'
                ? 'ยืนยันเลื่อนชั้นอัตโนมัติทั้งระบบ'
                : 'ยืนยันดำเนินการรายกลุ่ม'}
            </button>
          </section>

          <section className="space-y-4">
            <section className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
              <div className="mb-4">
                <h2 className="text-xl font-black text-slate-800">
                  Preview รายชื่อนักเรียน
                </h2>
                <p className="text-sm text-slate-500">
                  ตรวจสอบก่อนกดดำเนินการจริง
                </p>
              </div>

              {loading ? (
                <div className="rounded-2xl bg-slate-50 p-8 text-center text-slate-500">
                  กำลังโหลดข้อมูล...
                </div>
              ) : (
                <>
                  <PreviewMobileCards rows={previewRows} />
                  <PreviewDesktopTable rows={previewRows} />
                </>
              )}
            </section>

            <section className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
              <div className="mb-4">
                <h2 className="text-xl font-black text-slate-800">
                  Preview ครูประจำห้อง
                </h2>
                <p className="text-sm text-slate-500">
                  ครูจะตามห้องที่เลื่อนชั้น ส่วนครูของห้องที่จบการศึกษาจะถูกตั้งเป็น “รอจัดห้อง”
                </p>
              </div>

              {loading ? (
                <div className="rounded-2xl bg-slate-50 p-8 text-center text-slate-500">
                  กำลังโหลดข้อมูล...
                </div>
              ) : (
                <>
                  <TeacherMobileCards rows={teacherPreviewRows} />
                  <TeacherDesktopTable rows={teacherPreviewRows} />
                </>
              )}
            </section>
          </section>
        </section>
      </div>
    </main>
  );
}

function GroupSettingPanel({ form, availableRoomNos, updateForm }) {
  return (
    <div>
      <div className="mb-4">
        <h2 className="text-xl font-black text-slate-800">
          ตั้งค่าการเลื่อนชั้นรายกลุ่ม
        </h2>
        <p className="text-sm text-slate-500">
          เลือกต้นทางและปลายทาง แล้วตรวจ Preview ก่อนกดจริง
        </p>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-bold text-slate-700">
              ระดับต้นทาง
            </label>
            <select
              value={form.source_level}
              onChange={(e) => updateForm('source_level', e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500"
            >
              <option value="ปวช">ปวช</option>
              <option value="ปวส">ปวส</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-bold text-slate-700">
              ชั้นปีต้นทาง
            </label>
            <select
              value={form.source_year}
              onChange={(e) => updateForm('source_year', e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500"
            >
              <option value="1">1</option>
              <option value="2">2</option>
              {form.source_level === 'ปวช' && <option value="3">3</option>}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-bold text-slate-700">
            ห้องต้นทาง
          </label>
          <select
            value={form.source_room_no}
            onChange={(e) => updateForm('source_room_no', e.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500"
          >
            <option value="ALL">ทุกห้อง</option>
            {availableRoomNos.map((roomNo) => (
              <option key={roomNo} value={roomNo}>
                ห้อง {roomNo}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-bold text-slate-700">
            การดำเนินการ
          </label>
          <select
            value={form.action}
            onChange={(e) => updateForm('action', e.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500"
          >
            <option value="PROMOTE">เลื่อนชั้น</option>
            <option value="GRADUATE">จบการศึกษา / ปิดสถานะ</option>
          </select>
        </div>

        {form.action === 'PROMOTE' ? (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-bold text-slate-700">
                ระดับปลายทาง
              </label>
              <select
                value={form.target_level}
                onChange={(e) => updateForm('target_level', e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500"
              >
                <option value="ปวช">ปวช</option>
                <option value="ปวส">ปวส</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-bold text-slate-700">
                ชั้นปีปลายทาง
              </label>
              <select
                value={form.target_year}
                onChange={(e) => updateForm('target_year', e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500"
              >
                <option value="1">1</option>
                <option value="2">2</option>
                {form.target_level === 'ปวช' && <option value="3">3</option>}
              </select>
            </div>
          </div>
        ) : (
          <div>
            <label className="mb-1 block text-sm font-bold text-slate-700">
              หมายเหตุ
            </label>
            <input
              value={form.graduate_note}
              onChange={(e) => updateForm('graduate_note', e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500"
            />
          </div>
        )}
      </div>
    </div>
  );
}

function AutoSettingPanel({ autoRuleOverview }) {
  return (
    <div>
      <div className="mb-4">
        <h2 className="text-xl font-black text-slate-800">
          เลื่อนชั้นอัตโนมัติทั้งระบบ
        </h2>
        <p className="text-sm text-slate-500">
          ระบบจะใช้กติกามาตรฐาน นักเรียนเลื่อนชั้น ครูตามห้องใหม่ และครูห้องจบเป็น “รอจัดห้อง”
        </p>
      </div>

      <div className="space-y-3">
        {autoRuleOverview.map((rule) => (
          <div
            key={`${rule.source_level}_${rule.source_year}`}
            className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-black text-slate-800">{rule.label}</div>
                <div className="mt-1 text-xs text-slate-500">
                  {rule.action === 'GRADUATE'
                    ? `นักเรียน active = FALSE / ครูเป็น ${WAITING_ROOM_TEXT}`
                    : `นักเรียนและครูประจำห้องย้ายไป ${rule.target_level}.${rule.target_year}/ห้องเดิม`}
                </div>
              </div>

              <div className="rounded-full bg-white px-4 py-2 text-sm font-black text-slate-700 shadow-sm">
                {rule.count} คน
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PreviewMobileCards({ rows }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl bg-slate-50 p-8 text-center text-slate-500 md:hidden">
        ไม่พบนักเรียนตามเงื่อนไข
      </div>
    );
  }

  return (
    <div className="space-y-3 md:hidden">
      {rows.map((student, index) => (
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
                {student.prefix || ''}
                {student.first_name || ''} {student.last_name || ''}
              </div>
              <div className="mt-1 text-sm text-slate-500">
                เดิม: {student.level}.{student.year}/{student.room_no}
              </div>
              <div className="mt-1 text-sm font-bold text-slate-700">
                ใหม่:{' '}
                {student.next_active === 'FALSE'
                  ? 'จบการศึกษา / ปิดสถานะ'
                  : `${student.next_level}.${student.next_year}/${student.next_room_no}`}
              </div>
            </div>

            <StatusBadge ok={student.target_room_exists} action={student.action} />
          </div>

          <div className="rounded-2xl bg-slate-50 p-3 text-xs text-slate-600">
            <div>room_id เดิม: {student.room_id || '-'}</div>
            <div>room_id ใหม่: {student.next_room_id || '-'}</div>
            <div>กติกา: {student.rule_label || '-'}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function PreviewDesktopTable({ rows }) {
  return (
    <div
      className="hidden max-w-full overflow-x-auto rounded-2xl border border-slate-200 md:block"
      style={{
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <table className="min-w-[1180px] w-full border-collapse bg-white text-sm">
        <thead className="bg-slate-900 text-white">
          <tr>
            <th className="whitespace-nowrap px-4 py-3 text-center">ลำดับ</th>
            <th className="whitespace-nowrap px-4 py-3 text-left">รหัส</th>
            <th className="whitespace-nowrap px-4 py-3 text-left">ชื่อ - สกุล</th>
            <th className="whitespace-nowrap px-4 py-3 text-center">เดิม</th>
            <th className="whitespace-nowrap px-4 py-3 text-center">room_id เดิม</th>
            <th className="whitespace-nowrap px-4 py-3 text-center">ใหม่</th>
            <th className="whitespace-nowrap px-4 py-3 text-center">room_id ใหม่</th>
            <th className="whitespace-nowrap px-4 py-3 text-center">กติกา</th>
            <th className="whitespace-nowrap px-4 py-3 text-center">สถานะ</th>
          </tr>
        </thead>

        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan="9" className="px-4 py-8 text-center text-slate-500">
                ไม่พบนักเรียนตามเงื่อนไข
              </td>
            </tr>
          ) : (
            rows.map((student, index) => (
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
                  {student.prefix || ''}
                  {student.first_name || ''} {student.last_name || ''}
                </td>

                <td className="whitespace-nowrap px-4 py-3 text-center text-slate-700">
                  {student.level}.{student.year}/{student.room_no}
                </td>

                <td className="whitespace-nowrap px-4 py-3 text-center text-slate-500">
                  {student.room_id || '-'}
                </td>

                <td className="whitespace-nowrap px-4 py-3 text-center font-bold text-slate-700">
                  {student.next_active === 'FALSE'
                    ? 'จบการศึกษา / ปิดสถานะ'
                    : `${student.next_level}.${student.next_year}/${student.next_room_no}`}
                </td>

                <td className="whitespace-nowrap px-4 py-3 text-center text-slate-500">
                  {student.next_room_id || '-'}
                </td>

                <td className="whitespace-nowrap px-4 py-3 text-center text-slate-600">
                  {student.rule_label || '-'}
                </td>

                <td className="whitespace-nowrap px-4 py-3 text-center">
                  <StatusBadge ok={student.target_room_exists} action={student.action} />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function TeacherMobileCards({ rows }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl bg-slate-50 p-8 text-center text-slate-500 md:hidden">
        ไม่มีครูที่ต้องอัปเดตในรอบนี้
      </div>
    );
  }

  return (
    <div className="space-y-3 md:hidden">
      {rows.map((teacher, index) => (
        <div
          key={teacher.teacher_id || index}
          className={`rounded-3xl border p-4 shadow-sm ${
            teacher.teacher_action === 'WAITING'
              ? 'border-amber-100 bg-amber-50'
              : 'border-purple-100 bg-purple-50'
          }`}
        >
          <div className="text-xs font-bold text-slate-500">
            {index + 1}. {teacher.teacher_id}
          </div>
          <div className="text-lg font-black text-slate-800">
            {teacher.name || teacher.username || '-'}
          </div>

          <div className="mt-3 rounded-2xl bg-white p-3 text-xs text-slate-600">
            <div>
              <span className="font-black text-slate-800">เดิม: </span>
              {teacher.old_room_ids || '-'}
            </div>
            <div className="mt-1">
              <span className="font-black text-purple-700">ใหม่: </span>
              {teacher.new_room_ids || '-'}
            </div>
            <div className="mt-1">
              <span className="font-black text-slate-800">เหตุผล: </span>
              {teacher.reason || '-'}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function TeacherDesktopTable({ rows }) {
  return (
    <div
      className="hidden max-w-full overflow-x-auto rounded-2xl border border-slate-200 md:block"
      style={{
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <table className="min-w-[980px] w-full border-collapse bg-white text-sm">
        <thead className="bg-purple-700 text-white">
          <tr>
            <th className="whitespace-nowrap px-4 py-3 text-center">ลำดับ</th>
            <th className="whitespace-nowrap px-4 py-3 text-left">รหัสครู</th>
            <th className="whitespace-nowrap px-4 py-3 text-left">ชื่อครู</th>
            <th className="whitespace-nowrap px-4 py-3 text-left">ห้องเดิม</th>
            <th className="whitespace-nowrap px-4 py-3 text-left">ห้องใหม่</th>
            <th className="whitespace-nowrap px-4 py-3 text-center">สถานะ</th>
            <th className="whitespace-nowrap px-4 py-3 text-left">เหตุผล</th>
          </tr>
        </thead>

        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan="7" className="px-4 py-8 text-center text-slate-500">
                ไม่มีครูที่ต้องอัปเดตในรอบนี้
              </td>
            </tr>
          ) : (
            rows.map((teacher, index) => (
              <tr
                key={teacher.teacher_id || index}
                className="border-b border-slate-100 last:border-b-0 hover:bg-purple-50"
              >
                <td className="whitespace-nowrap px-4 py-3 text-center font-bold text-slate-500">
                  {index + 1}
                </td>

                <td className="whitespace-nowrap px-4 py-3 font-bold text-slate-700">
                  {teacher.teacher_id || '-'}
                </td>

                <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                  {teacher.name || teacher.username || '-'}
                </td>

                <td className="px-4 py-3 text-slate-600">
                  {teacher.old_room_ids || '-'}
                </td>

                <td className="px-4 py-3 font-bold text-purple-700">
                  {teacher.new_room_ids || '-'}
                </td>

                <td className="whitespace-nowrap px-4 py-3 text-center">
                  <TeacherActionBadge action={teacher.teacher_action} />
                </td>

                <td className="px-4 py-3 text-slate-600">
                  {teacher.reason || '-'}
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
    purple: 'bg-purple-50 text-purple-800',
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

function StatusBadge({ ok, action }) {
  if (action === 'GRADUATE') {
    return (
      <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-black text-blue-700">
        จบ
      </span>
    );
  }

  if (ok) {
    return (
      <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700">
        พร้อม
      </span>
    );
  }

  return (
    <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-black text-red-700">
      ห้องหาย
    </span>
  );
}

function TeacherActionBadge({ action }) {
  if (action === 'WAITING') {
    return (
      <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-700">
        รอจัดห้อง
      </span>
    );
  }

  return (
    <span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-black text-purple-700">
      ตามห้อง
    </span>
  );
}

function buildGroupPreviewRow(student, form, rooms) {
  if (form.action === 'GRADUATE') {
    return {
      ...student,
      source_level: student.level,
      source_year: student.year,
      action: 'GRADUATE',
      next_level: student.level,
      next_year: student.year,
      next_room_no: student.room_no,
      next_room_id: student.room_id,
      next_active: 'FALSE',
      next_status_label: form.graduate_note || 'จบการศึกษา',
      rule_label: form.graduate_note || 'จบการศึกษา',
      target_room_exists: true,
    };
  }

  const nextRoomNo = String(student.room_no || '').trim();
  const nextLevel = form.target_level;
  const nextYear = form.target_year;
  const nextRoomId = makeRoomId(nextLevel, nextYear, nextRoomNo);
  const targetRoomExists = hasRoom(rooms, nextRoomId);

  return {
    ...student,
    source_level: student.level,
    source_year: student.year,
    action: 'PROMOTE',
    next_level: nextLevel,
    next_year: nextYear,
    next_room_no: nextRoomNo,
    next_room_id: nextRoomId,
    next_active: 'TRUE',
    next_status_label: targetRoomExists
      ? 'พร้อมเลื่อนชั้น'
      : 'ไม่พบห้องปลายทาง',
    rule_label: `${student.level}.${student.year} → ${nextLevel}.${nextYear}`,
    target_room_exists: targetRoomExists,
  };
}

function buildAutoPreviewRow(student, rooms) {
  const level = String(student.level || '').trim();
  const year = String(student.year || '').trim();

  const rule = PROMOTION_RULES.find(
    (item) =>
      item.source_level === level && String(item.source_year) === String(year)
  );

  if (!rule) return null;

  if (rule.action === 'GRADUATE') {
    return {
      ...student,
      source_level: student.level,
      source_year: student.year,
      action: 'GRADUATE',
      next_level: student.level,
      next_year: student.year,
      next_room_no: student.room_no,
      next_room_id: student.room_id,
      next_active: 'FALSE',
      next_status_label: 'จบการศึกษา',
      rule_label: rule.label,
      target_room_exists: true,
    };
  }

  const nextRoomNo = String(student.room_no || '').trim();
  const nextRoomId = makeRoomId(rule.target_level, rule.target_year, nextRoomNo);
  const targetRoomExists = hasRoom(rooms, nextRoomId);

  return {
    ...student,
    source_level: student.level,
    source_year: student.year,
    action: 'PROMOTE',
    next_level: rule.target_level,
    next_year: rule.target_year,
    next_room_no: nextRoomNo,
    next_room_id: nextRoomId,
    next_active: 'TRUE',
    next_status_label: targetRoomExists
      ? 'พร้อมเลื่อนชั้น'
      : 'ไม่พบห้องปลายทาง',
    rule_label: rule.label,
    target_room_exists: targetRoomExists,
  };
}

function buildTeacherPreviewRows(users, roomActionMap) {
  if (!roomActionMap || roomActionMap.size === 0) return [];

  return users
    .filter((user) => {
      if (!isTrueValue(user.active)) return false;

      const role = String(user.role || '').toLowerCase();
      if (role === 'admin') return false;

      const roomIds = parseRoomIds(user.room_ids);
      if (roomIds.length === 0) return false;
      if (roomIds.some((roomId) => String(roomId).toUpperCase() === 'ALL')) {
        return false;
      }

      return roomIds.some((roomId) => roomActionMap.has(normalizeRoomId(roomId)));
    })
    .map((user) => {
      const oldRoomIds = parseRoomIds(user.room_ids);

      const changedActions = [];

      const newRoomIds = oldRoomIds.map((roomId) => {
        const action = roomActionMap.get(normalizeRoomId(roomId));

        if (!action) return roomId;

        changedActions.push(action);

        return action.target_room_id;
      });

      const uniqueNewRoomIds = uniqueByNormalizedRoomOrText(newRoomIds);

      const hasWaiting = changedActions.some(
        (item) => item.action === 'WAITING'
      );

      const hasPromote = changedActions.some(
        (item) => item.action === 'PROMOTE'
      );

      let teacherAction = 'PROMOTE';

      if (hasWaiting && !hasPromote) {
        teacherAction = 'WAITING';
      } else if (hasWaiting && hasPromote) {
        teacherAction = 'MIXED';
      }

      const reason = changedActions
        .map((item) => item.reason)
        .filter(Boolean)
        .join(' / ');

      return {
        teacher_id: user.teacher_id,
        username: user.username,
        name: user.name,
        role: user.role,
        old_room_ids: oldRoomIds.join(','),
        new_room_ids: uniqueNewRoomIds.join(','),
        teacher_action: teacherAction,
        reason,
      };
    })
    .filter((teacher) => {
      return normalizeRoomList(teacher.old_room_ids) !== normalizeRoomList(teacher.new_room_ids);
    })
    .sort((a, b) =>
      String(a.teacher_id || '').localeCompare(String(b.teacher_id || ''), 'th')
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

function uniqueByNormalizedRoomOrText(roomIds) {
  const seen = new Set();
  const result = [];

  roomIds.forEach((roomId) => {
    const key =
      roomId === WAITING_ROOM_TEXT
        ? WAITING_ROOM_TEXT
        : normalizeRoomId(roomId);

    if (!key || seen.has(key)) return;

    seen.add(key);
    result.push(roomId);
  });

  return result;
}

function normalizeRoomList(roomIdsText) {
  return parseRoomIds(roomIdsText)
    .map((roomId) =>
      roomId === WAITING_ROOM_TEXT ? WAITING_ROOM_TEXT : normalizeRoomId(roomId)
    )
    .sort()
    .join(',');
}

function hasRoom(rooms, roomId) {
  return rooms.some(
    (room) => normalizeRoomId(room.room_id) === normalizeRoomId(roomId)
  );
}

function makeRoomId(level, year, roomNo) {
  return `${level}${year}/${roomNo}`;
}

function sortPreviewRows(a, b) {
  const roomA = Number(a.room_no || 0);
  const roomB = Number(b.room_no || 0);

  if (roomA !== roomB) return roomA - roomB;

  return String(a.student_id || '').localeCompare(String(b.student_id || ''), 'th');
}

function sortAutoPreviewRows(a, b) {
  const levelA = getLevelWeight(a.level);
  const levelB = getLevelWeight(b.level);

  if (levelA !== levelB) return levelA - levelB;

  const yearA = Number(a.year || 0);
  const yearB = Number(b.year || 0);

  if (yearA !== yearB) return yearA - yearB;

  const roomA = Number(a.room_no || 0);
  const roomB = Number(b.room_no || 0);

  if (roomA !== roomB) return roomA - roomB;

  return String(a.student_id || '').localeCompare(String(b.student_id || ''), 'th');
}

function getLevelWeight(level) {
  const text = String(level || '');

  if (text.includes('ปวช')) return 1;
  if (text.includes('ปวส')) return 2;

  return 99;
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