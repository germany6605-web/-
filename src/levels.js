import * as THREE from 'three';
import { makeLevelRng, range } from './rng.js';
import { themeForLevel, worldForLevel, TOTAL_LEVELS, TOTAL_WORLDS, LEVELS_PER_WORLD, CLIMBING_WORLDS } from './themes.js';

export const LEVEL_LENGTH = 26;
const STEP = 0.55;
const PLATFORM_THICK = 0.6;
const CORRIDOR_HALF = 3.2;
const MAX_GAP = 2.1;
const END_MARGIN = 11;
const PAD_SIZE = 3;
const MAX_HEIGHT = STEP * 4;

// Climbing worlds gain a fixed amount of height every level, on top of
// whatever any earlier climbing world already added - so the baseline never
// has to drop back down at a world boundary, it just keeps building.
const CLIMB_STEPS_TOTAL = 6;
const CLIMB_GAIN_PER_LEVEL = CLIMB_STEPS_TOTAL * STEP;

const WORLD_BASE_Y = (() => {
  const arr = [0];
  for (let w = 0; w < TOTAL_WORLDS - 1; w++) {
    const add = CLIMBING_WORLDS.has(w) ? CLIMB_GAIN_PER_LEVEL * LEVELS_PER_WORLD : 0;
    arr.push(arr[w] + add);
  }
  return arr;
})();

function baseYForLevel(levelIndex) {
  const world = worldForLevel(levelIndex);
  const indexInWorld = levelIndex - world * LEVELS_PER_WORLD;
  const climbSoFar = CLIMBING_WORLDS.has(world) ? indexInWorld * CLIMB_GAIN_PER_LEVEL : 0;
  return WORLD_BASE_Y[world] + climbSoFar;
}

const materialCache = new Map();
function getMaterial(color) {
  const key = color;
  if (!materialCache.has(key)) {
    materialCache.set(key, new THREE.MeshLambertMaterial({ color }));
  }
  return materialCache.get(key);
}

// Hazards are unlit and fog-exempt so they read as a vivid neon-red warning
// in every theme, from the sunny grass world to the dark cave/space worlds.
// A single shared material also means game.js can pulse it once per frame
// and every hazard mesh in the game pulses with it for free.
let hazardMaterial = null;
export function getHazardMaterial() {
  if (!hazardMaterial) {
    hazardMaterial = new THREE.MeshBasicMaterial({ color: 0xff1040, fog: false, toneMapped: false });
  }
  return hazardMaterial;
}

const boxGeoCache = new Map();
function getBoxGeo(sx, sy, sz) {
  const key = `${sx.toFixed(2)}_${sy.toFixed(2)}_${sz.toFixed(2)}`;
  if (!boxGeoCache.has(key)) {
    boxGeoCache.set(key, new THREE.BoxGeometry(sx, sy, sz));
  }
  return boxGeoCache.get(key);
}

const cylGeoCache = new Map();
function getCylinderGeo(radius, height) {
  const key = `${radius.toFixed(2)}_${height.toFixed(2)}`;
  if (!cylGeoCache.has(key)) {
    cylGeoCache.set(key, new THREE.CylinderGeometry(radius, radius, height, 16));
  }
  return cylGeoCache.get(key);
}

const coneGeoCache = new Map();
function getConeGeo(radius, height) {
  const key = `${radius.toFixed(2)}_${height.toFixed(2)}`;
  if (!coneGeoCache.has(key)) {
    coneGeoCache.set(key, new THREE.ConeGeometry(radius, height, 8));
  }
  return coneGeoCache.get(key);
}

const icosGeoCache = new Map();
function getIcosGeo(radius) {
  const key = radius.toFixed(2);
  if (!icosGeoCache.has(key)) {
    icosGeoCache.set(key, new THREE.IcosahedronGeometry(radius, 0));
  }
  return icosGeoCache.get(key);
}

