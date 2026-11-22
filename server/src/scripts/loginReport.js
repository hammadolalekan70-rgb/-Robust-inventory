import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { AuditEvent } from '../models/AuditEvent.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
dotenv.config({ path: path.resolve(repoRoot, '.env') });

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function formatDate(value) {
  if (!value) return 'never';
  return new Date(value).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

function pad(value, width) {
  return String(value).padEnd(width);
}

async function main() {
  const uri = arg('uri') || process.env.MONGODB_URI;
  if (!uri) {
    console.error('Set MONGODB_URI or pass --uri "<connection string>".');
    process.exit(1);
  }
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  console.log(`Connected: ${uri.replace(/\/\/[^@]*@/, '//***@')}`);

  const [totalUsers, activeUsers, loginEvents, failedLogins, users] = await Promise.all([
    User.countDocuments({}),
    User.countDocuments({ isActive: true }),
    AuditEvent.find({ action: 'auth.login' }).sort({ createdAt: 1 }).lean(),
    AuditEvent.countDocuments({ action: 'auth.login_failed' }),
    User.find({}).select('name email role isActive lastLoginAt').sort({ name: 1 }).lean()
  ]);

  const byActor = new Map();
  for (const event of loginEvents) {
    const key = event.actor ? event.actor.toString() : `unknown:${event.actorName}`;
    const entry = byActor.get(key) || {
      name: event.actorName || 'Unknown',
      count: 0,
      first: event.createdAt,
      last: event.createdAt
    };
    entry.count += 1;
    entry.last = event.createdAt;
    byActor.set(key, entry);
  }

  const uniqueUsers = byActor.size;
  const rows = [...byActor.values()].sort((a, b) => b.count - a.count);
  const neverLoggedIn = users.filter((user) => !user.lastLoginAt).length;

  console.log('');
  console.log('Robust Warehouse Inventory - sign-in report');
  console.log('==========================================');
  console.log(`Accounts:             ${totalUsers} total, ${activeUsers} active`);
  console.log(`Successful sign-ins:  ${loginEvents.length}`);
  console.log(`Unique users signed in: ${uniqueUsers}`);
  console.log(`Failed sign-in attempts: ${failedLogins}`);
  console.log(`Accounts never signed in: ${neverLoggedIn}`);
  console.log('');

  if (rows.length) {
    console.log('Sign-ins by user');
    console.log(`${pad('User', 28)} ${pad('Sign-ins', 9)} Last sign-in`);
    console.log('-'.repeat(28 + 1 + 9 + 1 + 19));
    for (const row of rows) {
      console.log(`${pad(row.name.slice(0, 27), 28)} ${pad(row.count, 9)} ${formatDate(row.last)}`);
    }
    console.log('');
  }

  if (users.length) {
    console.log('All accounts');
    console.log(`${pad('Name', 28)} ${pad('Role', 6)} ${pad('Active', 6)} Last login`);
    console.log('-'.repeat(28 + 1 + 6 + 1 + 6 + 1 + 19));
    for (const user of users) {
      console.log(
        `${pad(String(user.name).slice(0, 27), 28)} ${pad(user.role, 6)} ${pad(
          user.isActive ? 'yes' : 'no',
          6
        )} ${formatDate(user.lastLoginAt)}`
      );
    }
    console.log('');
  }

  const recent = loginEvents.slice(-10).reverse();
  if (recent.length) {
    console.log('Most recent sign-ins');
    for (const event of recent) {
      console.log(`  ${formatDate(event.createdAt)}  ${event.actorName || 'Unknown'}  ${event.ip || ''}`);
    }
    console.log('');
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
