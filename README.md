# Meeple Shelf: quick start

## A. Test everything locally with fake games (no BoardGameGeek needed)
Requires Node 20+ and Docker.
```
npm install
cp .env.example .env
export DATABASE_URL=postgres://meeple:meeple@localhost:5432/meeple
npm run db:up                 # starts Postgres
npm run migrate               # creates tables  (needs psql; or just run npm run test:e2e, which creates them)
npm run test:e2e              # runs the whole new-release notification flow and checks the results
```
Expected last line: `PASS: new-release notifications work (4 notifications)`

## B. Run the website locally
```
export JWT_SECRET=anything-long
npm run migrate
SOURCE=mock MOCK_MAX_ID=6 BACKFILL=1 node worker/sync.js     # load 6 fake games
npm run api                                                    # open http://localhost:3000
```
Create an account, shelve "Castle Quest" as Played, then release more fake games:
```
SOURCE=mock MOCK_MAX_ID=10 node -e "import('./worker/sync.js').then(async m=>{await m.runSync();(await import('./worker/notify.js')).runNotify().then(()=>process.exit())})"
```
Refresh the site: "New for you" now shows alerts.

## C. BoardGameGeek access (real games)
BGG requires a registered application and a token. I can't register for you; it needs your BGG account.
1. Make a free BGG account and sign in.
2. Go to https://boardgamegeek.com/applications and create an application. Choose non-commercial unless you plan to earn money from the site. Approval can take a week or more.
3. Once approved, open "Tokens" on your application and create a token.
4. Put it in `.env` as `BGG_TOKEN=...` (never share it or commit it).
5. Check it: `npm run check:bgg` (loads .env values if you `export` them first).
6. Load the catalog once: `npm run backfill`, then run `npm run worker` to keep it updated.
Notes: BGG says their API rules can change, asks that requests come from your server with results cached, and public apps may need to show a "Powered by BGG" credit (the site footer has one). Read https://boardgamegeek.com/using_the_xml_api before launch.

## D. Put it online (Render)
1. Upload this folder to a new GitHub repository (never upload `.env`; `.gitignore` already skips it).
2. In Render: New > Blueprint > pick your repository. Render reads `render.yaml`, creates the database and website, and asks for `ADMIN_EMAIL` (use the email you'll sign up with).
3. Open your site's address, create an account with that email: an **Admin** tab appears.
4. Fake games are loaded automatically. To "release" new fake games, change `MOCK_MAX_ID` from 6 to 10 in Render's Environment settings, then press **Run update now** in the Admin tab.
5. When BGG approves you: remove the `SOURCE` setting, add `BGG_TOKEN`. The first run only imports recent games.
Note: free web services fall asleep when idle, so the hourly update only runs while the site is awake. A paid always-on instance fixes that.
