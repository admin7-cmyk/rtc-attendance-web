'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import AppNav from '@/components/AppNav';
import { exportWeeklyReportExcel } from '@/lib/exportWeeklyReportExcel';
import { exportWeeklyReportWord } from '@/lib/exportWeeklyReportWord';
import { exportSummaryReportExcel } from '@/lib/exportSummaryReportExcel';
import { exportSummaryReportWord } from '@/lib/exportSummaryReportWord';

const PAGE_SIZE = 1000;
const DAY_LABELS = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์'];

const REPORT_CONFIG = {
  formNo: 'ก.1/4',
  occupationalType: 'ประเภทวิชาอุตสาหกรรม',
  title: 'ใบเช็คการเข้าร่วมกิจกรรมเข้าแถวหน้าเสาธง',
  departmentName: 'แผนกวิชาช่างไฟฟ้ากำลัง',
  reporterName: '( นายเศรษฐ์   จงดี )',
  reporterLabel: 'ครูผู้รายงาน',
  headDepartmentName: '( นายชัยวัฒน์   พูลสวัสดิ์ )',
  headDepartmentLabel: 'หัวหน้าแผนกวิชาช่างไฟฟ้ากำลัง',
  activityHeadName: '( นายมานนท์   กองแดง )',
  activityHeadLabel: 'หัวหน้างานกิจกรรมนักเรียน นักศึกษา',
  deputyName: '( นายอานุภาพ   ทับศิริวัฒน์ )',
  deputyLabel: 'รองผู้อำนวยการฝ่ายกิจการนักเรียน นักศึกษา',
};

