import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { User } from '../src/models/User.js';
import { LOGIN_TEST_CODE, sha256 } from '../src/services/authService.js';
import {
  agent,
  createBossAndStaff,
  createUser,
  getApp,
  loggedInClient,
  resetDb
} from './helpers.js';

let app;
const PASSWORD = 'Password12345';

beforeAll(async () => {
  app = await getApp();
});

beforeEach(async () => {
  await resetDb();
  await createBossAndStaff();
});

describe('authentication', () => {
  it('requires an emailed code before creating an authenticated session', async () => {
    const client = agent();
    await client.init();
    const challenge = await client.login('staff@test.local', PASSWORD);

    expect(challenge.status).toBe(202);
    expect(challenge.body.requiresCode).toBe(true);
    expect(challenge.body.email).toBe('st***@test.local');
    expect((await client.get('/api/auth/me')).status).toBe(401);

    const res = await client.verify(LOGIN_TEST_CODE);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('staff@test.local');
    expect(res.body.user.role).toBe('staff');

    const cookie = res.headers['set-cookie'].join(';');
    expect(cookie).toMatch(/rwi\.sid=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);

    expect((await client.verify(LOGIN_TEST_CODE)).status).toBe(400);
  });

  it('rejects incorrect codes and locks the challenge after five attempts', async () => {
    const client = agent();
    await client.init();
    await client.login('staff@test.local', PASSWORD);

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const res = await client.verify('000000');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('LOGIN_CODE_INVALID');
    }

    const locked = await client.verify('000000');
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe('LOGIN_CODE_LOCKED');

    const afterLock = await client.verify(LOGIN_TEST_CODE);
    expect(afterLock.status).toBe(400);
    expect(afterLock.body.error.code).toBe('LOGIN_CODE_MISSING');
  });

  it('resends a code and keeps the challenge usable', async () => {
    const client = agent();
    await client.init();
    await client.login('staff@test.local', PASSWORD);

    const resent = await client.resendCode();
    expect(resent.status).toBe(200);
    expect(resent.body.sent).toBe(true);

    expect((await client.verify(LOGIN_TEST_CODE)).status).toBe(200);
  });

  it('rejects a wrong password with a generic message', async () => {
    const client = agent();
    await client.init();
    const res = await client.login('staff@test.local', 'WrongPassword1');
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Invalid email or password.');
  });

  it('rejects login for unknown emails without revealing that the account is missing', async () => {
    const client = agent();
    await client.init();
    const res = await client.login('nobody@test.local', PASSWORD);
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Invalid email or password.');
  });

  it('rejects login for deactivated accounts', async () => {
    await createUser({ name: 'Ghost', email: 'ghost@test.local', isActive: false });
    const client = agent();
    await client.init();
    const res = await client.login('ghost@test.local', PASSWORD);
    expect(res.status).toBe(401);
  });

  it('rejects state-changing requests without a CSRF token', async () => {
    const client = agent();
    await client.init();
    const res = await client.raw().post('/api/auth/login').send({
      email: 'staff@test.local',
      password: PASSWORD
    });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_FAILED');
  });

  it('rejects state-changing requests with a mismatched CSRF token', async () => {
    const client = agent();
    await client.init();
    const res = await client.raw()
      .post('/api/auth/login')
      .set('X-CSRF-Token', 'f'.repeat(client.csrfToken.length))
      .send({ email: 'staff@test.local', password: PASSWORD });
    expect(res.status).toBe(403);
  });

  it('returns the current user from /me and 401 after logout', async () => {
    const client = await loggedInClient('staff@test.local', PASSWORD);
    const me = await client.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('staff@test.local');

    const out = await client.post('/api/auth/logout');
    expect(out.status).toBe(200);

    const after = await client.get('/api/auth/me');
    expect(after.status).toBe(401);
  });

  it('has no public registration endpoint', async () => {
    const client = agent();
    await client.init();
    const res = await client.post('/api/auth/register', {
      name: 'Hacker',
      email: 'hacker@test.local',
      password: PASSWORD
    });
    expect(res.status).toBe(404);
  });
});

