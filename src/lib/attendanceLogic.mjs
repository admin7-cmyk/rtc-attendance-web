export function cleanText(value) {
  if (value === null || value === undefined) return '';

  return String(value).trim();
}

export function isTrueValue(value) {
  const text = cleanText(value).toUpperCase();

  return (
    value === true ||
    text === 'TRUE' ||
    text === '1' ||
    text === 'YES' ||
    text === 'Y'
  );
}

export function normalizeRoomId(value) {
  return cleanText(value)
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .replace(/\./g, '')
    .replace(/-/g, '/');
}

export function parseRoomIds(roomIdsText) {
  const text = cleanText(roomIdsText);

  if (!text) return [];
  if (text.toUpperCase() === 'ALL') return ['ALL'];

  return text
    .split(/[,;|\s]+/)
    .map((item) => cleanText(item))
    .filter(Boolean);
}

export function normalizeStatus(status) {
  const text = cleanText(status).toUpperCase();

  if (
    text === 'P' ||
    text === 'PRESENT' ||
    text === 'มา' ||
    text === 'มาเรียน' ||
    text === 'TRUE' ||
    text === '1'
  ) {
    return 'P';
  }

  if (
    text === 'A' ||
    text === 'ABSENT' ||
    text === 'ขาด' ||
    text === 'FALSE' ||
    text === '0'
  ) {
    return 'A';
  }

  return '';
}

export function normalizeScanStudentId(value) {
  const text = cleanText(value);

  if (!text) return '';

  const direct = text.replace(/\s+/g, '');

  if (/^\d+$/.test(direct)) {
    return direct;
  }

  const match = text.match(/\d{6,20}/);

  return match ? match[0] : direct;
}

export function normalizeDate(value) {
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

export function getMonthKey(ymd) {
  const date = normalizeDate(ymd);

  if (!date || date.length < 7) return '';

  return date.slice(0, 7);
}

export function buildAttendanceId(date, roomId, studentId) {
  const safeDate = normalizeDate(date);
  const safeRoomId = cleanText(roomId);
  const safeStudentId = cleanText(studentId);

  if (!safeDate || !safeRoomId || !safeStudentId) return '';

  return `${safeDate}_${safeRoomId}_${safeStudentId}`;
}

export function getWeekdayFromYmd(ymd) {
  const [yearText, monthText, dayText] = normalizeDate(ymd).split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (!year || !month || !day) return null;

  return new Date(year, month - 1, day).getDay();
}

export function applyRoomExceptionToSchoolDay({ schoolDay, roomExceptions, roomId }) {
  const dateText = normalizeDate(schoolDay?.date);
  const termId = cleanText(schoolDay?.term_id);
  const weekday = getWeekdayFromYmd(dateText);

  const activeExceptions = (roomExceptions || []).filter(
    (item) => isTrueValue(item.active) && cleanText(item.term_id) === termId &&
      (!roomId || normalizeRoomId(item.room_id) === normalizeRoomId(roomId))
  );

  const exactDateException = activeExceptions.find(
    (item) =>
      item.exception_type === 'DATE' && normalizeDate(item.date) === dateText
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

export function getRiskLevelFromAbsentPercent(value) {
  const percent = Number(value || 0);

  if (percent >= 20) return 'ตกกิจกรรม';
  if (percent >= 15) return 'เสี่ยงสูงมาก';
  if (percent >= 10) return 'เสี่ยงสูง';
  if (percent >= 5) return 'เฝ้าระวัง';

  return '';
}
