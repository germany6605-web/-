import { Game } from './game.js';
import * as save from './save.js';
import * as ui from './ui.js';

async function boot() {
  ui.setLoadingProgress(0.15);

  const ysdk = await save.initYandex();
  ui.setLoadingProgress(0.55);

  await save.loadSave();
  ui.setLoadingProgress(0.85);

  const game = new Game();
  window.__game = game;

  if (ysdk?.features?.LoadingAPI?.ready) {
    ysdk.features.LoadingAPI.ready();
  }

  ui.setLoadingProgress(1);
  ui.hide(ui.dom.loading);
  game.showMenu();

  const gp = ysdk?.features?.GameplayAPI;
  if (gp) {
    const origStart = game.startPlay.bind(game);
    game.startPlay = (idx) => { origStart(idx); gp.start(); };
    const origPause = game.pauseToMenu.bind(game);
    game.pauseToMenu = () => { origPause(); gp.stop(); };
    const origWin = game.onWin.bind(game);
    game.onWin = () => { origWin(); gp.stop(); };
  }
}

boot();
