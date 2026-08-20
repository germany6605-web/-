import { TOTAL_LEVELS, themeForLevel } from './themes.js';

const el = (id) => document.getElementById(id);

export const dom = {
  loading: el('loading'),
  loadingFill: el('loadingFill'),
  menu: el('menu'),
  menuProgress: el('menuProgress'),
  btnContinue: el('btnContinue'),
  btnNewGame: el('btnNewGame'),
  winScreen: el('winScreen'),
  btnReplay: el('btnReplay'),
  hud: el('hud'),
  levelNum: el('levelNum'),
  worldName: el('worldName'),
  progressFill: el('progressFill'),
  btnMenu: el('btnMenu'),
  checkpointToast: el('checkpointToast'),
  controls: el('controls'),
  joystickBase: el('joystickBase'),
  joystickKnob: el('joystickKnob'),
  jumpButton: el('jumpButton'),
  dragLayer: el('dragLayer'),
};

export function setLoadingProgress(pct) {
  dom.loadingFill.style.width = `${Math.round(pct * 100)}%`;
}

export function show(elm) { elm.classList.remove('hidden'); }
export function hide(elm) { elm.classList.add('hidden'); }

export function updateHud(levelIndex) {
  const theme = themeForLevel(levelIndex);
  dom.levelNum.textContent = `Уровень ${levelIndex + 1} / ${TOTAL_LEVELS}`;
  dom.worldName.textContent = theme.name;
  dom.progressFill.style.width = `${((levelIndex + 1) / TOTAL_LEVELS) * 100}%`;
}

export function updateMenuProgress(maxLevelReached) {
  dom.menuProgress.textContent = `Пройдено уровней: ${maxLevelReached} / ${TOTAL_LEVELS}`;
}

let toastTimer = null;
export function flashCheckpoint() {
  show(dom.checkpointToast);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => hide(dom.checkpointToast), 1400);
}
