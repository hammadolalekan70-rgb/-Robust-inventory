import { afterAll } from 'vitest';
import { closeAll } from './helpers.js';

afterAll(async () => {
  await closeAll();
});
