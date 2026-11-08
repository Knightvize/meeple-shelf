import fs from 'node:fs';
import { q } from './db.js';
export async function migrate() {
  await q(fs.readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8')); // safe to run every start
  console.log('Database ready');
}
