import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Purchase } from '../src/models/Purchase.js';
import { PurchaseRevision } from '../src/models/PurchaseRevision.js';
import { AuditEvent } from '../src/models/AuditEvent.js';
import { Product } from '../src/models/Product.js';
import { addDays, todayBusinessDate } from '../src/lib/dates.js';
import {
  createBossAndStaff,
  createProduct,
  createPurchase,
  createSupplier,
  getApp,
  loggedInClient,
  resetDb
} from './helpers.js';

let app;
const PASSWORD = 'Password12345';
let boss;
let staff;
let otherStaff;

beforeAll(async () => {
  app = await getApp();
});

beforeEach(async () => {
  await resetDb();
  await createBossAndStaff();
  boss = await loggedInClient('boss@test.local', PASSWORD);
  staff = await loggedInClient('staff@test.local', PASSWORD);
  otherStaff = await loggedInClient('staff2@test.local', PASSWORD);
});

async function seedDirectory() {
  const product = (await createProduct(boss, 'Rice')).body.product;
  const supplier = (await createSupplier(boss, 'Mama Ngozi Store', { phone: '08011112222' }))
    .body.supplier;
  return { product, supplier };
}

describe('purchase creation and financial calculations', () => {
  it('computes line totals and transaction totals in integer kobo', async () => {
    const { product, supplier } = await seedDirectory();
    const res = await createPurchase(boss, {
      supplierId: supplier.id,
      items: [
        { productId: product.id, quantity: '2.5', unitPrice: '1250.50', unitLabel: 'bag' },
        { productId: product.id, quantity: '3', unitPrice: '900', unitLabel: 'carton' }
      ],
      notes: 'Market trip'
    });

    expect(res.status).toBe(201);
    const purchase = res.body.purchase;
    expect(purchase.items[0].lineTotalKobo).toBe(312625);
    expect(purchase.items[1].lineTotalKobo).toBe(270000);
    expect(purchase.totalKobo).toBe(582625);
    expect(purchase.transactionNumber).toMatch(/^RWI-\d{8}-0001$/);
    expect(purchase.purchaseDate).toBe(todayBusinessDate());
  });

  it('rounds fractional quantities half-up to the nearest kobo', async () => {
    const { product, supplier } = await seedDirectory();
    const res = await createPurchase(boss, {
      supplierId: supplier.id,
      items: [{ productId: product.id, quantity: '1.005', unitPrice: '100.01' }]
    });
    expect(res.status).toBe(201);
    // 1005 milli * 10001 kobo / 1000 = 10051.005 -> 10051
    expect(res.body.purchase.items[0].lineTotalKobo).toBe(10051);
  });

  it('ignores client-supplied totals and always recalculates on the server', async () => {
    const { product, supplier } = await seedDirectory();
    const res = await createPurchase(boss, {
      supplierId: supplier.id,
      totalKobo: 1,
      items: [
        { productId: product.id, quantity: '2.5', unitPrice: '1250.50', lineTotalKobo: 1 }
      ]
    });
    expect(res.status).toBe(201);
    expect(res.body.purchase.totalKobo).toBe(312625);
  });

  it('rejects invalid quantities and prices', async () => {
    const { product, supplier } = await seedDirectory();
    const base = { supplierId: supplier.id, items: [{ productId: product.id }] };

    for (const quantity of ['0', '-1', '1.0001', 'abc', '']) {
      const res = await createPurchase(boss, {
        ...base,
        items: [{ productId: product.id, quantity, unitPrice: '100' }]
      });
      expect(res.status, `quantity ${quantity}`).toBe(400);
    }

    for (const unitPrice of ['0', '-5', '1.001', 'abc']) {
      const res = await createPurchase(boss, {
        ...base,
        items: [{ productId: product.id, quantity: '1', unitPrice }]
      });
      expect(res.status, `price ${unitPrice}`).toBe(400);
    }
  });

  it('rejects empty purchases, missing suppliers and missing products', async () => {
    const { product, supplier } = await seedDirectory();

    expect(
      (await createPurchase(boss, { supplierId: supplier.id, items: [] })).status
    ).toBe(400);

    expect(
      (
        await createPurchase(boss, {
          items: [{ productId: product.id, quantity: '1', unitPrice: '10' }]
        })
      ).status
    ).toBe(400);

    expect(
      (
        await createPurchase(boss, {
          supplierId: supplier.id,
          items: [{ quantity: '1', unitPrice: '10' }]
        })
      ).status
    ).toBe(400);
  });

  it('rejects future purchase dates', async () => {
    const { product, supplier } = await seedDirectory();
    const res = await createPurchase(boss, {
      purchaseDate: addDays(todayBusinessDate(), 1),
      supplierId: supplier.id,
      items: [{ productId: product.id, quantity: '1', unitPrice: '10' }]
    });
    expect(res.status).toBe(400);
  });

  it('assigns sequential transaction numbers per business day', async () => {
    const { product, supplier } = await seedDirectory();
    const make = () =>
      createPurchase(boss, {
        supplierId: supplier.id,
        items: [{ productId: product.id, quantity: '1', unitPrice: '10' }]
      });

    const first = await make();
    const second = await make();
    expect(first.body.purchase.transactionNumber).toMatch(/-0001$/);
    expect(second.body.purchase.transactionNumber).toMatch(/-0002$/);

    const yesterday = addDays(todayBusinessDate(), -1);
    const backdated = await createPurchase(boss, {
      purchaseDate: yesterday,
      supplierId: supplier.id,
      items: [{ productId: product.id, quantity: '1', unitPrice: '10' }]
    });
    expect(backdated.status).toBe(201);
    expect(backdated.body.purchase.transactionNumber).toBe(
      `RWI-${yesterday.replace(/-/g, '')}-0001`
    );
  });

  it('saves purchase without an attachment (attachments are optional)', async () => {
    const { product, supplier } = await seedDirectory();
    const res = await createPurchase(boss, {
      supplierId: supplier.id,
      items: [{ productId: product.id, quantity: '1', unitPrice: '10' }]
    });
    expect(res.status).toBe(201);
    expect(res.body.purchase.attachments).toHaveLength(0);
  });
});

