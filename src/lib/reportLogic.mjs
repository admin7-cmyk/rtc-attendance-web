import { applyRoomExceptionToSchoolDay, cleanText, getWeekdayFromYmd, isTrueValue, normalizeDate, normalizeRoomId, normalizeStatus } from './attendanceLogic.mjs';

export function getPeriodSchoolDays({ schoolDays, reportMode, selectedTermId, selectedWeekNo, selectedMonthKey }) {
  return schoolDays.filter((day) => {
    if (cleanText(day.term_id) !== cleanText(selectedTermId)) return false;
    if (reportMode === 'week') return cleanText(day.week_no) === cleanText(selectedWeekNo);
    if (reportMode === 'month') return cleanText(day.month_key) === cleanText(selectedMonthKey);
    return true;
  }).sort((a, b) => normalizeDate(a.date).localeCompare(normalizeDate(b.date)));
}

export function getRoomReportDays({ room, schoolDays, roomExceptions = [], ...period }) {
  return getPeriodSchoolDays({ schoolDays, ...period })
    .filter((day) => day.schedule_group === room.schedule_group)
    .map((day) => applyRoomExceptionToSchoolDay({ schoolDay: day, roomExceptions, roomId: room.room_id }));
}

export function getTargetLineupDays({ rooms, roomExceptions = [], ...options }) {
  if (!rooms) return getPeriodSchoolDays(options).filter((day) => isTrueValue(day.is_lineup_day));
  const dates = new Map();
  rooms.forEach((room) => getRoomReportDays({ room, roomExceptions, ...options }).forEach((day) => {
    if (isTrueValue(day.is_lineup_day)) dates.set(`${normalizeDate(day.date)}|${day.schedule_group}`, day);
  }));
  return [...dates.values()].sort((a, b) => normalizeDate(a.date).localeCompare(normalizeDate(b.date)));
}

// A student/date is one attendance observation. Legacy duplicate IDs must not
// inflate a report; prefer the most recently saved observation.
export function buildAttendanceSummaryMap(rows) {
  const latest = new Map();
  rows.forEach((row) => {
    const status = normalizeStatus(row.status);
    if (!status || !row.student_id) return;
    const key = `${normalizeRoomId(row.room_id)}|${normalizeDate(row.date)}|${row.student_id}`;
    const previous = latest.get(key);
    if (!previous || cleanText(row.checked_at) >= cleanText(previous.checked_at)) latest.set(key, row);
  });
  const summaries = new Map();
  latest.forEach((row) => {
    const key = `${normalizeRoomId(row.room_id)}|${normalizeDate(row.date)}`;
    if (!summaries.has(key)) summaries.set(key, { totalRecords: 0, presentCount: 0, absentCount: 0 });
    const summary = summaries.get(key);
    summary.totalRecords += 1;
    if (normalizeStatus(row.status) === 'P') summary.presentCount += 1;
    else summary.absentCount += 1;
  });
  return summaries;
}

export function getReportRosterCounts({ students, attendanceRows, term, today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date()) }) {
  const rosters = new Map();
  function add(roomId, studentId) {
    const key = normalizeRoomId(roomId);
    if (!key || !studentId) return;
    if (!rosters.has(key)) rosters.set(key, new Set());
    rosters.get(key).add(String(studentId));
  }
  // Saved term membership survives graduation and room changes. The current
  // roster is only relevant to terms that have not ended.
  attendanceRows.forEach((row) => { if (normalizeStatus(row.status)) add(row.room_id, row.student_id); });
  if (!term?.end_date || normalizeDate(term.end_date) >= today) {
    students.filter((student) => isTrueValue(student.active)).forEach((student) => add(student.room_id, student.student_id));
  }
  return new Map([...rosters].map(([room, ids]) => [room, ids.size]));
}

