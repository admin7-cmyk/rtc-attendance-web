import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';

export async function exportDailyHistoryWord({
  selectedDate,
  rows,
  overview,
}) {
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 720,
              right: 720,
              bottom: 720,
              left: 720,
            },
          },
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: 'รายงานประวัติการเช็กชื่อรายวัน',
                bold: true,
                size: 36,
                font: 'TH Sarabun New',
              }),
            ],
          }),

          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: `ประจำวันที่ ${formatThaiDate(selectedDate)}`,
                bold: true,
                size: 30,
                font: 'TH Sarabun New',
              }),
            ],
          }),

          emptyParagraph(),

          new Paragraph({
            children: [
              new TextRun({
                text: 'สรุปภาพรวม',
                bold: true,
                size: 30,
                font: 'TH Sarabun New',
              }),
            ],
          }),

          new Paragraph({
            children: [
              normalText(`ห้องที่บันทึกแล้ว: ${overview.totalRooms || 0} ห้อง`),
            ],
          }),

          new Paragraph({
            children: [
              normalText(
                `มาเข้าแถวรวม: ${overview.presentCount || 0} ครั้ง (${overview.presentPercent || '0.00'}%)`
              ),
            ],
          }),

          new Paragraph({
            children: [
              normalText(
                `ขาดรวม: ${overview.absentCount || 0} ครั้ง (${overview.absentPercent || '0.00'}%)`
              ),
            ],
          }),

          new Paragraph({
            children: [
              normalText(`รายการทั้งหมด: ${overview.totalRecords || 0} รายการ`),
            ],
          }),

          emptyParagraph(),

          createHistoryTable(rows),

          emptyParagraph(),

          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({
                text: `ออกรายงานเมื่อ ${formatThaiDateTime(new Date().toISOString())}`,
                size: 24,
                font: 'TH Sarabun New',
              }),
            ],
          }),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  downloadBlob(blob, `daily-history-${selectedDate || getTodayYmd()}.docx`);
}

function createHistoryTable(rows) {
  const header = new TableRow({
    tableHeader: true,
    children: [
      headerCell('ลำดับ'),
      headerCell('ห้อง'),
      headerCell('ภาคเรียน'),
      headerCell('สัปดาห์'),
      headerCell('รวม'),
      headerCell('มา'),
      headerCell('ขาด'),
      headerCell('ผู้บันทึก'),
      headerCell('เวลาล่าสุด'),
    ],
  });

  const bodyRows =
    rows.length === 0
      ? [
          new TableRow({
            children: [
              normalCell('ไม่พบข้อมูล', 9),
            ],
          }),
        ]
      : rows.map((row, index) => {
          return new TableRow({
            children: [
              normalCell(String(index + 1)),
              normalCell(row.room_name || row.room_id || '-'),
              normalCell(row.term_id || '-'),
              normalCell(row.week_no || '-'),
              normalCell(String(row.total_count || 0)),
              normalCell(String(row.present_count || 0)),
              normalCell(String(row.absent_count || 0)),
              normalCell(row.checked_by_name || row.checked_by || '-'),
              normalCell(formatThaiDateTime(row.last_checked_at)),
            ],
          });
        });

  return new Table({
    width: {
      size: 100,
      type: WidthType.PERCENTAGE,
    },
    rows: [header, ...bodyRows],
  });
}

function headerCell(text) {
  return new TableCell({
    shading: {
      fill: '111827',
    },
    borders: tableBorders(),
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text,
            bold: true,
            color: 'FFFFFF',
            size: 24,
            font: 'TH Sarabun New',
          }),
        ],
      }),
    ],
  });
}

function normalCell(text, columnSpan = 1) {
  return new TableCell({
    columnSpan,
    borders: tableBorders(),
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: String(text || '-'),
            size: 24,
            font: 'TH Sarabun New',
          }),
        ],
      }),
    ],
  });
}

function normalText(text) {
  return new TextRun({
    text,
    size: 28,
    font: 'TH Sarabun New',
  });
}

function emptyParagraph() {
  return new Paragraph({
    children: [
      new TextRun({
        text: '',
        size: 10,
      }),
    ],
  });
}

function tableBorders() {
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