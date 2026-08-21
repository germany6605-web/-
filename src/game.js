import * as THREE from 'three';
import { Player } from './player.js';
import { InputController } from './input.js';
import { ChaseCamera } from './camera.js';
import { buildLevel, disposeLevel, LEVEL_LENGTH, getHazardMaterial } from './levels.js';
import { TOTAL_LEVELS, themeForLevel, worldForLevel } from './themes.js';
import * as save from './save.js';
import * as ui from './ui.js';

const BUILD_AHEAD = 2;
const KEEP_BEHIND = 1;
const MAX_DT = 1 / 30;

export class Game {
  constructor() {
    this.canvas = document.getElementById('scene');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.camera3 = new THREE.PerspectiveCamera(62, 1, 0.1, 300);
    this.chaseCamera = new ChaseCamera(this.camera3);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x445566, 1.1);
    this.dir = new THREE.DirectionalLight(0xffffff, 1.2);
    this.dir.position.set(-10, 18, 8);
    this.scene.add(this.hemi, this.dir);

    this.player = new Player(this.scene);
    this.player.onDeath = () => this.respawn();

    this.levels = new Map();
    this.currentLevel = 0;
    this.maxLevelReached = 0;
    this.currentWorld = -1;
    this.running = false;

    this.input = new InputController({
      joystickBase: ui.dom.joystickBase,
      joystickKnob: ui.dom.joystickKnob,
      jumpButton: ui.dom.jumpButton,
      dragLayer: ui.dom.dragLayer,
      onCameraDrag: (d) => this.chaseCamera.addYaw(d),
    });

    window.addEventListener('resize', () => this.onResize());
    this.onResize();

    ui.dom.btnContinue.addEventListener('click', () => this.startPlay(save.getCachedSave().currentLevel));
    ui.dom.btnNewGame.addEventListener('click', () => {
      save.resetSave();
      this.startPlay(0);
    });
    ui.dom.btnReplay.addEventListener('click', () => {
      save.resetSave();
      this.startPlay(0);
    });
    ui.dom.btnMenu.addEventListener('click', () => this.pauseToMenu());

    this._clock = new THREE.Clock();
  }

  onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera3.aspect = w / h;
    this.camera3.updateProjectionMatrix();
  }

  showMenu() {
    this.running = false;
    ui.hide(ui.dom.hud);
    ui.hide(ui.dom.controls);
    ui.hide(ui.dom.winScreen);
    ui.updateMenuProgress(save.getCachedSave().maxLevelReached);
    ui.show(ui.dom.menu);
  }

  pauseToMenu() {
    this.showMenu();
  }

  startPlay(levelIndex) {
    const clamped = THREE.MathUtils.clamp(levelIndex, 0, TOTAL_LEVELS - 1);
    ui.hide(ui.dom.menu);
    ui.hide(ui.dom.winScreen);
    ui.show(ui.dom.hud);
    ui.show(ui.dom.controls);
    this.currentLevel = clamped;
    this.maxLevelReached = Math.max(save.getCachedSave().maxLevelReached, clamped);
    this.currentWorld = -1;
    this.ensureLevels(this.currentLevel);
    this.applyTheme(this.currentLevel);
    this.respawn();
    ui.updateHud(this.currentLevel);
    this.running = true;
    this._clock.start();
    if (!this._loopStarted) {
      this._loopStarted = true;
      this.renderer.setAnimationLoop(() => this.tick());
    }
  }

  respawn() {
    const lvl = this.levels.get(this.currentLevel) || this.buildAndRegister(this.currentLevel);
    const spawn = new THREE.Vector3(lvl.startWorld.x, lvl.startWorld.y, lvl.startWorld.z);
    this.player.teleport(spawn);
  }

  buildAndRegister(index) {
    const lvl = buildLevel(index);
    this.scene.add(lvl.group);
    this.levels.set(index, lvl);
    return lvl;
  }

  ensureLevels(centerIndex) {
    const lo = Math.max(0, centerIndex - KEEP_BEHIND);
    const hi = Math.min(TOTAL_LEVELS - 1, centerIndex + BUILD_AHEAD);
    for (let i = lo; i <= hi; i++) {
      if (!this.levels.has(i)) this.buildAndRegister(i);
    }
    for (const [idx, lvl] of this.levels) {
      if (idx < lo || idx > hi) {
        disposeLevel(lvl);
        this.levels.delete(idx);
      }
    }
  }

  applyTheme(levelIndex) {
    const world = worldForLevel(levelIndex);
    if (world === this.currentWorld) return;
    this.currentWorld = world;
    const theme = themeForLevel(levelIndex);
    this.scene.background = new THREE.Color(theme.sky);
    this.scene.fog = new THREE.Fog(theme.fog, 24, 70);
    this.hemi.groundColor.set(theme.hazard);
  }

  collectActiveColliders() {
    let colliders = [];
    let movers = [];
    let hazards = [];
    for (const lvl of this.levels.values()) {
      colliders = colliders.concat(lvl.colliders);
      movers = movers.concat(lvl.movers);
      hazards = hazards.concat(lvl.hazards);
    }
    return { colliders, movers, hazards };
  }

  tick() {
    if (!this.running) return;
    const dt = Math.min(this._clock.getDelta(), MAX_DT);
    const t = performance.now() / 1000;

    for (const lvl of this.levels.values()) {
      for (const m of lvl.movers) {
        const val = m.center + Math.sin(t * m.speed + m.phase) * m.amplitude;
        if (m.axis === 'z') m.mesh.position.z = val;
        else m.mesh.position.y = val;
      }
      for (const h of lvl.hazards) {
        if (h.type === 'blade') {
          h.mesh.rotation.y = h.phase + t * h.speed;
        } else if (h.type === 'orb') {
          h.mesh.position.z = h.center + Math.sin(t * h.speed + h.phase) * h.amplitude;
        }
      }
    }
    const pulse = 0.55 + Math.sin(t * 6) * 0.25;
    getHazardMaterial().color.setRGB(1, pulse * 0.18, pulse * 0.28);

    const move = this.input.getMove();
    if (this.input.consumeJump()) this.player.jump();
    const { colliders, movers, hazards } = this.collectActiveColliders();
    this.player.update(dt, move, colliders, movers, hazards);

    const boundaryIndex = Math.floor((this.player.position.x) / LEVEL_LENGTH);
    if (boundaryIndex > this.currentLevel) {
      if (boundaryIndex >= TOTAL_LEVELS) {
        this.onWin();
      } else {
        this.currentLevel = Math.min(boundaryIndex, TOTAL_LEVELS - 1);
        this.maxLevelReached = Math.max(this.maxLevelReached, this.currentLevel);
        this.ensureLevels(this.currentLevel);
        this.applyTheme(this.currentLevel);
        ui.updateHud(this.currentLevel);
        ui.flashCheckpoint();
        save.saveProgress(this.currentLevel, this.maxLevelReached);
      }
    }

    this.chaseCamera.update(this.player.position, dt);
    this.renderer.render(this.scene, this.camera3);
  }

  onWin() {
    this.running = false;
    this.maxLevelReached = TOTAL_LEVELS;
    save.saveProgress(TOTAL_LEVELS - 1, TOTAL_LEVELS);
    ui.hide(ui.dom.hud);
    ui.hide(ui.dom.controls);
    ui.show(ui.dom.winScreen);
  }
}
