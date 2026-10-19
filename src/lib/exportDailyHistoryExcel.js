import ExcelJS from 'exceljs';

export async function exportDailyHistoryExcel({
  selectedDate,
  rows,
  overview,
}) {
  const workbook = new ExcelJS.Workbook();

  workbook.creator = 'RTC Attendance System';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('daily_history');

  worksheet.properties.defaultRowHeight = 22;

  worksheet.columns = [
    { header: 'ลำดับ', key: 'index', width: 8 },
    { header: 'ห้อง', key: 'room_name', width: 18 },
    { header: 'ภาคเรียน', key: 'term_id', width: 14 },
    { header: 'สัปดาห์', key: 'week_no', width: 10 },
    { header: 'รวม', key: 'total_count', width: 10 },
    { header: 'มา', key: 'present_count', width: 10 },
    { header: 'ขาด', key: 'absent_count', width: 10 },
    { header: 'ผู้บันทึก', key: 'checked_by_name', width: 24 },
    { header: 'เวลาล่าสุด', key: 'last_checked_at', width: 24 },
  ];

  worksheet.mergeCells('A1:I1');
  worksheet.getCell('A1').value = 'รายงานประวัติการเช็กชื่อรายวัน';
  worksheet.getCell('A1').font = {
    bold: true,
    size: 18,
  };
  worksheet.getCell('A1').alignment = {
    horizontal: 'center',
    vertical: 'middle',
  };

  worksheet.mergeCells('A2:I2');
  worksheet.getCell('A2').value = `ประจำวันที่ ${formatThaiDate(selectedDate)}`;
  worksheet.getCell('A2').font = {
    bold: true,
    size: 14,
  };
  worksheet.getCell('A2').alignment = {
    horizontal: 'center',
    vertical: 'middle',
  };

  worksheet.addRow([]);

  worksheet.addRow(['สรุปภาพรวม']);
  worksheet.getCell('A4').font = {
    bold: true,
    size: 14,
  };

  worksheet.addRow(['ห้องที่บันทึกแล้ว', overview.totalRooms || 0, 'ห้อง']);
  worksheet.addRow([
    'มาเข้าแถวรวม',
    overview.presentCount || 0,
    `ครั้ง (${overview.presentPercent || '0.00'}%)`,
  ]);
  worksheet.addRow([
    'ขาดรวม',
    overview.absentCount || 0,
    `ครั้ง (${overview.absentPercent || '0.00'}%)`,
  ]);
  worksheet.addRow(['รายการทั้งหมด', overview.totalRecords || 0, 'รายการ']);

  worksheet.addRow([]);

  const headerRowNumber = worksheet.lastRow.number + 1;

  worksheet.addRow([
    'ลำดับ',
    'ห้อง',
    'ภาคเรียน',
    'สัปดาห์',
    'รวม',
    'มา',
    'ขาด',
    'ผู้บันทึก',
    'เวลาล่าสุด',
  ]);

  const headerRow = worksheet.getRow(headerRowNumber);

  headerRow.eachCell((cell) => {
    cell.font = {
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
    };

    cell.border = thinBorder();
  });

  rows.forEach((row, index) => {
    const excelRow = worksheet.addRow([
      index + 1,
      row.room_name || row.room_id || '-',
      row.term_id || '-',
      row.week_no || '-',
      Number(row.total_count || 0),
      Number(row.present_count || 0),
      Number(row.absent_count || 0),
      row.checked_by_name || row.checked_by || '-',
      formatThaiDateTime(row.last_checked_at),
    ]);

    excelRow.eachCell((cell, colNumber) => {
      cell.border = thinBorder();
      cell.alignment = {
        horizontal: colNumber === 2 || colNumber === 8 ? 'left' : 'center',
        vertical: 'middle',
      };
    });
  });

  worksheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.font = {
        name: 'TH Sarabun New',
        size: cell.font?.size || 14,
        bold: cell.font?.bold || false,
        color: cell.font?.color,
      };
    });
  });

  worksheet.pageSetup = {
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    paperSize: 9,
    margins: {
      left: 0.3,
      right: 0.3,
      top: 0.5,
      bottom: 0.5,
      header: 0.3,
      footer: 0.3,
    },
  };

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  downloadBlob(blob, `daily-history-${selectedDate || getTodayYmd()}.xlsx`);
}

function thinBorder() {
  return {
    top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  };
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();

  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function formatThaiDate(ymd) {
  if (!ymd) return '-';

  const [yearText, monthText, dayText] = String(ymd).slice(0, 10).split('-');

  if (!yearText || !monthText || !dayText) {
    return ymd;
  }

  const buddhistYear = Number(yearText) + 543;

  return `${dayText}/${monthText}/${buddhistYear}`;
}

function formatThaiDateTime(value) {
  if (!value) return '-';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear() + 543;
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');

  return `${day}/${month}/${year} ${hour}:${minute} น.`;
}

function getTodayYmd() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');

  return `${yyyy}-${mm}-${dd}`;
}