import assert from 'node:assert/strict';
import { findFrontier } from '../worker/frontier.js';
for (const N of [10, 999, 1000, 123456, 480001]) {
  const fake = async (ids) => { const l = ids.filter((i) => i >= 1 && i <= N && i % 7 !== 0); l.rawCount = l.length; return l; };
  const f = await findFrontier(fake);
  assert.ok(f >= N - 1 && f <= N + 40, `N=${N} got ${f}`);
}
console.log('PASS: frontier finder');
