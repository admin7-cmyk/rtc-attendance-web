'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import ExcelJS from 'exceljs';
import { supabase } from '@/lib/supabase';
import AppNav from '@/components/AppNav';

const PAGE_SIZE = 1000;

const IMPORT_MODES = {
  INSERT_ONLY: 'INSERT_ONLY',
  UPSERT: 'UPSERT',
};

const IMPORT_TYPES = {
  students: {
    key: 'students',
    label: 'นักเรียน',
    table: 'students',
    conflict: 'student_id',
    required: ['student_id', 'first_name', 'last_name', 'room_id'],
    fields: [
      'student_id',
      'prefix',
      'first_name',
      'last_name',
      'level',
      'year',
      'room_no',
      'room_id',
      'active',
    ],
    sampleRows: [
      {
        student_id: '68201040001',
        prefix: 'นาย',
        first_name: 'สมชาย',
        last_name: 'ใจดี',
        level: 'ปวช',
        year: '1',
        room_no: '1',
        room_id: 'ปวช1/1',
        active: 'TRUE',
      },
    ],
  },
  users: {
    key: 'users',
    label: 'ครู/ผู้ใช้',
    table: 'app_users',
    conflict: 'teacher_id',
    required: ['teacher_id', 'username', 'pin', 'name', 'role'],
    fields: [
      'teacher_id',
      'username',
      'pin',
      'name',
      'role',
      'room_ids',
      'active',
    ],
    sampleRows: [
      {
        teacher_id: 'T001',
        username: 'teacher01',
        pin: '1234',
        name: 'นายทดสอบ ระบบ',
        role: 'teacher',
        room_ids: 'ปวช1/1',
        active: 'TRUE',
      },
    ],
  },
  rooms: {
    key: 'rooms',
    label: 'ห้องเรียน',
    table: 'rooms',
    conflict: 'room_id',
    required: ['room_id', 'room_name', 'level', 'year', 'room_no', 'schedule_group'],
    fields: [
      'room_id',
      'room_name',
      'level',
      'year',
      'room_no',
      'schedule_group',
    ],
    sampleRows: [
      {
        room_id: 'ปวช1/1',
        room_name: 'ปวช.1/1',
        level: 'ปวช',
        year: '1',
        room_no: '1',
        schedule_group: 'ปวช',
      },
    ],
  },
  attendance: {
    key: 'attendance',
    label: 'ประวัติเช็กชื่อ',
    table: 'attendance',
    conflict: 'att_id',
    required: ['date', 'term_id', 'room_id', 'student_id', 'status'],
    fields: [
      'att_id',
      'date',
      'term_id',
      'week_no',
      'month_key',
      'room_id',
      'student_id',
      'status',
      'checked_by',
      'checked_at',
    ],
    sampleRows: [
      {
        att_id: '',
        date: '2026-05-22',
        term_id: '1/2569',
        week_no: '1',
        month_key: '2026-05',
        room_id: 'ปวช1/1',
        student_id: '68201040001',
        status: 'P',
        checked_by: 'T001',
        checked_at: '2026-05-22T08:00:00+07:00',
      },
    ],
  },
};

