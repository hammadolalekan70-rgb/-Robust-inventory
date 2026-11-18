import PDFDocument from 'pdfkit';
import { formatNaira, formatNairaPlain } from '../lib/money.js';
import { formatBusinessDateTime } from '../lib/dates.js';

const NAVY = '#0E2E4A';
const AMBER = '#F2A007';
const INK = '#111827';
const MUTED = '#6B7280';
const LINE = '#E5E7EB';
const ZEBRA = '#F8FAFC';

const MARGIN = 40;

function money(kobo) {
  return formatNairaPlain(kobo);
}

function naira(kobo) {
  return `NGN ${formatNaira(kobo).replace(/^NGN\s?/, '').replace(/₦/, '')}`;
}

function drawRMark(doc, x, y, size) {
  const s = size / 64;
  doc.save();
  doc.translate(x, y);
  doc.scale(s);
  doc.rect(14, 13, 12, 38).fill('#FFFFFF');
  doc
    .moveTo(26, 13)
    .lineTo(37, 13)
    .bezierCurveTo(45, 13, 50, 18, 50, 25)
    .bezierCurveTo(50, 31, 46, 35, 40, 35)
    .lineTo(26, 35)
    .closePath()
    .fill('#FFFFFF');
  doc
    .moveTo(33, 33)
    .lineTo(42, 33)
    .lineTo(52, 51)
    .lineTo(40, 51)
    .closePath()
    .fill('#FFFFFF');
  doc
    .moveTo(26, 21)
    .lineTo(35, 21)
    .bezierCurveTo(39, 21, 41, 23, 41, 25.5)
    .bezierCurveTo(41, 28, 39, 30, 35, 30)
    .lineTo(26, 30)
    .closePath()
    .fill(AMBER);
  doc.restore();
}

function drawHeader(doc, { title, rangeLabel, metaRight }) {
  const pageWidth = doc.page.width;
  doc.roundedRect(MARGIN, MARGIN - 4, 34, 34, 9).fill(NAVY);
  drawRMark(doc, MARGIN, MARGIN - 4, 34);

  doc.font('Helvetica-Bold').fontSize(14).fillColor(NAVY).text('ROBUST', MARGIN + 44, MARGIN + 2, {
    lineBreak: false
  });
  doc.font('Helvetica-Bold').fontSize(6.4).fillColor(AMBER).text('WAREHOUSE', MARGIN + 44.6, MARGIN + 19, {
    characterSpacing: 2.4,
    lineBreak: false
  });

  doc.font('Helvetica-Bold').fontSize(13).fillColor(NAVY).text(title, pageWidth - MARGIN - 260, MARGIN, {
    width: 260,
    align: 'right'
  });
  doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(rangeLabel, pageWidth - MARGIN - 260, MARGIN + 19, {
    width: 260,
    align: 'right'
  });
  if (metaRight) {
    doc.fontSize(7.5).fillColor(MUTED).text(metaRight, pageWidth - MARGIN - 260, MARGIN + 32, {
      width: 260,
      align: 'right'
    });
  }

  const y = MARGIN + 44;
  doc.moveTo(MARGIN, y).lineTo(pageWidth - MARGIN, y).lineWidth(2).strokeColor(NAVY).stroke();
  doc.moveTo(MARGIN, y).lineTo(MARGIN + 46, y).lineWidth(2.5).strokeColor(AMBER).stroke();
  return y + 12;
}

function drawContinuationHeader(doc, title) {
  const pageWidth = doc.page.width;
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(MUTED).text(
    `ROBUST WAREHOUSE INVENTORY  •  ${title} (continued)`,
    MARGIN,
    MARGIN - 6,
    { width: pageWidth - MARGIN * 2, lineBreak: false }
  );
  const y = MARGIN + 8;
  doc.moveTo(MARGIN, y).lineTo(pageWidth - MARGIN, y).lineWidth(1).strokeColor(LINE).stroke();
  return y + 10;
}

function sectionTitle(doc, text, y) {
  doc.font('Helvetica-Bold').fontSize(10.5).fillColor(NAVY).text(text, MARGIN, y);
  return doc.y + 6;
}

function contentWidth(doc) {
  return doc.page.width - MARGIN * 2;
}

function bottomLimit(doc) {
  return doc.page.height - 66;
}

