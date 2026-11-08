import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import path from 'path';
import { fileURLToPath } from 'url';
import cron from 'node-cron';
import { q } from './db.js';
import { migrate } from './migrate.js';
import { runJob } from '../worker/job.js';

const app = express();
app.use(express.json());
const __dir = path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.join(__dir, '../public')));
app.get('/health', (_req, res) => res.json({ ok: true }));

const isAdminEmail = (e) => !!process.env.ADMIN_EMAIL && e.toLowerCase() === process.env.ADMIN_EMAIL.toLowerCase();
const sign = (u) => jwt.sign({ id: u.id, admin: isAdminEmail(u.email) }, process.env.JWT_SECRET, { expiresIn: '30d' });
function auth(req, res, next) {
  try {
    const t = (req.headers.authorization || '').replace('Bearer ', '');
    req.user = jwt.verify(t, process.env.JWT_SECRET);
    next();
  } catch { res.status(401).json({ error: 'Not signed in' }); }
}

// --- Accounts ---
app.post('/auth/register', async (req, res) => {
  const { email, password, displayName } = req.body;
  if (!email || !password || password.length < 8 || !displayName) return res.status(400).json({ error: 'Invalid input' });
  try {
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await q(
      'INSERT INTO users (email, display_name, password_hash) VALUES (lower($1),$2,$3) RETURNING id, email',
      [email, displayName, hash]);
    res.json({ token: sign(rows[0]) });
  } catch { res.status(409).json({ error: 'Email already used' }); }
});

app.post('/auth/login', async (req, res) => {
  const { rows } = await q('SELECT * FROM users WHERE email = lower($1)', [req.body.email || '']);
  const u = rows[0];
  if (!u || !(await bcrypt.compare(req.body.password || '', u.password_hash)))
    return res.status(401).json({ error: 'Wrong email or password' });
  res.json({ token: sign(u) });
});

// --- Catalog ---
app.get('/games', async (req, res) => {
  const term = `%${(req.query.q || '').toString().toLowerCase()}%`;
  const { rows } = await q(
    `SELECT g.id, g.title, g.year_published, g.image_url,
            ROUND(AVG(s.rating),2) AS avg_rating, COUNT(s.rating) AS rating_count
       FROM games g LEFT JOIN shelf_entries s ON s.game_id = g.id
      WHERE lower(g.title) LIKE $1
      GROUP BY g.id ORDER BY rating_count DESC, g.year_published DESC NULLS LAST LIMIT 30`, [term]);
  res.json(rows);
});

app.get('/games/new', async (_req, res) => {
  const { rows } = await q(
    'SELECT id, title, year_published, image_url FROM games ORDER BY created_at DESC LIMIT 30');
  res.json(rows);
});

app.get('/games/:id/reviews', async (req, res) => {
  const { rows } = await q(
    `SELECT u.display_name, s.rating, s.review, s.updated_at
       FROM shelf_entries s JOIN users u ON u.id = s.user_id
      WHERE s.game_id = $1 AND s.review IS NOT NULL ORDER BY s.updated_at DESC LIMIT 50`, [req.params.id]);
  res.json(rows);
});

// --- Shelf ---
app.get('/me/shelf', auth, async (req, res) => {
  const { rows } = await q(
    `SELECT g.id, g.title, g.image_url, s.status, s.rating, s.review
       FROM shelf_entries s JOIN games g ON g.id = s.game_id
      WHERE s.user_id = $1 ORDER BY s.updated_at DESC`, [req.user.id]);
  res.json(rows);
});

app.put('/me/shelf/:gameId', auth, async (req, res) => {
  const { status, rating = null, review = null } = req.body;
  if (!['want', 'own', 'played'].includes(status)) return res.status(400).json({ error: 'Bad status' });
  await q(
    `INSERT INTO shelf_entries (user_id, game_id, status, rating, review)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (user_id, game_id)
     DO UPDATE SET status=$3, rating=$4, review=$5, updated_at=now()`,
    [req.user.id, req.params.gameId, status, rating, review]);
  res.json({ ok: true });
});

app.delete('/me/shelf/:gameId', auth, async (req, res) => {
  await q('DELETE FROM shelf_entries WHERE user_id=$1 AND game_id=$2', [req.user.id, req.params.gameId]);
  res.json({ ok: true });
});

// --- "New for you" notifications ---
app.get('/me/notifications', auth, async (req, res) => {
  const { rows } = await q(
    `SELECT n.id, n.reason, n.created_at, n.read_at,
            g.id AS game_id, g.title, g.image_url,
            r.title AS because_of
       FROM notifications n
       JOIN games g ON g.id = n.game_id
       LEFT JOIN games r ON r.id = n.reason_game_id
      WHERE n.user_id = $1 ORDER BY n.created_at DESC LIMIT 50`, [req.user.id]);
  res.json(rows);
});

app.post('/me/notifications/read', auth, async (req, res) => {
  await q('UPDATE notifications SET read_at = now() WHERE user_id=$1 AND read_at IS NULL', [req.user.id]);
  res.json({ ok: true });
});

// --- Admin (only the account whose email matches ADMIN_EMAIL) ---
const adminOnly = (req, res, next) => (req.user.admin ? next() : res.status(403).json({ error: 'Admins only' }));
const split = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);

app.post('/admin/games', auth, adminOnly, async (req, res) => {
  const { title, year, designers, families, image } = req.body;
  if (!title) return res.status(400).json({ error: 'Title needed' });
  const { rows } = await q(
    `INSERT INTO games (source, source_id, title, year_published, image_url)
     VALUES ('manual', (SELECT COALESCE(MAX(source_id),0)+1 FROM games WHERE source='manual'), $1,$2,$3)
     RETURNING id`, [title, Number(year) || null, image || null]);
  for (const d of split(designers)) await q('INSERT INTO game_designers VALUES ($1,$2) ON CONFLICT DO NOTHING', [rows[0].id, d]);
  for (const f of split(families)) await q('INSERT INTO game_families VALUES ($1,$2) ON CONFLICT DO NOTHING', [rows[0].id, f]);
  res.json({ id: rows[0].id });
});

app.post('/admin/run-update', auth, adminOnly, async (_req, res) => {
  try { await runJob(); res.json({ ok: true }); } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
});

await migrate();                                   // creates tables on first start
app.listen(process.env.PORT || 3000, () => console.log('API up'));
if (process.env.RUN_WORKER !== '0') {              // hourly game updates + alerts, inside this same service
  cron.schedule('0 * * * *', () => runJob().catch(console.error));
  setTimeout(() => runJob().catch(console.error), 5000);
}
