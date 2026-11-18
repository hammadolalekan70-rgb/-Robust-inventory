import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { connectDB, disconnectDB } from '../db/connect.js';
import { User } from '../models/User.js';
import { ROLES } from '../lib/constants.js';
import { hashPassword, normalizeEmail, passwordIssues } from '../services/authService.js';
import { logger } from '../lib/logger.js';

function arg(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  return process.argv[index + 1] ?? fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const force = hasFlag('force');
  let name = arg('name') || process.env.ADMIN_NAME;
  let email = arg('email') || process.env.ADMIN_EMAIL;
  let password = arg('password') || process.env.ADMIN_PASSWORD;

  let rl;
  if (!name || !email || !password) {
    rl = readline.createInterface({ input, output });
  }

  try {
    if (!name) name = (await rl.question('Boss/admin full name: ')).trim();
    if (!email) email = (await rl.question('Boss/admin email address: ')).trim();
    if (!password) password = (await rl.question('Boss/admin password (min 10 characters): ')).trim();
  } finally {
    rl?.close();
  }

  email = normalizeEmail(email);
  const issues = passwordIssues(password);
  if (!name || name.length < 2) {
    console.error('A name of at least 2 characters is required.');
    process.exit(1);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('A valid email address is required.');
    process.exit(1);
  }
  if (issues.length) {
    console.error('Password does not meet the policy:\n - ' + issues.join('\n - '));
    process.exit(1);
  }

  await connectDB();

  const existingBoss = await User.findOne({ role: ROLES.BOSS, isActive: true });
  if (existingBoss && !force) {
    console.error(
      `An active boss account already exists (${existingBoss.email}). ` +
        'Use --force only if you intend to create an additional administrator.'
    );
    await disconnectDB();
    process.exit(1);
  }

  const existing = await User.findOne({ email });
  if (existing) {
    console.error(`A user with the email ${email} already exists.`);
    await disconnectDB();
    process.exit(1);
  }

  const user = await User.create({
    name,
    email,
    passwordHash: await hashPassword(password),
    role: ROLES.BOSS,
    isActive: true
  });

  logger.info(`Boss/admin account created: ${user.email} (${user._id})`);
  logger.info('Remove ADMIN_PASSWORD from your shell history / environment now.');
  await disconnectDB();
}

main().catch(async (err) => {
  console.error(err);
  await disconnectDB().catch(() => {});
  process.exit(1);
});