function drawKpiBoxes(doc, y, boxes) {
  const total = contentWidth(doc);
  const gap = 10;
  const width = (total - gap * (boxes.length - 1)) / boxes.length;
  const height = 52;
  boxes.forEach((box, index) => {
    const x = MARGIN + index * (width + gap);
    doc.roundedRect(x, y, width, height, 6).fill('#F1F5F9');
    doc.rect(x, y, 3, height).fill(AMBER);
    doc.font('Helvetica').fontSize(7.5).fillColor(MUTED).text(box.label, x + 10, y + 9, {
      width: width - 20
    });
    doc.font('Helvetica-Bold').fontSize(box.size || 13).fillColor(NAVY).text(box.value, x + 10, y + 23, {
      width: width - 20,
      lineBreak: false
    });
  });
  return y + height + 14;
}

function cellHeight(doc, text, width, font, size) {
  doc.font(font).fontSize(size);
  return doc.heightOfString(String(text ?? ''), { width: width - 12 });
}

function drawTable(doc, { columns, rows, y, title, fontSize = 8, emptyText = 'No records' }) {
  const tableWidth = columns.reduce((sum, c) => sum + c.width, 0);
  const startX = MARGIN;
  const padY = 5;

  const drawHead = (atY) => {
    doc.rect(startX, atY, tableWidth, 20).fill(NAVY);
    doc.font('Helvetica-Bold').fontSize(fontSize).fillColor('#FFFFFF');
    let x = startX;
    for (const col of columns) {
      doc.text(col.label, x + 6, atY + 6, {
        width: col.width - 12,
        align: col.align || 'left',
        lineBreak: false
      });
      x += col.width;
    }
    return atY + 20;
  };

  const drawGroupRow = (label, atY) => {
    doc.rect(startX, atY, tableWidth, 18).fill('#E2E8F0');
    doc.font('Helvetica-Bold').fontSize(fontSize).fillColor(NAVY).text(label, startX + 6, atY + 5, {
      width: tableWidth - 12
    });
    return atY + 18;
  };

  let cursor = y;
  if (cursor + 40 > bottomLimit(doc)) {
    doc.addPage();
    cursor = drawContinuationHeader(doc, title);
  }
  cursor = drawHead(cursor);

  if (!rows.length) {
    doc.rect(startX, cursor, tableWidth, 22).fill(ZEBRA);
    doc.font('Helvetica').fontSize(fontSize).fillColor(MUTED).text(emptyText, startX + 6, cursor + 7, {
      width: tableWidth - 12
    });
    doc.y = cursor + 22;
    return cursor + 30;
  }

  rows.forEach((row, rowIndex) => {
    if (row.type === 'group') {
      if (cursor + 18 > bottomLimit(doc)) {
        doc.addPage();
        cursor = drawContinuationHeader(doc, title);
        cursor = drawHead(cursor);
      }
      cursor = drawGroupRow(row.label, cursor);
      return;
    }

    const cells = row.cells || row;
    const height =
      Math.max(
        ...columns.map((col, i) => cellHeight(doc, cells[i], col.width, row.bold ? 'Helvetica-Bold' : 'Helvetica', fontSize))
      ) + padY * 2;

    if (cursor + height > bottomLimit(doc)) {
      doc.addPage();
      cursor = drawContinuationHeader(doc, title);
      cursor = drawHead(cursor);
    }

    const fill = row.bold ? '#EEF2F7' : rowIndex % 2 === 0 ? '#FFFFFF' : ZEBRA;
    doc.rect(startX, cursor, tableWidth, height).fill(fill);
    doc.moveTo(startX, cursor + height).lineTo(startX + tableWidth, cursor + height).lineWidth(0.5).strokeColor(LINE).stroke();

    doc.font(row.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize).fillColor(INK);
    let x = startX;
    columns.forEach((col, i) => {
      doc.text(String(cells[i] ?? ''), x + 6, cursor + padY, {
        width: col.width - 12,
        align: col.align || 'left'
      });
      x += col.width;
    });
    cursor += height;
  });

  doc.y = cursor;
  return cursor + 14;
}

function drawFooter(doc, generatedAt, title) {
  const range = doc.bufferedPageRange();
  const total = range.count;
  const savedBottom = doc.page.margins.bottom;
  for (let i = 0; i < total; i += 1) {
    doc.switchToPage(range.start + i);
    doc.page.margins.bottom = 0;
    const y = doc.page.height - 34;
    doc.moveTo(MARGIN, y - 8).lineTo(doc.page.width - MARGIN, y - 8).lineWidth(0.5).strokeColor(LINE).stroke();
    doc.font('Helvetica').fontSize(7).fillColor(MUTED).text(
      `Robust Warehouse Inventory  •  ${title}  •  Generated ${generatedAt}  •  Confidential`,
      MARGIN,
      y,
      { width: contentWidth(doc) - 90, lineBreak: false }
    );
    doc.text(`Page ${i + 1} of ${total}`, doc.page.width - MARGIN - 82, y, {
      width: 82,
      align: 'right',
      lineBreak: false
    });
    doc.page.margins.bottom = savedBottom;
  }
}