describe('password reset', () => {
  it('returns a generic response for unknown emails', async () => {
    const client = agent();
    await client.init();
    const res = await client.post('/api/auth/forgot-password', { email: 'unknown@test.local' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/if an account exists/i);
  });

  it('creates a single-use, expiring reset token for existing active users', async () => {
    const client = agent();
    await client.init();
    const res = await client.post('/api/auth/forgot-password', { email: 'staff@test.local' });
    expect(res.status).toBe(200);

    const user = await User.findOne({ email: 'staff@test.local' }).select(
      '+resetTokenHash +resetTokenExpiresAt'
    );
    expect(user.resetTokenHash).toBeTruthy();
    expect(user.resetTokenExpiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('resets the password with a valid token and invalidates existing sessions', async () => {
    const staffClient = await loggedInClient('staff@test.local', PASSWORD);

    const raw = 'test-reset-token-1234567890abcdef';
    await User.updateOne(
      { email: 'staff@test.local' },
      {
        $set: {
          resetTokenHash: sha256(raw),
          resetTokenExpiresAt: new Date(Date.now() + 10 * 60 * 1000)
        }
      }
    );

    const anonymous = agent();
    await anonymous.init();
    const reset = await anonymous.post('/api/auth/reset-password', {
      token: raw,
      password: 'BrandNewPassword123'
    });
    expect(reset.status).toBe(200);

    const stale = await staffClient.get('/api/auth/me');
    expect(stale.status).toBe(401);

    const fresh = agent();
    await fresh.init();
    expect((await fresh.login('staff@test.local', PASSWORD)).status).toBe(401);
    expect((await fresh.login('staff@test.local', 'BrandNewPassword123')).status).toBe(202);
    expect((await fresh.verify(LOGIN_TEST_CODE)).status).toBe(200);
  });

  it('rejects a reused reset token', async () => {
    const raw = 'one-time-token-abcdefghijklmnop';
    await User.updateOne(
      { email: 'staff@test.local' },
      {
        $set: {
          resetTokenHash: sha256(raw),
          resetTokenExpiresAt: new Date(Date.now() + 10 * 60 * 1000)
        }
      }
    );

    const client = agent();
    await client.init();
    expect(
      (await client.post('/api/auth/reset-password', { token: raw, password: 'FirstNewPass123' }))
        .status
    ).toBe(200);
    const second = await client.post('/api/auth/reset-password', {
      token: raw,
      password: 'SecondNewPass123'
    });
    expect(second.status).toBe(400);
    expect(second.body.error.code).toBe('INVALID_RESET_TOKEN');
  });

  it('rejects expired reset tokens', async () => {
    const raw = 'expired-token-abcdefghijklmnop';
    await User.updateOne(
      { email: 'staff@test.local' },
      {
        $set: {
          resetTokenHash: sha256(raw),
          resetTokenExpiresAt: new Date(Date.now() - 1000)
        }
      }
    );
    const client = agent();
    await client.init();
    const res = await client.post('/api/auth/reset-password', {
      token: raw,
      password: 'AnotherPassword123'
    });
    expect(res.status).toBe(400);
  });
});

describe('password changes and deactivation', () => {
  it('requires the current password and rejects weak new passwords', async () => {
    const client = await loggedInClient('staff@test.local', PASSWORD);

    const wrong = await client.post('/api/auth/change-password', {
      currentPassword: 'NotThePassword1',
      newPassword: 'SomeNewPassword123'
    });
    expect(wrong.status).toBe(400);

    const weak = await client.post('/api/auth/change-password', {
      currentPassword: PASSWORD,
      newPassword: 'short'
    });
    expect(weak.status).toBe(400);
  });

  it('changes the password and keeps the current session usable', async () => {
    const client = await loggedInClient('staff@test.local', PASSWORD);
    const res = await client.post('/api/auth/change-password', {
      currentPassword: PASSWORD,
      newPassword: 'NewPassword9876'
    });
    expect(res.status).toBe(200);

    expect((await client.get('/api/auth/me')).status).toBe(200);

    const fresh = agent();
    await fresh.init();
    expect((await fresh.login('staff@test.local', 'NewPassword9876')).status).toBe(202);
    expect((await fresh.verify(LOGIN_TEST_CODE)).status).toBe(200);
  });

  it('kills active sessions immediately when an account is deactivated', async () => {
    const staffClient = await loggedInClient('staff@test.local', PASSWORD);
    const bossClient = await loggedInClient('boss@test.local', PASSWORD);

    const staff = await User.findOne({ email: 'staff@test.local' });
    const res = await bossClient.post(`/api/users/${staff._id}/deactivate`);
    expect(res.status).toBe(200);

    expect((await staffClient.get('/api/auth/me')).status).toBe(401);
    expect((await staffClient.get('/api/purchases')).status).toBe(401);
  });

  it('kills active sessions when the boss resets a staff password', async () => {
    const staffClient = await loggedInClient('staff@test.local', PASSWORD);
    const bossClient = await loggedInClient('boss@test.local', PASSWORD);
    const staff = await User.findOne({ email: 'staff@test.local' });

    const res = await bossClient.post(`/api/users/${staff._id}/password`, {
      password: 'ResetByBoss12345'
    });
    expect(res.status).toBe(200);
    expect((await staffClient.get('/api/auth/me')).status).toBe(401);
  });

  it('protects the last active boss account', async () => {
    const bossClient = await loggedInClient('boss@test.local', PASSWORD);
    const boss = await User.findOne({ email: 'boss@test.local' });
    const res = await bossClient.post(`/api/users/${boss._id}/deactivate`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('SELF_DEACTIVATION');

    const demote = await bossClient.patch(`/api/users/${boss._id}`, { role: 'staff' });
    expect(demote.status).toBe(400);
    expect(demote.body.error.code).toBe('LAST_BOSS_PROTECTED');
  });

  it('rate-limit configuration is disabled in tests but endpoints still validate input', async () => {
    const client = agent();
    await client.init();
    const res = await client.post('/api/auth/login', { email: 'not-an-email', password: '' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
