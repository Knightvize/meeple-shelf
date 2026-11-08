// Checks that your BoardGameGeek token works. Usage: BGG_TOKEN=xxxx node scripts/check-bgg.js
const token = process.env.BGG_TOKEN;
if (!token) { console.log('No BGG_TOKEN set. See README: "BoardGameGeek access".'); process.exit(1); }
const res = await fetch('https://boardgamegeek.com/xmlapi2/thing?id=13', {   // no "www." or the token is ignored
  headers: { Authorization: `Bearer ${token}` },
});
const body = await res.text();
if (res.status === 200 && body.includes('<item')) console.log('OK: token works. BGG returned game data.');
else if (res.status === 401) console.log('401: token rejected. Is the application approved and the token copied exactly?');
else if (res.status === 202 || res.status === 429) console.log(`${res.status}: BGG asked us to slow down/retry. Token is probably fine; try again shortly.`);
else console.log(`Unexpected status ${res.status}`);
