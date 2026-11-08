# Meeple Shelf: Goodreads for board games

## What it is
A social site where people shelve board games (Want / Own / Played), rate them 1-5, write reviews,
and get alerted when a new game appears that's related to one they played or own.

## Core features (v1)
1. **Accounts**: email + password, display name.
2. **Catalog**: searchable games, auto-filled from an external games database.
3. **Shelves**: status, rating, review per user per game.
4. **Reviews page** per game with average rating.
5. **"New for you"**: in-app list + optional email when a new game matches something you own/played.
6. **Later**: friends/following, lists, play logs, push notifications, recommendations.

## Architecture
- **Frontend**: Next.js (React). Mobile-first. (Start from the Meeple Shelf prototype UI.)
- **API**: `src/server.js` (Express + Postgres, JWT auth).
- **Worker**: `worker/index.js`, hourly: sync new games, then match + notify.
- **DB**: Postgres (`db/schema.sql`).
- **Hosting idea**: Render/Railway/Fly for API + worker, Neon/Supabase for Postgres, Vercel for frontend.

## How auto-update works
1. `sync.js` walks new game IDs upward from the last one stored and upserts details.
2. First run: `npm run backfill` so old games don't create notifications.
3. `notify.js` takes every game not yet processed and finds users who own/played a game in the
   same **series (family)** or by the same **designer**. It writes a `notifications` row (one per
   user + game), then emails anyone opted in.
4. Only games from the last ~2 years notify, so late-added old games don't spam people.

## Notification rules to decide
- Match on: series (strong), designer (medium). Publisher is too noisy; leave off at first.
- Weight by rating: only notify if you rated the old game 4+? (add a WHERE on `s.rating`).
- Digest vs instant emails; per-user opt-out already in `users.notify_email`.
- Add web/mobile push later (store subscriptions in a new table).

## Risks and to-dos before launch
- **Data source terms**: check the games database's current API terms (token, rate limits,
  commercial use). Keep the source behind `worker/bgg.js` so you can swap it.
- **Images/descriptions**: usually owned by publishers/the source. Check licensing before showing them.
- Add: email verification, password reset, rate limiting, input length limits, report/moderate reviews,
  privacy policy, account deletion.
- Tune the `NOISY` regex in `bgg.js` so only real series count as "families".

## Run it
```
cp .env.example .env     # fill in values
npm install
npm run migrate
npm run backfill         # one-time catalog import (slow, be patient)
npm run api              # terminal 1
npm run worker           # terminal 2
```

## API
POST /auth/register, /auth/login · GET /games?q= · GET /games/new · GET /games/:id/reviews
GET /me/shelf · PUT/DELETE /me/shelf/:gameId · GET /me/notifications · POST /me/notifications/read
