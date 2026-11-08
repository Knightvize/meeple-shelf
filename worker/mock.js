// Fake games source for tests. MOCK_MAX_ID controls how many games "exist".
const Y = new Date().getFullYear();
const CATALOG = [
  [1, 'Castle Quest', 2019, ['Ana Ruiz'], ['Castle Quest']],
  [2, 'Castle Quest: Dragon Age', 2020, ['Ana Ruiz'], ['Castle Quest']],
  [3, 'Orchard Rush', 2018, ['Ben Okafor'], ['Orchard Rush']],
  [4, 'Tidal Merchants', 2021, ['Ana Ruiz'], []],
  [5, 'Lantern Heist', 2022, ['Mia Chen'], ['Lantern Heist']],
  [6, 'Starlight Express', 2017, ['Mia Chen'], []],
  [7, 'Castle Quest: Frozen Keep', Y, ['Ana Ruiz'], ['Castle Quest']],
  [8, 'Tidal Merchants 2', Y, ['Ana Ruiz'], []],
  [9, 'Lantern Heist: Midnight', Y, ['Mia Chen'], ['Lantern Heist']],
  [10, 'Cactus Crossing', Y, ['Pat Lee'], []],
].map(([sourceId, title, year, designers, families]) => ({
  sourceId, title, year, minPlayers: 2, maxPlayers: 4, image: null, description: null,
  designers, publishers: [], families,
}));

export async function fetchBatch(ids) {
  const max = Number(process.env.MOCK_MAX_ID || 6);
  const list = CATALOG.filter((g) => ids.includes(g.sourceId) && g.sourceId <= max);
  list.rawCount = list.length;
  list.maxId = Math.max(0, ...list.map((g) => g.sourceId));
  return list;
}