describe('snapshots preserve historical accuracy', () => {
  it('keeps product and supplier snapshots after directory edits', async () => {
    const { product, supplier } = await seedDirectory();
    const created = await createPurchase(boss, {
      supplierId: supplier.id,
      items: [{ productId: product.id, quantity: '2', unitPrice: '500' }]
    });
    const purchaseId = created.body.purchase.id;

    await boss.patch(`/api/products/${product.id}`, { name: 'Premium Rice' });
    await boss.patch(`/api/suppliers/${supplier.id}`, {
      name: 'Mama Ngozi Superstore',
      phone: '08099998888'
    });

    const old = await boss.get(`/api/purchases/${purchaseId}`);
    expect(old.body.purchase.items[0].name).toBe('Rice');
    expect(old.body.purchase.supplier.name).toBe('Mama Ngozi Store');
    expect(old.body.purchase.supplier.phone).toBe('08011112222');

    const fresh = await createPurchase(boss, {
      supplierId: supplier.id,
      items: [{ productId: product.id, quantity: '1', unitPrice: '500' }]
    });
    expect(fresh.body.purchase.items[0].name).toBe('Premium Rice');
    expect(fresh.body.purchase.supplier.name).toBe('Mama Ngozi Superstore');
  });

  it('keeps old supplier contact details in historical transactions', async () => {
    const { product, supplier } = await seedDirectory();
    const created = await createPurchase(boss, {
      supplierId: supplier.id,
      items: [{ productId: product.id, quantity: '1', unitPrice: '10' }]
    });
    await boss.patch(`/api/suppliers/${supplier.id}`, { address: 'New Address 12' });
    const old = await boss.get(`/api/purchases/${created.body.purchase.id}`);
    expect(old.body.purchase.supplier.address).toBe('');
  });
});