const octaGeoCache = new Map();
function getOctaGeo(radius) {
  const key = radius.toFixed(2);
  if (!octaGeoCache.has(key)) {
    octaGeoCache.set(key, new THREE.OctahedronGeometry(radius, 0));
  }
  return octaGeoCache.get(key);
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

function stairs(ctx, steps, dir, stepHeight = STEP, stepLen = 1.5) {
  const { theme, cursor } = ctx;
  for (let i = 0; i < steps; i++) {
    cursor.y += dir * stepHeight;
    const cx = cursor.x + stepLen / 2;
    // riser: a taller box whose TOP stays exactly at cursor.y (the walkable
    // surface) while its bottom extends down so there's no floating gap.
    const riserHeight = PLATFORM_THICK + stepHeight * 4;
    const cy = cursor.y - riserHeight / 2;
    addBoxMesh(ctx, cx, cy, cursor.z, stepLen, riserHeight, CORRIDOR_HALF * 2, theme.platform);
    addBoxCollider(ctx, cx, cy, cursor.z, stepLen, riserHeight, CORRIDOR_HALF * 2, {});
    cursor.x += stepLen;
  }
}

// A smooth-looking incline: many small steps instead of a few tall ones.
// Same walkable mechanics as stairs(), just finer-grained for visual variety.
function rampPiece(ctx, rng, dir) {
  const { cursor, baseY } = ctx;
  const rampStep = 0.18;
  const rampLen = 0.7;
  const room = dir === 1
    ? Math.max(0, Math.floor((baseY + MAX_HEIGHT - cursor.y) / rampStep))
    : Math.max(0, Math.floor((cursor.y - baseY) / rampStep));
  const steps = Math.min(room, 6 + Math.floor(rng() * 6));
  if (steps > 0) stairs(ctx, steps, dir, rampStep, rampLen);
  else platform(ctx, 2);
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

function spikesPiece(ctx, rng) {
  const { cursor, group, hazards } = ctx;
  const len = range(rng, 3.4, 4.4);
  platform(ctx, len);
  const spikeCount = 2 + Math.floor(rng() * 2);
  const startX = cursor.x - len + 0.9;
  const spacing = (len - 1.8) / Math.max(1, spikeCount - 1);
  const laneSide = rng() > 0.5 ? 1 : -1;
  const spikeZ = laneSide * range(rng, 1.3, 1.9); // leaves a clear walk-around lane on the other side
  const radius = 0.26;
  const height = 0.55;
  for (let i = 0; i < spikeCount; i++) {
    const sx = startX + i * spacing;
    const mesh = new THREE.Mesh(getConeGeo(radius, height), getHazardMaterial());
    mesh.position.set(sx, cursor.y + height / 2, spikeZ);
    group.add(mesh);
    hazards.push({
      type: 'box',
      minX: sx - radius * 0.6, maxX: sx + radius * 0.6,
      minY: cursor.y, maxY: cursor.y + height,
      minZ: spikeZ - radius * 0.6, maxZ: spikeZ + radius * 0.6,
    });
  }
}

function bladePiece(ctx, rng) {
  const { theme, cursor, group, hazards } = ctx;
  const width = CORRIDOR_HALF * 2;
  // generous straight lead-in before the pivot so there's time to line up
  // with the safe lane, plus a short trailing stretch to land the dodge
  const leadIn = range(rng, 3.0, 3.6);
  const trail = range(rng, 1.4, 1.8);
  const platLen = leadIn + trail;
  const pivotX = cursor.x + leadIn;
  const pivotZ = cursor.z;
  platform(ctx, platLen, { width });
  const length = 2.6;
  const thickness = 0.28;
  const halfHeight = 0.32;
  const mesh = new THREE.Mesh(getBoxGeo(length, halfHeight * 2, thickness), getHazardMaterial());
  mesh.position.set(pivotX, cursor.y + halfHeight, pivotZ);
  group.add(mesh);
  const post = new THREE.Mesh(getCylinderGeo(0.1, 0.5), getMaterial(theme.accent));
  post.position.set(pivotX, cursor.y + 0.25, pivotZ);
  group.add(post);
  hazards.push({
    type: 'blade',
    mesh,
    length,
    thickness,
    halfHeight,
    speed: range(rng, 1.1, 1.7) * (rng() > 0.5 ? 1 : -1),
    phase: rng() * Math.PI * 2,
  });
}

function orbPiece(ctx, rng) {
  const { cursor, group, hazards } = ctx;
  const leadIn = range(rng, 3.0, 3.6);
  const trail = range(rng, 1.6, 2.0);
  const platLen = leadIn + trail;
  const baseX = cursor.x + leadIn;
  const baseY = cursor.y + 0.55;
  const baseZ = cursor.z;
  platform(ctx, platLen, { width: CORRIDOR_HALF * 2 });
  const radius = 0.32;
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 12, 8), getHazardMaterial());
  mesh.position.set(baseX, baseY, baseZ);
  group.add(mesh);
  hazards.push({
    type: 'orb',
    mesh,
    radius,
    axis: 'z',
    center: baseZ,
    amplitude: range(rng, 1.4, 2.0),
    speed: range(rng, 0.9, 1.3),
    phase: rng() * Math.PI * 2,
  });
}

