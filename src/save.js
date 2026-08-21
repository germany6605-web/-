const STORAGE_KEY = 'obby3d_save_v1';

const defaultSave = () => ({
  currentLevel: 0,
  maxLevelReached: 0,
  updatedAt: Date.now(),
});

let ysdk = null;
let player = null;
let cachedSave = null;
let saveInFlight = null;
let pendingSave = null;

function readLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.currentLevel !== 'number') return null;
    return data;
  } catch (e) {
    return null;
  }
}

function writeLocal(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    // storage unavailable (private mode etc.) - ignore, in-memory state still works
  }
}

// Outside the real Yandex Games host, YaGames.init() (and other SDK calls)
// can hang forever waiting for a handshake that will never arrive, which
// would otherwise stall the whole loading screen. Never await an SDK call
// without a timeout that falls back to "no SDK" / localStorage.
function withTimeout(promise, ms) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      resolve(value);
    };
    promise.then(finish).catch(() => finish(null));
    setTimeout(() => finish(null), ms);
  });
}

export async function initYandex() {
  try {
    if (typeof window.YaGames === 'undefined') return null;
    ysdk = await withTimeout(window.YaGames.init(), 4000);
    if (!ysdk) return null;
    player = await withTimeout(ysdk.getPlayer({ scopes: false }), 3000);
    return ysdk;
  } catch (e) {
    ysdk = null;
    return null;
  }
}

export function getYsdk() {
  return ysdk;
}

export async function loadSave() {
  if (player) {
    try {
      const remote = await withTimeout(player.getData(['obby3d']), 3000);
      if (remote && remote.obby3d && typeof remote.obby3d.currentLevel === 'number') {
        cachedSave = remote.obby3d;
        return cachedSave;
      }
    } catch (e) {
      // fall through to local
    }
  }
  cachedSave = readLocal() || defaultSave();
  return cachedSave;
}

function doSave(data) {
  writeLocal(data);
  if (player) {
    return player.setData({ obby3d: data }, true).catch(() => {});
  }
  return Promise.resolve();
}

// Debounced/queued save so rapid checkpoint hits don't spam the SDK.
export function saveProgress(currentLevel, maxLevelReached) {
  const data = { currentLevel, maxLevelReached, updatedAt: Date.now() };
  cachedSave = data;
  writeLocal(data);
  pendingSave = data;
  if (saveInFlight) return;
  const flush = () => {
    const toSave = pendingSave;
    pendingSave = null;
    saveInFlight = doSave(toSave).finally(() => {
      saveInFlight = null;
      if (pendingSave) flush();
    });
  };
  flush();
}

export function getCachedSave() {
  return cachedSave || defaultSave();
}

export function resetSave() {
  const data = defaultSave();
  cachedSave = data;
  writeLocal(data);
  if (player) player.setData({ obby3d: data }, true).catch(() => {});
}
