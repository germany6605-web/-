import * as THREE from 'three';
import { Player } from './src/player.js';
import { buildLevel, LEVEL_LENGTH } from './src/levels.js';
import { TOTAL_LEVELS } from './src/themes.js';

const dt = 1 / 60;
const MAX_SIM_TIME = 12; // seconds per level, generous for an easy obby

function simulateLevel(index) {
  const scene = new THREE.Scene();
  const cur = buildLevel(index);
  const next = index + 1 < TOTAL_LEVELS ? buildLevel(index + 1) : null;
  const colliders = cur.colliders.concat(next ? next.colliders : []);
  const movers = cur.movers.concat(next ? next.movers : []);

  const player = new Player(scene);
  let fell = false;
  player.onFall = () => { fell = true; };
  player.teleport(new THREE.Vector3(cur.startWorld.x, cur.startWorld.y, cur.startWorld.z));

  const targetX = cur.endX;
  let t = 0;
  while (t < MAX_SIM_TIME && !fell) {
    // movers
    const now = t;
    for (const m of movers) {
      const val = m.center + Math.sin(now * m.speed + m.phase) * m.amplitude;
      if (m.axis === 'z') m.mesh.position.z = val;
      else m.mesh.position.y = val;
    }

    const p = player.position;
    let target = null;
    for (const c of colliders) {
      if (c.maxX > p.x + 0.3 && c.minX < p.x + 3.5) {
        if (!target || c.minX < target.minX) target = c;
      }
    }
    const targetZ = target ? (target.minZ + target.maxZ) / 2 : 0;
    const dz = THREE.MathUtils.clamp((targetZ - p.z) * 0.8, -1, 1);
    const move = { x: 1, z: dz };

    if (player.grounded) {
      const aheadX0 = p.x + 0.5;
      const aheadX1 = p.x + 0.95;
      const covered = colliders.some((c) => c.maxX > aheadX0 && c.minX < aheadX1 && c.maxZ > p.z - 0.3 && c.minZ < p.z + 0.3 && c.maxY > p.y - 0.35 && c.maxY < p.y + 0.35)
        || movers.some((m) => {
          const mp = m.mesh.position;
          return mp.x + m.half.x > aheadX0 && mp.x - m.half.x < aheadX1 && mp.z + m.half.z > p.z - 0.3 && mp.z - m.half.z < p.z + 0.3 && mp.y + m.half.y > p.y - 0.35 && mp.y + m.half.y < p.y + 0.35;
        });
      if (!covered) player.jump();
    }

    player.update(dt, move, colliders, movers);
    t += dt;
    if (p.x >= targetX) break;
  }

  return { index, reached: player.position.x >= targetX, fell, finalX: player.position.x, time: t };
}

const from = parseInt(process.argv[2] || '0', 10);
const to = parseInt(process.argv[3] || String(TOTAL_LEVELS - 1), 10);

let failures = [];
for (let i = from; i <= to; i++) {
  const r = simulateLevel(i);
  if (!r.reached) failures.push(r);
}

console.log(`Tested levels ${from}..${to}: ${to - from + 1 - failures.length} passed, ${failures.length} failed`);
if (failures.length) {
  console.log('Failures (first 30):');
  for (const f of failures.slice(0, 30)) {
    console.log(f);
  }
}
