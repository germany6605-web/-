import * as THREE from 'three';
import { makeLevelRng, range } from './rng.js';
import { themeForLevel, worldForLevel, TOTAL_LEVELS } from './themes.js';

export const LEVEL_LENGTH = 26;
const STEP = 0.55;
const PLATFORM_THICK = 0.6;
const CORRIDOR_HALF = 3.2;
const MAX_GAP = 2.1;
const END_MARGIN = 11;
const PAD_SIZE = 3;
const MAX_HEIGHT = STEP * 4;

const materialCache = new Map();
function getMaterial(color) {
  const key = color;
  if (!materialCache.has(key)) {
    materialCache.set(key, new THREE.MeshLambertMaterial({ color }));
  }
  return materialCache.get(key);
}

const boxGeoCache = new Map();
function getBoxGeo(sx, sy, sz) {
  const key = `${sx.toFixed(2)}_${sy.toFixed(2)}_${sz.toFixed(2)}`;
  if (!boxGeoCache.has(key)) {
    boxGeoCache.set(key, new THREE.BoxGeometry(sx, sy, sz));
  }
  return boxGeoCache.get(key);
}

function addBoxCollider(ctx, cx, cy, cz, sx, sy, sz, opts = {}) {
  const half = { x: sx / 2, y: sy / 2, z: sz / 2 };
  ctx.colliders.push({
    minX: cx - half.x, maxX: cx + half.x,
    minY: cy - half.y, maxY: cy + half.y,
    minZ: cz - half.z, maxZ: cz + half.z,
    bouncy: !!opts.bouncy,
  });
}

function addBoxMesh(ctx, cx, cy, cz, sx, sy, sz, color) {
  const mesh = new THREE.Mesh(getBoxGeo(sx, sy, sz), getMaterial(color));
  mesh.position.set(cx, cy, cz);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  ctx.group.add(mesh);
  return mesh;
}

function platform(ctx, length, opts = {}) {
  const { theme, cursor } = ctx;
  const width = opts.width ?? CORRIDOR_HALF * 2;
  const color = opts.color ?? theme.platform;
  const cx = cursor.x + length / 2;
  addBoxMesh(ctx, cx, cursor.y - PLATFORM_THICK / 2, cursor.z, length, PLATFORM_THICK, width, color);
  addBoxCollider(ctx, cx, cursor.y - PLATFORM_THICK / 2, cursor.z, length, PLATFORM_THICK, width, opts);
  cursor.x += length;
}

function gap(ctx, length) {
  ctx.cursor.x += length;
}

function stairs(ctx, steps, dir) {
  const { theme, cursor } = ctx;
  const stepLen = 1.5;
  for (let i = 0; i < steps; i++) {
    cursor.y += dir * STEP;
    const cx = cursor.x + stepLen / 2;
    // riser: a taller box whose TOP stays exactly at cursor.y (the walkable
    // surface) while its bottom extends down so there's no floating gap.
    const riserHeight = PLATFORM_THICK + STEP * 4;
    const cy = cursor.y - riserHeight / 2;
    addBoxMesh(ctx, cx, cy, cursor.z, stepLen, riserHeight, CORRIDOR_HALF * 2, theme.platform);
    addBoxCollider(ctx, cx, cy, cursor.z, stepLen, riserHeight, CORRIDOR_HALF * 2, {});
    cursor.x += stepLen;
  }
}

function zigzag(ctx, count, rng) {
  const { cursor } = ctx;
  const padLen = 1.4;
  let dir = rng() > 0.5 ? 1 : -1;
  for (let i = 0; i < count; i++) {
    const targetZ = THREE.MathUtils.clamp(cursor.z + dir * range(rng, 1.2, 1.8), -CORRIDOR_HALF, CORRIDOR_HALF);
    cursor.z = targetZ;
    platform(ctx, padLen, { width: 2.2 });
    ctx.cursor.x -= 0.2; // slight overlap: zigzag is a lateral-steering challenge, never a fall risk
    dir *= -1;
  }
  // recentre gently so following pieces have room
  ctx.cursor.z = THREE.MathUtils.clamp(ctx.cursor.z, -CORRIDOR_HALF, CORRIDOR_HALF);
}

