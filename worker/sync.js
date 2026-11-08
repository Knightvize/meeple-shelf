// Pulls new games into our database. Run hourly (the API server does this itself).
// First run: finds the newest games at the source and only imports the most recent ones,
// marking them as "already seen" so nobody gets alerts for old games.
import { pool, q } from '../src/db.js';
import { findFrontier } from './frontier.js';
const { fetchBatch } = await import(process.env.SOURCE === 'mock' ? './mock.js' : './bgg.js');

const MOCK = process.env.SOURCE === 'mock';
const PAUSE = MOCK ? 0 : 1500; // be polite to the real source
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BATCH = 20, MAX_BATCHES = 50, EMPTY_STOP = 5;
const LOOKBACK = Number(process.env.LOOKBACK_IDS || 500);

async function upsert(g, backfill) {
  const { rows } = await q(
    `INSERT INTO games (source, source_id, title, year_published, min_players, max_players, image_url, description, notified_at)
     VALUES ('bgg',$1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (source, source_id) DO UPDATE
       SET title=$2, year_published=$3, min_players=$4, max_players=$5, image_url=$6, description=$7, updated_at=now()
     RETURNING id`,
    [g.sourceId, g.title, g.year, g.minPlayers, g.maxPlayers, g.image, g.description, backfill ? new Date() : null]);
  const id = rows[0].id;
  for (const [table, col, vals] of [
    ['game_families', 'family', g.families],
    ['game_designers', 'designer', g.designers],
    ['game_publishers', 'publisher', g.publishers],
  ]) for (const v of vals)
    await q(`INSERT INTO ${table} (game_id, ${col}) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [id, v]);
}

async function startingPoint() {
  const st = await q("SELECT value FROM sync_state WHERE key='last_id'");
  if (st.rows[0]) return { last: Number(st.rows[0].value), first: false };
  let last = 0;
  if (!MOCK) {
    last = process.env.BGG_START_ID
      ? Number(process.env.BGG_START_ID)
      : Math.max(0, (await findFrontier(fetchBatch, PAUSE)) - LOOKBACK);
    console.log('First run: starting at id', last);
  }
  await q("INSERT INTO sync_state (key,value) VALUES ('last_id',$1) ON CONFLICT (key) DO NOTHING", [String(last)]);
  return { last, first: true };
}

export async function runSync() {
  const { last, first } = await startingPoint();
  const backfill = first || process.env.BACKFILL === '1';
  let next = last + 1, emptyRun = 0, added = 0;
  for (let b = 0; b < MAX_BATCHES && emptyRun < EMPTY_STOP; b++) {
    const ids = Array.from({ length: BATCH }, (_, k) => next + k);
    let games;
    try { games = await fetchBatch(ids); }
    catch (e) { if (e.message === 'retry') { await sleep(5000); b--; continue; } throw e; }
    for (const g of games) { await upsert(g, backfill); added++; }
    if (games.rawCount > 0) {
      emptyRun = 0;
      next = Math.max(next, games.maxId + 1);   // never skip ids that don't exist yet
      await q(`INSERT INTO sync_state (key,value) VALUES ('last_id',$1)
               ON CONFLICT (key) DO UPDATE SET value=$1`, [String(games.maxId)]);
    } else { emptyRun++; next += BATCH; }
    await sleep(PAUSE);
  }
  console.log(`sync done, ${added} games upserted`);
}

if (process.argv[1].endsWith('sync.js')) runSync().then(() => pool.end());
