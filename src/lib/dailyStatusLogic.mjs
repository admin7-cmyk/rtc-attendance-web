import { applyRoomExceptionToSchoolDay, isTrueValue, normalizeDate, normalizeRoomId } from './attendanceLogic.mjs';
import { buildAttendanceSummaryMap } from './reportLogic.mjs';

export function buildDailyStatusRows({ rooms, students, schoolDays, attendanceRows, roomExceptions = [], selectedDate }) {
  const counts = new Map();
  students.filter((student) => isTrueValue(student.active)).forEach((student) => {
    const key = normalizeRoomId(student.room_id);
    counts.set(key, Number(counts.get(key) || 0) + 1);
  });
  const summaries = buildAttendanceSummaryMap(attendanceRows.filter((row) => normalizeDate(row.date) === selectedDate));
  return rooms.map((room) => {
    const roomKey = normalizeRoomId(room.room_id);
    const summary = summaries.get(`${roomKey}|${selectedDate}`);
    const checkedCount = summary?.totalRecords || 0;
    const totalStudents = Math.max(Number(counts.get(roomKey) || 0), checkedCount);
    const baseDay = schoolDays.find((day) => normalizeDate(day.date) === selectedDate && day.schedule_group === room.schedule_group);
    const schoolDay = baseDay ? applyRoomExceptionToSchoolDay({ schoolDay: baseDay, roomExceptions, roomId: room.room_id }) : null;
    let status = 'not_scheduled';
    let statusLabel = 'ไม่มีข้อมูลวันเข้าแถว';
    let note = 'ไม่พบข้อมูลใน school_days';
    if (schoolDay && !isTrueValue(schoolDay.is_lineup_day)) {
      status = 'holiday'; statusLabel = 'ไม่ต้องเข้าแถว'; note = schoolDay.note || 'วันนี้ไม่ใช่วันเข้าแถว';
    } else if (schoolDay) {
      if (!checkedCount) {
        status = 'missing'; statusLabel = 'ยังไม่บันทึก'; note = 'ยังไม่มีข้อมูลเช็กชื่อของห้องนี้';
      } else if (checkedCount < totalStudents) {
        status = 'partial'; statusLabel = 'บันทึกไม่ครบ'; note = `บันทึกแล้ว ${checkedCount}/${totalStudents} คน`;
      } else {
        status = 'done'; statusLabel = 'บันทึกแล้ว'; note = `ครบ ${checkedCount}/${totalStudents} คน`;
      }
    }
    return {
      room_id: room.room_id, room_name: room.room_name || room.room_id,
      level: room.level, year: room.year, room_no: room.room_no, schedule_group: room.schedule_group,
      total_students: totalStudents, checked_count: checkedCount,
      present_count: summary?.presentCount || 0, absent_count: summary?.absentCount || 0,
      status, statusLabel, note, schoolDay,
    };
  }).filter((row) => row.total_students > 0);
}