export default function ReportPage() {
  const [currentUser, setCurrentUser] = useState(null);

  const [terms, setTerms] = useState([]);
  const [schoolDays, setSchoolDays] = useState([]);
  const [rooms, setRooms] = useState([]);

  const [reportMode, setReportMode] = useState('week');
  const [selectedTermId, setSelectedTermId] = useState('');
  const [selectedWeekNo, setSelectedWeekNo] = useState('');
  const [selectedMonthKey, setSelectedMonthKey] = useState('');

  const [weeklyRows, setWeeklyRows] = useState([]);
  const [summaryRows, setSummaryRows] = useState([]);

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

      setCurrentUser(parsed);
      loadBootstrap();
    } catch {
      localStorage.removeItem('rtc_attendance_user');
      setPageError('ข้อมูลผู้ใช้ไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่');
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedTermId || schoolDays.length === 0) return;

    const firstWeek = schoolDays.find(
      (item) => String(item.term_id) === String(selectedTermId) && item.week_no
    );

    const firstMonth = schoolDays.find(
      (item) =>
        String(item.term_id) === String(selectedTermId) && item.month_key
    );

    if (!selectedWeekNo && firstWeek?.week_no) {
      setSelectedWeekNo(String(firstWeek.week_no));
    }

    if (!selectedMonthKey && firstMonth?.month_key) {
      setSelectedMonthKey(String(firstMonth.month_key));
    }
  }, [selectedTermId, schoolDays, selectedWeekNo, selectedMonthKey]);

  useEffect(() => {
    if (!currentUser || !selectedTermId) return;

    if (reportMode === 'week' && !selectedWeekNo) return;
    if (reportMode === 'month' && !selectedMonthKey) return;

    loadReport();
  }, [
    currentUser,
    reportMode,
    selectedTermId,
    selectedWeekNo,
    selectedMonthKey,
  ]);

  const weekOptions = useMemo(() => {
    const map = new Map();

    schoolDays
      .filter((item) => String(item.term_id) === String(selectedTermId))
      .forEach((item) => {
        if (item.week_no) {
          map.set(String(item.week_no), String(item.week_no));
        }
      });

    return Array.from(map.keys()).sort((a, b) => Number(a) - Number(b));
  }, [schoolDays, selectedTermId]);

  const monthOptions = useMemo(() => {
    const map = new Map();

    schoolDays
      .filter((item) => String(item.term_id) === String(selectedTermId))
      .forEach((item) => {
        if (item.month_key) {
          map.set(String(item.month_key), String(item.month_key));
        }
      });

    return Array.from(map.keys()).sort();
  }, [schoolDays, selectedTermId]);

  const targetLineupDays = useMemo(() => {
    return getTargetLineupDays({
      schoolDays,
      reportMode,
      selectedTermId,
      selectedWeekNo,
      selectedMonthKey,
    });
  }, [schoolDays, reportMode, selectedTermId, selectedWeekNo, selectedMonthKey]);

  const openedScheduleGroups = useMemo(() => {
    return [
      ...new Set(
        targetLineupDays.map((item) => item.schedule_group).filter(Boolean)
      ),
    ];
  }, [targetLineupDays]);

  const reportDateRange = useMemo(() => {
    const dates = targetLineupDays
      .map((item) => normalizeDate(item.date))
      .filter(Boolean);

    if (dates.length === 0) return '-';

    const uniqueDates = [...new Set(dates)].sort();

    return `${formatThaiLongDate(uniqueDates[0])} ถึง ${formatThaiLongDate(
      uniqueDates[uniqueDates.length - 1]
    )}`;
  }, [targetLineupDays]);

  const weeklyTotalRow = useMemo(() => {
    const total = {
      room_name: 'รวม',
      total_students: 0,
      daily: [0, 0, 0, 0, 0],
      weekly_total: 0,
      average: '',
      percent: '',
      checked_days: 0,
      note: '',
    };

    weeklyRows.forEach((row) => {
      total.total_students += Number(row.total_students || 0);
      total.weekly_total += Number(row.weekly_total || 0);
      total.checked_days += Number(row.checked_days || 0);

      row.daily.forEach((value, index) => {
        if (value !== '') {
          total.daily[index] += Number(value || 0);
        }
      });
    });

    const expected = weeklyRows.reduce((sum, row) => {
      return (
        sum +
        Number(row.total_students || 0) * Number(row.checked_days || 0)
      );
    }, 0);

    total.average =
      total.checked_days > 0
        ? (total.weekly_total / total.checked_days).toFixed(2)
        : '';

    total.percent =
      expected > 0 ? ((total.weekly_total / expected) * 100).toFixed(2) : '';

    return total;
  }, [weeklyRows]);

  const summaryTotalRow = useMemo(() => {
    const total = {
      room_name: 'รวม',
      total_students: 0,
      checked_days: 0,
      expected_total: 0,
      present_count: 0,
      absent_count: 0,
      present_percent: '',
      absent_percent: '',
      note: '',
    };

    summaryRows.forEach((row) => {
      total.total_students += Number(row.total_students || 0);
      total.checked_days += Number(row.checked_days || 0);
      total.expected_total += Number(row.expected_total || 0);
      total.present_count += Number(row.present_count || 0);
      total.absent_count += Number(row.absent_count || 0);
    });

    total.present_percent =
      total.expected_total > 0
        ? ((total.present_count / total.expected_total) * 100).toFixed(2)
        : '';

    total.absent_percent =
      total.expected_total > 0
        ? ((total.absent_count / total.expected_total) * 100).toFixed(2)
        : '';

    return total;
  }, [summaryRows]);

  async function loadBootstrap() {
    try {
      setLoading(true);
      setPageError('');

      const [termData, schoolDayData, roomData] = await Promise.all([
        fetchAllRows((from, to) =>
          supabase
            .from('terms')
            .select('*')
            .order('term_id', { ascending: false })
            .range(from, to)
        ),

        fetchAllRows((from, to) =>
          supabase
            .from('school_days')
            .select('*')
            .order('date', { ascending: true })
            .range(from, to)
        ),

        fetchAllRows((from, to) =>
          supabase
            .from('rooms')
            .select('*')
            .order('level', { ascending: true })
            .order('year', { ascending: true })
            .order('room_no', { ascending: true })
            .range(from, to)
        ),
      ]);

      setTerms(termData);
      setSchoolDays(schoolDayData);
      setRooms(roomData);

      const firstTermId = termData[0]?.term_id || '';
      setSelectedTermId(firstTermId);

      const firstWeek = schoolDayData.find(
        (item) => String(item.term_id) === String(firstTermId) && item.week_no
      );

      const firstMonth = schoolDayData.find(
        (item) =>
          String(item.term_id) === String(firstTermId) && item.month_key
      );

      if (firstWeek?.week_no) {
        setSelectedWeekNo(String(firstWeek.week_no));
      }

      if (firstMonth?.month_key) {
        setSelectedMonthKey(String(firstMonth.month_key));
      }
    } catch (err) {
      setPageError(err.message || 'โหลดข้อมูลเริ่มต้นไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }

  async function loadReport() {
    try {
      setLoading(true);
      setPageError('');

      const currentTargetLineupDays = getTargetLineupDays({
        schoolDays,
        reportMode,
        selectedTermId,
        selectedWeekNo,
        selectedMonthKey,
      });

      const activeScheduleGroups = [
        ...new Set(
          currentTargetLineupDays
            .map((item) => item.schedule_group)
            .filter(Boolean)
        ),
      ];

      if (activeScheduleGroups.length === 0) {
        setWeeklyRows([]);
        setSummaryRows([]);
        return;
      }

      const allTargetDates = [
        ...new Set(
          currentTargetLineupDays
            .map((item) => normalizeDate(item.date))
            .filter(Boolean)
        ),
      ];

      const [attendanceData, studentData] = await Promise.all([
        fetchAllRows((from, to) =>
          supabase
            .from('attendance')
            .select('*')
            .eq('term_id', selectedTermId)
            .in('date', allTargetDates)
            .order('date', { ascending: true })
            .order('room_id', { ascending: true })
            .range(from, to)
        ),

        fetchAllRows((from, to) =>
          supabase.from('students').select('*').range(from, to)
        ),
      ]);

      const activeStudents = (studentData || []).filter((student) =>
        isTrueValue(student.active)
      );

      const activeStudentCountByRoom = new Map();

      activeStudents.forEach((student) => {
        const roomKey = normalizeRoomId(student.room_id);
        activeStudentCountByRoom.set(
          roomKey,
          Number(activeStudentCountByRoom.get(roomKey) || 0) + 1
        );
      });

      const targetRooms = rooms.filter((room) => {
      const roomKey = normalizeRoomId(room.room_id);

      const roomHasOpened = activeScheduleGroups.includes(
        room.schedule_group
      );

      const activeStudentCount = Number(
        activeStudentCountByRoom.get(roomKey) || 0
      );

      const hasPermission = canAccessRoom(currentUser, room.room_id);

      return roomHasOpened && activeStudentCount > 0 && hasPermission;
    });

      const summaryMap = new Map();

      (attendanceData || []).forEach((item) => {
        const roomKey = normalizeRoomId(item.room_id);
        const dateKey = normalizeDate(item.date);
        const key = `${roomKey}|${dateKey}`;
        const status = normalizeStatus(item.status);

        if (!summaryMap.has(key)) {
          summaryMap.set(key, {
            totalRecords: 0,
            presentCount: 0,
            absentCount: 0,
          });
        }

        const summary = summaryMap.get(key);
        summary.totalRecords += 1;

        if (status === 'P') summary.presentCount += 1;
        if (status === 'A') summary.absentCount += 1;
      });

      if (reportMode === 'week') {
        const rows = buildWeeklyRows({
          rooms: targetRooms,
          schoolDays,
          selectedTermId,
          selectedWeekNo,
          activeStudentCountByRoom,
          summaryMap,
        });

        setWeeklyRows(sortRoomRows(rows));
        setSummaryRows([]);
      } else {
        const rows = buildSummaryRows({
          rooms: targetRooms,
          targetLineupDays: currentTargetLineupDays,
          activeStudentCountByRoom,
          summaryMap,
        });

        setSummaryRows(sortRoomRows(rows));
        setWeeklyRows([]);
      }
    } catch (err) {
      setPageError(err.message || 'โหลดรายงานไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }

  async function handleExportExcel() {
  if (reportMode === 'week') {
    if (weeklyRows.length === 0) {
      alert('ยังไม่มีข้อมูลรายงานสำหรับ Export');
      return;
    }

    await exportWeeklyReportExcel({
      reportRows: weeklyRows,
      totalRow: weeklyTotalRow,
      selectedWeekNo,
      weekDateRange: reportDateRange,
      reportConfig: REPORT_CONFIG,
    });

    return;
  }

  if (summaryRows.length === 0) {
    alert('ยังไม่มีข้อมูลรายงานสำหรับ Export');
    return;
  }

  await exportSummaryReportExcel({
    reportRows: summaryRows,
    totalRow: summaryTotalRow,
    reportMode,
    selectedMonthKey,
    reportDateRange,
    reportConfig: REPORT_CONFIG,
  });
}

  async function handleExportWord() {
  if (reportMode === 'week') {
    if (weeklyRows.length === 0) {
      alert('ยังไม่มีข้อมูลรายงานสำหรับ Export');
      return;
    }

    await exportWeeklyReportWord({
      reportRows: weeklyRows,
      totalRow: weeklyTotalRow,
      selectedWeekNo,
      weekDateRange: reportDateRange,
      reportConfig: REPORT_CONFIG,
    });

    return;
  }

  if (summaryRows.length === 0) {
    alert('ยังไม่มีข้อมูลรายงานสำหรับ Export');
    return;
  }

  await exportSummaryReportWord({
    reportRows: summaryRows,
    totalRow: summaryTotalRow,
    reportMode,
    selectedMonthKey,
    reportDateRange,
    reportConfig: REPORT_CONFIG,
  });
}

  function goHome() {
    window.location.href = '/';
  }

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-7xl">
        {currentUser && <AppNav currentUser={currentUser} active="report" />}

        <section className="mb-6 rounded-3xl bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-3xl font-black text-slate-800">
                รายงานการเข้าแถว
              </h1>
              <p className="mt-1 text-slate-500">
                รวมรายงานรายสัปดาห์ รายเดือน และรายภาคเรียนไว้ในหน้าเดียว
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={loadReport}
                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700"
              >
                โหลดข้อมูลใหม่
              </button>

              <button
                onClick={handleExportExcel}
                className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700"
              >
                Export Excel
              </button>

              <button
                onClick={handleExportWord}
                className="rounded-full bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"
              >
                Export Word
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

        <section className="mb-6 rounded-3xl bg-white p-6 shadow-sm">
          <div className="grid gap-4 md:grid-cols-4">
            <SelectBox
              label="ประเภทรายงาน"
              value={reportMode}
              onChange={setReportMode}
            >
              <option value="week">รายสัปดาห์</option>
              <option value="month">รายเดือน</option>
              <option value="term">รายภาคเรียน</option>
            </SelectBox>

            <SelectBox
              label="ภาคเรียน"
              value={selectedTermId}
              onChange={setSelectedTermId}
            >
              {terms.map((term) => (
                <option key={term.term_id} value={term.term_id}>
                  {term.term_name || term.term_id}
                </option>
              ))}
            </SelectBox>

            {reportMode === 'week' && (
              <SelectBox
                label="สัปดาห์"
                value={selectedWeekNo}
                onChange={setSelectedWeekNo}
              >
                {weekOptions.map((weekNo) => (
                  <option key={weekNo} value={weekNo}>
                    สัปดาห์ที่ {weekNo}
                  </option>
                ))}
              </SelectBox>
            )}

            {reportMode === 'month' && (
              <SelectBox
                label="เดือน"
                value={selectedMonthKey}
                onChange={setSelectedMonthKey}
              >
                {monthOptions.map((monthKey) => (
                  <option key={monthKey} value={monthKey}>
                    {formatMonthKey(monthKey)}
                  </option>
                ))}
              </SelectBox>
            )}

            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
              <div className="font-bold text-slate-800">ช่วงวันที่เข้าแถวจริง</div>
              <div>{reportDateRange}</div>
              <div className="mt-1 text-xs text-slate-400">
                กลุ่มที่เปิดแล้ว: {openedScheduleGroups.join(', ') || '-'}
              </div>
            </div>
          </div>
        </section>

        {reportMode === 'week' ? (
          <WeeklyReportSection
            loading={loading}
            rows={weeklyRows}
            totalRow={weeklyTotalRow}
            selectedWeekNo={selectedWeekNo}
            reportDateRange={reportDateRange}
          />
        ) : (
          <SummaryReportSection
            loading={loading}
            rows={summaryRows}
            totalRow={summaryTotalRow}
            reportMode={reportMode}
            selectedMonthKey={selectedMonthKey}
            reportDateRange={reportDateRange}
          />
        )}
      </div>
    </main>
  );
}

function WeeklyReportSection({
  loading,
  rows,
  totalRow,
  selectedWeekNo,
  reportDateRange,
}) {
  return (
    <section className="rounded-3xl bg-white p-6 shadow-sm">
      <div className="mb-4 text-center">
        <div className="text-right text-sm font-bold text-slate-700">
          {REPORT_CONFIG.formNo}
          <br />
          {REPORT_CONFIG.occupationalType}
        </div>

        <h2 className="mt-2 text-2xl font-black text-slate-800">
          {REPORT_CONFIG.title}
        </h2>

        <p className="text-lg font-bold text-slate-700">
          {REPORT_CONFIG.departmentName}
        </p>

        <p className="mt-1 text-sm text-slate-500">
          สัปดาห์ที่ {selectedWeekNo} ระหว่างวันที่ {reportDateRange}
        </p>
      </div>

      {loading ? (
        <LoadingBox />
      ) : (
        <WeeklyTable rows={rows} totalRow={totalRow} />
      )}
    </section>
  );
}

function SummaryReportSection({
  loading,
  rows,
  totalRow,
  reportMode,
  selectedMonthKey,
  reportDateRange,
}) {
  return (
    <>
      <section className="mb-6 grid gap-4 md:grid-cols-4">
        <SummaryCard title="ห้องที่แสดง" value={rows.length} unit="ห้อง" />
        <SummaryCard
          title="จำนวนมา"
          value={totalRow.present_count}
          unit={`${totalRow.present_percent || '0.00'}%`}
        />
        <SummaryCard
          title="จำนวนขาด"
          value={totalRow.absent_count}
          unit={`${totalRow.absent_percent || '0.00'}%`}
        />
        <SummaryCard
          title="จำนวนวันเช็กทั้งหมด"
          value={totalRow.checked_days}
          unit="รายการ/ห้อง"
        />
      </section>

      <section className="rounded-3xl bg-white p-6 shadow-sm">
        <div className="mb-4 text-center">
          <h2 className="text-2xl font-black text-slate-800">
            {reportMode === 'month'
              ? 'รายงานสรุปการเข้าแถวรายเดือน'
              : 'รายงานสรุปการเข้าแถวรายภาคเรียน'}
          </h2>

          <p className="text-lg font-bold text-slate-700">
            แผนกวิชาช่างไฟฟ้ากำลัง
          </p>

          <p className="mt-1 text-sm text-slate-500">
            {reportMode === 'month'
              ? `เดือน ${formatMonthKey(selectedMonthKey)}`
              : 'รายภาคเรียน'}{' '}
            | {reportDateRange}
          </p>
        </div>

        {loading ? (
          <LoadingBox />
        ) : (
          <SummaryTable rows={rows} totalRow={totalRow} />
        )}
      </section>
    </>
  );
}

function WeeklyTable({ rows, totalRow }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200">
      <table className="w-full min-w-[1100px] border-collapse bg-white text-sm">
        <thead className="bg-slate-900 text-white">
          <tr>
            <th rowSpan="2" className="border border-slate-700 px-3 py-3">
              ระดับชั้น
            </th>
            <th rowSpan="2" className="border border-slate-700 px-3 py-3">
              จำนวนทั้งหมด/ห้อง
            </th>
            <th colSpan="5" className="border border-slate-700 px-3 py-3">
              จำนวนนักเรียน นักศึกษาร่วมเข้าแถวหน้าเสาธง/สัปดาห์
            </th>
            <th rowSpan="2" className="border border-slate-700 px-3 py-3">
              รวม
            </th>
            <th rowSpan="2" className="border border-slate-700 px-3 py-3">
              เฉลี่ย
            </th>
            <th rowSpan="2" className="border border-slate-700 px-3 py-3">
              %
            </th>
            <th rowSpan="2" className="border border-slate-700 px-3 py-3">
              หมายเหตุ
            </th>
          </tr>

          <tr>
            {DAY_LABELS.map((day) => (
              <th key={day} className="border border-slate-700 px-3 py-3">
                {day}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan="11"
                className="border border-slate-200 px-3 py-8 text-center text-slate-500"
              >
                ไม่พบข้อมูลรายงาน
              </td>
            </tr>
          ) : (
            rows.map((row) => <WeeklyRow key={row.room_id} row={row} />)
          )}

          {rows.length > 0 && <WeeklyRow row={totalRow} isTotal />}
        </tbody>
      </table>
    </div>
  );
}

function WeeklyRow({ row, isTotal = false }) {
  return (
    <tr
      className={
        isTotal
          ? 'bg-slate-100 font-black'
          : 'border-b border-slate-100 hover:bg-slate-50'
      }
    >
      <td className="border border-slate-200 px-3 py-2 font-bold">
        {row.room_name}
      </td>

      <td className="border border-slate-200 px-3 py-2 text-center">
        {row.total_students}
      </td>

      {row.daily.map((value, index) => (
        <td key={index} className="border border-slate-200 px-3 py-2 text-center">
          {value}
        </td>
      ))}

      <td className="border border-slate-200 px-3 py-2 text-center font-bold">
        {row.weekly_total}
      </td>

      <td className="border border-slate-200 px-3 py-2 text-center">
        {row.average}
      </td>

      <td className="border border-slate-200 px-3 py-2 text-center font-bold">
        {row.percent ? `${row.percent}%` : ''}
      </td>

      <td className="border border-slate-200 px-3 py-2">{row.note || ''}</td>
    </tr>
  );
}

function SummaryTable({ rows, totalRow }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200">
      <table className="w-full min-w-[1000px] border-collapse bg-white text-sm">
        <thead className="bg-slate-900 text-white">
          <tr>
            <th className="border border-slate-700 px-3 py-3">ระดับชั้น</th>
            <th className="border border-slate-700 px-3 py-3">
              จำนวนทั้งหมด/ห้อง
            </th>
            <th className="border border-slate-700 px-3 py-3">จำนวนวันเช็ก</th>
            <th className="border border-slate-700 px-3 py-3">
              จำนวนที่ควรเช็ก
            </th>
            <th className="border border-slate-700 px-3 py-3">มา</th>
            <th className="border border-slate-700 px-3 py-3">ขาด</th>
            <th className="border border-slate-700 px-3 py-3">มา %</th>
            <th className="border border-slate-700 px-3 py-3">ขาด %</th>
            <th className="border border-slate-700 px-3 py-3">หมายเหตุ</th>
          </tr>
        </thead>

        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan="9"
                className="border border-slate-200 px-3 py-8 text-center text-slate-500"
              >
                ไม่พบข้อมูลรายงาน
              </td>
            </tr>
          ) : (
            rows.map((row) => <SummaryRow key={row.room_id} row={row} />)
          )}

          {rows.length > 0 && <SummaryRow row={totalRow} isTotal />}
        </tbody>
      </table>
    </div>
  );
}

function SummaryRow({ row, isTotal = false }) {
  return (
    <tr
      className={
        isTotal
          ? 'bg-slate-100 font-black'
          : 'border-b border-slate-100 hover:bg-slate-50'
      }
    >
      <td className="border border-slate-200 px-3 py-2 font-bold">
        {row.room_name}
      </td>
      <td className="border border-slate-200 px-3 py-2 text-center">
        {row.total_students}
      </td>
      <td className="border border-slate-200 px-3 py-2 text-center">
        {row.checked_days}
      </td>
      <td className="border border-slate-200 px-3 py-2 text-center">
        {row.expected_total}
      </td>
      <td className="border border-slate-200 px-3 py-2 text-center font-bold text-emerald-700">
        {row.present_count}
      </td>
      <td className="border border-slate-200 px-3 py-2 text-center font-bold text-red-700">
        {row.absent_count}
      </td>
      <td className="border border-slate-200 px-3 py-2 text-center font-bold text-emerald-700">
        {row.present_percent ? `${row.present_percent}%` : ''}
      </td>
      <td className="border border-slate-200 px-3 py-2 text-center font-bold text-red-700">
        {row.absent_percent ? `${row.absent_percent}%` : ''}
      </td>
      <td className="border border-slate-200 px-3 py-2">{row.note || ''}</td>
    </tr>
  );
}

function SelectBox({ label, value, onChange, children }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-bold text-slate-700">
        {label}
      </label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-slate-500"
      >
        {children}
      </select>
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

function LoadingBox() {
  return (
    <div className="rounded-2xl bg-slate-50 p-8 text-center text-slate-500">
      กำลังโหลดรายงาน...
    </div>
  );
}

function getTargetLineupDays({
  schoolDays,
  reportMode,
  selectedTermId,
  selectedWeekNo,
  selectedMonthKey,
}) {
  return schoolDays
    .filter((item) => {
      const sameTerm = String(item.term_id) === String(selectedTermId);
      const lineupDay = isTrueValue(item.is_lineup_day);

      if (!sameTerm || !lineupDay) return false;

      if (reportMode === 'week') {
        return String(item.week_no) === String(selectedWeekNo);
      }

      if (reportMode === 'month') {
        return String(item.month_key) === String(selectedMonthKey);
      }

      return true;
    })
    .sort((a, b) => normalizeDate(a.date).localeCompare(normalizeDate(b.date)));
}

function buildWeeklyRows({
  rooms,
  schoolDays,
  selectedTermId,
  selectedWeekNo,
  activeStudentCountByRoom,
  summaryMap,
}) {
  return rooms.map((room) => {
    const roomKey = normalizeRoomId(room.room_id);
    const totalStudents = Number(activeStudentCountByRoom.get(roomKey) || 0);

    const roomWeekDaysAll = schoolDays
      .filter(
        (item) =>
          String(item.term_id) === String(selectedTermId) &&
          String(item.week_no) === String(selectedWeekNo) &&
          item.schedule_group === room.schedule_group
      )
      .sort((a, b) => normalizeDate(a.date).localeCompare(normalizeDate(b.date)))
      .slice(0, 5);

    let weeklyTotal = 0;
    let checkedDays = 0;

    const daily = roomWeekDaysAll.map((day) => {
      if (!isTrueValue(day.is_lineup_day)) return '';

      const dateKey = normalizeDate(day.date);
      const key = `${roomKey}|${dateKey}`;
      const summary = summaryMap.get(key);

      if (!summary || summary.totalRecords === 0) return '';

      checkedDays++;
      weeklyTotal += summary.presentCount;

      return summary.presentCount;
    });

    while (daily.length < 5) {
      daily.push('');
    }

    const expected = totalStudents * checkedDays;

    return {
      room_id: room.room_id,
      room_name: room.room_name || room.room_id,
      level: room.level,
      year: room.year,
      room_no: room.room_no,
      schedule_group: room.schedule_group,
      total_students: totalStudents,
      daily,
      weekly_total: weeklyTotal,
      checked_days: checkedDays,
      average: checkedDays > 0 ? (weeklyTotal / checkedDays).toFixed(2) : '',
      percent: expected > 0 ? ((weeklyTotal / expected) * 100).toFixed(2) : '',
      note: checkedDays > 0 ? '' : 'ยังไม่บันทึก',
    };
  });
}

function buildSummaryRows({
  rooms,
  targetLineupDays,
  activeStudentCountByRoom,
  summaryMap,
}) {
  return rooms.map((room) => {
    const roomKey = normalizeRoomId(room.room_id);
    const totalStudents = Number(activeStudentCountByRoom.get(roomKey) || 0);

    const roomLineupDays = targetLineupDays.filter(
      (day) => day.schedule_group === room.schedule_group
    );

    let checkedDays = 0;
    let presentCount = 0;
    let absentCount = 0;

    roomLineupDays.forEach((day) => {
      const dateKey = normalizeDate(day.date);
      const key = `${roomKey}|${dateKey}`;
      const summary = summaryMap.get(key);

      if (!summary || summary.totalRecords === 0) return;

      checkedDays += 1;
      presentCount += Number(summary.presentCount || 0);
      absentCount += Number(summary.absentCount || 0);
    });

    const expectedTotal = totalStudents * checkedDays;

    return {
      room_id: room.room_id,
      room_name: room.room_name || room.room_id,
      level: room.level,
      year: room.year,
      room_no: room.room_no,
      schedule_group: room.schedule_group,
      total_students: totalStudents,
      checked_days: checkedDays,
      expected_total: expectedTotal,
      present_count: presentCount,
      absent_count: absentCount,
      present_percent:
        expectedTotal > 0
          ? ((presentCount / expectedTotal) * 100).toFixed(2)
          : '',
      absent_percent:
        expectedTotal > 0
          ? ((absentCount / expectedTotal) * 100).toFixed(2)
          : '',
      note: checkedDays > 0 ? '' : 'ยังไม่บันทึก',
    };
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

function sortRoomRows(rows) {
  return [...rows].sort((a, b) => {
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
  });
}

function getLevelWeight(level) {
  const text = String(level || '');

  if (text.includes('ปวช')) return 1;
  if (text.includes('ปวส')) return 2;

  return 99;
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

function formatThaiLongDate(ymd) {
  if (!ymd) return '-';

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

  const [yearText, monthText, dayText] = String(ymd).split('-');

  if (!yearText || !monthText || !dayText) return ymd;

  return `${Number(dayText)} ${monthNames[Number(monthText)]} ${
    Number(yearText) + 543
  }`;
}

function formatMonthKey(monthKey) {
  if (!monthKey) return '-';

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

  const [yearText, monthText] = String(monthKey).split('-');
  const month = Number(monthText);
  const year = Number(yearText) + 543;

  if (!month || !year) return monthKey;

  return `${monthNames[month]} ${year}`;
}

function canAccessRoom(currentUser, roomId) {
  const role = String(currentUser?.role || '').toLowerCase();

  if (role === 'admin') return true;

  const allowedRoomIds = String(currentUser?.room_ids || '')
    .split(',')
    .map((item) => normalizeRoomId(item))
    .filter(Boolean);

  return allowedRoomIds.includes(normalizeRoomId(roomId));
}