// End-to-end test of the "new game you might like" pipeline using a fake source.
// Needs a running Postgres (npm run db:up) and DATABASE_URL set.
process.env.SOURCE = 'mock';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pool, q } from '../src/db.js';
import { runSync } from '../worker/sync.js';
import { runNotify } from '../worker/notify.js';

const id = async (title) => (await q('SELECT id FROM games WHERE title=$1', [title])).rows[0].id;
const user = async (name) => (await q(
  "INSERT INTO users (email, display_name, password_hash) VALUES ($1,$1,'x') RETURNING id", [name + '@test.dev'])).rows[0].id;
const shelve = (u, g, status, rating) => q(
  'INSERT INTO shelf_entries (user_id, game_id, status, rating) VALUES ($1,$2,$3,$4)', [u, g, status, rating]);
const notesFor = async (u) => (await q(
  `SELECT g.title, n.reason, r.title AS because FROM notifications n
     JOIN games g ON g.id=n.game_id JOIN games r ON r.id=n.reason_game_id
    WHERE n.user_id=$1 ORDER BY g.title`, [u])).rows;

await q('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
await q(fs.readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8'));

// 1. Initial import of 6 existing games (backfill: no notifications for old games)
process.env.MOCK_MAX_ID = '6'; process.env.BACKFILL = '1';
await runSync(); await runNotify();
assert.equal((await q('SELECT count(*)::int c FROM games')).rows[0].c, 6);
assert.equal((await q('SELECT count(*)::int c FROM notifications')).rows[0].c, 0);

// 2. Users with different histories
const alice = await user('alice'), bob = await user('bob'), carol = await user('carol'), dave = await user('dave');
await shelve(alice, await id('Castle Quest'), 'played', 5);   // series + designer Ana Ruiz
await shelve(bob,   await id('Orchard Rush'), 'own', 4);       // unrelated
await shelve(carol, await id('Castle Quest'), 'want', null);   // only wants it: no alert
await shelve(dave,  await id('Tidal Merchants'), 'played', 3); // designer Ana Ruiz only

// 3. Four new games appear at the source
process.env.MOCK_MAX_ID = '10'; delete process.env.BACKFILL;
await runSync(); await runNotify();
assert.equal((await q("SELECT value FROM sync_state WHERE key='last_id'")).rows[0].value, '10');

assert.deepEqual(await notesFor(alice), [
  { title: 'Castle Quest: Frozen Keep', reason: 'same_family',   because: 'Castle Quest' },
  { title: 'Tidal Merchants 2',         reason: 'same_designer', because: 'Castle Quest' }]);
assert.deepEqual(await notesFor(dave), [
  { title: 'Castle Quest: Frozen Keep', reason: 'same_designer', because: 'Tidal Merchants' },
  { title: 'Tidal Merchants 2',         reason: 'same_designer', because: 'Tidal Merchants' }]);
assert.deepEqual(await notesFor(bob), []);
assert.deepEqual(await notesFor(carol), []);

// 4. Running again must not duplicate anything
const before = (await q('SELECT count(*)::int c FROM notifications')).rows[0].c;
await runSync(); await runNotify();
assert.equal((await q('SELECT count(*)::int c FROM notifications')).rows[0].c, before);

console.log('PASS: new-release notifications work (' + before + ' notifications)');
await pool.end();
