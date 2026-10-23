import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyRoomExceptionToSchoolDay,
  buildAttendanceId,
  getMonthKey,
  getRiskLevelFromAbsentPercent,
  isTrueValue,
  normalizeDate,
  normalizeRoomId,
  normalizeScanStudentId,
  normalizeStatus,
  parseRoomIds,
} from '../src/lib/attendanceLogic.mjs';
import {
  hashPin,
  isHashedPin,
  normalizeStoredPin,
  verifyPin,
} from '../src/lib/pinHash.mjs';

test('normalizes room ids for permission and lookup comparisons', () => {
  assert.equal(normalizeRoomId(' ปวช.1-2 '), 'ปวช1/2');
  assert.equal(normalizeRoomId('ปวส 2 / 1'), 'ปวส2/1');
});

test('parses room id lists and preserves ALL shortcut', () => {
  assert.deepEqual(parseRoomIds('ปวช1/1, ปวช1/2;ปวส1/1'), [
    'ปวช1/1',
    'ปวช1/2',
    'ปวส1/1',
  ]);
  assert.deepEqual(parseRoomIds('ALL'), ['ALL']);
});

test('normalizes attendance statuses from common values', () => {
  assert.equal(normalizeStatus('present'), 'P');
  assert.equal(normalizeStatus('มา'), 'P');
  assert.equal(normalizeStatus('มาเรียน'), 'P');
  assert.equal(normalizeStatus('1'), 'P');
  assert.equal(normalizeStatus('false'), 'A');
  assert.equal(normalizeStatus('ขาด'), 'A');
  assert.equal(normalizeStatus('0'), 'A');
  assert.equal(normalizeStatus('late'), '');
});

test('extracts student ids from QR and barcode payloads', () => {
  assert.equal(normalizeScanStudentId('  69201040001  '), '69201040001');
  assert.equal(normalizeScanStudentId('student_id=69201040001&room=1'), '69201040001');
  assert.equal(normalizeScanStudentId('ABC123'), 'ABC123');
});

test('normalizes Gregorian and Thai Buddhist date input', () => {
  assert.equal(normalizeDate('2026-05-18T00:00:00.000Z'), '2026-05-18');
  assert.equal(normalizeDate('18/5/2569'), '2026-05-18');
  assert.equal(getMonthKey('18/5/2569'), '2026-05');
});

test('builds stable attendance ids only when all parts are present', () => {
  assert.equal(
    buildAttendanceId('18/5/2569', 'ปวช1/1', '69201040001'),
    '2026-05-18_ปวช1/1_69201040001'
  );
  assert.equal(buildAttendanceId('', 'ปวช1/1', '69201040001'), '');
});

test('applies exact-date room exceptions before weekday exceptions', () => {
  const schoolDay = {
    date: '2026-05-19',
    term_id: '1/2569',
    is_lineup_day: 'TRUE',
    note: '',
  };

  const result = applyRoomExceptionToSchoolDay({
    schoolDay,
    roomExceptions: [
      {
        id: 'weekday',
        term_id: '1/2569',
        exception_type: 'WEEKDAY',
        weekday: 2,
        is_lineup_day: 'TRUE',
        note: 'weekday rule',
        active: 'TRUE',
      },
      {
        id: 'date',
        term_id: '1/2569',
        exception_type: 'DATE',
        date: '2026-05-19',
        is_lineup_day: 'FALSE',
        note: 'date override',
        active: 'TRUE',
      },
    ],
  });

  assert.equal(result.room_exception_id, 'date');
  assert.equal(result.is_lineup_day, 'FALSE');
  assert.equal(result.note, 'date override');
});

test('classifies attendance risk thresholds', () => {
  assert.equal(getRiskLevelFromAbsentPercent(4.99), '');
  assert.equal(getRiskLevelFromAbsentPercent(5), 'เฝ้าระวัง');
  assert.equal(getRiskLevelFromAbsentPercent(10), 'เสี่ยงสูง');
  assert.equal(getRiskLevelFromAbsentPercent(15), 'เสี่ยงสูงมาก');
  assert.equal(getRiskLevelFromAbsentPercent(20), 'ตกกิจกรรม');
});

test('recognizes true-like active values', () => {
  assert.equal(isTrueValue(true), true);
  assert.equal(isTrueValue('YES'), true);
  assert.equal(isTrueValue('0'), false);
});

test('hashes PIN values and verifies legacy plaintext PINs', async () => {
  const hash = await hashPin('1234');

  assert.equal(isHashedPin(hash), true);
  assert.equal(await verifyPin('1234', hash), true);
  assert.equal(await verifyPin('9999', hash), false);
  assert.equal(await verifyPin('1234', '1234'), true);
  assert.equal(await verifyPin('9999', '1234'), false);
});

test('normalizes stored PIN values without double-hashing', async () => {
  const hash = await normalizeStoredPin('1234');

  assert.equal(isHashedPin(hash), true);
  assert.equal(await normalizeStoredPin(hash), hash);
});
