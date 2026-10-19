'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import AppNav from '@/components/AppNav';

export default function SummaryPage() {
  const [currentUser, setCurrentUser] = useState(null);

  const [terms, setTerms] = useState([]);
  const [rooms, setRooms] = useState([]);

  const [selectedTermId, setSelectedTermId] = useState('');
  const [selectedRoomId, setSelectedRoomId] = useState('ALL');

  const [roomSummary, setRoomSummary] = useState([]);
  const [riskStudents, setRiskStudents] = useState([]);

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
      loadBootstrap(parsed);
    } catch {
      localStorage.removeItem('rtc_attendance_user');
      setPageError('ข้อมูลผู้ใช้ไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่');
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (currentUser && selectedTermId) {
      loadSummary();
    }
  }, [currentUser, selectedTermId, selectedRoomId]);

  const overview = useMemo(() => {
    const totalRooms = roomSummary.length;

    const presentCount = roomSummary.reduce(
      (sum, item) => sum + Number(item.present_count || 0),
      0
    );

    const absentCount = roomSummary.reduce(
      (sum, item) => sum + Number(item.absent_count || 0),
      0
    );

    const totalRecords = presentCount + absentCount;

    const presentPercent =
      totalRecords > 0 ? ((presentCount / totalRecords) * 100).toFixed(2) : '0.00';

    const absentPercent =
      totalRecords > 0 ? ((absentCount / totalRecords) * 100).toFixed(2) : '0.00';

    return {
      totalRooms,
      presentCount,
      absentCount,
      totalRecords,
      presentPercent,
      absentPercent,
      riskCount: riskStudents.length,
    };
  }, [roomSummary, riskStudents]);

  async function loadBootstrap(user) {
    try {
      setLoading(true);
      setPageError('');

      const { data: termData, error: termError } = await supabase
        .from('terms')
        .select('*')
        .order('term_id', { ascending: false });

      if (termError) {
        throw new Error(termError.message);
      }

      let roomQuery = supabase
        .from('rooms')
        .select('*')
        .order('level', { ascending: true })
        .order('year', { ascending: true })
        .order('room_no', { ascending: true })
        .order('room_id', { ascending: true });

      const isAdmin = String(user.role || '').toLowerCase() === 'admin';
      const roomIds = parseRoomIds(user.room_ids);

      if (!isAdmin && !roomIds.includes('ALL')) {
        roomQuery = roomQuery.in('room_id', roomIds);
      }

      const { data: roomData, error: roomError } = await roomQuery;

      if (roomError) {
        throw new Error(roomError.message);
      }

      const nextTerms = termData || [];
      const nextRooms = roomData || [];

      setTerms(nextTerms);
      setRooms(nextRooms);

      if (nextTerms.length > 0) {
        setSelectedTermId(nextTerms[0].term_id);
      }

      if (!isAdmin && nextRooms.length > 0) {
        setSelectedRoomId(nextRooms[0].room_id);
      }
    } catch (err) {
      setPageError(err.message || 'โหลดข้อมูลเริ่มต้นไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }

  async function loadSummary() {
    try {
      setLoading(true);
      setPageError('');

      let roomSummaryQuery = supabase
        .from('room_term_summary')
        .select('*')
        .eq('term_id', selectedTermId)
        .order('level', { ascending: true })
        .order('year', { ascending: true })
        .order('room_no', { ascending: true })
        .order('room_id', { ascending: true });

      let riskQuery = supabase
        .from('student_term_summary')
        .select('*')
        .eq('term_id', selectedTermId)
        .neq('risk_level', '')
        .order('absent_percent', { ascending: false })
        .order('room_id', { ascending: true })
        .order('student_id', { ascending: true });

      const isAdmin = String(currentUser.role || '').toLowerCase() === 'admin';
      const roomIds = parseRoomIds(currentUser.room_ids);

      if (selectedRoomId !== 'ALL') {
        roomSummaryQuery = roomSummaryQuery.eq('room_id', selectedRoomId);
        riskQuery = riskQuery.eq('room_id', selectedRoomId);
      } else if (!isAdmin && !roomIds.includes('ALL')) {
        roomSummaryQuery = roomSummaryQuery.in('room_id', roomIds);
        riskQuery = riskQuery.in('room_id', roomIds);
      }

      const [
        { data: roomSummaryData, error: roomSummaryError },
        { data: riskData, error: riskError },
      ] = await Promise.all([roomSummaryQuery, riskQuery]);

      if (roomSummaryError) {
        throw new Error(roomSummaryError.message);
      }

      if (riskError) {
        throw new Error(riskError.message);
      }

      setRoomSummary(roomSummaryData || []);
      setRiskStudents(
        (riskData || []).map((student) => ({
          ...student,
          risk_level: getRiskLevelFromAbsentPercent(student.absent_percent),
        }))
      );
    } catch (err) {
      setPageError(err.message || 'โหลดข้อมูลสรุปไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }

  function goHome() {
    window.location.href = '/';
  }

  return (
    <main className="min-h-screen bg-slate-100 px-3 py-4 sm:px-5 sm:py-5 lg:px-6 lg:py-6">
      <div className="mx-auto max-w-7xl">
        <AppNav currentUser={currentUser} active="summary" />

        <section className="mb-4 rounded-3xl bg-white p-4 shadow-sm sm:mb-6 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-2xl font-black text-slate-800 sm:text-3xl">
                Summary Dashboard
              </h1>
              <p className="mt-1 text-sm text-slate-500 sm:text-base">
                สรุปผลการเข้าแถว แผนกวิชาช่างไฟฟ้ากำลัง
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={loadSummary}
                disabled={loading || !currentUser}
                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700 disabled:opacity-50"
              >
                โหลดข้อมูลใหม่
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
          <section className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 sm:mb-6">
            <div className="font-bold">เกิดข้อผิดพลาด</div>
            <div>{pageError}</div>
          </section>
        )}

        <section className="mb-4 rounded-3xl bg-white p-4 shadow-sm sm:mb-6 sm:p-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-bold text-slate-700">
                ภาคเรียน
              </label>
              <select
                value={selectedTermId}
                onChange={(e) => setSelectedTermId(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500 sm:text-base"
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
                ห้องเรียน
              </label>
              <select
                value={selectedRoomId}
                onChange={(e) => setSelectedRoomId(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500 sm:text-base"
              >
                {String(currentUser?.role || '').toLowerCase() === 'admin' && (
                  <option value="ALL">ทุกห้อง</option>
                )}

                {rooms.map((room) => (
                  <option key={room.room_id} value={room.room_id}>
                    {room.room_name || room.room_id}
                  </option>
                ))}
              </select>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
              <div className="font-bold text-slate-800">ผู้ใช้งาน</div>
              <div>{currentUser?.name || '-'}</div>
              <div className="mt-1 inline-block rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
                {currentUser?.role || '-'}
              </div>
            </div>
          </div>
        </section>

        <section className="mb-4 grid grid-cols-2 gap-3 sm:mb-6 lg:grid-cols-4 lg:gap-4">
          <SummaryCard title="ห้องที่แสดง" value={overview.totalRooms} unit="ห้อง" />
          <SummaryCard
            title="มาเข้าแถวรวม"
            value={overview.presentCount}
            unit={`ครั้ง (${overview.presentPercent}%)`}
          />
          <SummaryCard
            title="ขาดรวม"
            value={overview.absentCount}
            unit={`ครั้ง (${overview.absentPercent}%)`}
          />
          <SummaryCard
            title="นักเรียนกลุ่มเสี่ยง"
            value={overview.riskCount}
            unit="คน"
          />
        </section>

        <section className="mb-4 rounded-3xl bg-white p-4 shadow-sm sm:mb-6 sm:p-6">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-black text-slate-800 sm:text-xl">
                สรุปผลรายห้อง
              </h2>
              <p className="text-sm text-slate-500">
                ดึงจาก View: room_term_summary
              </p>
              <p className="mt-1 text-xs font-semibold text-slate-400 sm:hidden">
                เลื่อนตารางซ้าย-ขวาเพื่อดูข้อมูลทั้งหมด
              </p>
            </div>

            {loading && (
              <span className="w-fit rounded-full bg-blue-100 px-4 py-2 text-sm font-bold text-blue-700">
                กำลังโหลด...
              </span>
            )}
          </div>

          <ResponsiveTable>
            <table className="min-w-[720px] border-collapse bg-white text-sm">
              <thead className="bg-slate-900 text-white">
                <tr>
                  <th className="whitespace-nowrap px-4 py-3 text-left">ห้อง</th>
                  <th className="whitespace-nowrap px-4 py-3 text-center">มา</th>
                  <th className="whitespace-nowrap px-4 py-3 text-center">ขาด</th>
                  <th className="whitespace-nowrap px-4 py-3 text-center">มา %</th>
                  <th className="whitespace-nowrap px-4 py-3 text-center">ขาด %</th>
                </tr>
              </thead>

              <tbody>
                {roomSummary.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="px-4 py-8 text-center text-slate-500">
                      ไม่พบข้อมูลสรุปรายห้อง
                    </td>
                  </tr>
                ) : (
                  roomSummary.map((row) => (
                    <tr
                      key={`${row.term_id}_${row.room_id}`}
                      className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
                    >
                      <td className="whitespace-nowrap px-4 py-3 font-bold text-slate-700">
                        {row.room_name || row.room_id}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-center font-bold text-emerald-700">
                        {row.present_count}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-center font-bold text-red-700">
                        {row.absent_count}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-center font-bold text-emerald-700">
                        {formatPercent(row.present_percent)}%
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-center font-bold text-red-700">
                        {formatPercent(row.absent_percent)}%
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </ResponsiveTable>
        </section>

        <section className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-4">
            <h2 className="text-lg font-black text-slate-800 sm:text-xl">
              นักเรียนกลุ่มเสี่ยง
            </h2>
            <p className="text-sm text-slate-500">
              เฝ้าระวัง 5% / เสี่ยงสูง 10% / เสี่ยงสูงมาก 15% / ตกกิจกรรม 20%
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-400 sm:hidden">
              เลื่อนตารางซ้าย-ขวาเพื่อดูข้อมูลทั้งหมด
            </p>
          </div>

          <ResponsiveTable>
            <table className="min-w-[1040px] border-collapse bg-white text-sm">
              <thead className="bg-slate-900 text-white">
                <tr>
                  <th className="whitespace-nowrap px-4 py-3 text-left">ห้อง</th>
                  <th className="whitespace-nowrap px-4 py-3 text-left">รหัส</th>
                  <th className="whitespace-nowrap px-4 py-3 text-left">ชื่อ - สกุล</th>
                  <th className="whitespace-nowrap px-4 py-3 text-center">มา</th>
                  <th className="whitespace-nowrap px-4 py-3 text-center">ขาด</th>
                  <th className="whitespace-nowrap px-4 py-3 text-center">ขาด %</th>
                  <th className="whitespace-nowrap px-4 py-3 text-center">
                    ระดับความเสี่ยง
                  </th>
                </tr>
              </thead>

              <tbody>
                {riskStudents.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="px-4 py-8 text-center text-slate-500">
                      ยังไม่พบนักเรียนกลุ่มเสี่ยง
                    </td>
                  </tr>
                ) : (
                  riskStudents.map((student) => (
                    <tr
                      key={`${student.term_id}_${student.room_id}_${student.student_id}`}
                      className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
                    >
                      <td className="whitespace-nowrap px-4 py-3 font-bold text-slate-700">
                        {student.room_name || student.room_id}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                        {student.student_id}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                        {student.prefix || ''}
                        {student.first_name || ''} {student.last_name || ''}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-center text-emerald-700">
                        {student.present_count}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-center text-red-700">
                        {student.absent_count}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-center font-bold text-red-700">
                        {formatPercent(student.absent_percent)}%
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-center">
                        <RiskBadge risk={student.risk_level} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </ResponsiveTable>
        </section>
      </div>
    </main>
  );
}

function ResponsiveTable({ children }) {
  return (
    <div
      className="max-w-full overflow-x-auto rounded-2xl border border-slate-200"
      style={{
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <div className="min-w-full">{children}</div>
    </div>
  );
}

function SummaryCard({ title, value, unit }) {
  return (
    <div className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
      <div className="text-xs font-medium text-slate-500 sm:text-sm">{title}</div>
      <div className="mt-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:gap-2">
        <span className="text-3xl font-black text-slate-800 sm:text-4xl">
          {value}
        </span>
        <span className="text-xs text-slate-500 sm:pb-1 sm:text-sm">{unit}</span>
      </div>
    </div>
  );
}

function getRiskLevelFromAbsentPercent(value) {
  const percent = Number(value || 0);

  if (percent >= 20) return 'ตกกิจกรรม';
  if (percent >= 15) return 'เสี่ยงสูงมาก';
  if (percent >= 10) return 'เสี่ยงสูง';
  if (percent >= 5) return 'เฝ้าระวัง';

  return '';
}

function RiskBadge({ risk }) {
  const text = String(risk || '');

  if (text === 'ตกกิจกรรม') {
    return (
      <span className="rounded-full bg-red-900 px-3 py-1 text-xs font-black text-white">
        ตกกิจกรรม
      </span>
    );
  }

  if (text === 'เสี่ยงสูงมาก') {
    return (
      <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-black text-red-700">
        เสี่ยงสูงมาก
      </span>
    );
  }

  if (text === 'เสี่ยงสูง') {
    return (
      <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-black text-orange-700">
        เสี่ยงสูง
      </span>
    );
  }

  if (text === 'เฝ้าระวัง') {
    return (
      <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-700">
        เฝ้าระวัง
      </span>
    );
  }

  return (
    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">
      ปกติ
    </span>
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

function formatPercent(value) {
  const number = Number(value || 0);
  return number.toFixed(2);
}