export default function AdminImportPage() {
  const fileInputRef = useRef(null);

  const [currentUser, setCurrentUser] = useState(null);
  const [importType, setImportType] = useState('students');
  const [importMode, setImportMode] = useState(IMPORT_MODES.INSERT_ONLY);

  const [rooms, setRooms] = useState([]);
  const [students, setStudents] = useState([]);
  const [users, setUsers] = useState([]);
  const [attendanceRows, setAttendanceRows] = useState([]);
  const [schoolDays, setSchoolDays] = useState([]);

  const [rawRows, setRawRows] = useState([]);
  const [fileName, setFileName] = useState('');

  const [loading, setLoading] = useState(true);
  const [parsing, setParsing] = useState(false);
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
      loadReferenceData();
    } catch {
      localStorage.removeItem('rtc_attendance_user');
      setPageError('ข้อมูลผู้ใช้ไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่');
      setLoading(false);
    }
  }, []);

  const selectedConfig = IMPORT_TYPES[importType];
  const isAttendanceImport = importType === 'attendance';

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
      map.set(cleanText(student.student_id), student);
    });

    return map;
  }, [students]);

  const existingStudentIds = useMemo(() => {
    return new Set(students.map((item) => cleanText(item.student_id)));
  }, [students]);

  const existingTeacherIds = useMemo(() => {
    return new Set(users.map((item) => cleanText(item.teacher_id)));
  }, [users]);

  const existingRoomIds = useMemo(() => {
    return new Set(rooms.map((item) => normalizeRoomId(item.room_id)));
  }, [rooms]);

  const existingAttendanceIds = useMemo(() => {
    return new Set(attendanceRows.map((item) => cleanText(item.att_id)));
  }, [attendanceRows]);

  const schoolDayKeySet = useMemo(() => {
    const set = new Set();

    schoolDays.forEach((day) => {
      set.add(makeSchoolDayKey(day));
    });

    return set;
  }, [schoolDays]);

  const previewRows = useMemo(() => {
    return rawRows.map((row, index) => {
      const normalized = normalizeImportRow(row, selectedConfig);

      const errors = validateRow({
        row: normalized,
        index,
        config: selectedConfig,
        importType,
        roomMap,
        studentMap,
        schoolDayKeySet,
      });

      const duplicateInFile = hasDuplicateInFile(
        rawRows.map((rawRow) => normalizeImportRow(rawRow, selectedConfig)),
        selectedConfig.conflict,
        normalized[selectedConfig.conflict],
        index
      );

      if (duplicateInFile) {
        errors.push(
          `มี ${selectedConfig.conflict} ซ้ำในไฟล์เดียวกัน: ${normalized[selectedConfig.conflict]}`
        );
      }

      const exists = checkExisting({
        importType,
        row: normalized,
        existingStudentIds,
        existingTeacherIds,
        existingRoomIds,
        existingAttendanceIds,
      });

      return {
        rowNo: index + 1,
        data: normalized,
        errors,
        exists,
        status: errors.length > 0 ? 'ERROR' : exists ? 'UPDATE' : 'NEW',
      };
    });
  }, [
    rawRows,
    selectedConfig,
    importType,
    roomMap,
    studentMap,
    schoolDayKeySet,
    existingStudentIds,
    existingTeacherIds,
    existingRoomIds,
    existingAttendanceIds,
  ]);

  const overview = useMemo(() => {
    const total = previewRows.length;
    const error = previewRows.filter((item) => item.status === 'ERROR').length;
    const update = previewRows.filter((item) => item.status === 'UPDATE').length;
    const created = previewRows.filter((item) => item.status === 'NEW').length;
    const ready = total - error;

    const willSave =
      importMode === IMPORT_MODES.INSERT_ONLY
        ? previewRows.filter((item) => item.status === 'NEW').length
        : ready;

    const willSkip =
      importMode === IMPORT_MODES.INSERT_ONLY
        ? previewRows.filter((item) => item.status === 'UPDATE').length
        : 0;

    return {
      total,
      error,
      update,
      created,
      ready,
      willSave,
      willSkip,
    };
  }, [previewRows, importMode]);

  async function loadReferenceData() {
    try {
      setLoading(true);
      setPageError('');
      setSuccessMessage('');

      const [roomData, studentData, userData, attendanceData, schoolDayData] =
        await Promise.all([
          fetchAllRows((from, to) =>
            supabase
              .from('rooms')
              .select('*')
              .order('room_id', { ascending: true })
              .range(from, to)
          ),
          fetchAllRows((from, to) =>
            supabase
              .from('students')
              .select('*')
              .order('student_id', { ascending: true })
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
              .from('attendance')
              .select('*')
              .order('date', { ascending: false })
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
        ]);

      setRooms(roomData || []);
      setStudents(studentData || []);
      setUsers(userData || []);
      setAttendanceRows(attendanceData || []);
      setSchoolDays(schoolDayData || []);
    } catch (err) {
      setPageError(err.message || 'โหลดข้อมูลอ้างอิงไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }

  function changeImportType(nextType) {
    setImportType(nextType);
    setImportMode(IMPORT_MODES.INSERT_ONLY);
    setRawRows([]);
    setFileName('');
    setPageError('');
    setSuccessMessage('');

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0];

    if (!file) return;

    try {
      setParsing(true);
      setPageError('');
      setSuccessMessage('');
      setRawRows([]);
      setFileName(file.name);

      const lowerName = file.name.toLowerCase();

      let rows = [];

      if (lowerName.endsWith('.csv')) {
        const text = await file.text();
        rows = parseCsvToObjects(text);
      } else if (lowerName.endsWith('.xlsx')) {
        rows = await parseXlsxToObjects(file);
      } else {
        throw new Error('รองรับเฉพาะไฟล์ .csv หรือ .xlsx เท่านั้น');
      }

      if (rows.length === 0) {
        throw new Error('ไม่พบข้อมูลในไฟล์ หรือไฟล์ไม่มีแถวข้อมูล');
      }

      setRawRows(rows);
      setSuccessMessage(`อ่านไฟล์สำเร็จ พบข้อมูล ${rows.length} แถว`);
    } catch (err) {
      setPageError(err.message || 'อ่านไฟล์ไม่สำเร็จ');
    } finally {
      setParsing(false);
    }
  }

  function clearImport() {
    setRawRows([]);
    setFileName('');
    setPageError('');
    setSuccessMessage('');

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  async function saveImportRows() {
    try {
      setSaving(true);
      setPageError('');
      setSuccessMessage('');

      if (previewRows.length === 0) {
        throw new Error('ยังไม่มีข้อมูลสำหรับบันทึก');
      }

      if (overview.error > 0) {
        throw new Error('ยังมีรายการผิดพลาด กรุณาแก้ไฟล์แล้วอัปโหลดใหม่ก่อนบันทึก');
      }

      const rowsToSave =
        importMode === IMPORT_MODES.INSERT_ONLY
          ? previewRows
              .filter((item) => item.status === 'NEW')
              .map((item) => prepareRowForSave(item.data, importType))
          : previewRows.map((item) => prepareRowForSave(item.data, importType));

      if (rowsToSave.length === 0) {
        throw new Error('ไม่มีรายการใหม่สำหรับบันทึก เพราะรายการทั้งหมดมีอยู่ในระบบแล้ว');
      }

      const ok = window.confirm(
        [
          `ต้องการนำเข้า${selectedConfig.label}ใช่ไหม?`,
          '',
          `ไฟล์: ${fileName || '-'}`,
          `ทั้งหมดในไฟล์: ${overview.total} รายการ`,
          `เพิ่มใหม่: ${overview.created} รายการ`,
          `พบรายการเดิม: ${overview.update} รายการ`,
          `จะบันทึกจริง: ${rowsToSave.length} รายการ`,
          importMode === IMPORT_MODES.INSERT_ONLY
            ? `โหมด: เพิ่มเฉพาะรายการใหม่ / ข้ามรายการเดิม ${overview.willSkip} รายการ`
            : 'โหมด: เพิ่มใหม่ + อัปเดตข้อมูลเดิม / รายการเดิมจะถูกทับ',
          '',
          importMode === IMPORT_MODES.UPSERT
            ? 'คำเตือน: โหมดนี้สามารถทับข้อมูลเดิมได้'
            : 'โหมดนี้จะไม่ทับข้อมูลเดิม',
        ].join('\n')
      );

      if (!ok) return;

      if (importMode === IMPORT_MODES.INSERT_ONLY) {
        for (const chunk of chunkArray(rowsToSave, 200)) {
          const { error } = await supabase.from(selectedConfig.table).insert(chunk);

          if (error) throw new Error(error.message);
        }
      } else {
        for (const chunk of chunkArray(rowsToSave, 200)) {
          const { error } = await supabase.from(selectedConfig.table).upsert(chunk, {
            onConflict: selectedConfig.conflict,
          });

          if (error) throw new Error(error.message);
        }
      }

      setSuccessMessage(
        `Import ${selectedConfig.label} สำเร็จ ${rowsToSave.length} รายการ`
      );

      await loadReferenceData();
    } catch (err) {
      setPageError(err.message || 'บันทึกข้อมูลไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  function downloadTemplate() {
    const rows = selectedConfig.sampleRows;
    const csv = objectsToCsv(rows, selectedConfig.fields);
    const blob = new Blob([csv], {
      type: 'text/csv;charset=utf-8;',
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');

    a.href = url;
    a.download = `template-${selectedConfig.key}.csv`;
    a.click();

    URL.revokeObjectURL(url);
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
        <AppNav currentUser={currentUser} active="admin-import" />

        <section className="mb-4 rounded-3xl bg-white p-4 shadow-sm sm:mb-6 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-2xl font-black text-slate-800 sm:text-3xl">
                Import Excel/CSV
              </h1>
              <p className="mt-1 text-sm text-slate-500 sm:text-base">
                นำเข้าข้อมูลนักเรียน ครู ห้องเรียน และประวัติเช็กชื่อ พร้อม Preview ก่อนบันทึกจริง
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={downloadTemplate}
                className="rounded-full bg-blue-100 px-4 py-2 text-sm font-bold text-blue-700 hover:bg-blue-200"
              >
                ดาวน์โหลด Template
              </button>

              <button
                onClick={loadReferenceData}
                disabled={loading}
                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700 disabled:opacity-50"
              >
                โหลดข้อมูลอ้างอิงใหม่
              </button>

              <button
                onClick={() => (window.location.href = '/admin-health')}
                className="rounded-full bg-emerald-100 px-4 py-2 text-sm font-bold text-emerald-700 hover:bg-emerald-200"
              >
                ไปตรวจสุขภาพข้อมูล
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

        <section className="mb-4 grid grid-cols-2 gap-3 sm:mb-6 lg:grid-cols-6 lg:gap-4">
          <StatCard title="ทั้งหมด" value={overview.total} unit="แถว" />
          <StatCard title="พร้อมบันทึก" value={overview.ready} unit="แถว" tone="green" />
          <StatCard title="เพิ่มใหม่" value={overview.created} unit="แถว" tone="blue" />
          <StatCard title="พบรายการเดิม" value={overview.update} unit="แถว" tone="amber" />
          <StatCard title="จะบันทึกจริง" value={overview.willSave} unit="แถว" tone="green" />
          <StatCard title="ผิดพลาด" value={overview.error} unit="แถว" tone="red" />
        </section>

        <section className="mb-4 grid gap-4 lg:grid-cols-[380px_1fr]">
          <section className="space-y-4">
            <section className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
              <h2 className="text-xl font-black text-slate-800">ตั้งค่าการ Import</h2>
              <p className="mt-1 text-sm text-slate-500">
                เลือกชนิดข้อมูล แล้วอัปโหลดไฟล์ .csv หรือ .xlsx
              </p>

              <div className="mt-4 grid gap-2">
                {Object.values(IMPORT_TYPES).map((item) => (
                  <button
                    key={item.key}
                    onClick={() => changeImportType(item.key)}
                    className={`rounded-2xl border px-4 py-3 text-left transition ${
                      importType === item.key
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="font-black">{item.label}</div>
                    <div
                      className={`mt-1 text-xs ${
                        importType === item.key ? 'text-slate-200' : 'text-slate-500'
                      }`}
                    >
                      ตาราง: {item.table} · key: {item.conflict}
                    </div>
                  </button>
                ))}
              </div>

              <div className="mt-5 rounded-2xl bg-slate-50 p-4">
                <div className="text-sm font-black text-slate-800">
                  โหมดการบันทึก
                </div>

                <div className="mt-3 grid gap-2">
                  <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-white p-3 text-sm text-slate-700">
                    <input
                      type="radio"
                      name="importMode"
                      checked={importMode === IMPORT_MODES.INSERT_ONLY}
                      onChange={() => setImportMode(IMPORT_MODES.INSERT_ONLY)}
                      className="mt-1"
                    />
                    <span>
                      <span className="block font-black">เพิ่มเฉพาะรายการใหม่</span>
                      <span className="text-xs text-slate-500">
                        ปลอดภัยสุด ถ้า key เดิมมีอยู่แล้วจะข้าม ไม่ทับข้อมูลเก่า
                      </span>
                    </span>
                  </label>

                  <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-white p-3 text-sm text-slate-700">
                    <input
                      type="radio"
                      name="importMode"
                      checked={importMode === IMPORT_MODES.UPSERT}
                      onChange={() => setImportMode(IMPORT_MODES.UPSERT)}
                      className="mt-1"
                    />
                    <span>
                      <span className="block font-black text-red-700">
                        เพิ่มใหม่ + อัปเดตข้อมูลเดิม
                      </span>
                      <span className="text-xs text-slate-500">
                        ถ้า key เดิมมีอยู่แล้ว จะเขียนทับข้อมูลเดิม
                      </span>
                    </span>
                  </label>
                </div>
              </div>

              {isAttendanceImport && (
                <div className="mt-5 rounded-2xl bg-amber-50 p-4 text-xs text-amber-800">
                  <div className="font-black">Import attendance</div>
                  <div className="mt-1">
                    ถ้าไฟล์ไม่มี att_id ระบบจะสร้างจาก date + room_id + student_id ให้อัตโนมัติ
                    เช่น 2026-05-22_ปวช1/1_68201040001
                  </div>
                </div>
              )}

              <div className="mt-5">
                <label className="mb-2 block text-sm font-black text-slate-700">
                  เลือกไฟล์
                </label>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx"
                  onChange={handleFileChange}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                />

                <div className="mt-2 text-xs text-slate-500">
                  {fileName ? `ไฟล์ที่เลือก: ${fileName}` : 'ยังไม่ได้เลือกไฟล์'}
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2">
                <button
                  onClick={saveImportRows}
                  disabled={
                    loading ||
                    parsing ||
                    saving ||
                    previewRows.length === 0 ||
                    overview.error > 0 ||
                    overview.willSave === 0
                  }
                  className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {saving ? 'กำลังบันทึก...' : 'บันทึกเข้าระบบ'}
                </button>

                <button
                  onClick={clearImport}
                  disabled={parsing || saving}
                  className="rounded-2xl bg-slate-200 px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-300 disabled:opacity-50"
                >
                  ล้างข้อมูล
                </button>
              </div>
            </section>

            <section className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
              <h2 className="text-xl font-black text-slate-800">หัวตารางที่ต้องใช้</h2>
              <p className="mt-1 text-sm text-slate-500">
                ชื่อคอลัมน์ในไฟล์ต้องตรงกับรายการนี้
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                {selectedConfig.fields.map((field) => {
                  const required = selectedConfig.required.includes(field);

                  return (
                    <span
                      key={field}
                      className={`rounded-full px-3 py-1 text-xs font-black ${
                        required
                          ? 'bg-red-100 text-red-700'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {field}
                      {required ? ' *' : ''}
                    </span>
                  );
                })}
              </div>

              <div className="mt-4 rounded-2xl bg-amber-50 p-4 text-xs text-amber-800">
                <div className="font-black">หมายเหตุ</div>
                <div className="mt-1">
                  ช่องที่มี * จำเป็นต้องมีข้อมูล ถ้าเลือกโหมดอัปเดต รายการ key เดิมจะถูกเขียนทับ
                </div>
              </div>
            </section>
          </section>

          <section className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-black text-slate-800">
                  Preview ข้อมูล
                </h2>
                <p className="text-sm text-slate-500">
                  ตรวจสอบก่อนบันทึกจริงลง Supabase
                </p>
              </div>

              <div className="text-sm font-bold text-slate-500">
                {parsing ? 'กำลังอ่านไฟล์...' : `${previewRows.length} แถว`}
              </div>
            </div>

            {loading ? (
              <div className="rounded-2xl bg-slate-50 p-8 text-center text-slate-500">
                กำลังโหลดข้อมูลอ้างอิง...
              </div>
            ) : parsing ? (
              <div className="rounded-2xl bg-slate-50 p-8 text-center text-slate-500">
                กำลังอ่านไฟล์...
              </div>
            ) : (
              <>
                <PreviewMobileCards rows={previewRows} config={selectedConfig} />
                <PreviewDesktopTable rows={previewRows} config={selectedConfig} />
              </>
            )}
          </section>
        </section>
      </div>
    </main>
  );
}

function PreviewMobileCards({ rows, config }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl bg-slate-50 p-8 text-center text-slate-500 md:hidden">
        ยังไม่มีข้อมูล Preview
      </div>
    );
  }

  return (
    <div className="space-y-3 md:hidden">
      {rows.map((item) => (
        <div
          key={`${item.rowNo}_${item.status}_${item.data[config.conflict]}`}
          className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-bold text-slate-400">
                แถวที่ {item.rowNo}
              </div>
              <div className="text-base font-black text-slate-800">
                {item.data[config.conflict] || '-'}
              </div>
            </div>

            <StatusBadge status={item.status} />
          </div>

          <div className="grid gap-1 rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">
            {config.fields.slice(0, 10).map((field) => (
              <div key={field}>
                <span className="font-black text-slate-800">{field}: </span>
                {String(item.data[field] || '-')}
              </div>
            ))}
          </div>

          {item.errors.length > 0 && (
            <div className="mt-3 rounded-2xl bg-red-50 p-3 text-xs text-red-700">
              {item.errors.map((error) => (
                <div key={error}>• {error}</div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function PreviewDesktopTable({ rows, config }) {
  return (
    <div
      className="hidden max-w-full overflow-x-auto rounded-2xl border border-slate-200 md:block"
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
      <table className="min-w-[1100px] w-full border-collapse bg-white text-sm">
        <thead className="bg-slate-900 text-white">
          <tr>
            <th className="whitespace-nowrap px-4 py-3 text-center">แถว</th>
            <th className="whitespace-nowrap px-4 py-3 text-center">สถานะ</th>
            {config.fields.map((field) => (
              <th key={field} className="whitespace-nowrap px-4 py-3 text-left">
                {field}
              </th>
            ))}
            <th className="whitespace-nowrap px-4 py-3 text-left">ข้อผิดพลาด</th>
          </tr>
        </thead>

        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={config.fields.length + 3}
                className="px-4 py-8 text-center text-slate-500"
              >
                ยังไม่มีข้อมูล Preview
              </td>
            </tr>
          ) : (
            rows.map((item) => (
              <tr
                key={`${item.rowNo}_${item.status}_${item.data[config.conflict]}`}
                className={`border-b border-slate-100 last:border-b-0 ${
                  item.status === 'ERROR' ? 'bg-red-50/40' : 'hover:bg-slate-50'
                }`}
              >
                <td className="whitespace-nowrap px-4 py-3 text-center font-bold text-slate-500">
                  {item.rowNo}
                </td>

                <td className="whitespace-nowrap px-4 py-3 text-center">
                  <StatusBadge status={item.status} />
                </td>

                {config.fields.map((field) => (
                  <td key={field} className="whitespace-nowrap px-4 py-3 text-slate-700">
                    {String(item.data[field] || '-')}
                  </td>
                ))}

                <td className="min-w-[260px] px-4 py-3 text-red-700">
                  {item.errors.length > 0
                    ? item.errors.map((error) => <div key={error}>• {error}</div>)
                    : '-'}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }) {
  if (status === 'ERROR') {
    return (
      <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-black text-red-700">
        ผิดพลาด
      </span>
    );
  }

  if (status === 'UPDATE') {
    return (
      <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-700">
        พบรายการเดิม
      </span>
    );
  }

  return (
    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700">
      เพิ่มใหม่
    </span>
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

async function parseXlsxToObjects(file) {
  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();

  await workbook.xlsx.load(buffer);

  const worksheet = workbook.worksheets[0];

  if (!worksheet) {
    throw new Error('ไม่พบ Sheet ในไฟล์ Excel');
  }

  const headerRow = worksheet.getRow(1);
  const headers = [];

  headerRow.eachCell((cell, colNumber) => {
    headers[colNumber] = normalizeHeader(getCellText(cell));
  });

  const rows = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const objectRow = {};
    let hasValue = false;

    headers.forEach((header, colNumber) => {
      if (!header) return;

      const value = getCellText(row.getCell(colNumber));

      if (value !== '') hasValue = true;

      objectRow[header] = value;
    });

    if (hasValue) rows.push(objectRow);
  });

  return rows;
}

function parseCsvToObjects(text) {
  const rows = parseCsv(text);

  if (rows.length < 2) return [];

  const headers = rows[0].map((header) => normalizeHeader(header));

  return rows
    .slice(1)
    .map((row) => {
      const objectRow = {};
      let hasValue = false;

      headers.forEach((header, index) => {
        if (!header) return;

        const value = cleanText(row[index]);

        if (value !== '') hasValue = true;

        objectRow[header] = value;
      });

      return hasValue ? objectRow : null;
    })
    .filter(Boolean);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let insideQuotes = false;

  const input = String(text || '').replace(/^\uFEFF/, '');

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    const next = input[i + 1];

    if (char === '"' && insideQuotes && next === '"') {
      cell += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      insideQuotes = !insideQuotes;
      continue;
    }

    if (char === ',' && !insideQuotes) {
      row.push(cell);
      cell = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !insideQuotes) {
      if (char === '\r' && next === '\n') i += 1;

      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    cell += char;
  }

  row.push(cell);
  rows.push(row);

  return rows.filter((item) => item.some((cellValue) => cleanText(cellValue) !== ''));
}

function normalizeImportRow(row, config) {
  const normalized = {};

  config.fields.forEach((field) => {
    normalized[field] = cleanText(row[field]);
  });

  if ('active' in normalized) {
    normalized.active = normalizeActive(normalized.active);
  }

  if (config.key === 'students') {
    normalized.room_id = cleanText(normalized.room_id);
    normalized.level = normalized.level || inferLevelFromRoomId(normalized.room_id);
    normalized.year = normalized.year || inferYearFromRoomId(normalized.room_id);
    normalized.room_no = normalized.room_no || inferRoomNoFromRoomId(normalized.room_id);
  }

  if (config.key === 'users') {
    normalized.role = cleanText(normalized.role || 'teacher').toLowerCase();
    normalized.room_ids = cleanText(normalized.room_ids);
  }

  if (config.key === 'rooms') {
    normalized.room_id = cleanText(normalized.room_id);
    normalized.level = normalized.level || inferLevelFromRoomId(normalized.room_id);
    normalized.year = normalized.year || inferYearFromRoomId(normalized.room_id);
    normalized.room_no = normalized.room_no || inferRoomNoFromRoomId(normalized.room_id);
    normalized.schedule_group =
      normalized.schedule_group || inferScheduleGroupFromRoom(normalized);
  }

  if (config.key === 'attendance') {
    normalized.date = normalizeDate(normalized.date);
    normalized.term_id = cleanText(normalized.term_id);
    normalized.room_id = cleanText(normalized.room_id);
    normalized.student_id = cleanText(normalized.student_id);
    normalized.status = normalizeAttendanceStatus(normalized.status);
    normalized.week_no = cleanText(normalized.week_no);
    normalized.month_key = cleanText(normalized.month_key) || getMonthKey(normalized.date);
    normalized.checked_by = cleanText(normalized.checked_by);
    normalized.checked_at = cleanText(normalized.checked_at) || new Date().toISOString();

    normalized.att_id =
      cleanText(normalized.att_id) ||
      buildAttendanceId(normalized.date, normalized.room_id, normalized.student_id);
  }

  return normalized;
}

function validateRow({
  row,
  config,
  importType,
  roomMap,
  studentMap,
  schoolDayKeySet,
}) {
  const errors = [];

  config.required.forEach((field) => {
    if (!cleanText(row[field])) {
      errors.push(`ช่องจำเป็นว่าง: ${field}`);
    }
  });

  if (importType === 'students') {
    if (row.room_id && !roomMap.has(normalizeRoomId(row.room_id))) {
      errors.push(`ไม่พบ room_id ในตาราง rooms: ${row.room_id}`);
    }
  }

  if (importType === 'users') {
    if (!['admin', 'teacher'].includes(cleanText(row.role).toLowerCase())) {
      errors.push('role ต้องเป็น admin หรือ teacher');
    }

    if (cleanText(row.role).toLowerCase() === 'teacher') {
      const roomIds = parseRoomIds(row.room_ids);

      if (roomIds.length === 0) {
        errors.push('ครูต้องมี room_ids หรือใส่ รอจัดห้อง');
      }

      roomIds.forEach((roomId) => {
        if (
          roomId &&
          roomId !== 'รอจัดห้อง' &&
          roomId.toUpperCase() !== 'ALL' &&
          !roomMap.has(normalizeRoomId(roomId))
        ) {
          errors.push(`ไม่พบห้องใน rooms: ${roomId}`);
        }
      });
    }
  }

  if (importType === 'rooms') {
    if (!['ปวช', 'ปวส', 'ปวส_ม6'].includes(row.schedule_group)) {
      errors.push('schedule_group ต้องเป็น ปวช, ปวส หรือ ปวส_ม6');
    }
  }

  if (importType === 'attendance') {
    if (row.date && !/^\d{4}-\d{2}-\d{2}$/.test(row.date)) {
      errors.push('date ต้องเป็นรูปแบบ YYYY-MM-DD เช่น 2026-05-22');
    }

    if (row.status && !['P', 'A'].includes(row.status)) {
      errors.push('status ต้องเป็น P หรือ A เท่านั้น');
    }

    if (row.student_id && !studentMap.has(cleanText(row.student_id))) {
      errors.push(`ไม่พบ student_id ในตาราง students: ${row.student_id}`);
    }

    if (row.room_id && !roomMap.has(normalizeRoomId(row.room_id))) {
      errors.push(`ไม่พบ room_id ในตาราง rooms: ${row.room_id}`);
    }

    const room = roomMap.get(normalizeRoomId(row.room_id));

    if (row.date && row.term_id && room?.schedule_group) {
      const schoolDayKey = [
        row.date,
        row.term_id,
        cleanText(room.schedule_group),
      ].join('|');

      if (!schoolDayKeySet.has(schoolDayKey)) {
        errors.push(
          `ไม่พบวันเข้าแถวใน school_days: ${row.date} / ${row.term_id} / ${room.schedule_group}`
        );
      }
    }
  }

  return errors;
}

function prepareRowForSave(row, importType) {
  if (importType === 'students') {
    return {
      student_id: cleanText(row.student_id),
      prefix: cleanText(row.prefix),
      first_name: cleanText(row.first_name),
      last_name: cleanText(row.last_name),
      level: cleanText(row.level),
      year: cleanText(row.year),
      room_no: cleanText(row.room_no),
      room_id: cleanText(row.room_id),
      active: normalizeActive(row.active),
    };
  }

  if (importType === 'users') {
    return {
      teacher_id: cleanText(row.teacher_id),
      username: cleanText(row.username),
      pin: cleanText(row.pin),
      name: cleanText(row.name),
      role: cleanText(row.role).toLowerCase(),
      room_ids:
        cleanText(row.role).toLowerCase() === 'admin'
          ? 'ALL'
          : cleanText(row.room_ids),
      active: normalizeActive(row.active),
    };
  }

  if (importType === 'attendance') {
    return {
      att_id: cleanText(row.att_id) || buildAttendanceId(row.date, row.room_id, row.student_id),
      date: normalizeDate(row.date),
      term_id: cleanText(row.term_id),
      week_no: cleanText(row.week_no),
      month_key: cleanText(row.month_key) || getMonthKey(row.date),
      room_id: cleanText(row.room_id),
      student_id: cleanText(row.student_id),
      status: normalizeAttendanceStatus(row.status),
      checked_by: cleanText(row.checked_by),
      checked_at: cleanText(row.checked_at) || new Date().toISOString(),
    };
  }

  return {
    room_id: cleanText(row.room_id),
    room_name: cleanText(row.room_name),
    level: cleanText(row.level),
    year: cleanText(row.year),
    room_no: cleanText(row.room_no),
    schedule_group: cleanText(row.schedule_group),
  };
}

function checkExisting({
  importType,
  row,
  existingStudentIds,
  existingTeacherIds,
  existingRoomIds,
  existingAttendanceIds,
}) {
  if (importType === 'students') {
    return existingStudentIds.has(cleanText(row.student_id));
  }

  if (importType === 'users') {
    return existingTeacherIds.has(cleanText(row.teacher_id));
  }

  if (importType === 'attendance') {
    return existingAttendanceIds.has(cleanText(row.att_id));
  }

  return existingRoomIds.has(normalizeRoomId(row.room_id));
}

function hasDuplicateInFile(rows, keyField, keyValue, currentIndex) {
  const normalizedKey = cleanText(keyValue);

  if (!normalizedKey) return false;

  return rows.some((row, index) => {
    if (index === currentIndex) return false;

    return cleanText(row[keyField]) === normalizedKey;
  });
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

function getCellText(cell) {
  const value = cell?.value;

  if (value === null || value === undefined) return '';

  if (value instanceof Date) {
    return formatDateObjectToYmd(value);
  }

  if (typeof value === 'object') {
    if ('text' in value) return cleanText(value.text);
    if ('result' in value) return cleanText(value.result);
    if ('richText' in value && Array.isArray(value.richText)) {
      return cleanText(value.richText.map((item) => item.text || '').join(''));
    }
  }

  return cleanText(value);
}

function normalizeHeader(value) {
  return cleanText(value).toLowerCase();
}

function cleanText(value) {
  if (value === null || value === undefined) return '';

  return String(value).trim();
}

function normalizeActive(value) {
  const text = cleanText(value).toUpperCase();

  if (!text) return 'TRUE';

  if (['FALSE', '0', 'NO', 'N', 'ไม่ใช้งาน', 'ปิด'].includes(text)) {
    return 'FALSE';
  }

  return 'TRUE';
}

function normalizeAttendanceStatus(value) {
  const text = cleanText(value).toUpperCase();

  if (['P', 'มา', 'มาเรียน', 'PRESENT', 'TRUE', '1'].includes(text)) {
    return 'P';
  }

  if (['A', 'ขาด', 'ABSENT', 'FALSE', '0'].includes(text)) {
    return 'A';
  }

  return text;
}

function parseRoomIds(roomIdsText) {
  const text = cleanText(roomIdsText);

  if (!text) return [];

  if (text.toUpperCase() === 'ALL') return ['ALL'];

  return text
    .split(/[,;|\s]+/)
    .map((item) => cleanText(item))
    .filter(Boolean);
}

function normalizeRoomId(value) {
  return cleanText(value)
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .replace(/\./g, '')
    .replace(/-/g, '/');
}

function inferLevelFromRoomId(roomId) {
  const text = normalizeRoomId(roomId);

  if (text.includes('ปวส')) return 'ปวส';
  if (text.includes('ปวช')) return 'ปวช';

  return '';
}

function inferYearFromRoomId(roomId) {
  const text = normalizeRoomId(roomId);
  const match = text.match(/(ปวช|ปวส)(\d)/);

  return match?.[2] || '';
}

function inferRoomNoFromRoomId(roomId) {
  const text = normalizeRoomId(roomId);
  const match = text.match(/\/(\d+)$/);

  return match?.[1] || '';
}

function inferScheduleGroupFromRoom(row) {
  const level = cleanText(row.level);
  const year = cleanText(row.year);
  const roomNo = cleanText(row.room_no);

  if (level === 'ปวช') return 'ปวช';
  if (level === 'ปวส' && year === '1' && roomNo === '1') return 'ปวส_ม6';
  if (level === 'ปวส') return 'ปวส';

  return '';
}

function makeSchoolDayKey(day) {
  return [
    normalizeDate(day.date),
    cleanText(day.term_id),
    cleanText(day.schedule_group),
  ].join('|');
}

function normalizeDate(value) {
  const text = cleanText(value);

  if (!text) return '';

  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    return text.slice(0, 10);
  }

  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(text)) {
    const [dayText, monthText, yearText] = text.split('/');
    let year = Number(yearText);

    if (year > 2400) year -= 543;

    return `${year}-${String(monthText).padStart(2, '0')}-${String(dayText).padStart(2, '0')}`;
  }

  return text.slice(0, 10);
}

function getMonthKey(ymd) {
  const date = normalizeDate(ymd);

  if (!date || date.length < 7) return '';

  return date.slice(0, 7);
}

function buildAttendanceId(date, roomId, studentId) {
  const safeDate = normalizeDate(date);
  const safeRoomId = cleanText(roomId);
  const safeStudentId = cleanText(studentId);

  if (!safeDate || !safeRoomId || !safeStudentId) return '';

  return `${safeDate}_${safeRoomId}_${safeStudentId}`;
}

function formatDateObjectToYmd(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');

  return `${yyyy}-${mm}-${dd}`;
}

function chunkArray(array, size) {
  const chunks = [];

  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }

  return chunks;
}

function objectsToCsv(rows, fields) {
  const header = fields.join(',');
  const body = rows
    .map((row) =>
      fields
        .map((field) => {
          const value = String(row[field] ?? '');

          return `"${value.replace(/"/g, '""')}"`;
        })
        .join(',')
    )
    .join('\n');

  return `\uFEFF${header}\n${body}`;
}