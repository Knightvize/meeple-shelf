// Finds roughly the newest game id at the source, so the first import only covers recent games.
// Assumes ids are mostly contiguous near the end. If it ever guesses wrong, set BGG_START_ID by hand.
export async function findFrontier(fetchBatch, pause = 0, W = 20) {
  const hit = async (n) => {
    if (pause) await new Promise((r) => setTimeout(r, pause));
    return (await fetchBatch(Array.from({ length: W }, (_, k) => n + k))).rawCount > 0;
  };
  let lo = 0, hi = 1000;                       // lo: something exists at/after it; hi: unknown
  while (await hit(hi)) { lo = hi; hi *= 2; if (hi > 20_000_000) break; }
  while (hi - lo > W) {
    const mid = Math.floor((lo + hi) / 2);
    if (await hit(mid)) lo = mid; else hi = mid;
  }
  return lo + W;                               // slightly above the newest id
}
