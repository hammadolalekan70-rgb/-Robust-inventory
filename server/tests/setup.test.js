import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { User } from '../src/models/User.js';
import { agent, createUser, getApp, resetDb } from './helpers.js';

const PASSWORD = 'Password12345';

beforeAll(async () => {
  await getApp();
});

beforeEach(async () => {
  await resetDb();
});

describe('first-run admin setup', () => {
  it('reports that setup is needed while no boss account exists', async () => {
    const client = agent();
    await client.init();

    const res = await client.get('/api/auth/setup-status');
    expect(res.status).toBe(200);
    expect(res.body.needsSetup).toBe(true);
  });

  it('creates the first boss account and then disables setup', async () => {
    const client = agent();
    await client.init();

    const res = await client.post('/api/auth/setup', {
      name: 'Owner Admin',
      email: 'owner@test.local',
      password: PASSWORD
    });

    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('boss');
    expect(res.body.user.email).toBe('owner@test.local');

    const saved = await User.findOne({ email: 'owner@test.local' });
    expect(saved.role).toBe('boss');
    expect(saved.isActive).toBe(true);

    const status = await client.get('/api/auth/setup-status');
    expect(status.body.needsSetup).toBe(false);
  });

  it('rejects setup once a boss account exists', async () => {
    await createUser({ email: 'existing-boss@test.local', role: 'boss', password: PASSWORD });

    const client = agent();
    await client.init();
    const res = await client.post('/api/auth/setup', {
      name: 'Late Admin',
      email: 'late@test.local',
      password: PASSWORD
    });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SETUP_COMPLETE');
    expect(await User.countDocuments({ role: 'boss' })).toBe(1);
  });

  it('rejects weak passwords and duplicate emails', async () => {
    const client = agent();
    await client.init();

    const weak = await client.post('/api/auth/setup', {
      name: 'Owner Admin',
      email: 'owner@test.local',
      password: 'short'
    });
    expect(weak.status).toBe(400);

    await createUser({ email: 'staff-taken@test.local', role: 'staff', password: PASSWORD });

    const duplicate = await client.post('/api/auth/setup', {
      name: 'Owner Admin',
      email: 'staff-taken@test.local',
      password: PASSWORD
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('EMAIL_TAKEN');
  });
});
