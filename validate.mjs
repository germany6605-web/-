import * as THREE from 'three';
import { Player } from './src/player.js';
import { buildLevel, LEVEL_LENGTH } from './src/levels.js';
import { TOTAL_LEVELS } from './src/themes.js';

const dt = 1 / 60;
const MAX_SIM_TIME = 12; // seconds per level, generous for an easy obby

// The full range a moving hazard could ever occupy, used only for route
// planning (a human picks one safe lane and holds it rather than reactively
// dodging a still-moving target frame by frame).
function hazardDangerZone(h) {
  if (h.type === 'orb') {
    const p = h.mesh.position;
    return { minX: p.x - h.radius, maxX: p.x + h.radius, minZ: h.center - h.amplitude - h.radius, maxZ: h.center + h.amplitude + h.radius };
  }
  if (h.type === 'blade') {
    const p = h.mesh.position;
    const reach = h.length / 2 + h.thickness / 2;
    return { minX: p.x - reach, maxX: p.x + reach, minZ: p.z - reach, maxZ: p.z + reach };
  }
  return h;
}

function simulateLevel(index) {
  const scene = new THREE.Scene();
  const cur = buildLevel(index);
  const next = index + 1 < TOTAL_LEVELS ? buildLevel(index + 1) : null;
  const colliders = cur.colliders.concat(next ? next.colliders : []);
  const movers = cur.movers.concat(next ? next.movers : []);
  const hazards = cur.hazards.concat(next ? next.hazards : []);

  const player = new Player(scene);
  let died = false;
  player.onDeath = () => { died = true; };
  player.teleport(new THREE.Vector3(cur.startWorld.x, cur.startWorld.y, cur.startWorld.z));

  const targetX = cur.endX;
  let t = 0;
  while (t < MAX_SIM_TIME && !died) {
    for (const m of movers) {
      const val = m.center + Math.sin(t * m.speed + m.phase) * m.amplitude;
      if (m.axis === 'z') m.mesh.position.z = val;
      else m.mesh.position.y = val;
    }
    for (const h of hazards) {
      if (h.type === 'blade') h.mesh.rotation.y = h.phase + t * h.speed;
      else if (h.type === 'orb') h.mesh.position.z = h.center + Math.sin(t * h.speed + h.phase) * h.amplitude;
    }

    const p = player.position;
    let target = null;
    for (const c of colliders) {
      if (c.maxX > p.x + 0.3 && c.minX < p.x + 3.5) {
        if (!target || c.minX < target.minX) target = c;
      }
    }
    let targetZ = target ? (target.minZ + target.maxZ) / 2 : 0;
    // steer away from any hazard whose danger zone the path from the current
    // position to the target would cross, mirroring how a sighted player
    // routes around danger rather than walking straight through it
    for (const h of hazards) {
      const hb = hazardDangerZone(h);
      if (hb.maxX < p.x - 0.5 || hb.minX > p.x + 4) continue;
      const hCenterZ = (hb.minZ + hb.maxZ) / 2;
      const hHalf = (hb.maxZ - hb.minZ) / 2 + 0.6;
      const lo = Math.min(p.z, targetZ);
      const hi = Math.max(p.z, targetZ);
      if (lo < hCenterZ + hHalf && hi > hCenterZ - hHalf) {
        const side = p.z >= hCenterZ ? 1 : -1;
        targetZ = hCenterZ + side * hHalf;
      }
    }
    const dz = THREE.MathUtils.clamp((targetZ - p.z) * 0.8, -1, 1);
    const move = { x: 1, z: dz };

    if (player.grounded) {
      const aheadX0 = p.x + 0.5;
      const aheadX1 = p.x + 1.6;
      const covered = colliders.some((c) => c.maxX > aheadX0 && c.minX < aheadX1 && c.maxZ > p.z - 0.3 && c.minZ < p.z + 0.3 && c.maxY > p.y - 0.35 && c.maxY < p.y + 0.35)
        || movers.some((m) => {
          const mp = m.mesh.position;
          return mp.x + m.half.x > aheadX0 && mp.x - m.half.x < aheadX1 && mp.z + m.half.z > p.z - 0.3 && mp.z - m.half.z < p.z + 0.3 && mp.y + m.half.y > p.y - 0.35 && mp.y + m.half.y < p.y + 0.35;
        });
      if (!covered) player.jump();
    }

    player.update(dt, move, colliders, movers, hazards);
    t += dt;
    if (p.x >= targetX) break;
  }

  return { index, reached: player.position.x >= targetX, died, finalX: player.position.x, time: t };
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