describe('permissions and purchase editing', () => {
  it('lets staff record purchases but not backdate them', async () => {
    const { product, supplier } = await seedDirectory();
    const ok = await createPurchase(staff, {
      supplierId: supplier.id,
      items: [{ productId: product.id, quantity: '1', unitPrice: '10' }]
    });
    expect(ok.status).toBe(201);

    const denied = await createPurchase(staff, {
      purchaseDate: addDays(todayBusinessDate(), -1),
      supplierId: supplier.id,
      items: [{ productId: product.id, quantity: '1', unitPrice: '10' }]
    });
    expect(denied.status).toBe(403);
  });

  it('restricts editing to the recording staff member', async () => {
    const { product, supplier } = await seedDirectory();
    const created = await createPurchase(staff, {
      supplierId: supplier.id,
      items: [{ productId: product.id, quantity: '1', unitPrice: '100' }]
    });
    const id = created.body.purchase.id;

    const payload = {
      supplierId: supplier.id,
      items: [{ productId: product.id, quantity: '2', unitPrice: '100' }]
    };

    const own = await staff.patch(`/api/purchases/${id}`, payload);
    expect(own.status).toBe(200);
    expect(own.body.purchase.totalKobo).toBe(20000);

    const denied = await otherStaff.patch(`/api/purchases/${id}`, payload);
    expect(denied.status).toBe(403);

    const bossEdit = await boss.patch(`/api/purchases/${id}`, payload);
    expect(bossEdit.status).toBe(200);
  });

  it('prevents staff from changing the purchase date but allows the boss', async () => {
    const { product, supplier } = await seedDirectory();
    const created = await createPurchase(staff, {
      supplierId: supplier.id,
      items: [{ productId: product.id, quantity: '1', unitPrice: '100' }]
    });
    const id = created.body.purchase.id;
    const yesterday = addDays(todayBusinessDate(), -1);

    const denied = await staff.patch(`/api/purchases/${id}`, {
      purchaseDate: yesterday,
      supplierId: supplier.id,
      items: [{ productId: product.id, quantity: '1', unitPrice: '100' }]
    });
    expect(denied.status).toBe(403);

    const allowed = await boss.patch(`/api/purchases/${id}`, {
      purchaseDate: yesterday,
      supplierId: supplier.id,
      items: [{ productId: product.id, quantity: '1', unitPrice: '100' }]
    });
    expect(allowed.status).toBe(200);
    expect(allowed.body.purchase.purchaseDate).toBe(yesterday);
  });

  it('records a revision with old and new values when a purchase is corrected', async () => {
    const { product, supplier } = await seedDirectory();
    const created = await createPurchase(staff, {
      supplierId: supplier.id,
      items: [{ productId: product.id, quantity: '1', unitPrice: '100' }]
    });
    const id = created.body.purchase.id;

    const edited = await boss.patch(`/api/purchases/${id}`, {
      supplierId: supplier.id,
      items: [{ productId: product.id, quantity: '4', unitPrice: '150' }],
      reason: 'Supplier corrected the invoice'
    });
    expect(edited.status).toBe(200);
    expect(edited.body.purchase.totalKobo).toBe(60000);
    expect(edited.body.purchase.revisionCount).toBe(1);

    const revisions = await boss.get(`/api/purchases/${id}/revisions`);
    expect(revisions.status).toBe(200);
    expect(revisions.body.revisions).toHaveLength(1);
    const change = revisions.body.revisions[0].changes.find((c) => c.field === 'items[0]');
    expect(change.oldValue.quantity).toBe('1');
    expect(change.newValue.quantity).toBe('4');
    expect(revisions.body.revisions[0].reason).toBe('Supplier corrected the invoice');

    const revisionDoc = await PurchaseRevision.findOne({ purchase: id });
    expect(revisionDoc).toBeTruthy();
    expect(revisionDoc.actorName).toBe('Boss Admin');

    const audit = await AuditEvent.findOne({ action: 'purchase.update', entityId: id });
    expect(audit).toBeTruthy();
    expect(audit.newValue.revisionNumber).toBe(1);
  });

  it('blocks staff from reading correction history and the audit log', async () => {
    const { product, supplier } = await seedDirectory();
    const created = await createPurchase(staff, {
      supplierId: supplier.id,
      items: [{ productId: product.id, quantity: '1', unitPrice: '100' }]
    });
    const id = created.body.purchase.id;
    expect((await staff.get(`/api/purchases/${id}/revisions`)).status).toBe(403);
    expect((await staff.get('/api/audit')).status).toBe(403);
  });

  it('lets staff view purchases recorded by other staff', async () => {
    const { product, supplier } = await seedDirectory();
    const created = await createPurchase(staff, {
      supplierId: supplier.id,
      items: [{ productId: product.id, quantity: '1', unitPrice: '100' }]
    });
    const res = await otherStaff.get(`/api/purchases/${created.body.purchase.id}`);
    expect(res.status).toBe(200);
  });

  it('prevents staff from creating users or managing the directory', async () => {
    const { product, supplier } = await seedDirectory();
    expect(
      (
        await staff.post('/api/users', {
          name: 'New Person',
          email: 'new@test.local',
          password: 'Password12345',
          role: 'staff'
        })
      ).status
    ).toBe(403);
    expect((await staff.get('/api/users')).status).toBe(403);
    expect((await staff.patch(`/api/products/${product.id}`, { name: 'X' })).status).toBe(403);
    expect((await staff.post(`/api/products/${product.id}/deactivate`)).status).toBe(403);
    expect((await staff.patch(`/api/suppliers/${supplier.id}`, { name: 'X' })).status).toBe(403);
  });
});