function narrowBridge(ctx, length) {
  platform(ctx, length, { width: 1.4 });
}

function movingPlatform(ctx, rng) {
  const { theme, cursor } = ctx;
  const size = { x: 2.2, y: PLATFORM_THICK, z: 2.2 };
  const axis = rng() > 0.5 ? 'z' : 'y';
  const gapLen = MAX_GAP + range(rng, 0.6, 1.4);
  const startX = cursor.x + gapLen / 2;
  const baseY = cursor.y - PLATFORM_THICK / 2;
  const baseZ = cursor.z;
  const mesh = new THREE.Mesh(getBoxGeo(size.x, size.y, size.z), getMaterial(theme.accent));
  mesh.position.set(startX, baseY, baseZ);
  ctx.group.add(mesh);
  const mover = {
    mesh,
    axis,
    center: axis === 'z' ? baseZ : baseY,
    amplitude: axis === 'z' ? range(rng, 1.6, 2.4) : range(rng, 0.8, 1.2),
    speed: range(rng, 0.7, 1.1),
    phase: rng() * Math.PI * 2,
    half: { x: size.x / 2, y: size.y / 2, z: size.z / 2 },
  };
  ctx.movers.push(mover);
  cursor.x += gapLen;
}

function jumpPad(ctx) {
  const { theme, cursor } = ctx;
  const len = 2;
  const cx = cursor.x + len / 2;
  addBoxMesh(ctx, cx, cursor.y - PLATFORM_THICK / 2, cursor.z, len, PLATFORM_THICK, CORRIDOR_HALF * 2, theme.accent);
  addBoxCollider(ctx, cx, cursor.y - PLATFORM_THICK / 2, cursor.z, len, PLATFORM_THICK, CORRIDOR_HALF * 2, { bouncy: true });
  cursor.x += len;
}

function buildPad(ctx, worldX, y, z, opts = {}) {
  const { theme } = ctx;
  const color = opts.finish ? 0xf2c94c : theme.platform;
  addBoxMesh(ctx, worldX, y - PLATFORM_THICK / 2, z, PAD_SIZE, PLATFORM_THICK, PAD_SIZE, color);
  addBoxCollider(ctx, worldX, y - PLATFORM_THICK / 2, z, PAD_SIZE, PLATFORM_THICK, PAD_SIZE, {});
  // flag pole marker
  const pole = new THREE.Mesh(getBoxGeo(0.12, 2.2, 0.12), getMaterial(0x8a8a8a));
  pole.position.set(worldX - PAD_SIZE / 2 + 0.3, y + 1.1, z - PAD_SIZE / 2 + 0.3);
  ctx.group.add(pole);
  const flag = new THREE.Mesh(getBoxGeo(0.9, 0.55, 0.05), getMaterial(opts.finish ? 0xf2c94c : theme.accent));
  flag.position.set(worldX - PAD_SIZE / 2 + 0.75, y + 1.9, z - PAD_SIZE / 2 + 0.3);
  ctx.group.add(flag);
}

function pieceWeightsForWorld(world) {
  const pool = [
    { type: 'gap', w: 3 },
    { type: 'stairsUp', w: 2 },
    { type: 'stairsDown', w: 2 },
    { type: 'zigzag', w: 2 },
    { type: 'narrow', w: 2 },
  ];
  if (world >= 1) pool.push({ type: 'jumpPad', w: 1.5 });
  if (world >= 2) pool.push({ type: 'moving', w: 2 });
  return pool;
}

function weightedPick(rng, pool) {
  const total = pool.reduce((s, p) => s + p.w, 0);
  let r = rng() * total;
  for (const p of pool) {
    if (r < p.w) return p.type;
    r -= p.w;
  }
  return pool[0].type;
}

