import ExcelJS from 'exceljs';

export async function exportSummaryReportExcel({
  reportRows,
  totalRow,
  reportMode,
  selectedMonthKey,
  reportDateRange,
  reportConfig,
}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'RTC Attendance System';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('รายงานสรุป', {
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: {
        left: 0.25,
        right: 0.25,
        top: 0.35,
        bottom: 0.35,
        header: 0.1,
        footer: 0.1,
      },
    },
  });

  sheet.properties.defaultRowHeight = 24;

  sheet.columns = [
    { width: 18 },
    { width: 16 },
    { width: 14 },
    { width: 16 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 18 },
  ];

  const reportTitle =
    reportMode === 'month'
      ? 'รายงานสรุปการเข้าแถวรายเดือน'
      : 'รายงานสรุปการเข้าแถวรายภาคเรียน';

  const periodText =
    reportMode === 'month'
      ? `เดือน ${formatMonthKey(selectedMonthKey)}`
      : 'รายภาคเรียน';

  sheet.mergeCells('A1:I1');
  sheet.getCell('A1').value = reportConfig.formNo || 'ก.1/4';
  sheet.getCell('A1').alignment = { horizontal: 'right', vertical: 'middle' };
  sheet.getCell('A1').font = { name: 'TH Sarabun New', size: 16, bold: true };

  sheet.mergeCells('A2:I2');
  sheet.getCell('A2').value = reportConfig.occupationalType || 'ประเภทวิชาอุตสาหกรรม';
  sheet.getCell('A2').alignment = { horizontal: 'right', vertical: 'middle' };
  sheet.getCell('A2').font = { name: 'TH Sarabun New', size: 16, bold: true };

  sheet.mergeCells('A4:I4');
  sheet.getCell('A4').value = reportTitle;
  sheet.getCell('A4').alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getCell('A4').font = { name: 'TH Sarabun New', size: 22, bold: true };

  sheet.mergeCells('A5:I5');
  sheet.getCell('A5').value = reportConfig.departmentName || 'แผนกวิชาช่างไฟฟ้ากำลัง';
  sheet.getCell('A5').alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getCell('A5').font = { name: 'TH Sarabun New', size: 18, bold: true };

  sheet.mergeCells('A6:I6');
  sheet.getCell('A6').value = `${periodText} | ${reportDateRange || '-'}`;
  sheet.getCell('A6').alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getCell('A6').font = { name: 'TH Sarabun New', size: 16 };

  const headerRowIndex = 8;

  sheet.getRow(headerRowIndex).values = [
    'ระดับชั้น',
    'จำนวนทั้งหมด/ห้อง',
    'จำนวนวันเช็ก',
    'จำนวนที่ควรเช็ก',
    'มา',
    'ขาด',
    'มา %',
    'ขาด %',
    'หมายเหตุ',
  ];

  let rowIndex = headerRowIndex + 1;

  reportRows.forEach((item) => {
    sheet.getRow(rowIndex).values = [
      item.room_name || '',
      Number(item.total_students || 0),
      Number(item.checked_days || 0),
      Number(item.expected_total || 0),
      Number(item.present_count || 0),
      Number(item.absent_count || 0),
      item.present_percent ? `${item.present_percent}%` : '',
      item.absent_percent ? `${item.absent_percent}%` : '',
      item.note || '',
    ];
    rowIndex++;
  });

  sheet.getRow(rowIndex).values = [
    totalRow.room_name || 'รวม',
    Number(totalRow.total_students || 0),
    Number(totalRow.checked_days || 0),
    Number(totalRow.expected_total || 0),
    Number(totalRow.present_count || 0),
    Number(totalRow.absent_count || 0),
    totalRow.present_percent ? `${totalRow.present_percent}%` : '',
    totalRow.absent_percent ? `${totalRow.absent_percent}%` : '',
    '',
  ];

  const totalRowIndex = rowIndex;
  rowIndex += 3;

  sheet.mergeCells(`A${rowIndex}:B${rowIndex}`);
  sheet.mergeCells(`D${rowIndex}:E${rowIndex}`);
  sheet.mergeCells(`G${rowIndex}:H${rowIndex}`);

  sheet.getCell(`A${rowIndex}`).value = reportConfig.reporterName || '';
  sheet.getCell(`D${rowIndex}`).value = reportConfig.headDepartmentName || '';
  sheet.getCell(`G${rowIndex}`).value = reportConfig.activityHeadName || '';
  sheet.getCell(`I${rowIndex}`).value = reportConfig.deputyName || '';

  rowIndex++;

  sheet.mergeCells(`A${rowIndex}:B${rowIndex}`);
  sheet.mergeCells(`D${rowIndex}:E${rowIndex}`);
  sheet.mergeCells(`G${rowIndex}:H${rowIndex}`);

  sheet.getCell(`A${rowIndex}`).value = reportConfig.reporterLabel || '';
  sheet.getCell(`D${rowIndex}`).value = reportConfig.headDepartmentLabel || '';
  sheet.getCell(`G${rowIndex}`).value = reportConfig.activityHeadLabel || '';
  sheet.getCell(`I${rowIndex}`).value = reportConfig.deputyLabel || '';

  for (let r = headerRowIndex; r <= totalRowIndex; r++) {
    for (let c = 1; c <= 9; c++) {
      const cell = sheet.getCell(r, c);

      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };

      cell.alignment = {
        horizontal: c === 1 || c === 9 ? 'left' : 'center',
        vertical: 'middle',
        wrapText: true,
      };

      cell.font = {
        name: 'TH Sarabun New',
        size: 16,
        bold: r === headerRowIndex || r === totalRowIndex,
      };
    }
  }

  for (let c = 1; c <= 9; c++) {
    sheet.getCell(headerRowIndex, c).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE5E7EB' },
    };

    sheet.getCell(totalRowIndex, c).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF3F4F6' },
    };
  }

  for (let r = 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    row.height = r <= 6 ? 26 : 24;

    row.eachCell((cell) => {
      cell.font = {
        name: 'TH Sarabun New',
        size: cell.font?.size || 16,
        bold: cell.font?.bold || false,
      };

      cell.alignment = cell.alignment || {
        horizontal: 'center',
        vertical: 'middle',
        wrapText: true,
      };
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();

  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const suffix =
    reportMode === 'month'
      ? `รายเดือน_${formatMonthKey(selectedMonthKey)}`
      : 'รายภาคเรียน';

  const fileName = `รายงานเข้าแถว_${suffix}.xlsx`;

  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = fileName;
  anchor.click();

  window.URL.revokeObjectURL(url);
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

  return `${monthNames[month]}_${year}`;
}