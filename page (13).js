'use client';

import { useEffect, useMemo, useState } from 'react';
import ExcelJS from 'exceljs';
import { supabase } from '@/lib/supabase';
import AppNav from '@/components/AppNav';

const PAGE_SIZE = 1000;

const MAIN_TABLES = [
  {
    tableName: 'app_users',
    label: 'ผู้ใช้งานระบบ',
    sheetName: 'app_users',
    columns: ['teacher_id', 'username', 'pin', 'name', 'role', 'room_ids', 'active'],
  },
  {
    tableName: 'rooms',
    label: 'ห้องเรียน',
    sheetName: 'rooms',
    columns: ['room_id', 'room_name', 'level', 'year', 'room_no', 'schedule_group'],
  },
  {
    tableName: 'students',
    label: 'นักเรียน นักศึกษา',
    sheetName: 'students',
    columns: [
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
  },
  {
    tableName: 'terms',
    label: 'ภาคเรียน',
    sheetName: 'terms',
    columns: ['term_id', 'term_name', 'start_date', 'end_date', 'total_weeks'],
  },
  {
    tableName: 'school_days',
    label: 'วันเข้าแถว',
    sheetName: 'school_days',
    columns: [
      'date',
      'term_id',
      'level_group',
      'schedule_group',
      'week_no',
      'month_key',
      'is_lineup_day',
      'note',
    ],
  },
  {
    tableName: 'attendance',
    label: 'ข้อมูลเช็กชื่อ',
    sheetName: 'attendance',
    columns: [
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
  },
];

const OPTIONAL_TABLES = [
  {
    tableName: 'audit_logs',
    label: 'ประวัติการใช้งาน',
    sheetName: 'audit_logs',
    columns: [],
  },
  
];

export default function BackupPage() {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [pageError, setPageError] = useState('');
  const [tableStats, setTableStats] = useState([]);
  const [lastBackupAt, setLastBackupAt] = useState('');

  useEffect(() => {
    const savedUser = localStorage.getItem('rtc_attendance_user');

    if (!savedUser) {
      setPageError('กรุณาเข้าสู่ระบบจากหน้าแรกก่อน');
      setLoading(false);
      return;
    }

    try {
      const parsed = JSON.parse(savedUser);

      if (String(parsed.role || '').toLowerCase() !== 'admin') {
        setPageError('หน้านี้สำหรับผู้ดูแลระบบเท่านั้น');
        setLoading(false);
        return;
      }

      setCurrentUser(parsed);
      loadTableStats();
    } catch {
      localStorage.removeItem('rtc_attendance_user');
      setPageError('ข้อมูลผู้ใช้ไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่');
      setLoading(false);
    }
  }, []);

  const totalRows = useMemo(() => {
    return tableStats.reduce((sum, item) => sum + Number(item.count || 0), 0);
  }, [tableStats]);

  async function loadTableStats() {
    try {
      setLoading(true);
      setPageError('');

      const stats = [];

      for (const table of MAIN_TABLES) {
        const count = await getTableCount(table.tableName);

        stats.push({
          ...table,
          count,
          status: 'พร้อมสำรอง',
          optional: false,
        });
      }

      for (const table of OPTIONAL_TABLES) {
        const result = await tryGetTableCount(table.tableName);

        if (result.exists) {
          stats.push({
            ...table,
            count: result.count,
            status: 'พร้อมสำรอง',
            optional: true,
          });
        }
      }

      setTableStats(stats);
    } catch (err) {
      setPageError(err.message || 'โหลดข้อมูลตารางไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }

  async function handleBackupExcel() {
    try {
      const confirmBackup = window.confirm(
        'ต้องการสำรองฐานข้อมูลเป็นไฟล์ Excel ใช่ไหม?\n\nหมายเหตุ: ไฟล์นี้อาจมีข้อมูลผู้ใช้และ PIN ควรเก็บไว้ในที่ปลอดภัย'
      );

      if (!confirmBackup) return;

      setExporting(true);
      setPageError('');

      const workbook = new ExcelJS.Workbook();

      workbook.creator = 'RTC Attendance System';
      workbook.created = new Date();
      workbook.modified = new Date();

      const backupTime = new Date();
      const backupTimeText = formatThaiDateTime(backupTime);

      const summarySheet = workbook.addWorksheet('backup_summary');

      buildSummarySheet({
        sheet: summarySheet,
        tableStats,
        backupTimeText,
        currentUser,
      });

      for (const table of tableStats) {
        const rows = await fetchAllRows((from, to) =>
          supabase.from(table.tableName).select('*').range(from, to)
        );

        buildDataSheet({
          workbook,
          table,
          rows,
          backupTimeText,
        });
      }

      const buffer = await workbook.xlsx.writeBuffer();

      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      const fileName = `RTC_Attendance_Backup_${formatFileDateTime(
        backupTime
      )}.xlsx`;

      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');

      anchor.href = url;
      anchor.download = fileName;
      anchor.click();

      window.URL.revokeObjectURL(url);

      setLastBackupAt(backupTimeText);
    } catch (err) {
      setPageError(err.message || 'สำรองข้อมูลไม่สำเร็จ');
    } finally {
      setExporting(false);
    }
  }

  function goHome() {
    window.location.href = '/';
  }

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-7xl">
        {currentUser && <AppNav currentUser={currentUser} active="backup" />}

        <section className="mb-6 rounded-3xl bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-3xl font-black text-slate-800">
                Backup ฐานข้อมูล
              </h1>

              <p className="mt-1 text-slate-500">
                สำรองข้อมูลจาก Supabase เป็นไฟล์ Excel สำหรับเก็บไว้ก่อนใช้งานจริง
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={loadTableStats}
                disabled={loading || exporting}
                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700 disabled:opacity-50"
              >
                โหลดข้อมูลใหม่
              </button>

              <button
                onClick={handleBackupExcel}
                disabled={loading || exporting || tableStats.length === 0}
                className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {exporting ? 'กำลัง Backup...' : 'Backup Excel'}
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

        <section className="mb-6 grid gap-4 md:grid-cols-3">
          <SummaryCard
            title="จำนวนตารางที่สำรอง"
            value={tableStats.length}
            unit="ตาราง"
          />

          <SummaryCard title="จำนวนข้อมูลรวม" value={totalRows} unit="แถว" />

          <SummaryCard
            title="Backup ล่าสุด"
            value={lastBackupAt || '-'}
            unit={lastBackupAt ? 'สำเร็จ' : 'ยังไม่เคยสำรองในรอบนี้'}
          />
        </section>

        <section className="mb-6 rounded-3xl border border-amber-200 bg-amber-50 p-5 text-amber-800">
          <div className="text-lg font-black">คำเตือนสำคัญ</div>

          <p className="mt-1 text-sm leading-6">
            ไฟล์ Backup อาจมีข้อมูลผู้ใช้งาน เช่น username และ PIN
            ควรเก็บไฟล์ไว้ในเครื่องหรือพื้นที่ที่ปลอดภัย ไม่ควรส่งต่อโดยไม่จำเป็น
          </p>
        </section>

        <section className="rounded-3xl bg-white p-6 shadow-sm">
          <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-black text-slate-800">
                รายการตารางที่จะ Backup
              </h2>

              <p className="text-sm text-slate-500">
                ระบบจะดึงข้อมูลแบบแบ่งหน้า ด้วย fetchAllRows() เพื่อป้องกันข้อมูลไม่ครบ
              </p>
            </div>
          </div>

          {loading ? (
            <div className="rounded-2xl bg-slate-50 p-8 text-center text-slate-500">
              กำลังโหลดข้อมูลตาราง...
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full min-w-[800px] border-collapse bg-white text-sm">
                <thead className="bg-slate-900 text-white">
                  <tr>
                    <th className="border border-slate-700 px-3 py-3 text-left">
                      ตาราง
                    </th>
                    <th className="border border-slate-700 px-3 py-3 text-left">
                      รายละเอียด
                    </th>
                    <th className="border border-slate-700 px-3 py-3 text-center">
                      จำนวนแถว
                    </th>
                    <th className="border border-slate-700 px-3 py-3 text-center">
                      สถานะ
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {tableStats.map((table) => (
                    <tr key={table.tableName} className="hover:bg-slate-50">
                      <td className="border border-slate-200 px-3 py-3 font-bold text-slate-800">
                        {table.tableName}
                      </td>

                      <td className="border border-slate-200 px-3 py-3 text-slate-600">
                        {table.label}
                        {table.optional && (
                          <span className="ml-2 rounded-full bg-blue-50 px-2 py-1 text-xs font-bold text-blue-600">
                            optional
                          </span>
                        )}
                      </td>

                      <td className="border border-slate-200 px-3 py-3 text-center font-bold">
                        {table.count}
                      </td>

                      <td className="border border-slate-200 px-3 py-3 text-center">
                        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                          {table.status}
                        </span>
                      </td>
                    </tr>
                  ))}

                  {tableStats.length === 0 && (
                    <tr>
                      <td
                        colSpan="4"
                        className="border border-slate-200 px-3 py-8 text-center text-slate-500"
                      >
                        ไม่พบตารางสำหรับ Backup
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function SummaryCard({ title, value, unit }) {
  return (
    <div className="rounded-3xl bg-white p-6 shadow-sm">
      <div className="text-sm font-medium text-slate-500">{title}</div>
      <div className="mt-3 flex flex-col gap-1">
        <span className="text-3xl font-black text-slate-800">{value}</span>
        <span className="text-sm text-slate-500">{unit}</span>
      </div>
    </div>
  );
}

function buildSummarySheet({ sheet, tableStats, backupTimeText, currentUser }) {
  sheet.columns = [
    { width: 24 },
    { width: 32 },
    { width: 16 },
    { width: 28 },
  ];

  sheet.mergeCells('A1:D1');
  sheet.getCell('A1').value = 'RTC Attendance System - Database Backup';
  sheet.getCell('A1').font = {
    name: 'TH Sarabun New',
    size: 20,
    bold: true,
  };
  sheet.getCell('A1').alignment = {
    horizontal: 'center',
    vertical: 'middle',
  };

  sheet.getCell('A3').value = 'วันที่ Backup';
  sheet.getCell('B3').value = backupTimeText;

  sheet.getCell('A4').value = 'ผู้ Backup';
  sheet.getCell('B4').value =
    currentUser?.name || currentUser?.username || '-';

  sheet.getCell('A5').value = 'หมายเหตุ';
  sheet.getCell('B5').value =
    'ไฟล์นี้อาจมีข้อมูลผู้ใช้งานและ PIN ควรเก็บไว้ในที่ปลอดภัย';

  sheet.getRow(7).values = ['table_name', 'description', 'row_count', 'status'];

  tableStats.forEach((table, index) => {
    sheet.getRow(8 + index).values = [
      table.tableName,
      table.label,
      table.count,
      table.status,
    ];
  });

  styleWorksheet(sheet, 7, 7 + tableStats.length, 4);
}

function buildDataSheet({ workbook, table, rows, backupTimeText }) {
  const sheet = workbook.addWorksheet(cleanSheetName(table.sheetName));

  const columns = getColumns(table, rows);

  sheet.columns = columns.map((column) => ({
    header: column,
    key: column,
    width: getColumnWidth(column),
  }));

  sheet.spliceRows(1, 0, [`Backup: ${table.tableName}`]);
  sheet.spliceRows(2, 0, [`วันที่ Backup: ${backupTimeText}`]);
  sheet.spliceRows(3, 0, []);

  sheet.mergeCells(1, 1, 1, Math.max(columns.length, 1));
  sheet.mergeCells(2, 1, 2, Math.max(columns.length, 1));

  sheet.getCell(1, 1).font = {
    name: 'TH Sarabun New',
    size: 18,
    bold: true,
  };

  sheet.getCell(2, 1).font = {
    name: 'TH Sarabun New',
    size: 14,
  };

  const headerRowIndex = 4;

  columns.forEach((column, index) => {
    const cell = sheet.getCell(headerRowIndex, index + 1);
    cell.value = column;
  });

  rows.forEach((row, rowIndex) => {
    columns.forEach((column, columnIndex) => {
      const value = row[column];
      const cell = sheet.getCell(headerRowIndex + 1 + rowIndex, columnIndex + 1);

      cell.value = formatCellValue(value);
    });
  });

  styleWorksheet(sheet, headerRowIndex, headerRowIndex + rows.length, columns.length);

  sheet.views = [
    {
      state: 'frozen',
      ySplit: headerRowIndex,
    },
  ];

  sheet.autoFilter = {
    from: {
      row: headerRowIndex,
      column: 1,
    },
    to: {
      row: headerRowIndex,
      column: columns.length,
    },
  };
}

function getColumns(table, rows) {
  const configuredColumns = table.columns || [];

  const discoveredColumns = [];

  rows.forEach((row) => {
    Object.keys(row || {}).forEach((key) => {
      if (!discoveredColumns.includes(key)) {
        discoveredColumns.push(key);
      }
    });
  });

  const mergedColumns = [...configuredColumns];

  discoveredColumns.forEach((column) => {
    if (!mergedColumns.includes(column)) {
      mergedColumns.push(column);
    }
  });

  return mergedColumns.length > 0 ? mergedColumns : ['no_data'];
}

function styleWorksheet(sheet, headerRowIndex, lastRowIndex, columnCount) {
  for (let r = 1; r <= Math.max(lastRowIndex, headerRowIndex); r++) {
    const row = sheet.getRow(r);

    row.eachCell((cell) => {
      cell.font = {
        name: 'TH Sarabun New',
        size: cell.font?.size || 14,
        bold: cell.font?.bold || false,
      };

      cell.alignment = {
        vertical: 'middle',
        horizontal: cell.alignment?.horizontal || 'left',
        wrapText: true,
      };
    });
  }

  for (let c = 1; c <= columnCount; c++) {
    const cell = sheet.getCell(headerRowIndex, c);

    cell.font = {
      name: 'TH Sarabun New',
      size: 14,
      bold: true,
      color: { argb: 'FFFFFFFF' },
    };

    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF111827' },
    };

    cell.alignment = {
      horizontal: 'center',
      vertical: 'middle',
      wrapText: true,
    };
  }

  for (let r = headerRowIndex; r <= lastRowIndex; r++) {
    for (let c = 1; c <= columnCount; c++) {
      const cell = sheet.getCell(r, c);

      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      };
    }
  }
}

async function getTableCount(tableName) {
  const { count, error } = await supabase
    .from(tableName)
    .select('*', { count: 'exact', head: true });

  if (error) throw new Error(`${tableName}: ${error.message}`);

  return count || 0;
}

async function tryGetTableCount(tableName) {
  const { count, error } = await supabase
    .from(tableName)
    .select('*', { count: 'exact', head: true });

  if (error) {
    return {
      exists: false,
      count: 0,
    };
  }

  return {
    exists: true,
    count: count || 0,
  };
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

function formatCellValue(value) {
  if (value === null || value === undefined) return '';

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return value;
}

function getColumnWidth(column) {
  const text = String(column || '');

  if (text.includes('id')) return 22;
  if (text.includes('name')) return 28;
  if (text.includes('date')) return 18;
  if (text.includes('time')) return 22;
  if (text.includes('note')) return 32;
  if (text.includes('room')) return 18;
  if (text.includes('status')) return 16;

  return 18;
}

function cleanSheetName(name) {
  return String(name || 'sheet')
    .replace(/[\\/?*[\]:]/g, '')
    .slice(0, 31);
}

function formatThaiDateTime(date) {
  const pad = (value) => String(value).padStart(2, '0');

  const day = pad(date.getDate());
  const month = pad(date.getMonth() + 1);
  const year = date.getFullYear() + 543;

  const hour = pad(date.getHours());
  const minute = pad(date.getMinutes());
  const second = pad(date.getSeconds());

  return `${day}/${month}/${year} ${hour}:${minute}:${second}`;
}

function formatFileDateTime(date) {
  const pad = (value) => String(value).padStart(2, '0');

  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());

  const hour = pad(date.getHours());
  const minute = pad(date.getMinutes());
  const second = pad(date.getSeconds());

  return `${year}${month}${day}_${hour}${minute}${second}`;
}