function aggregateRoom({ room, days, activeStudentCountByRoom, summaryMap }) {
  const roomKey = normalizeRoomId(room.room_id);
  const totalStudents = Number(activeStudentCountByRoom.get(roomKey) || 0);
  let checkedDays = 0;
  let expectedTotal = 0;
  let presentCount = 0;
  let absentCount = 0;
  let partialDays = 0;
  const recorded = new Map();
  days.filter((day) => isTrueValue(day.is_lineup_day)).forEach((day) => {
    const date = normalizeDate(day.date);
    if (recorded.has(date)) return;
    const summary = summaryMap.get(`${roomKey}|${date}`);
    if (!summary?.totalRecords) return;
    recorded.set(date, summary);
    checkedDays += 1;
    expectedTotal += Math.max(totalStudents, summary.totalRecords);
    presentCount += summary.presentCount;
    absentCount += summary.absentCount;
    if (summary.totalRecords < totalStudents) partialDays += 1;
  });
  return {
    room_id: room.room_id, room_name: room.room_name || room.room_id,
    level: room.level, year: room.year, room_no: room.room_no, schedule_group: room.schedule_group,
    total_students: totalStudents, checked_days: checkedDays, expected_total: expectedTotal,
    present_count: presentCount, absent_count: absentCount, partial_days: partialDays,
    present_percent: expectedTotal > 0 && !partialDays ? ((presentCount / expectedTotal) * 100).toFixed(2) : '',
    absent_percent: expectedTotal > 0 && !partialDays ? ((absentCount / expectedTotal) * 100).toFixed(2) : '',
    note: partialDays ? `บันทึกไม่ครบ ${partialDays} วัน` : checkedDays ? '' : 'ยังไม่บันทึก',
    recorded,
  };
}

export function buildWeeklyRows({ rooms, schoolDays, roomExceptions = [], selectedTermId, selectedWeekNo, activeStudentCountByRoom, summaryMap }) {
  return rooms.map((room) => {
    const days = getRoomReportDays({ room, schoolDays, roomExceptions, selectedTermId, selectedWeekNo, reportMode: 'week' });
    const weekdays = days.filter((day) => getWeekdayFromYmd(day.date) >= 1 && getWeekdayFromYmd(day.date) <= 5);
    const result = aggregateRoom({ room, days: weekdays, activeStudentCountByRoom, summaryMap });
    const daily = ['', '', '', '', ''];
    weekdays.forEach((day) => {
      if (!isTrueValue(day.is_lineup_day)) return;
      const summary = result.recorded.get(normalizeDate(day.date));
      if (summary) daily[getWeekdayFromYmd(day.date) - 1] = summary.presentCount;
    });
    const weekendCount = days.filter((day) => isTrueValue(day.is_lineup_day) && [0, 6].includes(getWeekdayFromYmd(day.date))).length;
    if (weekendCount) result.note = [result.note, 'มีวันเสาร์/อาทิตย์ โปรดดูรายงานรายเดือน'].filter(Boolean).join(' / ');
    const { recorded: _recorded, ...row } = result;
    return { ...row, daily, weekly_total: result.present_count,
      average: result.checked_days > 0 ? (result.present_count / result.checked_days).toFixed(2) : '',
      percent: result.present_percent };
  });
}

export function buildSummaryRows({ rooms, schoolDays, roomExceptions = [], activeStudentCountByRoom, summaryMap, ...period }) {
  return rooms.map((room) => {
    const days = getRoomReportDays({ room, schoolDays, roomExceptions, ...period });
    const { recorded: _recorded, ...row } = aggregateRoom({ room, days, activeStudentCountByRoom, summaryMap });
    return row;
  });
}

export function buildWeeklyTotal(rows) {
  const total = { room_name: 'รวม', total_students: 0, daily: [0, 0, 0, 0, 0], weekly_total: 0, checked_days: 0, expected_total: 0, partial_days: 0, note: '' };
  rows.forEach((row) => {
    for (const field of ['total_students', 'weekly_total', 'checked_days', 'expected_total', 'partial_days']) total[field] += Number(row[field] || 0);
    row.daily.forEach((value, index) => { if (value !== '') total.daily[index] += Number(value || 0); });
  });
  total.average = total.checked_days ? (total.weekly_total / total.checked_days).toFixed(2) : '';
  total.percent = total.expected_total && !total.partial_days ? ((total.weekly_total / total.expected_total) * 100).toFixed(2) : '';
  total.note = total.partial_days ? 'มีรายการบันทึกไม่ครบ' : '';
  return total;
}

export function buildSummaryTotal(rows) {
  const total = { room_name: 'รวม', total_students: 0, checked_days: 0, expected_total: 0, present_count: 0, absent_count: 0, partial_days: 0, note: '' };
  rows.forEach((row) => {
    for (const field of ['total_students', 'checked_days', 'expected_total', 'present_count', 'absent_count', 'partial_days']) total[field] += Number(row[field] || 0);
  });
  total.present_percent = total.expected_total && !total.partial_days ? ((total.present_count / total.expected_total) * 100).toFixed(2) : '';
  total.absent_percent = total.expected_total && !total.partial_days ? ((total.absent_count / total.expected_total) * 100).toFixed(2) : '';
  total.note = total.partial_days ? 'มีรายการบันทึกไม่ครบ' : '';
  return total;
}