export function buildLevel(levelIndex) {
  const worldOffsetX = levelIndex * LEVEL_LENGTH;
  const theme = themeForLevel(levelIndex);
  const world = worldForLevel(levelIndex);
  const rng = makeLevelRng(levelIndex);
  const group = new THREE.Group();
  const colliders = [];
  const movers = [];
  const cursor = { x: worldOffsetX, y: 0, z: 0 };
  const ctx = { group, colliders, movers, theme, cursor, rng };

  // entry / checkpoint pad
  buildPad(ctx, worldOffsetX + PAD_SIZE / 2, 0, 0, {});
  cursor.x = worldOffsetX + PAD_SIZE + 0.4;

  const pool = pieceWeightsForWorld(world);
  const budgetEnd = worldOffsetX + LEVEL_LENGTH - END_MARGIN;
  let pieces = 0;
  let lastType = null;
  while (cursor.x < budgetEnd && pieces < 6) {
    const avoid = lastType === 'gap' ? 'gap' : null;
    const type = weightedPick(rng, avoid ? pool.filter((p) => p.type !== avoid) : pool);
    lastType = type;
    switch (type) {
      case 'gap':
        platform(ctx, range(rng, 1.8, 2.4));
        gap(ctx, range(rng, 1.3, MAX_GAP));
        // generous landing zone so a full jump arc can't sail over it into
        // whatever short piece comes next
        platform(ctx, range(rng, 3.0, 4.2));
        break;
      case 'stairsUp': {
        const room = Math.max(0, Math.round((MAX_HEIGHT - cursor.y) / STEP));
        const steps = Math.min(2, room, 1 + Math.floor(rng() * 2));
        if (steps > 0) stairs(ctx, steps, 1);
        else platform(ctx, 2);
        break;
      }
      case 'stairsDown':
        if (cursor.y > 0) stairs(ctx, Math.min(2, Math.round(cursor.y / STEP), 1 + Math.floor(rng() * 2)), -1);
        else platform(ctx, 2);
        break;
      case 'zigzag':
        zigzag(ctx, 2, rng);
        break;
      case 'narrow':
        narrowBridge(ctx, range(rng, 2.5, 4));
        break;
      case 'jumpPad':
        platform(ctx, 1.4);
        jumpPad(ctx);
        // wide catch platform, sized for the bounce's arc so it can't overshoot into a void
        platform(ctx, range(rng, 5, 5.8));
        break;
      case 'moving':
        platform(ctx, 1.2);
        movingPlatform(ctx, rng);
        platform(ctx, range(rng, 3.0, 4.2));
        break;
      default:
        platform(ctx, 2);
    }
    pieces++;
  }

  // leveling connector: bring z back toward 0 with a generous safe platform,
  // and y back to baseline with short stairs, so the next level always
  // starts predictably at (worldOffsetX + LEVEL_LENGTH, 0, 0).
  if (cursor.y !== 0) {
    const steps = Math.round(Math.abs(cursor.y) / STEP);
    const dir = cursor.y > 0 ? -1 : 1;
    if (steps > 0) stairs(ctx, steps, dir);
  }
  cursor.y = 0;
  const finalLen = Math.max(0.5, worldOffsetX + LEVEL_LENGTH - cursor.x);
  const wideWidth = Math.min(CORRIDOR_HALF * 2 + Math.abs(cursor.z) * 2 + 1, 12);
  platform(ctx, finalLen, { width: wideWidth });
  cursor.z = 0;

  const isLast = levelIndex === TOTAL_LEVELS - 1;
  if (isLast) {
    buildPad(ctx, worldOffsetX + LEVEL_LENGTH, 0, 0, { finish: true });
  }

  return {
    index: levelIndex,
    group,
    colliders,
    movers,
    theme,
    startWorld: { x: worldOffsetX + PAD_SIZE / 2, y: 1.2, z: 0 },
    endX: worldOffsetX + LEVEL_LENGTH,
  };
}

export function disposeLevel(level) {
  // geometries/materials come from shared caches (see getBoxGeo/getMaterial)
  // and are reused by later levels, so only the group needs detaching here.
  level.group.parent?.remove(level.group);
}