// Full-width "must jump" hazards: unlike spikes/blade/orb (which always
// leave a safe lane to walk around), these block the entire corridor so
// clearing them requires an actual jump.
function hurdlePiece(ctx, rng) {
  const { cursor, group, hazards } = ctx;
  const leadIn = range(rng, 2.6, 3.2);
  const trail = range(rng, 1.6, 2.0);
  const barX = cursor.x + leadIn;
  platform(ctx, leadIn + trail, { width: CORRIDOR_HALF * 2 });
  const height = 0.5;
  const thickness = 0.22;
  const width = CORRIDOR_HALF * 2;
  const mesh = new THREE.Mesh(getBoxGeo(thickness, height, width), getHazardMaterial());
  mesh.position.set(barX, cursor.y + height / 2, cursor.z);
  group.add(mesh);
  hazards.push({
    type: 'box',
    minX: barX - thickness / 2, maxX: barX + thickness / 2,
    minY: cursor.y, maxY: cursor.y + height,
    minZ: cursor.z - width / 2, maxZ: cursor.z + width / 2,
  });
}

function spikeWallPiece(ctx, rng) {
  const { cursor, group, hazards } = ctx;
  const leadIn = range(rng, 2.6, 3.2);
  const trail = range(rng, 1.8, 2.2);
  const spikeX = cursor.x + leadIn;
  platform(ctx, leadIn + trail, { width: CORRIDOR_HALF * 2 });
  const height = 0.55;
  const count = 7;
  const spanWidth = CORRIDOR_HALF * 2 - 0.4;
  const spacing = spanWidth / (count - 1);
  for (let i = 0; i < count; i++) {
    const sz = cursor.z - spanWidth / 2 + i * spacing;
    const mesh = new THREE.Mesh(getConeGeo(0.26, height), getHazardMaterial());
    mesh.position.set(spikeX, cursor.y + height / 2, sz);
    group.add(mesh);
  }
  // one continuous hitbox spanning the whole row - no sliver between cones to sneak through
  hazards.push({
    type: 'box',
    minX: spikeX - 0.3, maxX: spikeX + 0.3,
    minY: cursor.y, maxY: cursor.y + height,
    minZ: cursor.z - spanWidth / 2 - 0.2, maxZ: cursor.z + spanWidth / 2 + 0.2,
  });
}

function rollingLogPiece(ctx, rng) {
  const { cursor, group, hazards } = ctx;
  const leadIn = range(rng, 2.6, 3.2);
  const trail = range(rng, 1.6, 2.0);
  const logX = cursor.x + leadIn;
  platform(ctx, leadIn + trail, { width: CORRIDOR_HALF * 2 });
  const radius = 0.32;
  const width = CORRIDOR_HALF * 2;
  const mesh = new THREE.Mesh(getCylinderGeo(radius, width), getHazardMaterial());
  mesh.rotation.z = Math.PI / 2; // lay the cylinder on its side, spanning the corridor
  mesh.position.set(logX, cursor.y + radius, cursor.z);
  group.add(mesh);
  hazards.push({
    type: 'box',
    spinMesh: mesh, // rolls visually around its own axis; the hitbox never changes shape
    minX: logX - radius, maxX: logX + radius,
    minY: cursor.y, maxY: cursor.y + radius * 2,
    minZ: cursor.z - width / 2, maxZ: cursor.z + width / 2,
  });
}

