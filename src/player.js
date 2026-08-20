import * as THREE from 'three';

const GRAVITY = -26;
const MOVE_SPEED = 6.4;
const AIR_SPEED = 5.6;
const JUMP_VELOCITY = 7.6;
const BOUNCE_VELOCITY = 11;
const RADIUS = 0.42;
const HEIGHT = 1.5;
const STEP_UP_MAX = 0.62; // small ledges (stairs) are auto-climbed instead of blocking like a wall
const MAX_FALL = -40;
const COYOTE_TIME = 0.15; // grace period after walking off a ledge where jump still works
const JUMP_BUFFER = 0.15; // pressing jump slightly before landing still triggers it

export class Player {
  constructor(scene) {
    this.group = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x4f8ef7 });
    const headMat = new THREE.MeshLambertMaterial({ color: 0xffd8a8 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(RADIUS, HEIGHT - RADIUS * 2, 4, 8), bodyMat);
    body.position.y = HEIGHT / 2;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), headMat);
    head.position.y = HEIGHT + 0.15;
    this.group.add(body, head);
    scene.add(this.group);

    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.grounded = false;
    this.groundMover = null;
    this.deathY = MAX_FALL;
    this.onFall = null;
    this.facing = 0;
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
  }

  teleport(pos) {
    this.position.copy(pos);
    this.velocity.set(0, 0, 0);
    this.grounded = false;
    this.groundMover = null;
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.group.position.copy(this.position);
  }

  jump() {
    this.jumpBufferTimer = JUMP_BUFFER;
  }

  update(dt, input, colliders, movers) {
    const speed = this.grounded ? MOVE_SPEED : AIR_SPEED;
    const moveX = input.x * speed;
    const moveZ = input.z * speed;
    this.velocity.x = THREE.MathUtils.lerp(this.velocity.x, moveX, this.grounded ? 0.35 : 0.12);
    this.velocity.z = THREE.MathUtils.lerp(this.velocity.z, moveZ, this.grounded ? 0.35 : 0.12);
    this.velocity.y += GRAVITY * dt;
    if (this.velocity.y < -30) this.velocity.y = -30;

    // carry the player along with whatever moving platform they're standing on
    if (this.grounded && this.groundMover) {
      const m = this.groundMover;
      const delta = m.axis === 'z' ? m.mesh.position.z - m.prevRef : m.mesh.position.y - m.prevRef;
      if (m.axis === 'z') this.position.z += delta;
      else this.position.y += delta;
    }

    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    resolveHorizontal(this.position, colliders, movers);

    const prevY = this.position.y;
    this.position.y += this.velocity.y * dt;

    this.grounded = false;
    this.groundMover = null;
    if (this.velocity.y <= 0.01) {
      const ground = findGround(this.position, prevY, colliders, movers);
      if (ground) {
        if (ground.bouncy) {
          this.velocity.y = BOUNCE_VELOCITY;
          this.position.y = ground.top;
        } else {
          this.position.y = ground.top;
          this.velocity.y = 0;
          this.grounded = true;
          if (ground.mover) {
            this.groundMover = ground.mover;
            ground.mover.prevRef = ground.mover.axis === 'z' ? ground.mover.mesh.position.z : ground.mover.mesh.position.y;
          }
        }
      }
    }

    this.coyoteTimer = this.grounded ? COYOTE_TIME : Math.max(0, this.coyoteTimer - dt);
    if (this.jumpBufferTimer > 0 && (this.grounded || this.coyoteTimer > 0)) {
      this.velocity.y = JUMP_VELOCITY;
      this.grounded = false;
      this.groundMover = null;
      this.coyoteTimer = 0;
      this.jumpBufferTimer = 0;
    } else {
      this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - dt);
    }

    if (input.x !== 0 || input.z !== 0) {
      const targetFacing = Math.atan2(input.x, input.z);
      this.facing = lerpAngle(this.facing, targetFacing, 0.25);
    }
    this.group.position.copy(this.position);
    this.group.rotation.y = this.facing;

    if (this.position.y < this.deathY) {
      this.onFall && this.onFall();
    }
  }
}

function lerpAngle(a, b, t) {
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

function resolveHorizontal(pos, colliders, movers) {
  const px0 = pos.x - RADIUS, px1 = pos.x + RADIUS;
  const pz0 = pos.z - RADIUS, pz1 = pos.z + RADIUS;
  const py0 = pos.y + 0.05, py1 = pos.y + HEIGHT - 0.05;
  const all = getAllBoxes(colliders, movers);
  for (const b of all) {
    if (b.bouncy) continue;
    if (px1 <= b.minX || px0 >= b.maxX) continue;
    if (pz1 <= b.minZ || pz0 >= b.maxZ) continue;
    if (py1 <= b.minY || py0 >= b.maxY) continue;
    // small ledges (stair steps) are auto-climbed rather than treated as a wall
    const rise = b.maxY - pos.y;
    if (rise > -0.05 && rise <= STEP_UP_MAX) {
      pos.y = b.maxY;
      continue;
    }
    // overlapping a solid side wall region: push out along smallest axis
    const overlapX1 = b.maxX - px0;
    const overlapX2 = px1 - b.minX;
    const overlapZ1 = b.maxZ - pz0;
    const overlapZ2 = pz1 - b.minZ;
    const minX = Math.min(overlapX1, overlapX2);
    const minZ = Math.min(overlapZ1, overlapZ2);
    if (minX < minZ) {
      pos.x += overlapX1 < overlapX2 ? overlapX1 : -overlapX2;
    } else {
      pos.z += overlapZ1 < overlapZ2 ? overlapZ1 : -overlapZ2;
    }
  }
}

function getAllBoxes(colliders, movers) {
  const boxes = colliders;
  const moverBoxes = movers.map((m) => {
    const p = m.mesh.position;
    return {
      minX: p.x - m.half.x, maxX: p.x + m.half.x,
      minY: p.y - m.half.y, maxY: p.y + m.half.y,
      minZ: p.z - m.half.z, maxZ: p.z + m.half.z,
      mover: m,
    };
  });
  return boxes.length || moverBoxes.length ? boxes.concat(moverBoxes) : boxes;
}

// Swept ground check: a platform counts as landed-on if its top was at/below
// the player's feet at the start of the frame and the feet have now reached
// at/below it. This catches fast falls in a single low-fps frame instead of
// only testing the final position (which lets the player tunnel through).
function findGround(pos, prevY, colliders, movers) {
  const px0 = pos.x - RADIUS + 0.06, px1 = pos.x + RADIUS - 0.06;
  const pz0 = pos.z - RADIUS + 0.06, pz1 = pos.z + RADIUS - 0.06;
  let best = null;
  const all = getAllBoxes(colliders, movers);
  for (const b of all) {
    if (px1 <= b.minX || px0 >= b.maxX) continue;
    if (pz1 <= b.minZ || pz0 >= b.maxZ) continue;
    if (b.maxY > prevY + 0.05) continue; // was already above the player, not a floor we fell onto
    if (pos.y > b.maxY + 0.05) continue; // haven't reached down to it yet this frame
    if (!best || b.maxY > best.top) {
      best = { top: b.maxY, bouncy: b.bouncy, mover: b.mover || null };
    }
  }
  return best;
}
