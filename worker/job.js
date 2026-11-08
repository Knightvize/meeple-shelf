import { runSync } from './sync.js';
import { runNotify } from './notify.js';
let running = false;
export async function runJob() {
  if (running) return;
  running = true;
  try {
    if (process.env.SOURCE === 'mock' || process.env.BGG_TOKEN) await runSync();
    else console.log('No BGG_TOKEN yet: skipping catalog update');
    await runNotify();
  } finally { running = false; }
}