// Splits `total` into `parts` non-negative integers (some may be 0) that
// always sum to exactly `total`, so a climbing level's net height gain is
// deterministic regardless of how the RNG distributes it across flights.
function partitionSteps(rng, total, parts) {
  if (parts <= 1) return [total];
  const cuts = [];
  for (let i = 0; i < parts - 1; i++) cuts.push(Math.floor(rng() * (total + 1)));
  cuts.sort((a, b) => a - b);
  const result = [];
  let prev = 0;
  for (const c of cuts) {
    result.push(c - prev);
    prev = c;
  }
  result.push(total - prev);
  return result;
}

// A climbing level replaces the normal piece loop entirely: a few flights
// of stairs (always summing to CLIMB_GAIN_PER_LEVEL) separated by flat rests
// and the occasional bit of variety, ending flush with the next level's pad.
function buildClimbSkeleton(ctx, rng, worldOffsetX) {
  const flights = 2 + Math.floor(rng() * 2);
  const stepsPerFlight = partitionSteps(rng, CLIMB_STEPS_TOTAL, flights);
  for (let f = 0; f < flights; f++) {
    if (stepsPerFlight[f] > 0) stairs(ctx, stepsPerFlight[f], 1);
    if (f < flights - 1) {
      const roll = rng();
      if (roll < 0.25) {
        platform(ctx, range(rng, 1.6, 2.0));
        gap(ctx, range(rng, 1.2, 1.7));
        platform(ctx, range(rng, 2.2, 2.8));
      } else if (roll < 0.4) {
        spikesPiece(ctx, rng);
      } else if (roll < 0.5) {
        hurdlePiece(ctx, rng);
      } else {
        platform(ctx, range(rng, 2.2, 3.0));
      }
    }
  }
  const finalLen = Math.max(0.5, worldOffsetX + LEVEL_LENGTH - ctx.cursor.x);
  platform(ctx, finalLen, { width: CORRIDOR_HALF * 2 });
}

function steppingStones(ctx, rng) {
  const { theme, cursor, group, colliders } = ctx;
  const count = 3 + Math.floor(rng() * 2);
  for (let i = 0; i < count; i++) {
    const stoneRadius = range(rng, 0.85, 1.05);
    const cx = cursor.x + stoneRadius;
    const mesh = new THREE.Mesh(getCylinderGeo(stoneRadius, PLATFORM_THICK), getMaterial(theme.platform));
    mesh.position.set(cx, cursor.y - PLATFORM_THICK / 2, cursor.z);
    group.add(mesh);
    colliders.push({
      minX: cx - stoneRadius, maxX: cx + stoneRadius,
      minY: cursor.y - PLATFORM_THICK, maxY: cursor.y,
      minZ: cursor.z - stoneRadius, maxZ: cursor.z + stoneRadius,
      bouncy: false,
    });
    cursor.x = cx + stoneRadius + range(rng, 0.9, 1.4);
  }
}

