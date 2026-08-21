// 11 worlds x 25 levels = 275 levels total. Each world has its own palette
// so the game visibly progresses without needing hand-authored levels.
export const LEVELS_PER_WORLD = 25;
export const TOTAL_LEVELS = 275;
export const TOTAL_WORLDS = TOTAL_LEVELS / LEVELS_PER_WORLD;

export const THEMES = [
  { name: 'Луга', sky: 0x8ecdf0, fog: 0x8ecdf0, platform: 0x7bc96f, accent: 0xf2c94c, hazard: 0x5aa0d8 },
  { name: 'Пустыня', sky: 0xf6d492, fog: 0xf6d492, platform: 0xe0b774, accent: 0xd9534f, hazard: 0xe6c477 },
  { name: 'Лес', sky: 0x9fd8a3, fog: 0x9fd8a3, platform: 0x6b8f4e, accent: 0xffffff, hazard: 0x3c6e47 },
  { name: 'Снег', sky: 0xdff1ff, fog: 0xdff1ff, platform: 0xe9f4fb, accent: 0x4aa3df, hazard: 0x9fd0ee },
  { name: 'Пещера', sky: 0x2b2b3a, fog: 0x2b2b3a, platform: 0x7a7a8a, accent: 0xf2c94c, hazard: 0x151520 },
  { name: 'Лава', sky: 0x3a1414, fog: 0x3a1414, platform: 0x6b4a3a, accent: 0xff7a3d, hazard: 0xff4d1a },
  { name: 'Небеса', sky: 0xbfe3ff, fog: 0xbfe3ff, platform: 0xffffff, accent: 0xffd166, hazard: 0x8fc6e8 },
  { name: 'Конфеты', sky: 0xffd6ec, fog: 0xffd6ec, platform: 0xff8fc7, accent: 0x7ee8fa, hazard: 0xff5fa8 },
  { name: 'Технологии', sky: 0x0d1b2a, fog: 0x0d1b2a, platform: 0x1f3a5f, accent: 0x3ddc97, hazard: 0x0a1622 },
  { name: 'Космос', sky: 0x05030f, fog: 0x05030f, platform: 0x3d3a5c, accent: 0x8ee3ff, hazard: 0x120f2a },
  { name: 'Радуга', sky: 0x1a1a2e, fog: 0x1a1a2e, platform: 0xffffff, accent: 0xff4d6d, hazard: 0x1a1a2e },
];

export function themeForLevel(levelIndex) {
  const world = Math.floor(levelIndex / LEVELS_PER_WORLD);
  return THEMES[Math.min(world, THEMES.length - 1)];
}

export function worldForLevel(levelIndex) {
  return Math.floor(levelIndex / LEVELS_PER_WORLD);
}

// Worlds that steadily gain or lose height across all 25 of their levels
// instead of staying roughly flat, each mapped to a climb direction
// (1 = upward, -1 = downward): Пещера climbs out of a cave, Лава then
// descends into the volcano (landing back near ground level), Небеса climbs
// into the sky, Технологии climbs a tower, and Космос climbs into orbit.
export const CLIMBING_WORLDS = new Map([
  [4, 1],
  [5, -1],
  [6, 1],
  [8, 1],
  [9, 1],
]);