function newDocument() {
  return new PDFDocument({
    size: 'A4',
    margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
    bufferPages: true,
    info: {
      Title: 'Robust Warehouse Inventory Report',
      Author: 'Robust Warehouse Inventory',
      Creator: 'Robust Warehouse Inventory'
    }
  });
}

function rangeLabel(report) {
  return `Reporting period: ${report.range.from} to ${report.range.to}`;
}

export function streamSummaryPdf(res, report) {
  const doc = newDocument();
  const generatedAt = formatBusinessDateTime(new Date());
  doc.pipe(res);

  let y = drawHeader(doc, {
    title: 'SPENDING SUMMARY REPORT',
    rangeLabel: rangeLabel(report),
    metaRight: `Generated ${generatedAt}`
  });

  y = drawKpiBoxes(doc, y, [
    { label: 'TOTAL SPENDING', value: naira(report.totals.totalKobo), size: 12 },
    { label: 'TRANSACTIONS', value: String(report.totals.transactionCount) },
    { label: 'AVERAGE PER TRANSACTION', value: naira(report.totals.averageKobo), size: 11 }
  ]);

  y = sectionTitle(doc, 'Spending by day', y);
  y = drawTable(doc, {
    title: 'Spending Summary',
    y,
    columns: [
      { label: 'Date', width: 150 },
      { label: 'Transactions', width: 100, align: 'right' },
      { label: 'Amount (NGN)', width: contentWidth(doc) - 250, align: 'right' }
    ],
    rows: report.daily.map((d) => [d.date, d.count, money(d.totalKobo)])
  });

  y = sectionTitle(doc, 'Spending by week', y);
  y = drawTable(doc, {
    title: 'Spending Summary',
    y,
    columns: [
      { label: 'Week starting (Monday)', width: 180 },
      { label: 'Transactions', width: 100, align: 'right' },
      { label: 'Amount (NGN)', width: contentWidth(doc) - 280, align: 'right' }
    ],
    rows: report.weekly.map((w) => [w.key, w.count, money(w.totalKobo)])
  });

  y = sectionTitle(doc, 'Spending by month', y);
  y = drawTable(doc, {
    title: 'Spending Summary',
    y,
    columns: [
      { label: 'Month', width: 180 },
      { label: 'Transactions', width: 100, align: 'right' },
      { label: 'Amount (NGN)', width: contentWidth(doc) - 280, align: 'right' }
    ],
    rows: report.monthly.map((m) => [m.key, m.count, money(m.totalKobo)])
  });

  y = sectionTitle(doc, 'Spending by supplier', y);
  y = drawTable(doc, {
    title: 'Spending Summary',
    y,
    columns: [
      { label: 'Supplier', width: 250 },
      { label: 'Transactions', width: 100, align: 'right' },
      { label: 'Amount (NGN)', width: contentWidth(doc) - 350, align: 'right' }
    ],
    rows: report.bySupplier.map((s) => [s.name, s.count, money(s.totalKobo)])
  });

  y = sectionTitle(doc, 'Spending by product', y);
  y = drawTable(doc, {
    title: 'Spending Summary',
    y,
    columns: [
      { label: 'Product', width: 230 },
      { label: 'Quantity', width: 80, align: 'right' },
      { label: 'Transactions', width: 95, align: 'right' },
      { label: 'Amount (NGN)', width: contentWidth(doc) - 405, align: 'right' }
    ],
    rows: report.byProduct.map((p) => [p.name, p.quantity, p.count, money(p.totalKobo)])
  });

  if (report.byStaff?.length) {
    y = sectionTitle(doc, 'Spending recorded by staff', y);
    drawTable(doc, {
      title: 'Spending Summary',
      y,
      columns: [
        { label: 'Staff member', width: 250 },
        { label: 'Transactions', width: 100, align: 'right' },
        { label: 'Amount (NGN)', width: contentWidth(doc) - 350, align: 'right' }
      ],
      rows: report.byStaff.map((s) => [s.name, s.count, money(s.totalKobo)])
    });
  }

  drawFooter(doc, generatedAt, 'Spending Summary');
  doc.end();
}

