import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAttendanceSummaryMap, buildSummaryRows, buildSummaryTotal, buildWeeklyRows, buildWeeklyTotal, getReportRosterCounts, getTargetLineupDays } from '../src/lib/reportLogic.mjs';
import { buildDailyStatusRows } from '../src/lib/dailyStatusLogic.mjs';

const room = { room_id: 'R1', schedule_group: 'G1', room_name: 'Room 1' };
const day = { date: '2026-05-19', term_id: 'T1', week_no: '1', month_key: '2026-05', schedule_group: 'G1', is_lineup_day: 'TRUE' };
const period = { rooms: [room], schoolDays: [day], reportMode: 'month', selectedTermId: 'T1', selectedMonthKey: '2026-05', selectedWeekNo: '1' };
const attendance = (count, date = day.date) => Array.from({ length: count }, (_, index) => ({ att_id: `${date}_${index}`, date, term_id: 'T1', room_id: 'R1', student_id: String(index), status: 'P', checked_at: '2026-05-19T01:00:00Z' }));

test('reports include an added room date even when the general calendar is a holiday', () => {
  const options = { ...period, schoolDays: [{ ...day, is_lineup_day: 'FALSE' }], roomExceptions: [{ room_id: 'R1', term_id: 'T1', active: 'TRUE', exception_type: 'DATE', date: day.date, is_lineup_day: 'TRUE' }] };
  assert.equal(getTargetLineupDays(options).length, 1);
  const rows = buildSummaryRows({ ...options, activeStudentCountByRoom: new Map([['R1', 2]]), summaryMap: buildAttendanceSummaryMap(attendance(2)) });
  assert.equal(rows[0].present_count, 2);
  assert.equal(rows[0].present_percent, '100.00');
});

test('room cancellations and weekday overrides do not leak into another room', () => {
  const secondRoom = { ...room, room_id: 'R2' };
  const roomExceptions = [{ room_id: 'R1', term_id: 'T1', active: 'TRUE', exception_type: 'WEEKDAY', weekday: 2, is_lineup_day: 'FALSE' }];
  const rows = buildSummaryRows({ ...period, rooms: [room, secondRoom], roomExceptions,
    activeStudentCountByRoom: new Map([['R1', 1], ['R2', 1]]),
    summaryMap: buildAttendanceSummaryMap([...attendance(1), { ...attendance(1)[0], room_id: 'R2' }]),
  });
  assert.equal(rows[0].checked_days, 0);
  assert.equal(rows[1].checked_days, 1);
});

test('closed-term reports preserve graduated students and never divide by the current class size', () => {
  const rows = attendance(30);
  const counts = getReportRosterCounts({ students: [], attendanceRows: rows, term: { end_date: '2026-05-31' }, today: '2026-10-23' });
  assert.equal(counts.get('R1'), 30);
  const result = buildSummaryRows({ ...period, activeStudentCountByRoom: counts, summaryMap: buildAttendanceSummaryMap(rows) })[0];
  assert.equal(result.total_students, 30);
  assert.equal(result.expected_total, 30);
  assert.equal(result.present_percent, '100.00');
  const currentStudents = Array.from({ length: 20 }, (_, index) => ({ student_id: `new-${index}`, room_id: 'R1', active: 'TRUE' }));
  assert.equal(getReportRosterCounts({ students: currentStudents, attendanceRows: rows, term: { end_date: '2026-05-31' }, today: '2026-10-23' }).get('R1'), 30);
});

test('a partially scanned day is marked incomplete without inventing absences or percentages', () => {
  const options = { ...period, activeStudentCountByRoom: new Map([['R1', 30]]), summaryMap: buildAttendanceSummaryMap(attendance(1)) };
  const row = buildSummaryRows(options)[0];
  assert.equal(row.present_count, 1);
  assert.equal(row.absent_count, 0);
  assert.equal(row.expected_total, 30);
  assert.equal(row.partial_days, 1);
  assert.equal(row.present_percent, '');
  assert.match(row.note, /บันทึกไม่ครบ/);
  assert.equal(buildSummaryTotal([row]).present_percent, '');
  const weekly = buildWeeklyRows(options);
  assert.equal(weekly[0].daily[0], '');
  assert.equal(weekly[0].daily[1], 1);
  assert.equal(buildWeeklyTotal(weekly).percent, '');
});

test('legacy duplicate records count each student once and use the latest saved status', () => {
  const record = attendance(1)[0];
  const summary = buildAttendanceSummaryMap([record, { ...record, att_id: 'legacy-id', status: 'A', checked_at: '2026-05-19T02:00:00Z' }]).get(`R1|${day.date}`);
  assert.deepEqual(summary, { totalRecords: 1, presentCount: 0, absentCount: 1 });
});

test('weekly reports retain Monday-Friday columns when Monday has no calendar row', () => {
  const row = buildWeeklyRows({ ...period, activeStudentCountByRoom: new Map([['R1', 1]]), summaryMap: buildAttendanceSummaryMap(attendance(1)) })[0];
  assert.deepEqual(row.daily, ['', 1, '', '', '']);
});

test('daily status honors room exceptions and does not call a partial scan complete', () => {
  const students = [0, 1].map((id) => ({ student_id: String(id), room_id: 'R1', active: 'TRUE' }));
  const options = { rooms: [room], students, schoolDays: [day], attendanceRows: attendance(1), selectedDate: day.date };
  assert.equal(buildDailyStatusRows(options)[0].status, 'partial');
  const row = buildDailyStatusRows({ ...options, roomExceptions: [{ room_id: 'R1', term_id: 'T1', active: 'TRUE', exception_type: 'DATE', date: day.date, is_lineup_day: 'FALSE', note: 'Room holiday' }] })[0];
  assert.equal(row.status, 'holiday');
  assert.equal(row.note, 'Room holiday');
});
