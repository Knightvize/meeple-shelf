// For every game not yet processed, find users who OWN or PLAYED a related game
// (same series/family, or same designer) and queue a notification.
// Then email people who opted in.
import nodemailer from 'nodemailer';
import { q, pool } from '../src/db.js';

const MATCH_SQL = `
WITH fresh AS (
  SELECT id FROM games
   WHERE notified_at IS NULL
     AND (year_published IS NULL OR year_published >= EXTRACT(YEAR FROM now())::int - 1)
), related AS (
  SELECT f.id AS new_game, gf2.game_id AS old_game, 'same_family' AS reason, 1 AS prio
    FROM fresh f
    JOIN game_families gf1 ON gf1.game_id = f.id
    JOIN game_families gf2 ON gf2.family = gf1.family AND gf2.game_id <> f.id
  UNION ALL
  SELECT f.id, gd2.game_id, 'same_designer', 2
    FROM fresh f
    JOIN game_designers gd1 ON gd1.game_id = f.id
    JOIN game_designers gd2 ON gd2.designer = gd1.designer AND gd2.game_id <> f.id
), hits AS (
  SELECT DISTINCT ON (s.user_id, r.new_game)
         s.user_id, r.new_game, r.reason, r.old_game
    FROM related r
    JOIN shelf_entries s ON s.game_id = r.old_game AND s.status IN ('own','played')
   WHERE NOT EXISTS (SELECT 1 FROM shelf_entries x WHERE x.user_id = s.user_id AND x.game_id = r.new_game)
   ORDER BY s.user_id, r.new_game, r.prio, s.rating DESC NULLS LAST
)
INSERT INTO notifications (user_id, game_id, reason, reason_game_id)
SELECT user_id, new_game, reason, old_game FROM hits
ON CONFLICT (user_id, game_id) DO NOTHING`;

export async function runNotify() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(MATCH_SQL);
    await client.query('UPDATE games SET notified_at = now() WHERE notified_at IS NULL');
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }

  if (!process.env.SMTP_URL) return;
  const mail = nodemailer.createTransport(process.env.SMTP_URL);
  const { rows } = await q(
    `SELECT n.id, u.email, u.display_name, g.title, r.title AS because_of
       FROM notifications n JOIN users u ON u.id=n.user_id AND u.notify_email
       JOIN games g ON g.id=n.game_id LEFT JOIN games r ON r.id=n.reason_game_id
      WHERE n.emailed_at IS NULL LIMIT 500`);
  for (const n of rows) {
    await mail.sendMail({
      from: process.env.MAIL_FROM, to: n.email,
      subject: `New game: ${n.title}`,
      text: `Hi ${n.display_name},\n\n"${n.title}" just came out, and you've played or owned "${n.because_of}".\n\nOpen Meeple Shelf to take a look.`,
    });
    await q('UPDATE notifications SET emailed_at = now() WHERE id=$1', [n.id]);
  }
}

if (process.argv[1].endsWith('notify.js')) runNotify().then(() => pool.end());
