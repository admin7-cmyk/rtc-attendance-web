import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  PageOrientation,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';

const FONT_NAME = 'TH Sarabun New';

export async function exportSummaryReportWord({
  reportRows,
  totalRow,
  reportMode,
  selectedMonthKey,
  reportDateRange,
  reportConfig,
}) {
  const reportTitle =
    reportMode === 'month'
      ? 'รายงานสรุปการเข้าแถวรายเดือน'
      : 'รายงานสรุปการเข้าแถวรายภาคเรียน';

  const periodText =
    reportMode === 'month'
      ? `เดือน ${formatMonthKey(selectedMonthKey)}`
      : 'รายภาคเรียน';

  const doc = new Document({
    creator: 'RTC Attendance System',
    sections: [
      {
        properties: {
          page: {
            size: {
              orientation: PageOrientation.LANDSCAPE,
            },
            margin: {
              top: 720,
              right: 720,
              bottom: 720,
              left: 720,
            },
          },
        },
        children: [
          rightText(reportConfig.formNo || 'ก.1/4', 28, true),
          rightText(reportConfig.occupationalType || 'ประเภทวิชาอุตสาหกรรม', 28, true),

          spacer(),

          centerText(reportTitle, 36, true),
          centerText(reportConfig.departmentName || 'แผนกวิชาช่างไฟฟ้ากำลัง', 30, true),
          centerText(`${periodText} | ${reportDateRange || '-'}`, 26, false),

          spacer(),

          createSummaryTable(reportRows, totalRow),

          spacer(),
          spacer(),

          createSignatureTable(reportConfig),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);

  const suffix =
    reportMode === 'month'
      ? `รายเดือน_${formatMonthKey(selectedMonthKey)}`
      : 'รายภาคเรียน';

  const fileName = `รายงานเข้าแถว_${suffix}.docx`;

  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = fileName;
  anchor.click();

  window.URL.revokeObjectURL(url);
}

function createSummaryTable(reportRows, totalRow) {
  const rows = [];

  rows.push(
    new TableRow({
      tableHeader: true,
      children: [
        headerCell('ระดับชั้น', 1800),
        headerCell('จำนวนทั้งหมด/ห้อง', 1700),
        headerCell('จำนวนวันเช็ก', 1300),
        headerCell('จำนวนที่ควรเช็ก', 1600),
        headerCell('มา', 1000),
        headerCell('ขาด', 1000),
        headerCell('มา %', 1000),
        headerCell('ขาด %', 1000),
        headerCell('หมายเหตุ', 1600),
      ],
    })
  );

  reportRows.forEach((row) => {
    rows.push(createBodyRow(row));
  });

  rows.push(createBodyRow(totalRow, true));

  return new Table({
    width: {
      size: 100,
      type: WidthType.PERCENTAGE,
    },
    rows,
  });
}

function createBodyRow(row, isTotal = false) {
  return new TableRow({
    children: [
      bodyCell(row.room_name || '', 1800, AlignmentType.LEFT, isTotal),
      bodyCell(String(row.total_students ?? ''), 1700, AlignmentType.CENTER, isTotal),
      bodyCell(String(row.checked_days ?? ''), 1300, AlignmentType.CENTER, isTotal),
      bodyCell(String(row.expected_total ?? ''), 1600, AlignmentType.CENTER, isTotal),
      bodyCell(String(row.present_count ?? ''), 1000, AlignmentType.CENTER, true),
      bodyCell(String(row.absent_count ?? ''), 1000, AlignmentType.CENTER, true),
      bodyCell(row.present_percent ? `${row.present_percent}%` : '', 1000, AlignmentType.CENTER, isTotal),
      bodyCell(row.absent_percent ? `${row.absent_percent}%` : '', 1000, AlignmentType.CENTER, isTotal),
      bodyCell(row.note || '', 1600, AlignmentType.LEFT, isTotal),
    ],
  });
}

function createSignatureTable(reportConfig) {
  return new Table({
    width: {
      size: 100,
      type: WidthType.PERCENTAGE,
    },
    borders: noBorders(),
    rows: [
      new TableRow({
        children: [
          signatureCell(reportConfig.reporterName || ''),
          signatureCell(reportConfig.headDepartmentName || ''),
          signatureCell(reportConfig.activityHeadName || ''),
          signatureCell(reportConfig.deputyName || ''),
        ],
      }),
      new TableRow({
        children: [
          signatureCell(reportConfig.reporterLabel || '', true),
          signatureCell(reportConfig.headDepartmentLabel || '', true),
          signatureCell(reportConfig.activityHeadLabel || '', true),
          signatureCell(reportConfig.deputyLabel || '', true),
        ],
      }),
    ],
  });
}

function headerCell(text, width) {
  return new TableCell({
    width: {
      size: width,
      type: WidthType.DXA,
    },
    shading: {
      fill: '111827',
    },
    borders: normalBorders(),
    verticalAlign: 'center',
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text,
            font: FONT_NAME,
            size: 26,
            bold: true,
            color: 'FFFFFF',
          }),
        ],
      }),
    ],
  });
}

function bodyCell(text, width, align = AlignmentType.CENTER, bold = false) {
  return new TableCell({
    width: {
      size: width,
      type: WidthType.DXA,
    },
    borders: normalBorders(),
    verticalAlign: 'center',
    children: [
      new Paragraph({
        alignment: align,
        children: [
          new TextRun({
            text,
            font: FONT_NAME,
            size: 26,
            bold,
          }),
        ],
      }),
    ],
  });
}

function signatureCell(text, bold = false) {
  return new TableCell({
    borders: noBorders(),
    verticalAlign: 'center',
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text,
            font: FONT_NAME,
            size: 26,
            bold,
          }),
        ],
      }),
    ],
  });
}

function centerText(text, size = 28, bold = false) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [
      new TextRun({
        text,
        font: FONT_NAME,
        size,
        bold,
      }),
    ],
  });
}

function rightText(text, size = 26, bold = false) {
  return new Paragraph({
    alignment: AlignmentType.RIGHT,
    children: [
      new TextRun({
        text,
        font: FONT_NAME,
        size,
        bold,
      }),
    ],
  });
}

function spacer() {
  return new Paragraph({
    children: [
      new TextRun({
        text: '',
        font: FONT_NAME,
        size: 8,
      }),
    ],
  });
}

function normalBorders() {
  return {
    top: {
      style: BorderStyle.SINGLE,
      size: 1,
      color: 'D1D5DB',
    },
    bottom: {
      style: BorderStyle.SINGLE,
      size: 1,
      color: 'D1D5DB',
    },
    left: {
      style: BorderStyle.SINGLE,
      size: 1,
      color: 'D1D5DB',
    },
    right: {
      style: BorderStyle.SINGLE,
      size: 1,
      color: 'D1D5DB',
    },
  };
}

function noBorders() {
  return {
    top: {
      style: BorderStyle.NONE,
      size: 0,
      color: 'FFFFFF',
    },
    bottom: {
      style: BorderStyle.NONE,
      size: 0,
      color: 'FFFFFF',
    },
    left: {
      style: BorderStyle.NONE,
      size: 0,
      color: 'FFFFFF',
    },
    right: {
      style: BorderStyle.NONE,
      size: 0,
      color: 'FFFFFF',
    },
  };
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