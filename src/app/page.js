'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import AppNav from '@/components/AppNav';

const LOGO_SRC = '/brand/logo-ep.png';

export default function Home() {
  const [currentUser, setCurrentUser] = useState(null);

  const [loginForm, setLoginForm] = useState({
    username: '',
    pin: '',
  });

  const [loginError, setLoginError] = useState('');
  const [loadingLogin, setLoadingLogin] = useState(false);

  const [rooms, setRooms] = useState([]);
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [selectedDate, setSelectedDate] = useState(getTodayYmd());

  const [students, setStudents] = useState([]);
  const [attendanceMap, setAttendanceMap] = useState({});
  const [schoolDayInfo, setSchoolDayInfo] = useState(null);
  const [studentStatsMap, setStudentStatsMap] = useState({});
  const [selectedStudentHistory, setSelectedStudentHistory] = useState(null);

  const [searchText, setSearchText] = useState('');
  const [loadingData, setLoadingData] = useState(false);
  const [saving, setSaving] = useState(false);

  const [pageError, setPageError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    const savedUser = localStorage.getItem('rtc_attendance_user');

    if (savedUser) {
      try {
        setCurrentUser(JSON.parse(savedUser));
      } catch {
        localStorage.removeItem('rtc_attendance_user');
      }
    }
  }, []);

  useEffect(() => {
    if (currentUser) {
      loadRooms(currentUser);
    }
  }, [currentUser]);

  useEffect(() => {
    if (currentUser && selectedRoomId && selectedDate) {
      loadAttendancePage(selectedRoomId, selectedDate);
    }
  }, [currentUser, selectedRoomId, selectedDate]);

  const selectedRoom = useMemo(() => {
    return rooms.find((room) => room.room_id === selectedRoomId) || null;
  }, [rooms, selectedRoomId]);

  const filteredStudents = useMemo(() => {
    const keyword = String(searchText || '').trim().toLowerCase();

    if (!keyword) return students;

    return students.filter((student) => {
      const text = [
        student.student_id,
        student.prefix,
        student.first_name,
        student.last_name,
        student.level,
        student.year,
        student.room_no,
        student.room_id,
      ]
        .join(' ')
        .toLowerCase();

      return text.includes(keyword);
    });
  }, [students, searchText]);

  const summary = useMemo(() => {
    const total = students.length;
    let present = 0;
    let absent = 0;
    let notSaved = 0;

    students.forEach((student) => {
      const status = attendanceMap[String(student.student_id)] || '';

      if (status === 'P') present += 1;
      else if (status === 'A') absent += 1;
      else notSaved += 1;
    });

    return {
      total,
      present,
      absent,
      notSaved,
      presentPercent: total > 0 ? ((present / total) * 100).toFixed(2) : '0.00',
      absentPercent: total > 0 ? ((absent / total) * 100).toFixed(2) : '0.00',
      savedCount: present + absent,
    };
  }, [students, attendanceMap]);

  async function handleLogin(event) {
    event.preventDefault();

    try {
      setLoadingLogin(true);
      setLoginError('');

      const username = String(loginForm.username || '').trim();
      const pin = String(loginForm.pin || '').trim();

      if (!username || !pin) {
        throw new Error('กรุณากรอก Username และ PIN');
      }

      const { data, error } = await supabase
        .from('app_users')
        .select('*')
        .eq('username', username)
        .eq('pin', pin)
        .limit(1)
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!data) throw new Error('Username หรือ PIN ไม่ถูกต้อง');
      if (!isActiveValue(data.active)) throw new Error('บัญชีนี้ถูกปิดใช้งาน');

      const user = {
        teacher_id: data.teacher_id,
        username: data.username,
        name: data.name,
        role: data.role,
        room_ids: data.room_ids,
        active: data.active,
      };

      localStorage.setItem('rtc_attendance_user', JSON.stringify(user));
      setCurrentUser(user);
    } catch (err) {
      setLoginError(err.message || 'เข้าสู่ระบบไม่สำเร็จ');
    } finally {
      setLoadingLogin(false);
    }
  }

  function logout() {
    localStorage.removeItem('rtc_attendance_user');
    setCurrentUser(null);
    setRooms([]);
    setStudents([]);
    setAttendanceMap({});
    setSchoolDayInfo(null);
    setStudentStatsMap({});
    setSelectedStudentHistory(null);
    setSelectedRoomId('');
    setSearchText('');
    setPageError('');
    setSuccessMessage('');
    setLoginForm({
      username: '',
      pin: '',
    });
  }

  async function loadRooms(user) {
    try {
      setPageError('');
      setSuccessMessage('');
      setLoadingData(true);

      let query = supabase
        .from('rooms')
        .select('*')
        .order('level', { ascending: true })
        .order('year', { ascending: true })
        .order('room_no', { ascending: true })
        .order('room_id', { ascending: true });

      const isAdmin = String(user.role || '').toLowerCase() === 'admin';
      const roomIds = parseRoomIds(user.room_ids);

      if (!isAdmin && !roomIds.includes('ALL')) {
        query = query.in('room_id', roomIds);
      }

      const { data, error } = await query;

      if (error) throw new Error(error.message);

      const roomList = data || [];
      setRooms(roomList);

      if (roomList.length > 0) {
        setSelectedRoomId(roomList[0].room_id);
      } else {
        setSelectedRoomId('');
      }
    } catch (err) {
      setPageError(err.message || 'โหลดห้องเรียนไม่สำเร็จ');
    } finally {
      setLoadingData(false);
    }
  }

  async function loadAttendancePage(roomId, dateText) {
    try {
      setPageError('');
      setSuccessMessage('');
      setLoadingData(true);
      setSearchText('');
      setSelectedStudentHistory(null);

      const room = rooms.find((item) => item.room_id === roomId) || null;

      const { data: studentData, error: studentError } = await supabase
        .from('students')
        .select('*')
        .eq('room_id', roomId)
        .order('student_id', { ascending: true });

      if (studentError) throw new Error(studentError.message);

      const activeStudents = (studentData || []).filter((student) =>
        isActiveValue(student.active)
      );

      const dayInfo = await fetchSchoolDayInfo(room, dateText);

      const { data: attendanceData, error: attendanceError } = await supabase
        .from('attendance')
        .select('*')
        .eq('room_id', roomId)
        .eq('date', dateText);

      if (attendanceError) throw new Error(attendanceError.message);

      const nextMap = {};

      (attendanceData || []).forEach((item) => {
        nextMap[String(item.student_id)] = normalizeStatus(item.status);
      });

      const statsMap = await buildStudentStats({
        activeStudents,
        room,
        termId: dayInfo.term_id || '',
        roomId,
      });

      setStudents(activeStudents);
      setAttendanceMap(nextMap);
      setSchoolDayInfo(dayInfo);
      setStudentStatsMap(statsMap);
    } catch (err) {
      setStudents([]);
      setAttendanceMap({});
      setSchoolDayInfo(null);
      setStudentStatsMap({});
      setSelectedStudentHistory(null);
      setPageError(err.message || 'โหลดข้อมูลเช็กชื่อไม่สำเร็จ');
    } finally {
      setLoadingData(false);
    }
  }

  async function buildStudentStats({ activeStudents, room, termId, roomId }) {
    const statsMap = {};
    const studentIds = (activeStudents || []).map((student) =>
      String(student.student_id)
    );

    if (!room?.schedule_group || !termId || studentIds.length === 0) {
      studentIds.forEach((studentId) => {
        statsMap[studentId] = createEmptyStudentStat();
      });
      return statsMap;
    }

    const { data: schoolDayRows, error: schoolDayError } = await supabase
      .from('school_days')
      .select('date, term_id, week_no, month_key, note, is_lineup_day, schedule_group')
      .eq('term_id', termId)
      .eq('schedule_group', room.schedule_group)
      .order('date', { ascending: true });

    if (schoolDayError) throw new Error(schoolDayError.message);

    const roomExceptions = await fetchRoomLineupExceptions(roomId, termId);
    const effectiveLineupDateSet = new Set();

    (schoolDayRows || []).forEach((day) => {
      const effectiveDay = applyRoomExceptionToSchoolDay({
        schoolDay: day,
        roomExceptions,
      });

      if (String(effectiveDay.is_lineup_day).toUpperCase() === 'TRUE') {
        effectiveLineupDateSet.add(String(effectiveDay.date || '').slice(0, 10));
      }
    });

    const totalRequiredDays = effectiveLineupDateSet.size;
    const allowedAbsentDays = Math.floor(totalRequiredDays * 0.4);

    studentIds.forEach((studentId) => {
      statsMap[studentId] = {
        totalRequiredDays,
        allowedAbsentDays,
        presentCount: 0,
        absentCount: 0,
        absentHistory: [],
      };
    });

    const { data: termAttendanceRows, error: termAttendanceError } = await supabase
      .from('attendance')
      .select('*')
      .eq('room_id', roomId)
      .eq('term_id', termId)
      .in('student_id', studentIds)
      .order('date', { ascending: true });

    if (termAttendanceError) throw new Error(termAttendanceError.message);

    (termAttendanceRows || []).forEach((row) => {
      const studentId = String(row.student_id || '');
      const rowDate = String(row.date || '').slice(0, 10);
      const status = normalizeStatus(row.status);

      if (!effectiveLineupDateSet.has(rowDate)) return;

      if (!statsMap[studentId]) {
        statsMap[studentId] = {
          totalRequiredDays,
          allowedAbsentDays,
          presentCount: 0,
          absentCount: 0,
          absentHistory: [],
        };
      }

      if (status === 'P') {
        statsMap[studentId].presentCount += 1;
      } else if (status === 'A') {
        statsMap[studentId].absentCount += 1;
        statsMap[studentId].absentHistory.push({
          date: row.date || '',
          week_no: row.week_no || '',
          month_label: formatThaiMonthYearFromYmd(row.date || ''),
        });
      }
    });

    return statsMap;
  }

  async function fetchSchoolDayInfo(room, dateText) {
    const scheduleGroup = room?.schedule_group || selectedRoom?.schedule_group || '';

    if (!scheduleGroup) {
      throw new Error('ไม่พบ schedule_group ของห้องนี้');
    }

    const { data, error } = await supabase
      .from('school_days')
      .select('*')
      .eq('date', dateText)
      .eq('schedule_group', scheduleGroup)
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);

    if (!data) {
      throw new Error('ไม่พบข้อมูลวันเข้าแถวของวันที่เลือกใน SchoolDays');
    }

    if (!room?.room_id || !data.term_id) return data;

    const roomExceptions = await fetchRoomLineupExceptions(room.room_id, data.term_id);

    return applyRoomExceptionToSchoolDay({
      schoolDay: data,
      roomExceptions,
    });
  }

  async function fetchRoomLineupExceptions(roomId, termId) {
    if (!roomId || !termId) return [];

    const { data, error } = await supabase
      .from('room_lineup_exceptions')
      .select('*')
      .eq('room_id', roomId)
      .eq('term_id', termId)
      .eq('active', 'TRUE');

    if (error) throw new Error(error.message);

    return data || [];
  }

  function setStudentStatus(studentId, status) {
    setAttendanceMap((prev) => ({
      ...prev,
      [String(studentId)]: status,
    }));
  }

  function toggleStudentPresent(studentId, checked) {
    setStudentStatus(studentId, checked ? 'P' : 'A');
  }

  function markAllPresent() {
    const nextMap = {};

    students.forEach((student) => {
      nextMap[String(student.student_id)] = 'P';
    });

    setAttendanceMap(nextMap);
  }

  function markAllAbsent() {
    const nextMap = {};

    students.forEach((student) => {
      nextMap[String(student.student_id)] = 'A';
    });

    setAttendanceMap(nextMap);
  }

  function clearAllStatus() {
    const nextMap = {};

    students.forEach((student) => {
      nextMap[String(student.student_id)] = '';
    });

    setAttendanceMap(nextMap);
  }

  function openStudentHistory(student) {
    const studentId = String(student.student_id || '');
    const stat = studentStatsMap[studentId] || createEmptyStudentStat();

    setSelectedStudentHistory({
      ...student,
      stat,
      term_id: schoolDayInfo?.term_id || '',
    });
  }

  function closeStudentHistory() {
    setSelectedStudentHistory(null);
  }

  async function saveAttendance() {
    try {
      setSaving(true);
      setPageError('');
      setSuccessMessage('');

      if (!currentUser) throw new Error('กรุณาเข้าสู่ระบบก่อน');
      if (!selectedRoomId) throw new Error('กรุณาเลือกห้องเรียน');
      if (!selectedDate) throw new Error('กรุณาเลือกวันที่');
      if (students.length === 0) throw new Error('ไม่พบนักเรียนสำหรับบันทึก');

      const dayInfo = schoolDayInfo || (await fetchSchoolDayInfo(selectedRoom, selectedDate));

      if (String(dayInfo.is_lineup_day).toUpperCase() !== 'TRUE') {
        throw new Error(
          `วันที่เลือกไม่ใช่วันเข้าแถว: ${
            dayInfo.room_exception_note || dayInfo.note || '-'
          }`
        );
      }

      const confirmText = [
        `ยืนยันบันทึกการเช็กชื่อ`,
        `ห้อง: ${getSelectedRoomName(rooms, selectedRoomId)}`,
        `วันที่: ${formatThaiDate(selectedDate)}`,
        `มา: ${summary.present} คน`,
        `ขาด: ${summary.absent + summary.notSaved} คน`,
        '',
        `หมายเหตุ: รายชื่อที่ยังไม่บันทึกจะถูกนับเป็น "ขาด"`,
      ].join('\n');

      const ok = window.confirm(confirmText);
      if (!ok) return;

      const checkedAt = new Date().toISOString();

      const rows = students.map((student) => {
        const studentId = String(student.student_id);
        const status = attendanceMap[studentId] === 'P' ? 'P' : 'A';
        const attId = `${selectedDate}_${selectedRoomId}_${studentId}`;

        return {
          att_id: attId,
          date: selectedDate,
          term_id: dayInfo.term_id || '',
          week_no: dayInfo.week_no || '',
          month_key: dayInfo.month_key || '',
          room_id: selectedRoomId,
          student_id: studentId,
          status,
          checked_by: currentUser.teacher_id || currentUser.username || '',
          checked_at: checkedAt,
        };
      });

      const { error } = await supabase.from('attendance').upsert(rows, {
        onConflict: 'att_id',
      });

      if (error) throw new Error(error.message);

      setSuccessMessage(`บันทึกการเช็กชื่อสำเร็จ ${rows.length} รายการ`);
      await loadAttendancePage(selectedRoomId, selectedDate);
    } catch (err) {
      setPageError(err.message || 'บันทึกข้อมูลไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  if (!currentUser) {
    return (
      <main className="min-h-screen bg-slate-100 p-4">
        <div className="mx-auto flex min-h-[calc(100vh-32px)] max-w-md items-center justify-center">
          <section className="w-full rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8">
            <div className="mb-6 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
                <img
                  src={LOGO_SRC}
                  alt="EP Logo"
                  className="h-full w-full object-contain p-0"
                  style={{
                    transform: 'scale(1.9)',
                    transformOrigin: 'center',
                  }}
                />
              </div>

              <h1 className="text-2xl font-black text-slate-800">
                ระบบเช็กชื่อเข้าแถว
              </h1>

              <p className="mt-2 text-sm leading-6 text-slate-500">
                แผนกวิชาช่างไฟฟ้ากำลัง<br />
                วิทยาลัยเทคนิคราชบุรี
              </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-bold text-slate-600">
                  Username
                </label>
                <input
                  value={loginForm.username}
                  onChange={(e) =>
                    setLoginForm((prev) => ({
                      ...prev,
                      username: e.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-800 outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
                  placeholder="เช่น admin หรือรหัสครู"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-bold text-slate-600">
                  PIN
                </label>
                <input
                  type="password"
                  value={loginForm.pin}
                  onChange={(e) =>
                    setLoginForm((prev) => ({
                      ...prev,
                      pin: e.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-800 outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
                  placeholder="กรอก PIN"
                />
              </div>

              {loginError && (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
                  {loginError}
                </div>
              )}

              <button
                type="submit"
                disabled={loadingLogin}
                className="w-full rounded-2xl bg-sky-600 px-4 py-3 font-black text-white hover:bg-sky-700 disabled:opacity-60"
              >
                {loadingLogin ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
              </button>
            </form>

            <div className="mt-6 rounded-2xl bg-slate-50 p-4 text-center text-xs leading-6 text-slate-500">
              ระบบบริหารจัดการการเข้าแถวและติดตามผู้เรียน
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4 pb-36 md:p-6 md:pb-6">
      <div className="mx-auto max-w-7xl">
        <AppNav currentUser={currentUser} active="attendance" />

        <section className="mb-6 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 md:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-2xl font-black text-slate-800 md:text-3xl">
                ระบบเช็กชื่อเข้าแถว
              </h1>
              <p className="mt-1 text-sm font-medium text-slate-500 md:text-base">
                แผนกวิชาช่างไฟฟ้ากำลัง วิทยาลัยเทคนิคราชบุรี
              </p>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
              <div>
                <span className="font-black text-slate-800">
                  {currentUser.name}
                </span>
                <span className="ml-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
                  {currentUser.role}
                </span>
              </div>
              <div className="mt-1 text-xs text-slate-400">
                ใช้เมนูด้านบนเพื่อออกจากระบบ
              </div>
            </div>
          </div>
        </section>

        {pageError && (
          <section className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">
            <div className="font-bold">เกิดข้อผิดพลาด</div>
            <div>{pageError}</div>
          </section>
        )}

        {successMessage && (
          <section className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-700">
            <div className="font-bold">สำเร็จ</div>
            <div>{successMessage}</div>
          </section>
        )}

        <section className="mb-6 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 md:p-6">
          <div className="grid gap-4 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-sm font-bold text-slate-600">
                ห้องเรียน
              </label>
              <select
                value={selectedRoomId}
                onChange={(e) => setSelectedRoomId(e.target.value)}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-800 outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
              >
                {rooms.map((room) => (
                  <option key={room.room_id} value={room.room_id}>
                    {room.room_name || room.room_id}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-bold text-slate-600">
                วันที่
              </label>

              <CustomThaiCalendar
                value={selectedDate}
                onChange={setSelectedDate}
                room={selectedRoom}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-bold text-slate-600">
                ค้นหานักเรียน
              </label>
              <input
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-800 outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
                placeholder="ค้นหารหัส / ชื่อ / นามสกุล"
              />
            </div>

            <div className="flex items-end">
              <button
                onClick={() => loadAttendancePage(selectedRoomId, selectedDate)}
                className="w-full rounded-2xl bg-sky-600 px-4 py-3 font-bold text-white hover:bg-sky-700"
              >
                โหลดข้อมูล
              </button>
            </div>
          </div>

          <SchoolDayBox info={schoolDayInfo} selectedDate={selectedDate} />
        </section>

        <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
          <SummaryCard title="นักเรียนทั้งหมด" value={summary.total} unit="คน" tone="blue" />
          <SummaryCard
            title="มาเข้าแถว"
            value={summary.present}
            unit={`คน (${summary.presentPercent}%)`}
            tone="mint"
          />
          <SummaryCard
            title="ขาด"
            value={summary.absent}
            unit={`คน (${summary.absentPercent}%)`}
            tone="red"
          />
          <SummaryCard title="ยังไม่บันทึก" value={summary.notSaved} unit="คน" tone="slate" />
        </section>

        <DailyAbsentBox
          students={students}
          attendanceMap={attendanceMap}
          selectedDate={selectedDate}
        />

        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 md:p-6">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-black text-slate-800">
                รายชื่อนักเรียน นักศึกษา
              </h2>
              <p className="text-sm text-slate-500">
                ห้อง {getSelectedRoomName(rooms, selectedRoomId)} | วันที่{' '}
                {formatThaiDate(selectedDate)}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap">
              <button
                onClick={markAllPresent}
                disabled={students.length === 0}
                className="rounded-full bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50 md:py-2"
              >
                มาเข้าแถวทั้งหมด
              </button>

              <button
                onClick={markAllAbsent}
                disabled={students.length === 0}
                className="rounded-full bg-red-600 px-4 py-3 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50 md:py-2"
              >
                ขาดทั้งหมด
              </button>

              <button
                onClick={clearAllStatus}
                disabled={students.length === 0}
                className="rounded-full bg-slate-200 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-300 disabled:opacity-50 md:py-2"
              >
                ล้างสถานะ
              </button>

              <button
                onClick={saveAttendance}
                disabled={saving || loadingData || students.length === 0}
                className="rounded-full bg-slate-800 px-5 py-3 text-sm font-bold text-white hover:bg-slate-900 disabled:opacity-60 md:py-2"
              >
                {saving ? 'กำลังบันทึก...' : 'บันทึกการเช็กชื่อ'}
              </button>
            </div>
          </div>

          {loadingData ? (
            <div className="rounded-2xl bg-slate-50 p-8 text-center text-slate-500">
              กำลังโหลดข้อมูล...
            </div>
          ) : (
            <>
              <StudentMobileCards
                students={filteredStudents}
                attendanceMap={attendanceMap}
                studentStatsMap={studentStatsMap}
                onSetStatus={setStudentStatus}
                onOpenHistory={openStudentHistory}
              />

              <StudentDesktopTable
                students={filteredStudents}
                attendanceMap={attendanceMap}
                studentStatsMap={studentStatsMap}
                onTogglePresent={toggleStudentPresent}
                onOpenHistory={openStudentHistory}
              />
            </>
          )}
        </section>
      </div>

      <MobileSaveBar
        summary={summary}
        saving={saving}
        loadingData={loadingData}
        students={students}
        onSave={saveAttendance}
      />

      {selectedStudentHistory && (
        <StudentHistoryModal
          student={selectedStudentHistory}
          onClose={closeStudentHistory}
        />
      )}
    </main>
  );
}

function CustomThaiCalendar({ value, onChange, room }) {
  const [open, setOpen] = useState(false);
  const [displayMonth, setDisplayMonth] = useState(getMonthKeyFromYmd(value || getTodayYmd()));
  const [dayMap, setDayMap] = useState({});
  const [loading, setLoading] = useState(false);

  const scheduleGroup = room?.schedule_group || '';
  const roomId = room?.room_id || '';

  useEffect(() => {
    if (value) {
      setDisplayMonth(getMonthKeyFromYmd(value));
    }
  }, [value]);

  useEffect(() => {
    loadCalendarMonth();
  }, [displayMonth, scheduleGroup, roomId]);

  async function loadCalendarMonth() {
    try {
      setLoading(true);

      if (!displayMonth || !scheduleGroup) {
        setDayMap({});
        return;
      }

      const startDate = `${displayMonth}-01`;
      const endDate = getMonthEndYmd(displayMonth);

      const { data: schoolDays, error: schoolDaysError } = await supabase
        .from('school_days')
        .select('date, term_id, week_no, month_key, note, is_lineup_day, schedule_group')
        .eq('schedule_group', scheduleGroup)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true });

      if (schoolDaysError) throw new Error(schoolDaysError.message);

      const termIds = Array.from(
        new Set((schoolDays || []).map((day) => day.term_id).filter(Boolean))
      );

      let roomExceptions = [];

      if (roomId && termIds.length > 0) {
        const { data: exceptionRows, error: exceptionError } = await supabase
          .from('room_lineup_exceptions')
          .select('*')
          .eq('room_id', roomId)
          .eq('active', 'TRUE')
          .in('term_id', termIds);

        if (exceptionError) throw new Error(exceptionError.message);

        roomExceptions = exceptionRows || [];
      }

      const nextMap = {};

      (schoolDays || []).forEach((day) => {
        const effectiveDay = applyRoomExceptionToSchoolDay({
          schoolDay: day,
          roomExceptions,
        });

        nextMap[String(effectiveDay.date || '').slice(0, 10)] = effectiveDay;
      });

      setDayMap(nextMap);
    } catch {
      setDayMap({});
    } finally {
      setLoading(false);
    }
  }

  function goPrevMonth() {
    setDisplayMonth(addMonthsToMonthKey(displayMonth, -1));
  }

  function goNextMonth() {
    setDisplayMonth(addMonthsToMonthKey(displayMonth, 1));
  }

  function goToday() {
    const today = getTodayYmd();
    setDisplayMonth(getMonthKeyFromYmd(today));
    onChange(today);
    setOpen(false);
  }

  function selectDate(ymd) {
    onChange(ymd);
    setDisplayMonth(getMonthKeyFromYmd(ymd));
    setOpen(false);
  }

  const days = buildCalendarDays(displayMonth);
  const displayLabel = formatThaiMonthYearFromMonthKey(displayMonth);
  const selectedLabel = formatThaiDateLong(value);
  const selectedInfo = dayMap[value] || null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-left text-base outline-none transition hover:border-sky-500 focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
      >
        <span>
          <span className="block font-bold text-slate-800">{selectedLabel}</span>
          <span className="mt-0.5 block text-xs text-slate-500">
            {getCalendarSelectedText(selectedInfo)}
          </span>
        </span>

        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-lg">
          📅
        </span>
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+8px)] z-[80] w-[min(92vw,390px)] rounded-3xl border border-slate-200 bg-white p-4 shadow-xl">
          <div className="mb-4 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={goPrevMonth}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 font-black text-slate-600 hover:bg-slate-200"
            >
              ‹
            </button>

            <div className="text-center">
              <div className="text-base font-black text-slate-800">{displayLabel}</div>
              <div className="text-xs text-slate-500">
                {loading ? 'กำลังโหลดวันหยุด...' : room?.room_name || roomId || 'ยังไม่พบห้อง'}
              </div>
            </div>

            <button
              type="button"
              onClick={goNextMonth}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 font-black text-slate-600 hover:bg-slate-200"
            >
              ›
            </button>
          </div>

          <div className="mb-2 grid grid-cols-7 gap-1 text-center text-xs font-black text-slate-400">
            {['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'].map((day) => (
              <div key={day} className="py-1">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {days.map((item) => {
              if (!item.ymd) {
                return <div key={item.key} className="h-11 rounded-2xl" />;
              }

              const info = dayMap[item.ymd] || null;
              const isSelected = item.ymd === value;
              const isToday = item.ymd === getTodayYmd();
              const isWeekend = item.weekday === 0 || item.weekday === 6;
              const isLineupDay = info && String(info.is_lineup_day).toUpperCase() === 'TRUE';
              const isHoliday = info && String(info.is_lineup_day).toUpperCase() !== 'TRUE';
              const isRoomException = Boolean(info?.room_exception_id);

              let className =
                'relative flex h-11 flex-col items-center justify-center rounded-2xl text-sm font-black transition';

              if (isSelected) {
                className += ' bg-sky-600 text-white';
              } else if (isHoliday) {
                className += isRoomException
                  ? ' bg-orange-100 text-orange-700 hover:bg-orange-200'
                  : ' bg-red-100 text-red-700 hover:bg-red-200';
              } else if (isLineupDay) {
                className += isRoomException
                  ? ' bg-sky-100 text-sky-700 hover:bg-sky-200'
                  : ' bg-emerald-100 text-emerald-700 hover:bg-emerald-200';
              } else if (isWeekend) {
                className += ' bg-red-50 text-red-500 hover:bg-red-100';
              } else {
                className += ' bg-slate-50 text-slate-600 hover:bg-slate-100';
              }

              if (isToday && !isSelected) {
                className += ' ring-2 ring-sky-300';
              }

              return (
                <button
                  key={item.ymd}
                  type="button"
                  onClick={() => selectDate(item.ymd)}
                  title={info?.room_exception_note || info?.note || ''}
                  className={className}
                >
                  <span>{item.day}</span>

                  {(isLineupDay || isHoliday) && (
                    <span
                      className={`mt-0.5 h-1.5 w-1.5 rounded-full ${
                        isSelected
                          ? 'bg-white'
                          : isRoomException
                            ? 'bg-orange-500'
                            : isHoliday
                              ? 'bg-red-500'
                              : 'bg-emerald-500'
                      }`}
                    />
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 text-[11px]">
            <div className="rounded-2xl bg-emerald-100 px-3 py-2 font-bold text-emerald-700">
              เขียว = วันเข้าแถว
            </div>
            <div className="rounded-2xl bg-red-100 px-3 py-2 font-bold text-red-700">
              แดง = วันหยุดทั่วไป
            </div>
            <div className="rounded-2xl bg-orange-100 px-3 py-2 font-bold text-orange-700">
              ส้ม = ยกเว้นรายห้อง
            </div>
            <div className="rounded-2xl bg-sky-100 px-3 py-2 font-bold text-sky-700">
              ฟ้า = วันที่เลือก
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={goToday}
              className="rounded-2xl bg-slate-800 px-4 py-2 text-sm font-black text-white hover:bg-slate-900"
            >
              วันนี้
            </button>

            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-200"
            >
              ปิด
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StudentMobileCards({
  students,
  attendanceMap,
  studentStatsMap,
  onSetStatus,
  onOpenHistory,
}) {
  if (students.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500 md:hidden">
        ไม่พบข้อมูลนักเรียน
      </div>
    );
  }

  return (
    <div className="space-y-3 md:hidden">
      {students.map((student, index) => {
        const studentId = String(student.student_id);
        const status = attendanceMap[studentId] || '';
        const stat = studentStatsMap[studentId] || createEmptyStudentStat();

        const fullName = `${student.prefix || ''}${student.first_name || ''} ${
          student.last_name || ''
        }`.trim();

        return (
          <article
            key={student.student_id}
            className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-sm font-black text-slate-600">
                {index + 1}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenHistory(student)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="text-xs font-bold text-slate-400">
                      {student.student_id}
                    </div>

                    <div className="mt-1 break-words text-base font-black leading-snug text-slate-800">
                      {fullName || '-'}
                    </div>

                    <div className="mt-1 text-sm font-semibold text-slate-500">
                      {student.level}.{student.year}/{student.room_no}
                    </div>
                  </button>

                  <StatusBadge status={status} />
                </div>

                <button
                  type="button"
                  onClick={() => onOpenHistory(student)}
                  className="mt-3 grid w-full grid-cols-2 gap-2 text-left"
                >
                  <div className="rounded-2xl bg-emerald-50 px-3 py-2">
                    <div className="text-xs font-bold text-emerald-600">
                      มาสะสม
                    </div>
                    <div className="mt-1 text-sm font-black text-emerald-700">
                      {stat.presentCount}/{stat.totalRequiredDays} วัน
                    </div>
                  </div>

                  <div className="rounded-2xl bg-red-50 px-3 py-2">
                    <div className="text-xs font-bold text-red-600">
                      ขาดสะสม
                    </div>
                    <div className="mt-1 text-sm font-black text-red-700">
                      {stat.absentCount}/{stat.allowedAbsentDays} วัน
                    </div>
                  </div>
                </button>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => onSetStatus(studentId, 'P')}
                    className={`rounded-2xl px-4 py-3 text-sm font-black transition ${
                      status === 'P'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                    }`}
                  >
                    มา
                  </button>

                  <button
                    type="button"
                    onClick={() => onSetStatus(studentId, 'A')}
                    className={`rounded-2xl px-4 py-3 text-sm font-black transition ${
                      status === 'A'
                        ? 'bg-red-600 text-white'
                        : 'bg-red-100 text-red-700 hover:bg-red-200'
                    }`}
                  >
                    ขาด
                  </button>
                </div>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function StudentDesktopTable({
  students,
  attendanceMap,
  studentStatsMap,
  onTogglePresent,
  onOpenHistory,
}) {
  return (
    <div className="hidden overflow-hidden rounded-2xl border border-slate-200 md:block">
      <table className="w-full border-collapse bg-white text-sm">
        <thead className="bg-slate-800 text-white">
          <tr>
            <th className="px-4 py-3 text-center">ลำดับ</th>
            <th className="px-4 py-3 text-left">รหัสนักเรียน</th>
            <th className="px-4 py-3 text-left">ชื่อ - สกุล</th>
            <th className="px-4 py-3 text-center">ห้อง</th>
            <th className="px-4 py-3 text-center">มาเข้าแถว</th>
            <th className="px-4 py-3 text-center">สถานะ</th>
          </tr>
        </thead>

        <tbody>
          {students.length === 0 ? (
            <tr>
              <td colSpan="6" className="px-4 py-8 text-center text-slate-500">
                ไม่พบข้อมูลนักเรียน
              </td>
            </tr>
          ) : (
            students.map((student, index) => {
              const studentId = String(student.student_id);
              const status = attendanceMap[studentId] || '';
              const checked = status === 'P';
              const stat = studentStatsMap[studentId] || createEmptyStudentStat();

              return (
                <tr
                  key={student.student_id}
                  className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
                >
                  <td className="px-4 py-3 text-center font-bold text-slate-400">
                    {index + 1}
                  </td>

                  <td className="px-4 py-3 font-semibold text-slate-700">
                    {student.student_id}
                  </td>

                  <td className="px-4 py-3 text-slate-700">
                    <button
                      type="button"
                      onClick={() => onOpenHistory(student)}
                      className="text-left"
                    >
                      <div className="font-bold text-sky-700 hover:text-sky-900 hover:underline">
                        {student.prefix || ''}
                        {student.first_name || ''} {student.last_name || ''}
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-semibold text-emerald-700">
                          มาสะสม {stat.presentCount}/{stat.totalRequiredDays} วัน
                        </span>
                        <span className="text-slate-300">|</span>
                        <span className="font-semibold text-red-600">
                          ขาดสะสม {stat.absentCount}/{stat.allowedAbsentDays} วัน
                        </span>
                      </div>
                    </button>
                  </td>

                  <td className="px-4 py-3 text-center text-slate-500">
                    {student.level}.{student.year}/{student.room_no}
                  </td>

                  <td className="px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) =>
                        onTogglePresent(studentId, e.target.checked)
                      }
                      className="h-5 w-5 accent-emerald-600"
                    />
                  </td>

                  <td className="px-4 py-3 text-center">
                    <StatusBadge status={status} />
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

function StudentHistoryModal({ student, onClose }) {
  const fullName = `${student.prefix || ''}${student.first_name || ''} ${
    student.last_name || ''
  }`.trim();

  const roomText =
    student.room_id || `${student.level || ''}${student.year || ''}/${student.room_no || ''}`;

  const stat = student.stat || createEmptyStudentStat();
  const absentHistory = Array.isArray(stat.absentHistory) ? stat.absentHistory : [];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-3 sm:p-4">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-4 py-4 sm:px-6 sm:py-5">
          <div className="min-w-0">
            <h3 className="break-words text-xl font-black text-slate-800 sm:text-2xl">
              {fullName || '-'}
            </h3>

            <p className="mt-2 break-words text-xs text-slate-500 sm:text-sm">
              รหัสนักเรียน {student.student_id || '-'} | ห้อง {roomText} | ภาคเรียน{' '}
              {student.term_id || '-'}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-100"
          >
            ×
          </button>
        </div>

        <div className="max-h-[calc(90vh-88px)] overflow-y-auto p-4 sm:p-6">
          <div className="mb-5 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="text-xs font-bold text-emerald-700">มาสะสม</div>
              <div className="mt-1 text-2xl font-black text-emerald-700">
                {stat.presentCount}/{stat.totalRequiredDays}
              </div>
              <div className="mt-1 text-xs text-emerald-700">วัน</div>
            </div>

            <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
              <div className="text-xs font-bold text-red-700">ขาดสะสม</div>
              <div className="mt-1 text-2xl font-black text-red-700">
                {stat.absentCount}/{stat.allowedAbsentDays}
              </div>
              <div className="mt-1 text-xs text-red-700">วัน</div>
            </div>
          </div>

          {absentHistory.length === 0 ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-8 text-center text-lg font-bold text-emerald-700">
              ไม่เคยขาดเข้าแถว
            </div>
          ) : (
            <div
              className="max-w-full overflow-x-auto rounded-2xl border border-slate-200"
              style={{
                WebkitOverflowScrolling: 'touch',
              }}
            >
              <table className="min-w-[620px] w-full border-collapse bg-white text-sm">
                <thead className="bg-slate-100 text-slate-700">
                  <tr>
                    <th className="whitespace-nowrap px-4 py-3 text-left">ลำดับ</th>
                    <th className="whitespace-nowrap px-4 py-3 text-left">วันที่ขาด</th>
                    <th className="whitespace-nowrap px-4 py-3 text-left">สัปดาห์ที่</th>
                    <th className="whitespace-nowrap px-4 py-3 text-left">เดือน</th>
                  </tr>
                </thead>

                <tbody>
                  {absentHistory.map((item, index) => (
                    <tr
                      key={`${item.date}_${index}`}
                      className="border-t border-slate-100"
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                        {index + 1}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                        {formatThaiDate(item.date)}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                        {item.week_no || '-'}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                        {item.month_label || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MobileSaveBar({ summary, saving, loadingData, students, onSave }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 p-3 shadow-2xl backdrop-blur md:hidden">
      <div className="mx-auto max-w-7xl">
        <div className="mb-2 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-2xl bg-emerald-50 px-2 py-2 font-bold text-emerald-700">
            มา {summary.present}
          </div>
          <div className="rounded-2xl bg-red-50 px-2 py-2 font-bold text-red-700">
            ขาด {summary.absent}
          </div>
          <div className="rounded-2xl bg-slate-50 px-2 py-2 font-bold text-slate-700">
            ยังไม่บันทึก {summary.notSaved}
          </div>
        </div>

        <button
          onClick={onSave}
          disabled={saving || loadingData || students.length === 0}
          className="w-full rounded-2xl bg-slate-800 px-5 py-3 text-base font-black text-white hover:bg-slate-900 disabled:opacity-60"
        >
          {saving ? 'กำลังบันทึก...' : 'บันทึกการเช็กชื่อ'}
        </button>
      </div>
    </div>
  );
}

function SchoolDayBox({ info, selectedDate }) {
  if (!info) {
    return (
      <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
        ยังไม่พบข้อมูลวันเข้าแถวของวันที่ {formatThaiDate(selectedDate)}
      </div>
    );
  }

  const isLineup = String(info.is_lineup_day).toUpperCase() === 'TRUE';
  const hasRoomException = Boolean(info.room_exception_id);

  return (
    <div
      className={`mt-4 rounded-2xl border p-4 text-sm ${
        isLineup
          ? hasRoomException
            ? 'border-sky-200 bg-sky-50 text-sky-700'
            : 'border-emerald-200 bg-emerald-50 text-emerald-700'
          : hasRoomException
            ? 'border-orange-200 bg-orange-50 text-orange-700'
            : 'border-red-200 bg-red-50 text-red-700'
      }`}
    >
      <div className="font-black">
        {isLineup ? 'วันนี้เป็นวันเข้าแถว' : 'วันนี้ไม่ใช่วันเข้าแถว'}
        {hasRoomException ? ' — ตามข้อยกเว้นรายห้อง' : ''}
      </div>

      <div className="mt-1 grid gap-1 md:grid-cols-4">
        <div>วันที่: {formatThaiDate(info.date || selectedDate)}</div>
        <div>ภาคเรียน: {info.term_id || '-'}</div>
        <div>สัปดาห์ที่: {info.week_no || '-'}</div>
        <div>กลุ่มเวลา: {info.schedule_group || '-'}</div>
      </div>

      {(info.room_exception_note || info.note) && (
        <div className="mt-1">
          หมายเหตุ: {info.room_exception_note || info.note}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ title, value, unit, tone = 'blue' }) {
  const toneClass = {
    blue: 'border-sky-200 bg-sky-50 text-sky-700',
    mint: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    red: 'border-red-200 bg-red-50 text-red-700',
    slate: 'border-slate-200 bg-slate-50 text-slate-700',
  };

  return (
    <div className={`rounded-3xl border p-4 shadow-sm md:p-6 ${toneClass[tone] || toneClass.blue}`}>
      <div className="text-xs font-bold opacity-75 md:text-sm">{title}</div>
      <div className="mt-3 flex flex-col gap-1 md:flex-row md:items-end md:gap-2">
        <span className="text-3xl font-black md:text-4xl">
          {value}
        </span>
        <span className="text-xs opacity-75 md:pb-1 md:text-sm">{unit}</span>
      </div>
    </div>
  );
}

function DailyAbsentBox({ students, attendanceMap, selectedDate }) {
  const absentStudents = (students || []).filter((student) => {
    const studentId = String(student.student_id || '');
    return attendanceMap[studentId] === 'A';
  });

  return (
    <section className="mb-6 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 md:p-6">
      <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-800">
            รายชื่อคนขาดประจำวัน
          </h2>
          <p className="text-sm text-slate-500">
            วันที่ {formatThaiDate(selectedDate)} | ขาด {absentStudents.length} คน
          </p>
        </div>

        <div className="rounded-full bg-red-100 px-4 py-2 text-sm font-black text-red-700">
          ขาด {absentStudents.length} คน
        </div>
      </div>

      {absentStudents.length === 0 ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-5 text-center text-sm font-bold text-emerald-700">
          ยังไม่มีรายชื่อคนขาดในวันนี้
        </div>
      ) : (
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
          {absentStudents.map((student, index) => {
            const fullName = `${student.prefix || ''}${student.first_name || ''} ${
              student.last_name || ''
            }`.trim();

            return (
              <div
                key={student.student_id}
                className="flex items-start gap-3 rounded-2xl border border-red-100 bg-red-50 px-4 py-3"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-600 text-xs font-black text-white">
                  {index + 1}
                </div>

                <div className="min-w-0">
                  <div className="text-xs font-bold text-red-500">
                    {student.student_id}
                  </div>

                  <div className="break-words text-sm font-black text-slate-800">
                    {fullName || '-'}
                  </div>

                  <div className="mt-0.5 text-xs font-semibold text-slate-500">
                    {student.level}.{student.year}/{student.room_no}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-3 text-xs text-slate-500">
        หมายเหตุ: รายชื่อนี้แสดงเฉพาะคนที่ถูกเลือกสถานะ “ขาด” แล้วเท่านั้น
      </div>
    </section>
  );
}

function StatusBadge({ status }) {
  if (status === 'P') {
    return (
      <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700">
        มา
      </span>
    );
  }

  if (status === 'A') {
    return (
      <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-black text-red-700">
        ขาด
      </span>
    );
  }

  return (
    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
      ยังไม่บันทึก
    </span>
  );
}

function createEmptyStudentStat() {
  return {
    totalRequiredDays: 0,
    allowedAbsentDays: 0,
    presentCount: 0,
    absentCount: 0,
    absentHistory: [],
  };
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

function applyRoomExceptionToSchoolDay({ schoolDay, roomExceptions }) {
  const dateText = String(schoolDay?.date || '').slice(0, 10);
  const termId = String(schoolDay?.term_id || '');
  const weekday = getWeekdayFromYmd(dateText);

  const activeExceptions = (roomExceptions || []).filter(
    (item) => isActiveValue(item.active) && String(item.term_id || '') === termId
  );

  const exactDateException = activeExceptions.find(
    (item) =>
      item.exception_type === 'DATE' &&
      String(item.date || '').slice(0, 10) === dateText
  );

  const weekdayException = activeExceptions.find(
    (item) =>
      item.exception_type === 'WEEKDAY' &&
      Number(item.weekday) === Number(weekday)
  );

  const exception = exactDateException || weekdayException;

  if (!exception) return schoolDay;

  return {
    ...schoolDay,
    is_lineup_day: exception.is_lineup_day,
    note: exception.note || schoolDay.note || '',
    room_exception_id: exception.id,
    room_exception_type: exception.exception_type,
    room_exception_note: exception.note || '',
  };
}

function getCalendarSelectedText(selectedInfo) {
  if (!selectedInfo) return 'คลิกเพื่อเลือกวันที่';

  const isLineup = String(selectedInfo.is_lineup_day).toUpperCase() === 'TRUE';

  if (selectedInfo.room_exception_id) {
    return isLineup
      ? `เข้าแถวตามข้อยกเว้นรายห้อง · สัปดาห์ที่ ${selectedInfo.week_no || '-'}`
      : selectedInfo.room_exception_note || 'ไม่เข้าแถวตามข้อยกเว้นรายห้อง';
  }

  return isLineup
    ? `วันเข้าแถว · สัปดาห์ที่ ${selectedInfo.week_no || '-'}`
    : selectedInfo.note || 'วันหยุด / ไม่เข้าแถว';
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

function getSelectedRoomName(rooms, roomId) {
  const room = rooms.find((item) => item.room_id === roomId);
  return room?.room_name || roomId || '-';
}

function getTodayYmd() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');

  return `${yyyy}-${mm}-${dd}`;
}

function getWeekdayFromYmd(ymd) {
  const [yearText, monthText, dayText] = String(ymd || '').split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (!year || !month || !day) return null;

  return new Date(year, month - 1, day).getDay();
}

function formatThaiDate(ymd) {
  if (!ymd) return '-';

  const [yearText, monthText, dayText] = String(ymd).split('-');

  if (!yearText || !monthText || !dayText) return ymd;

  const buddhistYear = Number(yearText) + 543;

  return `${dayText}/${monthText}/${buddhistYear}`;
}

function formatThaiDateLong(ymd) {
  if (!ymd) return '-';

  const [yearText, monthText, dayText] = String(ymd).split('-');

  if (!yearText || !monthText || !dayText) return ymd;

  const monthNames = [
    '',
    'มกราคม',
    'กุมภาพันธ์',
    'มีนาคม',
    'เมษายน',
    'พฤษภาคม',
    'มิถุนายน',
    'กรกฎาคม',
    'สิงหาคม',
    'กันยายน',
    'ตุลาคม',
    'พฤศจิกายน',
    'ธันวาคม',
  ];

  const monthNumber = Number(monthText);
  const buddhistYear = Number(yearText) + 543;

  return `${Number(dayText)} ${monthNames[monthNumber] || '-'} ${buddhistYear}`;
}

function formatThaiMonthYearFromYmd(ymd) {
  if (!ymd) return '-';

  const [yearText, monthText] = String(ymd).split('-');

  if (!yearText || !monthText) return '-';

  const monthNames = [
    '',
    'มกราคม',
    'กุมภาพันธ์',
    'มีนาคม',
    'เมษายน',
    'พฤษภาคม',
    'มิถุนายน',
    'กรกฎาคม',
    'สิงหาคม',
    'กันยายน',
    'ตุลาคม',
    'พฤศจิกายน',
    'ธันวาคม',
  ];

  const monthNumber = Number(monthText);
  const buddhistYear = Number(yearText) + 543;

  return `${monthNames[monthNumber] || '-'} ${buddhistYear}`;
}

function formatThaiMonthYearFromMonthKey(monthKey) {
  if (!monthKey) return '-';

  const [yearText, monthText] = String(monthKey).split('-');

  if (!yearText || !monthText) return '-';

  const monthNames = [
    '',
    'มกราคม',
    'กุมภาพันธ์',
    'มีนาคม',
    'เมษายน',
    'พฤษภาคม',
    'มิถุนายน',
    'กรกฎาคม',
    'สิงหาคม',
    'กันยายน',
    'ตุลาคม',
    'พฤศจิกายน',
    'ธันวาคม',
  ];

  const buddhistYear = Number(yearText) + 543;
  const monthNumber = Number(monthText);

  return `${monthNames[monthNumber] || '-'} ${buddhistYear}`;
}

function getMonthKeyFromYmd(ymd) {
  const text = String(ymd || '').trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text.slice(0, 7);
  }

  return getTodayYmd().slice(0, 7);
}

function getMonthEndYmd(monthKey) {
  const [yearText, monthText] = String(monthKey || '').split('-');
  const year = Number(yearText);
  const month = Number(monthText);

  if (!year || !month) return getTodayYmd();

  const lastDay = new Date(year, month, 0).getDate();

  return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

function addMonthsToMonthKey(monthKey, amount) {
  const [yearText, monthText] = String(monthKey || '').split('-');
  const year = Number(yearText);
  const month = Number(monthText);

  if (!year || !month) return getTodayYmd().slice(0, 7);

  const date = new Date(year, month - 1 + amount, 1);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');

  return `${yyyy}-${mm}`;
}

function buildCalendarDays(monthKey) {
  const [yearText, monthText] = String(monthKey || '').split('-');
  const year = Number(yearText);
  const month = Number(monthText);

  if (!year || !month) return [];

  const firstDate = new Date(year, month - 1, 1);
  const startWeekday = firstDate.getDay();
  const lastDay = new Date(year, month, 0).getDate();

  const days = [];

  for (let i = 0; i < startWeekday; i += 1) {
    days.push({
      key: `blank-${i}`,
      ymd: '',
    });
  }

  for (let day = 1; day <= lastDay; day += 1) {
    const date = new Date(year, month - 1, day);
    const ymd = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    days.push({
      key: ymd,
      ymd,
      day,
      weekday: date.getDay(),
    });
  }

  return days;
}

function isActiveValue(value) {
  const text = String(value || '').trim().toUpperCase();

  return text === 'TRUE' || text === '1' || text === 'YES' || text === 'Y';
}