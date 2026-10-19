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

export async function exportWeeklyReportWord({
  reportRows,
  totalRow,
  selectedWeekNo,
  weekDateRange,
  reportConfig,
}) {
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

          centerText(
            reportConfig.title || 'ใบเช็คการเข้าร่วมกิจกรรมเข้าแถวหน้าเสาธง',
            36,
            true
          ),
          centerText(reportConfig.departmentName || 'แผนกวิชาช่างไฟฟ้ากำลัง', 30, true),
          centerText(
            `สัปดาห์ที่ ${selectedWeekNo || '-'} ระหว่างวันที่ ${weekDateRange || '-'}`,
            26,
            false
          ),

          spacer(),

          createReportTable(reportRows, totalRow),

          spacer(),
          spacer(),

          createSignatureTable(reportConfig),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);

  const fileName = `รายงานเข้าแถว_สัปดาห์ที่_${selectedWeekNo || '-'}.docx`;
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = fileName;
  anchor.click();

  window.URL.revokeObjectURL(url);
}

function createReportTable(reportRows, totalRow) {
  const rows = [];

  rows.push(
    new TableRow({
      tableHeader: true,
      children: [
        headerCell('ระดับชั้น', 1800, 2),
        headerCell('จำนวนทั้งหมด/ห้อง', 1900, 2),
        headerCell('จำนวนนักเรียน นักศึกษาร่วมเข้าแถวหน้าเสาธง/สัปดาห์', 5200, 1, 5),
        headerCell('รวม', 1000, 2),
        headerCell('เฉลี่ย', 1000, 2),
        headerCell('%', 1000, 2),
        headerCell('หมายเหตุ', 1400, 2),
      ],
    })
  );

  rows.push(
    new TableRow({
      tableHeader: true,
      children: [
        headerCell('จันทร์', 1040),
        headerCell('อังคาร', 1040),
        headerCell('พุธ', 1040),
        headerCell('พฤหัสบดี', 1040),
        headerCell('ศุกร์', 1040),
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
  const fontBold = isTotal;

  return new TableRow({
    children: [
      bodyCell(row.room_name || '', 1800, AlignmentType.LEFT, fontBold),
      bodyCell(String(row.total_students ?? ''), 1900, AlignmentType.CENTER, fontBold),
      bodyCell(String(row.daily?.[0] ?? ''), 1040, AlignmentType.CENTER, fontBold),
      bodyCell(String(row.daily?.[1] ?? ''), 1040, AlignmentType.CENTER, fontBold),
      bodyCell(String(row.daily?.[2] ?? ''), 1040, AlignmentType.CENTER, fontBold),
      bodyCell(String(row.daily?.[3] ?? ''), 1040, AlignmentType.CENTER, fontBold),
      bodyCell(String(row.daily?.[4] ?? ''), 1040, AlignmentType.CENTER, fontBold),
      bodyCell(String(row.weekly_total ?? ''), 1000, AlignmentType.CENTER, true),
      bodyCell(String(row.average ?? ''), 1000, AlignmentType.CENTER, fontBold),
      bodyCell(row.percent ? `${row.percent}%` : '', 1000, AlignmentType.CENTER, fontBold),
      bodyCell(row.note || '', 1400, AlignmentType.LEFT, fontBold),
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

function headerCell(text, width, rowSpan = 1, colSpan = 1) {
  return new TableCell({
    width: {
      size: width,
      type: WidthType.DXA,
    },
    rowSpan,
    columnSpan: colSpan,
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