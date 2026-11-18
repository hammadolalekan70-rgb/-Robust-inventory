import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { connectDB } from '../src/db/connect.js';
import { User } from '../src/models/User.js';
import { hashPassword, LOGIN_TEST_CODE } from '../src/services/authService.js';

let app;
const agents = [];

export async function getApp() {
  if (app) return app;
  await connectDB();
  await mongoose.connection.dropDatabase();
  app = createApp();
  return app;
}

export async function resetDb() {
  const collections = await mongoose.connection.db.collections();
  for (const collection of collections) {
    await collection.deleteMany({});
  }
}

export async function closeAll() {
  for (const agent of agents) {
    try {
      await agent.close?.();
    } catch {
      /* ignore */
    }
  }
  agents.length = 0;
  if (app?.locals?.sessionStore?.close) {
    await app.locals.sessionStore.close();
  }
  try {
    await mongoose.connection.dropDatabase();
  } catch {
    /* ignore */
  }
  await mongoose.disconnect();
  app = null;
}

export async function createUser({
  name = 'Test User',
  email,
  password = 'Password12345',
  role = 'staff',
  isActive = true
} = {}) {
  return User.create({
    name,
    email: email.toLowerCase(),
    passwordHash: await hashPassword(password),
    role,
    isActive
  });
}

export async function createBossAndStaff() {
  const boss = await createUser({
    name: 'Boss Admin',
    email: 'boss@test.local',
    role: 'boss'
  });
  const staff = await createUser({
    name: 'Staff One',
    email: 'staff@test.local',
    role: 'staff'
  });
  const otherStaff = await createUser({
    name: 'Staff Two',
    email: 'staff2@test.local',
    role: 'staff'
  });
  return { boss, staff, otherStaff };
}

export function agent() {
  const instance = request.agent(app);
  agents.push(instance);
  const client = {
    csrfToken: null,
    async init() {
      const res = await instance.get('/api/auth/csrf');
      client.csrfToken = res.body.csrfToken;
      return client;
    },
    async login(email, password) {
      const res = await instance
        .post('/api/auth/login')
        .set('X-CSRF-Token', client.csrfToken)
        .send({ email, password });
      if (res.body?.csrfToken) client.csrfToken = res.body.csrfToken;
      return res;
    },
    get(url) {
      return instance.get(url);
    },
    post(url, body) {
      return instance.post(url).set('X-CSRF-Token', client.csrfToken).send(body);
    },
    verify(code = LOGIN_TEST_CODE) {
      return instance
        .post('/api/auth/login/verify')
        .set('X-CSRF-Token', client.csrfToken)
        .send({ code });
    },
    resendCode() {
      return instance.post('/api/auth/login/resend').set('X-CSRF-Token', client.csrfToken);
    },
    patch(url, body) {
      return instance.patch(url).set('X-CSRF-Token', client.csrfToken).send(body);
    },
    del(url) {
      return instance.delete(url).set('X-CSRF-Token', client.csrfToken);
    },
    raw() {
      return instance;
    }
  };
  return client;
}

export async function loggedInClient(email, password) {
  const client = agent();
  await client.init();
  const res = await client.login(email, password);
  if (res.status === 202) {
    const verified = await client.verify(LOGIN_TEST_CODE);
    if (verified.status !== 200) {
      throw new Error(
        `Login verification failed for ${email}: ${verified.status} ${JSON.stringify(verified.body)}`
      );
    }
    return client;
  }
  if (res.status !== 200) {
    throw new Error(`Login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return client;
}

export function pngBuffer() {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lQ9cTQAAAABJRU5ErkJggg==',
    'base64'
  );
}

export function pdfBuffer() {
  return Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n', 'utf8');
}

export async function createProduct(client, name, extra = {}) {
  const res = await client.post('/api/products', { name, ...extra });
  return res;
}

export async function createSupplier(client, name, extra = {}) {
  const res = await client.post('/api/suppliers', { name, ...extra });
  return res;
}

export async function createPurchase(client, payload) {
  return client.post('/api/purchases', payload);
}