describe('duplicate warnings', () => {
  it('blocks an exact duplicate product and allows a confirmed similar product', async () => {
    await createProduct(boss, 'Palm Oil');
    const exact = await createProduct(boss, 'palm  oil');
    expect(exact.status).toBe(409);
    expect(exact.body.error.code).toBe('PRODUCT_EXISTS');

    const similar = await createProduct(boss, 'Palm Oil 5L');
    expect(similar.status).toBe(409);
    expect(similar.body.error.code).toBe('PRODUCT_DUPLICATE');
    expect(similar.body.error.details.matches[0].name).toBe('Palm Oil');

    const confirmed = await createProduct(boss, 'Palm Oil 5L', { confirmNew: true });
    expect(confirmed.status).toBe(201);
  });

  it('warns during purchase recording and allows explicit confirmation', async () => {
    await createProduct(boss, 'Palm Oil');
    const supplier = (await createSupplier(boss, 'Mama Ngozi Store')).body.supplier;

    const blocked = await createPurchase(boss, {
      supplierId: supplier.id,
      items: [
        { newProduct: { name: 'Palm Oil 5 Litres' }, quantity: '1', unitPrice: '900' }
      ]
    });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('DUPLICATE_WARNING');
    expect(blocked.body.error.details.products[0].matches.length).toBeGreaterThan(0);

    const allowed = await createPurchase(boss, {
      supplierId: supplier.id,
      items: [
        {
          newProduct: { name: 'Palm Oil 5 Litres', confirmNew: true },
          quantity: '1',
          unitPrice: '900'
        }
      ]
    });
    expect(allowed.status).toBe(201);
  });

  it('reuses an exact existing product instead of creating a duplicate', async () => {
    const existing = (await createProduct(boss, 'Palm Oil')).body.product;
    const supplier = (await createSupplier(boss, 'Mama Ngozi Store')).body.supplier;

    const res = await createPurchase(boss, {
      supplierId: supplier.id,
      items: [{ newProduct: { name: 'palm oil' }, quantity: '1', unitPrice: '900' }]
    });
    expect(res.status).toBe(201);
    expect(res.body.purchase.items[0].productId).toBe(existing.id);

    const count = await Product.countDocuments({ normalizedName: 'palm oil' });
    expect(count).toBe(1);
  });

  it('warns about similar suppliers', async () => {
    await createSupplier(boss, 'Mama Ngozi Store');
    const res = await createSupplier(boss, 'Mama Ngozi Stores');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SUPPLIER_DUPLICATE');
  });

  it('rejects deactivated products for new purchases but keeps them in history', async () => {
    const { product, supplier } = await seedDirectory();
    const created = await createPurchase(boss, {
      supplierId: supplier.id,
      items: [{ productId: product.id, quantity: '1', unitPrice: '50' }]
    });
    await boss.post(`/api/products/${product.id}/deactivate`);

    const denied = await createPurchase(boss, {
      supplierId: supplier.id,
      items: [{ productId: product.id, quantity: '1', unitPrice: '50' }]
    });
    expect(denied.status).toBe(409);
    expect(denied.body.error.code).toBe('PRODUCT_INACTIVE');

    const history = await boss.get(`/api/purchases/${created.body.purchase.id}`);
    expect(history.status).toBe(200);
    expect(history.body.purchase.items[0].name).toBe('Rice');
  });
});
