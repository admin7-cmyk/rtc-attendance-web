'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import AppNav from '@/components/AppNav';

const PAGE_SIZE = 1000;

const EMPTY_TERM_FORM = {
  term_id: '',
  term_name: '',
  start_date: '',
  end_date: '',
  total_weeks: '',
};

const EMPTY_DAY_FORM = {
  date: '',
  term_id: '',
  level_group: '',
  schedule_group: 'ปวช',
  week_no: '',
  month_key: '',
  is_lineup_day: 'TRUE',
  note: '',
};

const EMPTY_GENERATOR_FORM = {
  term_id: '',
  start_date: '',
  end_date: '',
  total_weeks: '',
  create_pvc: true,
  create_pvs: true,
  create_pvs_m6: true,
  holiday_text: '',
  note: 'สร้างอัตโนมัติ',
};

export default function AdminTermsPage() {
  const [currentUser, setCurrentUser] = useState(null);

  const [terms, setTerms] = useState([]);
  const [schoolDays, setSchoolDays] = useState([]);

  const [termForm, setTermForm] = useState(EMPTY_TERM_FORM);
  const [dayForm, setDayForm] = useState(EMPTY_DAY_FORM);
  const [generatorForm, setGeneratorForm] = useState(EMPTY_GENERATOR_FORM);

  const [editingTermId, setEditingTermId] = useState('');
  const [editingDayKey, setEditingDayKey] = useState('');

  const [selectedTermFilter, setSelectedTermFilter] = useState('ALL');
  const [scheduleGroupFilter, setScheduleGroupFilter] = useState('ALL');
  const [lineupFilter, setLineupFilter] = useState('ALL');
  const [searchText, setSearchText] = useState('');

  const [showGenerator, setShowGenerator] = useState(false);

  const [loading, setLoading] = useState(true);
  const [savingTerm, setSavingTerm] = useState(false);
  const [savingDay, setSavingDay] = useState(false);
  const [savingGenerator, setSavingGenerator] = useState(false);

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

  const filteredSchoolDays = useMemo(() => {
    const keyword = String(searchText || '').trim().toLowerCase();

    return schoolDays.filter((day) => {
      if (selectedTermFilter !== 'ALL' && day.term_id !== selectedTermFilter) {
        return false;
      }

      if (
        scheduleGroupFilter !== 'ALL' &&
        String(day.schedule_group || '') !== scheduleGroupFilter
      ) {
        return false;
      }

      if (lineupFilter === 'TRUE' && !isTrueValue(day.is_lineup_day)) {
        return false;
      }

      if (lineupFilter === 'FALSE' && isTrueValue(day.is_lineup_day)) {
        return false;
      }

      if (!keyword) return true;

      const combined = [
        day.date,
        day.term_id,
        day.level_group,
        day.schedule_group,
        day.week_no,
        day.month_key,
        day.is_lineup_day,
        day.note,
      ]
        .join(' ')
        .toLowerCase();

      return combined.includes(keyword);
    });
  }, [
    schoolDays,
    selectedTermFilter,
    scheduleGroupFilter,
    lineupFilter,
    searchText,
  ]);

  const overview = useMemo(() => {
    const totalDays = schoolDays.length;
    const lineupDays = schoolDays.filter((day) =>
      isTrueValue(day.is_lineup_day)
    ).length;
    const offDays = totalDays - lineupDays;

    return {
      termCount: terms.length,
      totalDays,
      lineupDays,
      offDays,
    };
  }, [terms, schoolDays]);

  const generatedRows = useMemo(() => {
    return generateSchoolDays(generatorForm);
  }, [generatorForm]);

  const generatorOverview = useMemo(() => {
    const existingCount = generatedRows.filter((row) =>
      schoolDays.some((day) => makeSchoolDayKey(day) === makeSchoolDayKey(row))
    ).length;

    const newCount = generatedRows.length - existingCount;

    return {
      total: generatedRows.length,
      newCount,
      existingCount,
      holidayCount: parseHolidayDates(generatorForm.holiday_text).length,
    };
  }, [generatedRows, schoolDays, generatorForm.holiday_text]);

  async function loadPageData() {
    try {
      setLoading(true);
      setPageError('');
      setSuccessMessage('');

      const [termData, schoolDayData] = await Promise.all([
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
            .order('schedule_group', { ascending: true })
            .range(from, to)
        ),
      ]);

      setTerms(termData || []);
      setSchoolDays(schoolDayData || []);

      if ((termData || []).length > 0) {
        const latestTerm = termData[0];

        setTermForm((prev) => ({
          ...prev,
          term_id: prev.term_id || latestTerm.term_id || '',
        }));

        setDayForm((prev) => ({
          ...prev,
          term_id: prev.term_id || latestTerm.term_id || '',
        }));

        setGeneratorForm((prev) => ({
          ...prev,
          term_id: prev.term_id || latestTerm.term_id || '',
          start_date: prev.start_date || normalizeDate(latestTerm.start_date),
          end_date: prev.end_date || normalizeDate(latestTerm.end_date),
          total_weeks: prev.total_weeks || latestTerm.total_weeks || '',
        }));
      }
    } catch (err) {
      setPageError(err.message || 'โหลดข้อมูลไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }

  function updateTermForm(field, value) {
    setTermForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  function updateDayForm(field, value) {
    setDayForm((prev) => {
      const next = {
        ...prev,
        [field]: value,
      };

      if (field === 'date' && value) {
        next.month_key = getMonthKey(value);
      }

      return next;
    });
  }

  function updateGeneratorForm(field, value) {
    setGeneratorForm((prev) => {
      const next = {
        ...prev,
        [field]: value,
      };

      if (field === 'term_id') {
        const selectedTerm = terms.find((term) => term.term_id === value);

        if (selectedTerm) {
          next.start_date = normalizeDate(selectedTerm.start_date);
          next.end_date = normalizeDate(selectedTerm.end_date);
          next.total_weeks = selectedTerm.total_weeks || '';
        }
      }

      return next;
    });
  }

  function startCreateTerm() {
    setEditingTermId('');
    setTermForm(EMPTY_TERM_FORM);
    setPageError('');
    setSuccessMessage('');
  }

  function startEditTerm(term) {
    setEditingTermId(term.term_id || '');

    setTermForm({
      term_id: term.term_id || '',
      term_name: term.term_name || '',
      start_date: normalizeDate(term.start_date),
      end_date: normalizeDate(term.end_date),
      total_weeks: term.total_weeks || '',
    });

    setPageError('');
    setSuccessMessage('');
  }

  function resetTermForm() {
    setEditingTermId('');
    setTermForm(EMPTY_TERM_FORM);
    setPageError('');
    setSuccessMessage('');
  }

  async function saveTerm(event) {
    event.preventDefault();

    try {
      setSavingTerm(true);
      setPageError('');
      setSuccessMessage('');

      const termId = String(termForm.term_id || '').trim();
      const termName = String(termForm.term_name || '').trim();
      const startDate = String(termForm.start_date || '').trim();
      const endDate = String(termForm.end_date || '').trim();
      const totalWeeks = String(termForm.total_weeks || '').trim();

      if (!termId) throw new Error('กรุณากรอก term_id เช่น 1/2569');
      if (!termName) throw new Error('กรุณากรอกชื่อภาคเรียน');
      if (!startDate) throw new Error('กรุณาเลือกวันเปิดภาคเรียน');
      if (!endDate) throw new Error('กรุณาเลือกวันปิดภาคเรียน');
      if (!totalWeeks) throw new Error('กรุณากรอกจำนวนสัปดาห์');

      const row = {
        term_id: termId,
        term_name: termName,
        start_date: startDate,
        end_date: endDate,
        total_weeks: totalWeeks,
      };

      const { error } = await supabase.from('terms').upsert(row, {
        onConflict: 'term_id',
      });

      if (error) throw new Error(error.message);

      setSuccessMessage(
        editingTermId
          ? `แก้ไขภาคเรียน ${termName} สำเร็จ`
          : `เพิ่มภาคเรียน ${termName} สำเร็จ`
      );

      await loadPageData();
      resetTermForm();
    } catch (err) {
      setPageError(err.message || 'บันทึกภาคเรียนไม่สำเร็จ');
    } finally {
      setSavingTerm(false);
    }
  }

  function startCreateDay() {
    const latestTermId = terms[0]?.term_id || '';
    const today = getTodayYmd();

    setEditingDayKey('');
    setDayForm({
      ...EMPTY_DAY_FORM,
      term_id: latestTermId,
      date: today,
      month_key: getMonthKey(today),
    });
    setPageError('');
    setSuccessMessage('');
  }

  function startEditDay(day) {
    const key = makeSchoolDayKey(day);

    setEditingDayKey(key);

    setDayForm({
      date: normalizeDate(day.date),
      term_id: day.term_id || '',
      level_group: day.level_group || '',
      schedule_group: day.schedule_group || '',
      week_no: day.week_no || '',
      month_key: day.month_key || getMonthKey(day.date),
      is_lineup_day: isTrueValue(day.is_lineup_day) ? 'TRUE' : 'FALSE',
      note: day.note || '',
    });

    setPageError('');
    setSuccessMessage('');
  }

  function resetDayForm() {
    setEditingDayKey('');
    setDayForm(EMPTY_DAY_FORM);
    setPageError('');
    setSuccessMessage('');
  }

  async function saveSchoolDay(event) {
    event.preventDefault();

    try {
      setSavingDay(true);
      setPageError('');
      setSuccessMessage('');

      const date = String(dayForm.date || '').trim();
      const termId = String(dayForm.term_id || '').trim();
      const levelGroup = String(dayForm.level_group || '').trim();
      const scheduleGroup = String(dayForm.schedule_group || '').trim();
      const weekNo = String(dayForm.week_no || '').trim();
      const monthKey = String(dayForm.month_key || '').trim() || getMonthKey(date);
      const isLineupDay = String(dayForm.is_lineup_day || 'TRUE')
        .trim()
        .toUpperCase();
      const note = String(dayForm.note || '').trim();

      if (!date) throw new Error('กรุณาเลือกวันที่');
      if (!termId) throw new Error('กรุณาเลือกภาคเรียน');
      if (!scheduleGroup) throw new Error('กรุณากรอก schedule_group');
      if (!weekNo) throw new Error('กรุณากรอก week_no');

      const row = {
        date,
        term_id: termId,
        level_group: levelGroup,
        schedule_group: scheduleGroup,
        week_no: weekNo,
        month_key: monthKey,
        is_lineup_day: isLineupDay === 'TRUE' ? 'TRUE' : 'FALSE',
        note,
      };

      const oldKey = editingDayKey;
      const nextKey = makeSchoolDayKey(row);

      if (oldKey && oldKey !== nextKey) {
        const oldParts = parseSchoolDayKey(oldKey);

        const { error: oldUpdateError } = await supabase
          .from('school_days')
          .update(row)
          .eq('date', oldParts.date)
          .eq('term_id', oldParts.term_id)
          .eq('schedule_group', oldParts.schedule_group);

        if (oldUpdateError) throw new Error(oldUpdateError.message);
      } else {
        await upsertSchoolDayRow(row, schoolDays);
      }

      setSuccessMessage(
        editingDayKey
          ? `แก้ไขวันเข้าแถว ${formatThaiDate(date)} สำเร็จ`
          : `เพิ่มวันเข้าแถว ${formatThaiDate(date)} สำเร็จ`
      );

      await loadPageData();
      resetDayForm();
    } catch (err) {
      setPageError(err.message || 'บันทึกวันเข้าแถวไม่สำเร็จ');
    } finally {
      setSavingDay(false);
    }
  }

  async function saveGeneratedRows() {
    try {
      setSavingGenerator(true);
      setPageError('');
      setSuccessMessage('');

      if (!generatorForm.term_id) {
        throw new Error('กรุณาเลือกภาคเรียน');
      }

      if (!generatorForm.start_date || !generatorForm.end_date) {
        throw new Error('กรุณากำหนดวันเริ่มต้นและวันสิ้นสุด');
      }

      if (generatedRows.length === 0) {
        throw new Error('ไม่พบวันเข้าแถวสำหรับสร้าง กรุณาตรวจช่วงวันที่หรือกลุ่มที่เลือก');
      }

      const confirmText = [
        'ยืนยันสร้างวันเข้าแถวอัตโนมัติ',
        '',
        `ภาคเรียน: ${generatorForm.term_id}`,
        `ช่วงวันที่: ${formatThaiDate(generatorForm.start_date)} - ${formatThaiDate(generatorForm.end_date)}`,
        `จำนวนรายการทั้งหมด: ${generatedRows.length} รายการ`,
        `รายการใหม่โดยประมาณ: ${generatorOverview.newCount} รายการ`,
        `รายการเดิมที่จะอัปเดต: ${generatorOverview.existingCount} รายการ`,
        '',
        'ต้องการดำเนินการต่อใช่ไหม?',
      ].join('\n');

      const ok = window.confirm(confirmText);

      if (!ok) return;

      for (const row of generatedRows) {
        await upsertSchoolDayRow(row, schoolDays);
      }

      setSuccessMessage(`สร้างวันเข้าแถวอัตโนมัติสำเร็จ ${generatedRows.length} รายการ`);
      await loadPageData();
    } catch (err) {
      setPageError(err.message || 'สร้างวันเข้าแถวอัตโนมัติไม่สำเร็จ');
    } finally {
      setSavingGenerator(false);
    }
  }

  async function toggleSchoolDayLineup(day) {
    try {
      setSavingDay(true);
      setPageError('');
      setSuccessMessage('');

      const nextValue = isTrueValue(day.is_lineup_day) ? 'FALSE' : 'TRUE';

      const ok = window.confirm(
        `ต้องการเปลี่ยนวันที่ ${formatThaiDate(day.date)} กลุ่ม ${day.schedule_group} เป็น ${
          nextValue === 'TRUE' ? 'วันเข้าแถว' : 'ไม่เข้าแถว'
        } ใช่ไหม?`
      );

      if (!ok) return;

      const { error } = await supabase
        .from('school_days')
        .update({
          is_lineup_day: nextValue,
        })
        .eq('date', day.date)
        .eq('term_id', day.term_id)
        .eq('schedule_group', day.schedule_group);

      if (error) throw new Error(error.message);

      setSuccessMessage('เปลี่ยนสถานะวันเข้าแถวสำเร็จ');
      await loadPageData();
    } catch (err) {
      setPageError(err.message || 'เปลี่ยนสถานะไม่สำเร็จ');
    } finally {
      setSavingDay(false);
    }
  }

  function goAdmin() {
    window.location.href = '/admin';
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
        <AppNav currentUser={currentUser} active="admin-terms" />

        <section className="mb-4 rounded-3xl bg-white p-4 shadow-sm sm:mb-6 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-2xl font-black text-slate-800 sm:text-3xl">
                จัดการภาคเรียน / วันเข้าแถว
              </h1>
              <p className="mt-1 text-sm text-slate-500 sm:text-base">
                แก้ไขข้อมูล terms และ school_days โดยไม่ต้องเข้า Supabase
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={startCreateTerm}
                className="rounded-full bg-blue-100 px-4 py-2 text-sm font-bold text-blue-700 hover:bg-blue-200"
              >
                เพิ่มภาคเรียน
              </button>

              <button
                onClick={startCreateDay}
                className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700"
              >
                เพิ่มวันเข้าแถว
              </button>

              <button
                onClick={() => setShowGenerator((prev) => !prev)}
                className={`rounded-full px-4 py-2 text-sm font-bold ${
                  showGenerator
                    ? 'bg-pink-600 text-white hover:bg-pink-700'
                    : 'bg-pink-100 text-pink-700 hover:bg-pink-200'
                }`}
              >
                สร้างวันเข้าแถวอัตโนมัติ
              </button>

              <button
                onClick={loadPageData}
                disabled={loading}
                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700 disabled:opacity-50"
              >
                โหลดข้อมูลใหม่
              </button>

              <button
                onClick={goAdmin}
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

        <section className="mb-4 grid grid-cols-2 gap-3 sm:mb-6 lg:grid-cols-4 lg:gap-4">
          <StatCard title="ภาคเรียน" value={overview.termCount} unit="รายการ" />
          <StatCard title="วันทั้งหมด" value={overview.totalDays} unit="รายการ" />
          <StatCard
            title="วันเข้าแถว"
            value={overview.lineupDays}
            unit="รายการ"
            tone="green"
          />
          <StatCard
            title="วันไม่เข้าแถว"
            value={overview.offDays}
            unit="รายการ"
            tone="red"
          />
        </section>

        {showGenerator && (
          <AutoGeneratorPanel
            form={generatorForm}
            terms={terms}
            rows={generatedRows}
            overview={generatorOverview}
            saving={savingGenerator}
            onChange={updateGeneratorForm}
            onSave={saveGeneratedRows}
          />
        )}

        <section className="mb-4 grid gap-4 xl:grid-cols-[420px_1fr]">
          <section className="space-y-4">
            <TermFormPanel
              form={termForm}
              editingTermId={editingTermId}
              saving={savingTerm}
              onChange={updateTermForm}
              onSubmit={saveTerm}
              onReset={resetTermForm}
            />

            <SchoolDayFormPanel
              form={dayForm}
              terms={terms}
              editingDayKey={editingDayKey}
              saving={savingDay}
              onChange={updateDayForm}
              onSubmit={saveSchoolDay}
              onReset={resetDayForm}
            />
          </section>

          <section className="space-y-4">
            <TermsList terms={terms} onEdit={startEditTerm} />

            <section className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
              <div className="mb-4">
                <h2 className="text-xl font-black text-slate-800">
                  รายการวันเข้าแถว
                </h2>
                <p className="text-sm text-slate-500">
                  แสดงจากตาราง school_days
                </p>
              </div>

              <div className="mb-4 grid gap-3 md:grid-cols-4">
                <select
                  value={selectedTermFilter}
                  onChange={(e) => setSelectedTermFilter(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500"
                >
                  <option value="ALL">ทุกภาคเรียน</option>
                  {terms.map((term) => (
                    <option key={term.term_id} value={term.term_id}>
                      {term.term_name || term.term_id}
                    </option>
                  ))}
                </select>

                <select
                  value={scheduleGroupFilter}
                  onChange={(e) => setScheduleGroupFilter(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500"
                >
                  <option value="ALL">ทุกกลุ่มเวลา</option>
                  <option value="ปวช">ปวช</option>
                  <option value="ปวส">ปวส</option>
                  <option value="ปวส_ม6">ปวส_ม6</option>
                </select>

                <select
                  value={lineupFilter}
                  onChange={(e) => setLineupFilter(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500"
                >
                  <option value="ALL">ทุกสถานะ</option>
                  <option value="TRUE">วันเข้าแถว</option>
                  <option value="FALSE">ไม่เข้าแถว</option>
                </select>

                <input
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="ค้นหา note / week / วันที่"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500"
                />
              </div>

              {loading ? (
                <div className="rounded-2xl bg-slate-50 p-8 text-center text-slate-500">
                  กำลังโหลดข้อมูล...
                </div>
              ) : (
                <>
                  <SchoolDayMobileCards
                    rows={filteredSchoolDays}
                    onEdit={startEditDay}
                    onToggle={toggleSchoolDayLineup}
                    saving={savingDay}
                  />

                  <SchoolDayDesktopTable
                    rows={filteredSchoolDays}
                    onEdit={startEditDay}
                    onToggle={toggleSchoolDayLineup}
                    saving={savingDay}
                  />
                </>
              )}
            </section>
          </section>
        </section>
      </div>
    </main>
  );
}

function AutoGeneratorPanel({
  form,
  terms,
  rows,
  overview,
  saving,
  onChange,
  onSave,
}) {
  return (
    <section className="mb-4 rounded-3xl border border-pink-100 bg-white p-4 shadow-sm sm:mb-6 sm:p-6">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-800">
            สร้างวันเข้าแถวอัตโนมัติทั้งเทอม
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            ระบบจะสร้างเฉพาะวันจันทร์-ศุกร์ ข้ามเสาร์-อาทิตย์ และข้ามวันหยุดที่ระบุเพิ่ม
          </p>
        </div>

        <button
          onClick={onSave}
          disabled={saving || rows.length === 0}
          className="rounded-full bg-pink-600 px-5 py-2 text-sm font-black text-white hover:bg-pink-700 disabled:opacity-50"
        >
          {saving ? 'กำลังบันทึก...' : 'บันทึกวันเข้าแถวอัตโนมัติ'}
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-bold text-slate-700">
              ภาคเรียน
            </label>
            <select
              value={form.term_id}
              onChange={(e) => onChange('term_id', e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500"
            >
              <option value="">เลือกภาคเรียน</option>
              {terms.map((term) => (
                <option key={term.term_id} value={term.term_id}>
                  {term.term_name || term.term_id}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-bold text-slate-700">
                วันเริ่มต้น
              </label>
              <input
                type="date"
                value={form.start_date}
                onChange={(e) => onChange('start_date', e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-bold text-slate-700">
                วันสิ้นสุด
              </label>
              <input
                type="date"
                value={form.end_date}
                onChange={(e) => onChange('end_date', e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-bold text-slate-700">
              จำนวนสัปดาห์
            </label>
            <input
              value={form.total_weeks}
              onChange={(e) => onChange('total_weeks', e.target.value)}
              placeholder="เช่น 18"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500"
            />
          </div>

          <div className="rounded-2xl bg-slate-50 p-4">
            <div className="mb-2 text-sm font-black text-slate-800">
              กลุ่มที่ต้องการสร้าง
            </div>

            <div className="grid gap-2">
              <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
                <input
                  type="checkbox"
                  checked={form.create_pvc}
                  onChange={(e) => onChange('create_pvc', e.target.checked)}
                />
                ปวช
              </label>

              <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
                <input
                  type="checkbox"
                  checked={form.create_pvs}
                  onChange={(e) => onChange('create_pvs', e.target.checked)}
                />
                ปวส
              </label>

              <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
                <input
                  type="checkbox"
                  checked={form.create_pvs_m6}
                  onChange={(e) => onChange('create_pvs_m6', e.target.checked)}
                />
                ปวส_ม6
              </label>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-bold text-slate-700">
              วันหยุดเพิ่มเติม
            </label>
            <textarea
              value={form.holiday_text}
              onChange={(e) => onChange('holiday_text', e.target.value)}
              rows={4}
              placeholder={'ใส่วันที่แบบ ค.ศ. เช่น\n2026-06-01\n2026-07-28\nคั่นด้วยบรรทัดใหม่หรือ comma'}
              className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500"
            />
            <p className="mt-1 text-xs text-slate-400">
              วันเหล่านี้จะไม่ถูกสร้างเป็นวันเข้าแถว
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-bold text-slate-700">
              หมายเหตุ
            </label>
            <input
              value={form.note}
              onChange={(e) => onChange('note', e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500"
            />
          </div>
        </div>

        <div>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MiniStat title="รวม" value={overview.total} unit="รายการ" />
            <MiniStat title="ใหม่" value={overview.newCount} unit="รายการ" tone="green" />
            <MiniStat title="อัปเดตเดิม" value={overview.existingCount} unit="รายการ" tone="blue" />
            <MiniStat title="วันหยุดเพิ่ม" value={overview.holidayCount} unit="วัน" tone="red" />
          </div>

          <div
            className="max-h-[420px] overflow-auto rounded-2xl border border-slate-200"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            <table className="min-w-[760px] w-full border-collapse bg-white text-sm">
              <thead className="sticky top-0 bg-slate-900 text-white">
                <tr>
                  <th className="whitespace-nowrap px-4 py-3 text-center">ลำดับ</th>
                  <th className="whitespace-nowrap px-4 py-3 text-center">วันที่</th>
                  <th className="whitespace-nowrap px-4 py-3 text-center">ภาคเรียน</th>
                  <th className="whitespace-nowrap px-4 py-3 text-center">กลุ่ม</th>
                  <th className="whitespace-nowrap px-4 py-3 text-center">week</th>
                  <th className="whitespace-nowrap px-4 py-3 text-center">month</th>
                  <th className="whitespace-nowrap px-4 py-3 text-left">note</th>
                </tr>
              </thead>

              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="px-4 py-8 text-center text-slate-500">
                      ยังไม่มีรายการ Preview
                    </td>
                  </tr>
                ) : (
                  rows.map((row, index) => (
                    <tr
                      key={`${row.date}_${row.term_id}_${row.schedule_group}_${index}`}
                      className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-center font-bold text-slate-500">
                        {index + 1}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-center font-bold text-slate-700">
                        {formatThaiDate(row.date)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-center text-slate-700">
                        {row.term_id}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-center text-slate-700">
                        {row.schedule_group}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-center text-slate-700">
                        {row.week_no}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-center text-slate-700">
                        {row.month_key}
                      </td>
                      <td className="min-w-[160px] px-4 py-3 text-slate-600">
                        {row.note || '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3 rounded-2xl bg-amber-50 p-4 text-xs text-amber-800">
            <div className="font-black">หมายเหตุ</div>
            <div className="mt-1">
              ถ้ารายการวันที่/กลุ่มนั้นมีอยู่แล้ว ระบบจะอัปเดตข้อมูลเดิมแทนการสร้างซ้ำ
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function TermFormPanel({
  form,
  editingTermId,
  saving,
  onChange,
  onSubmit,
  onReset,
}) {
  return (
    <section className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
      <div className="mb-4">
        <h2 className="text-xl font-black text-slate-800">
          {editingTermId ? 'แก้ไขภาคเรียน' : 'เพิ่ม / แก้ไขภาคเรียน'}
        </h2>
        <p className="text-sm text-slate-500">เช่น term_id = 1/2569</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-bold text-slate-700">
            Term ID
          </label>
          <input
            value={form.term_id}
            onChange={(e) => onChange('term_id', e.target.value)}
            disabled={Boolean(editingTermId)}
            placeholder="เช่น 1/2569"
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500 disabled:bg-slate-100 disabled:text-slate-400"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-bold text-slate-700">
            ชื่อภาคเรียน
          </label>
          <input
            value={form.term_name}
            onChange={(e) => onChange('term_name', e.target.value)}
            placeholder="เช่น ภาคเรียนที่ 1/2569"
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-bold text-slate-700">
              วันเปิด
            </label>
            <input
              type="date"
              value={form.start_date}
              onChange={(e) => onChange('start_date', e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-bold text-slate-700">
              วันปิด
            </label>
            <input
              type="date"
              value={form.end_date}
              onChange={(e) => onChange('end_date', e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-bold text-slate-700">
            จำนวนสัปดาห์
          </label>
          <input
            value={form.total_weeks}
            onChange={(e) => onChange('total_weeks', e.target.value)}
            placeholder="เช่น 18"
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {saving ? 'กำลังบันทึก...' : 'บันทึกภาคเรียน'}
          </button>

          <button
            type="button"
            onClick={onReset}
            className="rounded-2xl bg-slate-200 px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-300"
          >
            ล้างฟอร์ม
          </button>
        </div>
      </form>
    </section>
  );
}

function SchoolDayFormPanel({
  form,
  terms,
  editingDayKey,
  saving,
  onChange,
  onSubmit,
  onReset,
}) {
  return (
    <section className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
      <div className="mb-4">
        <h2 className="text-xl font-black text-slate-800">
          {editingDayKey ? 'แก้ไขวันเข้าแถว' : 'เพิ่ม / แก้ไขวันเข้าแถว'}
        </h2>
        <p className="text-sm text-slate-500">
          1 วันที่อาจมีหลาย schedule_group เช่น ปวช / ปวส / ปวส_ม6
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-bold text-slate-700">
            วันที่
          </label>
          <input
            type="date"
            value={form.date}
            onChange={(e) => onChange('date', e.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-bold text-slate-700">
            ภาคเรียน
          </label>
          <select
            value={form.term_id}
            onChange={(e) => onChange('term_id', e.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500"
          >
            <option value="">เลือกภาคเรียน</option>
            {terms.map((term) => (
              <option key={term.term_id} value={term.term_id}>
                {term.term_name || term.term_id}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-bold text-slate-700">
              level_group
            </label>
            <input
              value={form.level_group}
              onChange={(e) => onChange('level_group', e.target.value)}
              placeholder="เช่น ปวช / ปวส"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-bold text-slate-700">
              schedule_group
            </label>
            <select
              value={form.schedule_group}
              onChange={(e) => onChange('schedule_group', e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500"
            >
              <option value="ปวช">ปวช</option>
              <option value="ปวส">ปวส</option>
              <option value="ปวส_ม6">ปวส_ม6</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-bold text-slate-700">
              week_no
            </label>
            <input
              value={form.week_no}
              onChange={(e) => onChange('week_no', e.target.value)}
              placeholder="เช่น 1"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-bold text-slate-700">
              month_key
            </label>
            <input
              value={form.month_key}
              onChange={(e) => onChange('month_key', e.target.value)}
              placeholder="เช่น 2026-05"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-bold text-slate-700">
            สถานะวันเข้าแถว
          </label>
          <select
            value={form.is_lineup_day}
            onChange={(e) => onChange('is_lineup_day', e.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500"
          >
            <option value="TRUE">เป็นวันเข้าแถว</option>
            <option value="FALSE">ไม่เข้าแถว / วันหยุด</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-bold text-slate-700">
            หมายเหตุ
          </label>
          <textarea
            value={form.note}
            onChange={(e) => onChange('note', e.target.value)}
            rows={3}
            placeholder="เช่น วันหยุด / วันสำคัญ / เปิดเทอม ปวส."
            className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {saving ? 'กำลังบันทึก...' : 'บันทึกวันเข้าแถว'}
          </button>

          <button
            type="button"
            onClick={onReset}
            className="rounded-2xl bg-slate-200 px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-300"
          >
            ล้างฟอร์ม
          </button>
        </div>
      </form>
    </section>
  );
}

function TermsList({ terms, onEdit }) {
  return (
    <section className="rounded-3xl bg-white p-4 shadow-sm sm:p-6">
      <div className="mb-4">
        <h2 className="text-xl font-black text-slate-800">รายการภาคเรียน</h2>
        <p className="text-sm text-slate-500">แสดงจากตาราง terms</p>
      </div>

      {terms.length === 0 ? (
        <div className="rounded-2xl bg-slate-50 p-8 text-center text-slate-500">
          ไม่พบข้อมูลภาคเรียน
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {terms.map((term) => (
            <div
              key={term.term_id}
              className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-bold text-slate-400">
                    {term.term_id}
                  </div>
                  <div className="text-lg font-black text-slate-800">
                    {term.term_name || '-'}
                  </div>
                  <div className="mt-1 text-sm text-slate-500">
                    {formatThaiDate(term.start_date)} - {formatThaiDate(term.end_date)}
                  </div>
                  <div className="mt-1 text-xs text-slate-400">
                    {term.total_weeks || '-'} สัปดาห์
                  </div>
                </div>

                <button
                  onClick={() => onEdit(term)}
                  className="rounded-full bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-700"
                >
                  แก้ไข
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function SchoolDayMobileCards({ rows, onEdit, onToggle, saving }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl bg-slate-50 p-8 text-center text-slate-500 md:hidden">
        ไม่พบข้อมูลวันเข้าแถว
      </div>
    );
  }

  return (
    <div className="space-y-3 md:hidden">
      {rows.map((day, index) => {
        const lineup = isTrueValue(day.is_lineup_day);

        return (
          <div
            key={`${day.date}_${day.term_id}_${day.schedule_group}_${index}`}
            className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-slate-400">
                  {index + 1}. {day.term_id}
                </div>
                <div className="text-lg font-black text-slate-800">
                  {formatThaiDate(day.date)}
                </div>
                <div className="mt-1 text-sm text-slate-500">
                  {day.schedule_group || '-'} · สัปดาห์ {day.week_no || '-'}
                </div>
              </div>

              <LineupBadge value={day.is_lineup_day} />
            </div>

            <div className="mb-3 rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">
              <div>
                <span className="font-bold text-slate-800">month_key: </span>
                {day.month_key || '-'}
              </div>
              <div className="mt-1">
                <span className="font-bold text-slate-800">หมายเหตุ: </span>
                {day.note || '-'}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onEdit(day)}
                className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white"
              >
                แก้ไข
              </button>

              <button
                onClick={() => onToggle(day)}
                disabled={saving}
                className={`rounded-2xl px-4 py-3 text-sm font-bold disabled:opacity-50 ${
                  lineup
                    ? 'bg-red-50 text-red-700'
                    : 'bg-emerald-50 text-emerald-700'
                }`}
              >
                {lineup ? 'ตั้งเป็นวันหยุด' : 'ตั้งเป็นเข้าแถว'}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SchoolDayDesktopTable({ rows, onEdit, onToggle, saving }) {
  return (
    <div
      className="hidden max-w-full overflow-x-auto rounded-2xl border border-slate-200 md:block"
      style={{
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <table className="min-w-[1150px] w-full border-collapse bg-white text-sm">
        <thead className="bg-slate-900 text-white">
          <tr>
            <th className="whitespace-nowrap px-4 py-3 text-center">ลำดับ</th>
            <th className="whitespace-nowrap px-4 py-3 text-center">วันที่</th>
            <th className="whitespace-nowrap px-4 py-3 text-center">ภาคเรียน</th>
            <th className="whitespace-nowrap px-4 py-3 text-center">level_group</th>
            <th className="whitespace-nowrap px-4 py-3 text-center">
              schedule_group
            </th>
            <th className="whitespace-nowrap px-4 py-3 text-center">week</th>
            <th className="whitespace-nowrap px-4 py-3 text-center">month</th>
            <th className="whitespace-nowrap px-4 py-3 text-center">สถานะ</th>
            <th className="whitespace-nowrap px-4 py-3 text-left">หมายเหตุ</th>
            <th className="whitespace-nowrap px-4 py-3 text-center">จัดการ</th>
          </tr>
        </thead>

        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan="10" className="px-4 py-8 text-center text-slate-500">
                ไม่พบข้อมูลวันเข้าแถว
              </td>
            </tr>
          ) : (
            rows.map((day, index) => {
              const lineup = isTrueValue(day.is_lineup_day);

              return (
                <tr
                  key={`${day.date}_${day.term_id}_${day.schedule_group}_${index}`}
                  className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
                >
                  <td className="whitespace-nowrap px-4 py-3 text-center font-bold text-slate-500">
                    {index + 1}
                  </td>

                  <td className="whitespace-nowrap px-4 py-3 text-center font-bold text-slate-700">
                    {formatThaiDate(day.date)}
                  </td>

                  <td className="whitespace-nowrap px-4 py-3 text-center text-slate-700">
                    {day.term_id || '-'}
                  </td>

                  <td className="whitespace-nowrap px-4 py-3 text-center text-slate-700">
                    {day.level_group || '-'}
                  </td>

                  <td className="whitespace-nowrap px-4 py-3 text-center text-slate-700">
                    {day.schedule_group || '-'}
                  </td>

                  <td className="whitespace-nowrap px-4 py-3 text-center text-slate-700">
                    {day.week_no || '-'}
                  </td>

                  <td className="whitespace-nowrap px-4 py-3 text-center text-slate-700">
                    {day.month_key || '-'}
                  </td>

                  <td className="whitespace-nowrap px-4 py-3 text-center">
                    <LineupBadge value={day.is_lineup_day} />
                  </td>

                  <td className="min-w-[220px] px-4 py-3 text-slate-600">
                    {day.note || '-'}
                  </td>

                  <td className="whitespace-nowrap px-4 py-3 text-center">
                    <div className="flex justify-center gap-2">
                      <button
                        onClick={() => onEdit(day)}
                        className="rounded-full bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-700"
                      >
                        แก้ไข
                      </button>

                      <button
                        onClick={() => onToggle(day)}
                        disabled={saving}
                        className={`rounded-full px-4 py-2 text-xs font-bold disabled:opacity-50 ${
                          lineup
                            ? 'bg-red-50 text-red-700 hover:bg-red-100'
                            : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                        }`}
                      >
                        {lineup ? 'วันหยุด' : 'เข้าแถว'}
                      </button>
                    </div>
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

function StatCard({ title, value, unit, tone = 'slate' }) {
  const toneClass = {
    slate: 'bg-white text-slate-800',
    green: 'bg-emerald-50 text-emerald-800',
    red: 'bg-red-50 text-red-800',
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

function MiniStat({ title, value, unit, tone = 'slate' }) {
  const toneClass = {
    slate: 'bg-slate-50 text-slate-800',
    green: 'bg-emerald-50 text-emerald-800',
    red: 'bg-red-50 text-red-800',
    blue: 'bg-blue-50 text-blue-800',
  };

  return (
    <div className={`rounded-2xl p-4 ${toneClass[tone] || toneClass.slate}`}>
      <div className="text-xs font-bold opacity-70">{title}</div>
      <div className="mt-2 flex items-end gap-1">
        <span className="text-2xl font-black">{value}</span>
        <span className="pb-1 text-xs">{unit}</span>
      </div>
    </div>
  );
}

function LineupBadge({ value }) {
  if (isTrueValue(value)) {
    return (
      <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700">
        เข้าแถว
      </span>
    );
  }

  return (
    <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-black text-red-700">
      ไม่เข้าแถว
    </span>
  );
}

async function upsertSchoolDayRow(row, existingRows) {
  const existed = existingRows.find(
    (item) => makeSchoolDayKey(item) === makeSchoolDayKey(row)
  );

  if (existed) {
    const { error } = await supabase
      .from('school_days')
      .update(row)
      .eq('date', row.date)
      .eq('term_id', row.term_id)
      .eq('schedule_group', row.schedule_group);

    if (error) throw new Error(error.message);

    return;
  }

  const { error } = await supabase.from('school_days').insert(row);

  if (error) throw new Error(error.message);
}

function generateSchoolDays(form) {
  const termId = String(form.term_id || '').trim();
  const startDate = normalizeDate(form.start_date);
  const endDate = normalizeDate(form.end_date);
  const totalWeeks = Number(form.total_weeks || 0);
  const holidayDates = new Set(parseHolidayDates(form.holiday_text));

  if (!termId || !startDate || !endDate) return [];

  const start = parseYmdToDate(startDate);
  const end = parseYmdToDate(endDate);

  if (!start || !end || start > end) return [];

  const groups = [];

  if (form.create_pvc) {
    groups.push({
      level_group: 'ปวช',
      schedule_group: 'ปวช',
    });
  }

  if (form.create_pvs) {
    groups.push({
      level_group: 'ปวส',
      schedule_group: 'ปวส',
    });
  }

  if (form.create_pvs_m6) {
    groups.push({
      level_group: 'ปวส',
      schedule_group: 'ปวส_ม6',
    });
  }

  if (groups.length === 0) return [];

  const rows = [];
  let current = new Date(start);

  while (current <= end) {
    const ymd = formatDateObjectToYmd(current);
    const day = current.getDay();
    const isWeekend = day === 0 || day === 6;
    const isHoliday = holidayDates.has(ymd);

    if (!isWeekend && !isHoliday) {
      const weekNo = calculateWeekNo(start, current, totalWeeks);
      const monthKey = getMonthKey(ymd);

      groups.forEach((group) => {
        rows.push({
          date: ymd,
          term_id: termId,
          level_group: group.level_group,
          schedule_group: group.schedule_group,
          week_no: String(weekNo),
          month_key: monthKey,
          is_lineup_day: 'TRUE',
          note: String(form.note || '').trim(),
        });
      });
    }

    current.setDate(current.getDate() + 1);
  }

  return rows;
}

function calculateWeekNo(startDateObject, currentDateObject, totalWeeks) {
  const diffMs = currentDateObject.getTime() - startDateObject.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  const weekNo = Math.floor(diffDays / 7) + 1;

  if (totalWeeks > 0) {
    return Math.min(weekNo, totalWeeks);
  }

  return weekNo;
}

function parseHolidayDates(text) {
  return String(text || '')
    .split(/[\n,;|\s]+/)
    .map((item) => normalizeDate(item))
    .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item));
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

function makeSchoolDayKey(day) {
  return [
    normalizeDate(day.date),
    String(day.term_id || '').trim(),
    String(day.schedule_group || '').trim(),
  ].join('|');
}

function parseSchoolDayKey(key) {
  const [date, term_id, schedule_group] = String(key || '').split('|');

  return {
    date,
    term_id,
    schedule_group,
  };
}

function normalizeDate(value) {
  if (!value) return '';
  return String(value).trim().slice(0, 10);
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

function getTodayYmd() {
  const now = new Date();
  return formatDateObjectToYmd(now);
}

function getMonthKey(ymd) {
  const dateText = normalizeDate(ymd);

  if (!dateText || dateText.length < 7) {
    return '';
  }

  return dateText.slice(0, 7);
}

function parseYmdToDate(ymd) {
  const normalized = normalizeDate(ymd);
  const [yearText, monthText, dayText] = normalized.split('-');

  if (!yearText || !monthText || !dayText) return null;

  const date = new Date(
    Number(yearText),
    Number(monthText) - 1,
    Number(dayText)
  );

  if (Number.isNaN(date.getTime())) return null;

  return date;
}

function formatDateObjectToYmd(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');

  return `${yyyy}-${mm}-${dd}`;
}

function formatThaiDate(ymd) {
  if (!ymd) return '-';

  const normalized = normalizeDate(ymd);
  const [yearText, monthText, dayText] = String(normalized).split('-');

  if (!yearText || !monthText || !dayText) {
    return ymd;
  }

  const buddhistYear = Number(yearText) + 543;

  return `${dayText}/${monthText}/${buddhistYear}`;
}