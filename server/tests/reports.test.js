import fs from 'node:fs/promises';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Attachment } from '../src/models/Attachment.js';
import { config } from '../src/config/env.js';
import { addDays, todayBusinessDate } from '../src/lib/dates.js';
import {
  createBossAndStaff,
  createProduct,
  createPurchase,
  createSupplier,
  getApp,
  loggedInClient,
  pdfBuffer,
  pngBuffer,
  resetDb
} from './helpers.js';

let app;
const PASSWORD = 'Password12345';
let boss;
let staff;

beforeAll(async () => {
  app = await getApp();
});

beforeEach(async () => {
  await resetDb();
  await createBossAndStaff();
  boss = await loggedInClient('boss@test.local', PASSWORD);
  staff = await loggedInClient('staff@test.local', PASSWORD);
});

async function seed() {
  const rice = (await createProduct(boss, 'Rice')).body.product;
  const oil = (await createProduct(boss, 'Vegetable Oil')).body.product;
  const s1 = (await createSupplier(boss, 'Mama Ngozi Store')).body.supplier;
  const s2 = (await createSupplier(boss, 'Alhaji Provisions')).body.supplier;
  return { rice, oil, s1, s2 };
}

describe('attachments', () => {
  it('stores validated receipt images with randomized names and private access', async () => {
    const { rice, s1 } = await seed();
    const res = await boss
      .raw()
      .post('/api/purchases')
      .set('X-CSRF-Token', boss.csrfToken)
      .field(
        'payload',
        JSON.stringify({
          supplierId: s1.id,
          items: [{ productId: rice.id, quantity: '1', unitPrice: '2500' }]
        })
      )
      .attach('files', pngBuffer(), { filename: 'receipt.png', contentType: 'image/png' });

    expect(res.status).toBe(201);
    expect(res.body.purchase.attachments).toHaveLength(1);
    const attachment = res.body.purchase.attachments[0];
    expect(attachment.originalName).toBe('receipt.png');
    expect(attachment.mimeType).toBe('image/png');

    const stored = await Attachment.findById(attachment.id);
    expect(stored.storedName).toMatch(/^[0-9a-f-]{36}\.png$/);
    expect(stored.sha256).toHaveLength(64);

    const file = await boss.get(`/api/attachments/${attachment.id}`);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toContain('image/png');
    expect(file.headers['x-content-type-options']).toBe('nosniff');
    expect(file.headers['content-security-policy']).toContain("default-src 'none'");
  });

  it('accepts PDF invoices', async () => {
    const { rice, s1 } = await seed();
    const res = await boss
      .raw()
      .post('/api/purchases')
      .set('X-CSRF-Token', boss.csrfToken)
      .field(
        'payload',
        JSON.stringify({
          supplierId: s1.id,
          items: [{ productId: rice.id, quantity: '1', unitPrice: '100' }]
        })
      )
      .attach('files', pdfBuffer(), { filename: 'invoice.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(201);
    expect(res.body.purchase.attachments[0].mimeType).toBe('application/pdf');
  });

  it('rejects files whose content does not match a supported type', async () => {
    const { rice, s1 } = await seed();
    const res = await boss
      .raw()
      .post('/api/purchases')
      .set('X-CSRF-Token', boss.csrfToken)
      .field(
        'payload',
        JSON.stringify({
          supplierId: s1.id,
          items: [{ productId: rice.id, quantity: '1', unitPrice: '100' }]
        })
      )
      .attach('files', Buffer.from('MZ\x90\x00malicious executable'), {
        filename: 'receipt.png',
        contentType: 'image/png'
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_FILE_CONTENT');
  });

  it('rejects unsupported declared content types', async () => {
    const { rice, s1 } = await seed();
    const res = await boss
      .raw()
      .post('/api/purchases')
      .set('X-CSRF-Token', boss.csrfToken)
      .field(
        'payload',
        JSON.stringify({
          supplierId: s1.id,
          items: [{ productId: rice.id, quantity: '1', unitPrice: '100' }]
        })
      )
      .attach('files', Buffer.from('hello'), {
        filename: 'script.js',
        contentType: 'application/javascript'
      });
    expect(res.status).toBe(400);
  });

  it('rejects files over the configured size limit', async () => {
    const { rice, s1 } = await seed();
    const big = Buffer.alloc(6 * 1024 * 1024, 0x41);
    pngBuffer().copy(big, 0);

    const res = await boss
      .raw()
      .post('/api/purchases')
      .set('X-CSRF-Token', boss.csrfToken)
      .field(
        'payload',
        JSON.stringify({
          supplierId: s1.id,
          items: [{ productId: rice.id, quantity: '1', unitPrice: '100' }]
        })
      )
      .attach('files', big, { filename: 'huge.png', contentType: 'image/png' });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('FILE_TOO_LARGE');
  });

  it('requires authentication and restricts deletion to the owner or boss', async () => {
    const { rice, s1 } = await seed();
    const created = await staff
      .raw()
      .post('/api/purchases')
      .set('X-CSRF-Token', staff.csrfToken)
      .field(
        'payload',
        JSON.stringify({
          supplierId: s1.id,
          items: [{ productId: rice.id, quantity: '1', unitPrice: '100' }]
        })
      )
      .attach('files', pngBuffer(), { filename: 'proof.png', contentType: 'image/png' });

    const attachmentId = created.body.purchase.attachments[0].id;

    const anonymous = await request(app).get(`/api/attachments/${attachmentId}`);
    expect(anonymous.status).toBe(401);

    const other = await (
      await loggedInClient('staff2@test.local', PASSWORD)
    ).del(`/api/attachments/${attachmentId}`);
    expect(other.status).toBe(403);

    const stored = await Attachment.findById(attachmentId);
    const abs = `${config.uploadDir}/${stored.relativePath}`;
    await expect(fs.access(abs)).resolves.toBeUndefined();

    const removed = await staff.del(`/api/attachments/${attachmentId}`);
    expect(removed.status).toBe(200);
    await expect(fs.access(abs)).rejects.toBeTruthy();

    const after = await staff.get(`/api/purchases/${created.body.purchase.id}`);
    expect(after.body.purchase.attachments).toHaveLength(0);
  });

  it('hides attachments of deleted purchases from staff but not from the boss', async () => {
    const { rice, s1 } = await seed();
    const created = await boss
      .raw()
      .post('/api/purchases')
      .set('X-CSRF-Token', boss.csrfToken)
      .field(
        'payload',
        JSON.stringify({
          supplierId: s1.id,
          items: [{ productId: rice.id, quantity: '1', unitPrice: '100' }]
        })
      )
      .attach('files', pngBuffer(), { filename: 'proof.png', contentType: 'image/png' });

    const purchaseId = created.body.purchase.id;
    const attachmentId = created.body.purchase.attachments[0].id;

    await boss.del(`/api/purchases/${purchaseId}`);

    expect((await staff.get(`/api/attachments/${attachmentId}`)).status).toBe(404);
    expect((await staff.get(`/api/purchases/${purchaseId}`)).status).toBe(404);
    expect((await boss.get(`/api/attachments/${attachmentId}`)).status).toBe(200);
    expect((await boss.get(`/api/purchases/${purchaseId}`)).status).toBe(200);
  });
});

describe('dashboard and reports', () => {
  let days;

  async function seedReportData() {
    const { rice, oil, s1, s2 } = await seed();
    const today = todayBusinessDate();
    days = {
      d1: addDays(today, -2),
      d2: addDays(today, -1),
      d3: today
    };

    await createPurchase(boss, {
      purchaseDate: days.d1,
      supplierId: s1.id,
      items: [
        { productId: rice.id, quantity: '2', unitPrice: '100' },
        { productId: oil.id, quantity: '1', unitPrice: '300' }
      ]
    });
    await createPurchase(boss, {
      purchaseDate: days.d2,
      supplierId: s2.id,
      items: [{ productId: rice.id, quantity: '1', unitPrice: '150' }]
    });
    await createPurchase(boss, {
      purchaseDate: days.d3,
      supplierId: s1.id,
      items: [{ productId: oil.id, quantity: '3', unitPrice: '250' }]
    });

    return { rice, oil, s1, s2 };
  }

  it('aggregates totals, daily breakdowns and supplier/product splits', async () => {
    await seedReportData();
    const res = await boss.get(`/api/dashboard?from=${days.d1}&to=${days.d3}`);
    expect(res.status).toBe(200);

    expect(res.body.totalKobo).toBe(140000);
    expect(res.body.transactionCount).toBe(3);
    expect(res.body.daily).toHaveLength(3);
    expect(res.body.daily.map((d) => d.totalKobo)).toEqual([50000, 15000, 75000]);
    expect(res.body.daily.map((d) => d.count)).toEqual([1, 1, 1]);

    const bySupplier = Object.fromEntries(
      res.body.bySupplier.map((s) => [s.name, s.totalKobo])
    );
    expect(bySupplier['Mama Ngozi Store']).toBe(125000);
    expect(bySupplier['Alhaji Provisions']).toBe(15000);

    const byProduct = Object.fromEntries(res.body.byProduct.map((p) => [p.name, p.totalKobo]));
    expect(byProduct.Rice).toBe(35000);
    expect(byProduct['Vegetable Oil']).toBe(105000);

    expect(res.body.counts.products).toBe(2);
    expect(res.body.counts.suppliers).toBe(2);
    expect(res.body.recent).toHaveLength(3);
  });

  it('hides total spend from staff until the unlock code is entered', async () => {
    await seedReportData();
    const url = `/api/dashboard?from=${days.d1}&to=${days.d3}`;

    const locked = await staff.get(url);
    expect(locked.status).toBe(200);
    expect(locked.body.spendUnlocked).toBe(false);
    expect(locked.body.totalKobo).toBeNull();
    expect(locked.body.averageKobo).toBeNull();
    expect(locked.body.daily.every((day) => day.totalKobo === null)).toBe(true);

    const summaryUrl = `/api/reports/summary?from=${days.d1}&to=${days.d3}`;
    expect((await staff.get(summaryUrl)).status).toBe(403);
    expect((await staff.get(`/api/reports/summary.pdf?from=${days.d1}&to=${days.d3}`)).status).toBe(403);

    const wrongCode = config.dashboardUnlockCode === '9999' ? '0000' : '9999';
    expect((await staff.post('/api/dashboard/unlock', { code: wrongCode })).status).toBe(403);

    const unlocked = await staff.post('/api/dashboard/unlock', {
      code: config.dashboardUnlockCode
    });
    expect(unlocked.status).toBe(200);

    const visible = await staff.get(url);
    expect(visible.body.spendUnlocked).toBe(true);
    expect(visible.body.totalKobo).toBe(140000);
    expect(visible.body.averageKobo).toBe(46667);

    expect((await staff.get(summaryUrl)).status).toBe(403);
  });

  it('filters by date range and drills into a single day', async () => {
    await seedReportData();

    const todayOnly = await boss.get(`/api/dashboard?from=${days.d3}&to=${days.d3}`);
    expect(todayOnly.body.totalKobo).toBe(75000);
    expect(todayOnly.body.transactionCount).toBe(1);

    const drill = await boss.get(`/api/dashboard/day/${days.d1}`);
    expect(drill.status).toBe(200);
    expect(drill.body.totalKobo).toBe(50000);
    expect(drill.body.items).toHaveLength(1);
    expect(drill.body.items[0].transactionNumber).toMatch(/^RWI-/);
  });

  it('returns zeros and empty series for a period with no purchases', async () => {
    await seedReportData();
    const emptyDay = addDays(todayBusinessDate(), -30);
    const res = await boss.get(`/api/dashboard?from=${emptyDay}&to=${emptyDay}`);
    expect(res.body.totalKobo).toBe(0);
    expect(res.body.transactionCount).toBe(0);
    expect(res.body.daily).toEqual([{ date: emptyDay, totalKobo: 0, count: 0 }]);
  });

  it('excludes deleted purchases from dashboard totals until restored', async () => {
    const { s1 } = await seedReportData();
    const list = await boss.get(`/api/purchases?from=${days.d3}&to=${days.d3}`);
    const purchaseId = list.body.items[0].id;

    await boss.del(`/api/purchases/${purchaseId}`);
    let res = await boss.get(`/api/dashboard?from=${days.d1}&to=${days.d3}`);
    expect(res.body.totalKobo).toBe(65000);

    await boss.post(`/api/purchases/${purchaseId}/restore`);
    res = await boss.get(`/api/dashboard?from=${days.d1}&to=${days.d3}`);
    expect(res.body.totalKobo).toBe(140000);
    expect(s1).toBeTruthy();
  });

  it('builds weekly and monthly summaries that agree with the total', async () => {
    await seedReportData();
    const res = await boss.get(`/api/reports/summary?from=${days.d1}&to=${days.d3}`);
    expect(res.status).toBe(200);
    expect(res.body.totals.totalKobo).toBe(140000);
    expect(res.body.totals.transactionCount).toBe(3);

    const weeklyTotal = res.body.weekly.reduce((sum, w) => sum + w.totalKobo, 0);
    const monthlyTotal = res.body.monthly.reduce((sum, m) => sum + m.totalKobo, 0);
    expect(weeklyTotal).toBe(140000);
    expect(monthlyTotal).toBe(140000);
  });

  it('produces a detailed report whose totals match the dashboard', async () => {
    await seedReportData();
    const dashboard = await boss.get(`/api/dashboard?from=${days.d1}&to=${days.d3}`);
    const detailed = await boss.get(`/api/reports/detailed?from=${days.d1}&to=${days.d3}`);

    expect(detailed.body.transactionCount).toBe(3);
    expect(detailed.body.totalKobo).toBe(dashboard.body.totalKobo);
    const sumOfItems = detailed.body.transactions.reduce(
      (sum, t) => sum + t.items.reduce((s, i) => s + i.lineTotalKobo, 0),
      0
    );
    expect(sumOfItems).toBe(detailed.body.totalKobo);
  });

  it('tracks historical product prices across suppliers', async () => {
    const { rice } = await seedReportData();
    const res = await boss.get(`/api/products/${rice.id}/price-history`);
    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(2);
    expect(res.body.stats.minKobo).toBe(10000);
    expect(res.body.stats.maxKobo).toBe(15000);
    expect(res.body.stats.avgKobo).toBe(12500);
    expect(res.body.stats.lastKobo).toBe(15000);
    expect(res.body.bySupplier).toHaveLength(2);
    expect(res.body.entries[0].date).toBe(days.d2);
  });

  it('rejects invalid date ranges', async () => {
    const res = await boss.get(`/api/dashboard?from=${days?.d3 || '2026-01-10'}&to=2026-01-01`);
    expect(res.status).toBe(400);
    expect((await boss.get('/api/reports/summary')).status).toBe(400);
  });

  it('generates summary and detailed PDF reports', async () => {
    await seedReportData();

    const summary = await boss
      .get(`/api/reports/summary.pdf?from=${days.d1}&to=${days.d3}`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(summary.status).toBe(200);
    expect(summary.headers['content-type']).toContain('application/pdf');
    expect(summary.body.subarray(0, 5).toString()).toBe('%PDF-');

    const detailed = await boss
      .get(`/api/reports/detailed.pdf?from=${days.d1}&to=${days.d3}`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(detailed.status).toBe(200);
    expect(detailed.body.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('paginates long PDF reports and keeps totals on a final page', async () => {
    const { rice, s1 } = await seed();
    for (let i = 0; i < 60; i += 1) {
      const res = await createPurchase(boss, {
        supplierId: s1.id,
        items: [{ productId: rice.id, quantity: '1', unitPrice: String(100 + i) }]
      });
      expect(res.status).toBe(201);
    }
    const today = todayBusinessDate();
    const pdf = await boss
      .get(`/api/reports/detailed.pdf?from=${today}&to=${today}`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });

    expect(pdf.status).toBe(200);
    const pageCount = (pdf.body.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    expect(pageCount).toBeGreaterThan(3);
  });

  it('still produces a valid PDF when there are no transactions', async () => {
    await seed();
    const empty = addDays(todayBusinessDate(), -40);
    const pdf = await boss
      .get(`/api/reports/detailed.pdf?from=${empty}&to=${empty}`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(pdf.status).toBe(200);
    expect(pdf.body.subarray(0, 5).toString()).toBe('%PDF-');
  });
});