// Like steppingStones, but each pillar sits a little higher or lower than
// the last - a gentle rolling rhythm instead of a flat row, in the theme's
// accent colour so it reads as a distinct shape from the ground-level ones.
function floatingPillars(ctx, rng) {
  const { theme, cursor, group, colliders, baseY } = ctx;
  const count = 3 + Math.floor(rng() * 2);
  for (let i = 0; i < count; i++) {
    const stoneRadius = range(rng, 0.75, 0.95);
    const cx = cursor.x + stoneRadius;
    let dy = range(rng, -0.35, 0.35);
    if (cursor.y + dy > baseY + MAX_HEIGHT || cursor.y + dy < baseY - MAX_HEIGHT) dy = 0;
    cursor.y += dy;
    const mesh = new THREE.Mesh(getCylinderGeo(stoneRadius, PLATFORM_THICK), getMaterial(theme.accent));
    mesh.position.set(cx, cursor.y - PLATFORM_THICK / 2, cursor.z);
    group.add(mesh);
    colliders.push({
      minX: cx - stoneRadius, maxX: cx + stoneRadius,
      minY: cursor.y - PLATFORM_THICK, maxY: cursor.y,
      minZ: cursor.z - stoneRadius, maxZ: cursor.z + stoneRadius,
      bouncy: false,
    });
    cursor.x = cx + stoneRadius + range(rng, 0.8, 1.2);
  }
}

function addDecoration(ctx, x, z, rng) {
  const { theme, group } = ctx;
  const kind = Math.floor(rng() * 3);
  const y = -0.3;
  if (kind === 0) {
    const trunk = new THREE.Mesh(getCylinderGeo(0.12, 0.8), getMaterial(0x8a6a4a));
    trunk.position.set(x, y + 0.4, z);
    group.add(trunk);
    const top = new THREE.Mesh(getConeGeo(0.55, 1.1), getMaterial(theme.platform));
    top.position.set(x, y + 1.1, z);
    group.add(top);
  } else if (kind === 1) {
    const rock = new THREE.Mesh(getIcosGeo(range(rng, 0.35, 0.6)), getMaterial(theme.accent));
    rock.position.set(x, y + 0.3, z);
    rock.rotation.set(rng() * Math.PI, rng() * Math.PI, 0);
    group.add(rock);
  } else {
    const crystal = new THREE.Mesh(getOctaGeo(range(rng, 0.3, 0.5)), getMaterial(theme.accent));
    crystal.position.set(x, y + 0.5, z);
    crystal.rotation.y = rng() * Math.PI;
    group.add(crystal);
  }
}

function scatterDecorations(ctx, worldOffsetX, rng) {
  const count = 4 + Math.floor(rng() * 4);
  for (let i = 0; i < count; i++) {
    const side = rng() > 0.5 ? 1 : -1;
    const x = worldOffsetX + range(rng, 1, LEVEL_LENGTH - 1);
    const z = side * range(rng, CORRIDOR_HALF + 1.2, CORRIDOR_HALF + 3.2);
    addDecoration(ctx, x, z, rng);
  }
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
    { type: 'stones', w: 2 },
    { type: 'pillars', w: 1.8 },
    { type: 'ramp', w: 1.8 },
    { type: 'spikes', w: 1.5 },
    { type: 'hurdle', w: 1.5 },
  ];
  if (world >= 1) pool.push({ type: 'jumpPad', w: 1.5 }, { type: 'blade', w: 1.5 }, { type: 'spikeWall', w: 1.3 });
  if (world >= 2) pool.push({ type: 'moving', w: 2 }, { type: 'orb', w: 1.5 }, { type: 'rollingLog', w: 1.3 });
  return pool;
}

