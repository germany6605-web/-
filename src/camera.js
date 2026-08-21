import * as THREE from 'three';

// Offset slightly to the side (z) rather than sitting dead-on the corridor's
// centre axis - a camera perfectly behind the player looks straight down the
// same line as upcoming obstacles, so anything a few units ahead visually
// stacks on top of the player model instead of reading as "ahead of them".
// The side offset gives real parallax separation between player and hazard.
const BASE_OFFSET = new THREE.Vector3(-7.6, 4.8, -2.8);

export class ChaseCamera {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0; // extra orbit offset the player can drag in
    this.current = new THREE.Vector3();
    this.hasInit = false;
  }

  addYaw(delta) {
    this.yaw = THREE.MathUtils.clamp(this.yaw + delta, -1.1, 1.1);
  }

  update(playerPos, dt) {
    const offset = BASE_OFFSET.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    const desired = playerPos.clone().add(offset);
    if (!this.hasInit) {
      this.current.copy(desired);
      this.hasInit = true;
    } else {
      const t = 1 - Math.pow(0.0008, dt);
      this.current.lerp(desired, t);
    }
    this.camera.position.copy(this.current);
    const lookAt = playerPos.clone().add(new THREE.Vector3(2.2, 1.0, 0));
    this.camera.lookAt(lookAt);
    // gently relax the yaw drag back toward centre so the camera doesn't get stuck
    this.yaw *= Math.pow(0.02, dt);
  }
}
