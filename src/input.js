export class InputController {
  constructor({ joystickBase, joystickKnob, jumpButton, dragLayer, onCameraDrag }) {
    this.keys = new Set();
    this.jumpQueued = false;
    this.joyVec = { x: 0, z: 0 };
    this.joyActive = false;
    this.joyPointerId = null;
    this.dragPointerId = null;
    this.lastDragX = 0;
    this.onCameraDrag = onCameraDrag || (() => {});

    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (e.code === 'Space') this.jumpQueued = true;
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));

    if (joystickBase && joystickKnob) {
      const rect = () => joystickBase.getBoundingClientRect();
      const start = (e) => {
        if (this.joyPointerId !== null) return;
        this.joyPointerId = e.pointerId;
        this.joyActive = true;
        joystickBase.setPointerCapture(e.pointerId);
        move(e);
      };
      const move = (e) => {
        if (e.pointerId !== this.joyPointerId) return;
        const r = rect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        let dx = (e.clientX - cx) / (r.width / 2);
        let dy = (e.clientY - cy) / (r.height / 2);
        const len = Math.hypot(dx, dy);
        if (len > 1) { dx /= len; dy /= len; }
        this.joyVec.x = -dy; // up on stick = forward
        this.joyVec.z = dx;
        joystickKnob.style.transform = `translate(${dx * 26}px, ${dy * 26}px)`;
      };
      const end = (e) => {
        if (e.pointerId !== this.joyPointerId) return;
        this.joyPointerId = null;
        this.joyActive = false;
        this.joyVec.x = 0;
        this.joyVec.z = 0;
        joystickKnob.style.transform = 'translate(0px, 0px)';
      };
      joystickBase.addEventListener('pointerdown', start);
      joystickBase.addEventListener('pointermove', move);
      joystickBase.addEventListener('pointerup', end);
      joystickBase.addEventListener('pointercancel', end);
    }

    if (jumpButton) {
      const trigger = (e) => {
        e.preventDefault();
        this.jumpQueued = true;
      };
      jumpButton.addEventListener('pointerdown', trigger);
    }

    if (dragLayer) {
      dragLayer.addEventListener('pointerdown', (e) => {
        if (this.dragPointerId !== null) return;
        this.dragPointerId = e.pointerId;
        this.lastDragX = e.clientX;
        dragLayer.setPointerCapture(e.pointerId);
      });
      dragLayer.addEventListener('pointermove', (e) => {
        if (e.pointerId !== this.dragPointerId) return;
        const dx = e.clientX - this.lastDragX;
        this.lastDragX = e.clientX;
        this.onCameraDrag(-dx * 0.005);
      });
      const release = (e) => {
        if (e.pointerId !== this.dragPointerId) return;
        this.dragPointerId = null;
      };
      dragLayer.addEventListener('pointerup', release);
      dragLayer.addEventListener('pointercancel', release);
    }
  }

  getMove() {
    let x = 0;
    let z = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) x += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) z += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) z -= 1;
    if (this.joyActive) {
      x += this.joyVec.x;
      z += this.joyVec.z;
    }
    const len = Math.hypot(x, z);
    if (len > 1) { x /= len; z /= len; }
    return { x, z };
  }

  consumeJump() {
    if (this.jumpQueued) {
      this.jumpQueued = false;
      return true;
    }
    return false;
  }
}
