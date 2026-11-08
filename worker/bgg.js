// Catalog source adapter. Swap this file to use a different games database.
// IMPORTANT: check the provider's current API terms (registration/token, rate limits,
// and whether commercial use is allowed) before launching publicly.
import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });
const arr = (x) => (x === undefined ? [] : Array.isArray(x) ? x : [x]);
// Many "families" are tags (mechanisms, components...). Keep only series-like ones. Tune this.
const NOISY = /^(Components|Mechanism|Mechanics|Category|Country|Players|Admin|Crowdfunding|Digital Implementations|Misc|Theme|Game|Region):/i;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fetchBatch(ids) {
  const url = `https://boardgamegeek.com/xmlapi2/thing?id=${ids.join(',')}`;
  const headers = process.env.BGG_TOKEN ? { Authorization: `Bearer ${process.env.BGG_TOKEN}` } : {};
  const res = await fetch(url, { headers });
  if (res.status === 202 || res.status === 429) throw new Error('retry');
  if (!res.ok) throw new Error(`Source error ${res.status}`);
  const xml = parser.parse(await res.text());
  const raw = arr(xml.items?.item);
  const list = raw
    .filter((i) => i.type === 'boardgame')
    .map((i) => {
      const names = arr(i.name);
      const primary = names.find((n) => n.type === 'primary') || names[0];
      const links = arr(i.link);
      const pick = (t) => links.filter((l) => l.type === t).map((l) => l.value);
      return {
        sourceId: Number(i.id),
        title: primary.value,
        year: Number(i.yearpublished?.value) || null,
        minPlayers: Number(i.minplayers?.value) || null,
        maxPlayers: Number(i.maxplayers?.value) || null,
        image: i.thumbnail || null,
        description: i.description || null,
        designers: pick('boardgamedesigner').filter((d) => !/uncredited/i.test(d)),
        publishers: pick('boardgamepublisher'),
        families: pick('boardgamefamily').filter((f) => !NOISY.test(f)),
      };
    });
  list.rawCount = raw.length;                                   // everything the source returned
  list.maxId = Math.max(0, ...raw.map((i) => Number(i.id)));    // highest id seen (any type)
  return list;
}
