import ExcelJS from 'exceljs';

export async function exportWeeklyReportExcel({
  reportRows,
  totalRow,
  selectedWeekNo,
  weekDateRange,
  reportConfig,
}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'RTC Attendance System';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('รายงานรายสัปดาห์', {
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

  sheet.properties.defaultRowHeight = 22;

  sheet.columns = [
    { width: 16 },
    { width: 16 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 18 },
  ];

  // ===== Header =====
  sheet.mergeCells('A1:K1');
  sheet.getCell('A1').value = reportConfig.formNo || 'ก.1/4';
  sheet.getCell('A1').alignment = { horizontal: 'right', vertical: 'middle' };
  sheet.getCell('A1').font = { name: 'TH Sarabun New', size: 16, bold: true };

  sheet.mergeCells('A2:K2');
  sheet.getCell('A2').value =
    reportConfig.occupationalType || 'ประเภทวิชาอุตสาหกรรม';
  sheet.getCell('A2').alignment = { horizontal: 'right', vertical: 'middle' };
  sheet.getCell('A2').font = { name: 'TH Sarabun New', size: 16, bold: true };

  sheet.mergeCells('A4:K4');
  sheet.getCell('A4').value =
    reportConfig.title || 'ใบเช็คการเข้าร่วมกิจกรรมเข้าแถวหน้าเสาธง';
  sheet.getCell('A4').alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getCell('A4').font = { name: 'TH Sarabun New', size: 22, bold: true };

  sheet.mergeCells('A5:K5');
  sheet.getCell('A5').value =
    reportConfig.departmentName || 'แผนกวิชาช่างไฟฟ้ากำลัง';
  sheet.getCell('A5').alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getCell('A5').font = { name: 'TH Sarabun New', size: 18, bold: true };

  sheet.mergeCells('A6:K6');
  sheet.getCell(
    'A6'
  ).value = `สัปดาห์ที่ ${selectedWeekNo || '-'} ระหว่างวันที่ ${
    weekDateRange || '-'
  }`;
  sheet.getCell('A6').alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getCell('A6').font = { name: 'TH Sarabun New', size: 16 };

  // ===== Table Header =====
  const headerStartRow = 8;

  sheet.mergeCells(`A${headerStartRow}:A${headerStartRow + 1}`);
  sheet.mergeCells(`B${headerStartRow}:B${headerStartRow + 1}`);
  sheet.mergeCells(`C${headerStartRow}:G${headerStartRow}`);
  sheet.mergeCells(`H${headerStartRow}:H${headerStartRow + 1}`);
  sheet.mergeCells(`I${headerStartRow}:I${headerStartRow + 1}`);
  sheet.mergeCells(`J${headerStartRow}:J${headerStartRow + 1}`);
  sheet.mergeCells(`K${headerStartRow}:K${headerStartRow + 1}`);

  sheet.getCell(`A${headerStartRow}`).value = 'ระดับชั้น';
  sheet.getCell(`B${headerStartRow}`).value = 'จำนวนทั้งหมด/ห้อง';
  sheet.getCell(`C${headerStartRow}`).value =
    'จำนวนนักเรียน นักศึกษาร่วมเข้าแถวหน้าเสาธง/สัปดาห์';
  sheet.getCell(`H${headerStartRow}`).value = 'รวม';
  sheet.getCell(`I${headerStartRow}`).value = 'เฉลี่ย';
  sheet.getCell(`J${headerStartRow}`).value = '%';
  sheet.getCell(`K${headerStartRow}`).value = 'หมายเหตุ';

  sheet.getCell(`C${headerStartRow + 1}`).value = 'จันทร์';
  sheet.getCell(`D${headerStartRow + 1}`).value = 'อังคาร';
  sheet.getCell(`E${headerStartRow + 1}`).value = 'พุธ';
  sheet.getCell(`F${headerStartRow + 1}`).value = 'พฤหัสบดี';
  sheet.getCell(`G${headerStartRow + 1}`).value = 'ศุกร์';

  // ===== Body =====
  let rowIndex = headerStartRow + 2;

  reportRows.forEach((item) => {
    sheet.getRow(rowIndex).values = [
      item.room_name || '',
      Number(item.total_students || 0),
      item.daily?.[0] ?? '',
      item.daily?.[1] ?? '',
      item.daily?.[2] ?? '',
      item.daily?.[3] ?? '',
      item.daily?.[4] ?? '',
      Number(item.weekly_total || 0),
      item.average || '',
      item.percent ? `${item.percent}%` : '',
      item.note || '',
    ];

    rowIndex++;
  });

  sheet.getRow(rowIndex).values = [
    totalRow.room_name || 'รวม',
    Number(totalRow.total_students || 0),
    totalRow.daily?.[0] ?? '',
    totalRow.daily?.[1] ?? '',
    totalRow.daily?.[2] ?? '',
    totalRow.daily?.[3] ?? '',
    totalRow.daily?.[4] ?? '',
    Number(totalRow.weekly_total || 0),
    totalRow.average || '',
    totalRow.percent ? `${totalRow.percent}%` : '',
    '',
  ];

  const totalRowIndex = rowIndex;
  rowIndex += 3;

  // ===== Signatures =====
  sheet.mergeCells(`A${rowIndex}:B${rowIndex}`);
  sheet.mergeCells(`D${rowIndex}:E${rowIndex}`);
  sheet.mergeCells(`G${rowIndex}:H${rowIndex}`);
  sheet.mergeCells(`J${rowIndex}:K${rowIndex}`);

  sheet.getCell(`A${rowIndex}`).value = reportConfig.reporterName || '';
  sheet.getCell(`D${rowIndex}`).value = reportConfig.headDepartmentName || '';
  sheet.getCell(`G${rowIndex}`).value = reportConfig.activityHeadName || '';
  sheet.getCell(`J${rowIndex}`).value = reportConfig.deputyName || '';

  rowIndex++;

  sheet.mergeCells(`A${rowIndex}:B${rowIndex}`);
  sheet.mergeCells(`D${rowIndex}:E${rowIndex}`);
  sheet.mergeCells(`G${rowIndex}:H${rowIndex}`);
  sheet.mergeCells(`J${rowIndex}:K${rowIndex}`);

  sheet.getCell(`A${rowIndex}`).value = reportConfig.reporterLabel || '';
  sheet.getCell(`D${rowIndex}`).value =
    reportConfig.headDepartmentLabel || '';
  sheet.getCell(`G${rowIndex}`).value = reportConfig.activityHeadLabel || '';
  sheet.getCell(`J${rowIndex}`).value = reportConfig.deputyLabel || '';

  // ===== Styling =====
  const lastTableRow = totalRowIndex;

  for (let r = headerStartRow; r <= lastTableRow; r++) {
    for (let c = 1; c <= 11; c++) {
      const cell = sheet.getCell(r, c);

      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };

      cell.alignment = {
        horizontal: c === 1 || c === 11 ? 'left' : 'center',
        vertical: 'middle',
        wrapText: true,
      };

      cell.font = {
        name: 'TH Sarabun New',
        size: 16,
        bold: r <= headerStartRow + 1 || r === totalRowIndex,
      };
    }
  }

  for (let r = headerStartRow; r <= headerStartRow + 1; r++) {
    for (let c = 1; c <= 11; c++) {
      sheet.getCell(r, c).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE5E7EB' },
      };
    }
  }

  for (let c = 1; c <= 11; c++) {
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

  for (let r = totalRowIndex + 3; r <= totalRowIndex + 4; r++) {
    for (let c = 1; c <= 11; c++) {
      const cell = sheet.getCell(r, c);

      cell.font = {
        name: 'TH Sarabun New',
        size: 16,
        bold: r === totalRowIndex + 4,
      };

      cell.alignment = {
        horizontal: 'center',
        vertical: 'middle',
        wrapText: true,
      };
    }
  }

  // ===== Download =====
  const buffer = await workbook.xlsx.writeBuffer();

  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const fileName = `รายงานเข้าแถว_สัปดาห์ที่_${selectedWeekNo || '-'}.xlsx`;

  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = fileName;
  anchor.click();

  window.URL.revokeObjectURL(url);
}