import fs from 'node:fs/promises';
import path from 'node:path';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { config } from '../src/config/env.js';
import { Purchase } from '../src/models/Purchase.js';
import { PurchaseRevision } from '../src/models/PurchaseRevision.js';
import { Attachment } from '../src/models/Attachment.js';
import { AuditEvent } from '../src/models/AuditEvent.js';
import {
  createBossAndStaff,
  createProduct,
  createPurchase,
  createSupplier,
  getApp,
  loggedInClient,
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

async function seedPurchase({ withAttachment = false } = {}) {
  const product = (await createProduct(boss, 'Rice')).body.product;
  const supplier = (await createSupplier(boss, 'Mama Ngozi Store')).body.supplier;

  if (!withAttachment) {
    const res = await createPurchase(boss, {
      supplierId: supplier.id,
      items: [{ productId: product.id, quantity: '2', unitPrice: '1250.50' }]
    });
    return { product, supplier, purchase: res.body.purchase };
  }

  const res = await boss
    .raw()
    .post('/api/purchases')
    .set('X-CSRF-Token', boss.csrfToken)
    .field(
      'payload',
      JSON.stringify({
        supplierId: supplier.id,
        items: [{ productId: product.id, quantity: '2', unitPrice: '1250.50' }]
      })
    )
    .attach('files', pngBuffer(), { filename: 'receipt.png', contentType: 'image/png' });

  return { product, supplier, purchase: res.body.purchase };
}

describe('user administration', () => {
  it('lets the boss create, edit, deactivate and reactivate staff', async () => {
    const created = await boss.post('/api/users', {
      name: 'New Staff',
      email: 'newstaff@test.local',
      password: 'InitialPass123',
      role: 'staff'
    });
    expect(created.status).toBe(201);
    const id = created.body.user.id;

    const duplicate = await boss.post('/api/users', {
      name: 'Duplicate',
      email: 'newstaff@test.local',
      password: 'InitialPass123',
      role: 'staff'
    });
    expect(duplicate.status).toBe(409);

    const edited = await boss.patch(`/api/users/${id}`, { name: 'Renamed Staff' });
    expect(edited.status).toBe(200);
    expect(edited.body.user.name).toBe('Renamed Staff');

    const reset = await boss.post(`/api/users/${id}/password`, { password: 'ChangedPass123' });
    expect(reset.status).toBe(200);

    const { agent } = await import('./helpers.js');
    const client = agent();
    await client.init();
    const login = await client.login('newstaff@test.local', 'ChangedPass123');
    expect(login.status).toBe(202);
    expect((await client.verify()).status).toBe(200);

    const deactivated = await boss.post(`/api/users/${id}/deactivate`);
    expect(deactivated.status).toBe(200);
    expect(deactivated.body.user.isActive).toBe(false);

    const reactivated = await boss.post(`/api/users/${id}/reactivate`);
    expect(reactivated.status).toBe(200);
    expect(reactivated.body.user.isActive).toBe(true);

    const audit = await AuditEvent.find({ action: { $in: ['user.create', 'user.update'] } });
    expect(audit.length).toBeGreaterThanOrEqual(2);
  });

  it('shows per-staff purchase activity to the boss', async () => {
    const product = (await createProduct(boss, 'Rice')).body.product;
    const supplier = (await createSupplier(boss, 'Mama Ngozi Store')).body.supplier;
    const created = await createPurchase(staff, {
      supplierId: supplier.id,
      items: [{ productId: product.id, quantity: '2', unitPrice: '1250.50' }]
    });
    const purchase = created.body.purchase;
    const staffUser = await (await import('../src/models/User.js')).User.findOne({
      email: 'staff@test.local'
    });

    const res = await boss.get(`/api/users/${staffUser._id}/activity`);
    expect(res.status).toBe(200);
    expect(res.body.stats.totalPurchasesAllTime).toBe(1);
    expect(res.body.stats.totalKobo).toBe(purchase.totalKobo);
    expect(res.body.recentPurchases[0].transactionNumber).toBe(purchase.transactionNumber);
  });

  it('blocks staff from user administration', async () => {
    expect((await staff.get('/api/users')).status).toBe(403);
  });
});

describe('trash, restore and permanent deletion', () => {
  it('moves purchases to trash, excludes them from totals and restores them', async () => {
    const { purchase } = await seedPurchase();

    const del = await boss.del(`/api/purchases/${purchase.id}`);
    expect(del.status).toBe(200);
    expect(del.body.purchase.isDeleted).toBe(true);

    const today = purchase.purchaseDate;
    const dash = await boss.get(`/api/dashboard?from=${today}&to=${today}`);
    expect(dash.body.totalKobo).toBe(0);

    const active = await boss.get('/api/purchases');
    expect(active.body.items).toHaveLength(0);

    const trash = await boss.get('/api/purchases?status=deleted');
    expect(trash.body.items).toHaveLength(1);
    expect(trash.body.items[0].transactionNumber).toBe(purchase.transactionNumber);

    expect((await staff.get('/api/purchases?status=deleted')).status).toBe(403);

    const restored = await boss.post(`/api/purchases/${purchase.id}/restore`);
    expect(restored.status).toBe(200);
    expect(restored.body.purchase.isDeleted).toBe(false);

    const dashAfter = await boss.get(`/api/dashboard?from=${today}&to=${today}`);
    expect(dashAfter.body.totalKobo).toBe(purchase.totalKobo);
  });

  it('requires trashed state before permanent deletion and cleans up files and revisions', async () => {
    const { purchase } = await seedPurchase({ withAttachment: true });
    expect(purchase.attachments).toHaveLength(1);

    const attachment = await Attachment.findById(purchase.attachments[0].id);
    const abs = path.join(config.uploadDir, attachment.relativePath);
    await expect(fs.access(abs)).resolves.toBeUndefined();

    await boss.patch(`/api/purchases/${purchase.id}`, {
      supplierId: purchase.supplier.id,
      items: [{ productId: purchase.items[0].productId, quantity: '3', unitPrice: '1000' }]
    });
    expect(await PurchaseRevision.countDocuments({ purchase: purchase.id })).toBe(1);

    const tooEarly = await boss.del(`/api/purchases/${purchase.id}/permanent`);
    expect(tooEarly.status).toBe(409);

    await boss.del(`/api/purchases/${purchase.id}`);
    const purged = await boss.del(`/api/purchases/${purchase.id}/permanent`);
    expect(purged.status).toBe(200);

    expect(await Purchase.countDocuments({ _id: purchase.id })).toBe(0);
    expect(await Attachment.countDocuments({ purchase: purchase.id })).toBe(0);
    expect(await PurchaseRevision.countDocuments({ purchase: purchase.id })).toBe(0);
    await expect(fs.access(abs)).rejects.toBeTruthy();

    const audit = await AuditEvent.findOne({ action: 'purchase.purge' });
    expect(audit).toBeTruthy();
    expect(audit.transactionNumber).toBe(purchase.transactionNumber);
  });

  it('prevents staff from deleting, restoring or purging purchases', async () => {
    const { purchase } = await seedPurchase();
    expect((await staff.del(`/api/purchases/${purchase.id}`)).status).toBe(403);
    expect((await staff.post(`/api/purchases/${purchase.id}/restore`)).status).toBe(403);
    expect((await staff.del(`/api/purchases/${purchase.id}/permanent`)).status).toBe(403);
  });
});

describe('audit history', () => {
  it('records purchase deletions and exposes them only to the boss', async () => {
    const { purchase } = await seedPurchase();
    await boss.del(`/api/purchases/${purchase.id}`);

    const auditRes = await boss.get('/api/audit?action=purchase.delete');
    expect(auditRes.status).toBe(200);
    expect(auditRes.body.items.length).toBeGreaterThan(0);
    expect(auditRes.body.items[0].transactionNumber).toBe(purchase.transactionNumber);

    expect((await staff.get('/api/audit')).status).toBe(403);
    expect((await staff.get('/api/audit?action=purchase.delete')).status).toBe(403);
  });

  it('records login events', async () => {
    await boss.post('/api/auth/logout');
    const fresh = await loggedInClient('boss@test.local', PASSWORD);
    expect(fresh).toBeTruthy();
    const loginEvents = await AuditEvent.find({ action: 'auth.login' });
    expect(loginEvents.length).toBeGreaterThan(0);
  });
});