export function streamDetailedPdf(res, detailed) {
  const doc = newDocument();
  const generatedAt = formatBusinessDateTime(new Date());
  doc.pipe(res);

  let y = drawHeader(doc, {
    title: 'DETAILED PURCHASE REPORT',
    rangeLabel: `${rangeLabel(detailed)}  •  ${detailed.transactionCount} transaction(s)`,
    metaRight: `Generated ${generatedAt}`
  });

  y = drawKpiBoxes(doc, y, [
    { label: 'TOTAL SPENDING', value: naira(detailed.totalKobo), size: 12 },
    { label: 'TRANSACTIONS', value: String(detailed.transactionCount) },
    { label: 'ITEMS RECORDED', value: String(detailed.transactions.reduce((n, t) => n + t.items.length, 0)) }
  ]);

  if (!detailed.transactions.length) {
    doc.font('Helvetica-Bold').fontSize(11).fillColor(NAVY).text('No purchases found for this period.', MARGIN, y + 10);
    doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text(
      'Adjust the reporting dates and generate the report again.',
      MARGIN,
      y + 28
    );
    drawFooter(doc, generatedAt, 'Detailed Purchases');
    doc.end();
    return;
  }

  for (const tx of detailed.transactions) {
    if (doc.y + 130 > bottomLimit(doc)) {
      doc.addPage();
      drawContinuationHeader(doc, 'Detailed Purchases');
    }
    const blockY = Math.max(doc.y + 2, MARGIN + 10);

    doc.roundedRect(MARGIN, blockY, contentWidth(doc), 26, 4).fill('#E8EEF5');
    doc.font('Helvetica-Bold').fontSize(9).fillColor(NAVY).text(tx.transactionNumber, MARGIN + 8, blockY + 6, {
      lineBreak: false
    });
    doc.font('Helvetica-Bold').fontSize(9).fillColor(NAVY).text(naira(tx.totalKobo), MARGIN, blockY + 6, {
      width: contentWidth(doc) - 8,
      align: 'right',
      lineBreak: false
    });

    doc.font('Helvetica').fontSize(7.8).fillColor(MUTED).text(
      `Date: ${tx.purchaseDate}    Supplier: ${tx.supplier.name}    Recorded by: ${tx.recordedBy.name}` +
        `    Attachments: ${tx.attachments.length}${tx.revisionCount ? `    Corrections: ${tx.revisionCount}` : ''}`,
      MARGIN + 8,
      blockY + 32,
      { width: contentWidth(doc) - 16 }
    );

    let tableY = doc.y + 6;
    doc.y = tableY;
    doc.y = drawTable(doc, {
      title: 'Detailed Purchases',
      y: tableY,
      fontSize: 7.8,
      columns: [
        { label: 'Product', width: 225 },
        { label: 'Unit', width: 48 },
        { label: 'Quantity', width: 62, align: 'right' },
        { label: 'Unit price (NGN)', width: 92, align: 'right' },
        { label: 'Line total (NGN)', width: contentWidth(doc) - 427, align: 'right' }
      ],
      rows: tx.items.map((item) => [
        item.name,
        item.unitLabel || '—',
        item.quantity,
        money(item.unitPriceKobo),
        money(item.lineTotalKobo)
      ])
    });

    if (tx.notes) {
      if (doc.y + 30 > bottomLimit(doc)) {
        doc.addPage();
        doc.y = drawContinuationHeader(doc, 'Detailed Purchases');
      }
      doc.font('Helvetica-Oblique').fontSize(7.5).fillColor(MUTED).text(`Notes: ${tx.notes}`, MARGIN + 8, doc.y, {
        width: contentWidth(doc) - 16
      });
      doc.y += 10;
    }
    doc.y += 8;
  }

  if (doc.y + 50 > bottomLimit(doc)) {
    doc.addPage();
    doc.y = drawContinuationHeader(doc, 'Detailed Purchases');
  }
  const totalY = doc.y + 4;
  doc.roundedRect(MARGIN, totalY, contentWidth(doc), 30, 5).fill(NAVY);
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#FFFFFF').text('GRAND TOTAL', MARGIN + 12, totalY + 10, {
    lineBreak: false
  });
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#FFFFFF').text(naira(detailed.totalKobo), MARGIN, totalY + 10, {
    width: contentWidth(doc) - 12,
    align: 'right',
    lineBreak: false
  });
  doc.y = totalY + 40;

  drawFooter(doc, generatedAt, 'Detailed Purchases');
  doc.end();
}

export function pdfFilename(kind, from, to) {
  const label = kind === 'summary' ? 'spending-summary' : 'purchases-detailed';
  return `RWI-${label}-${from}-to-${to}.pdf`;
}