const HAZARD_TYPES = new Set(['spikes', 'blade', 'orb', 'hurdle', 'spikeWall', 'rollingLog']);

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
  const hazards = [];
  const baseY = baseYForLevel(levelIndex);
  const cursor = { x: worldOffsetX, y: baseY, z: 0 };
  const ctx = { group, colliders, movers, hazards, theme, cursor, rng, baseY };

  // entry / checkpoint pad
  buildPad(ctx, worldOffsetX + PAD_SIZE / 2, baseY, 0, {});
  cursor.x = worldOffsetX + PAD_SIZE + 0.4;

  if (CLIMBING_WORLDS.has(world)) {
    buildClimbSkeleton(ctx, rng, worldOffsetX);
    scatterDecorations(ctx, worldOffsetX, rng);
    const isLast = levelIndex === TOTAL_LEVELS - 1;
    if (isLast) buildPad(ctx, worldOffsetX + LEVEL_LENGTH, cursor.y, 0, { finish: true });
    return {
      index: levelIndex,
      group,
      colliders,
      hazards,
      movers,
      theme,
      startWorld: { x: worldOffsetX + PAD_SIZE / 2, y: baseY + 1.2, z: 0 },
      endX: worldOffsetX + LEVEL_LENGTH,
    };
  }

  const pool = pieceWeightsForWorld(world);
  const budgetEnd = worldOffsetX + LEVEL_LENGTH - END_MARGIN;
  let pieces = 0;
  let lastType = null;
  while (cursor.x < budgetEnd && pieces < 6) {
    // never chain two gaps, and never chain two hazards back to back - each
    // hazard's safe lane should be reasoned about on its own, not combined
    // with another hazard's while it's still fresh underfoot
    const avoidTypes = lastType === 'gap' ? ['gap'] : HAZARD_TYPES.has(lastType) ? [...HAZARD_TYPES] : [];
    const candidatePool = avoidTypes.length ? pool.filter((p) => !avoidTypes.includes(p.type)) : pool;
    const type = weightedPick(rng, candidatePool.length ? candidatePool : pool);
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
        const room = Math.max(0, Math.round((baseY + MAX_HEIGHT - cursor.y) / STEP));
        const steps = Math.min(2, room, 1 + Math.floor(rng() * 2));
        if (steps > 0) stairs(ctx, steps, 1);
        else platform(ctx, 2);
        break;
      }
      case 'stairsDown':
        if (cursor.y > baseY) stairs(ctx, Math.min(2, Math.round((cursor.y - baseY) / STEP), 1 + Math.floor(rng() * 2)), -1);
        else platform(ctx, 2);
        break;
      case 'ramp':
        rampPiece(ctx, rng, rng() > 0.5 ? 1 : -1);
        break;
      case 'pillars':
        floatingPillars(ctx, rng);
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
      case 'stones':
        steppingStones(ctx, rng);
        break;
      case 'spikes':
        spikesPiece(ctx, rng);
        break;
      case 'blade':
        bladePiece(ctx, rng);
        break;
      case 'orb':
        orbPiece(ctx, rng);
        break;
      case 'hurdle':
        hurdlePiece(ctx, rng);
        break;
      case 'spikeWall':
        spikeWallPiece(ctx, rng);
        break;
      case 'rollingLog':
        rollingLogPiece(ctx, rng);
        break;
      default:
        platform(ctx, 2);
    }
    pieces++;
  }

  // leveling connector: bring z back toward 0 with a generous safe platform,
  // and y back to this level's own baseline with short stairs, so the next
  // level always starts predictably at (worldOffsetX + LEVEL_LENGTH, baseY, 0).
  if (cursor.y !== baseY) {
    const steps = Math.round(Math.abs(cursor.y - baseY) / STEP);
    const dir = cursor.y > baseY ? -1 : 1;
    if (steps > 0) stairs(ctx, steps, dir);
  }
  cursor.y = baseY;
  const finalLen = Math.max(0.5, worldOffsetX + LEVEL_LENGTH - cursor.x);
  const wideWidth = Math.min(CORRIDOR_HALF * 2 + Math.abs(cursor.z) * 2 + 1, 12);
  platform(ctx, finalLen, { width: wideWidth });
  cursor.z = 0;

  const isLast = levelIndex === TOTAL_LEVELS - 1;
  if (isLast) {
    buildPad(ctx, worldOffsetX + LEVEL_LENGTH, baseY, 0, { finish: true });
  }

  scatterDecorations(ctx, worldOffsetX, rng);

  return {
    index: levelIndex,
    group,
    colliders,
    hazards,
    movers,
    theme,
    startWorld: { x: worldOffsetX + PAD_SIZE / 2, y: baseY + 1.2, z: 0 },
    endX: worldOffsetX + LEVEL_LENGTH,
  };
}

export function disposeLevel(level) {
  // geometries/materials come from shared caches (see getBoxGeo/getMaterial)
  // and are reused by later levels, so only the group needs detaching here.
  level.group.parent?.remove(level.group);
}
