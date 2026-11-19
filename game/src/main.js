// Boot: build the game, wire the screens' buttons, and either run the loop
// or stage one screenshot scene (?shot=chase|plaza|mission|night&seed=N).
// In shot mode the scene is painted and window.__solmarReady is set, so a
// screenshot script knows the frame is real and ready.
import { createGame } from './game.js';
import { stageShot } from './shots.js';
import { loadSave } from './save.js';

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 1;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const game = createGame(canvas, { seed, shot: shot || undefined, document });
window.__solmar = game;

function announce(message) {
  if (status) status.textContent = message;
}

function refreshContinue() {
  const cont = document.getElementById('btn-continue');
  if (cont) cont.disabled = !loadSave();
}

function bindButtons() {
  const newGame = document.getElementById('btn-new');
  const cont = document.getElementById('btn-continue');
  const resume = document.getElementById('btn-resume');
  const restart = document.getElementById('btn-restart');
  const mute = document.getElementById('btn-mute');
  const help = document.getElementById('btn-help');
  const helpBack = document.getElementById('btn-help-back');
  const helpPanel = document.getElementById('help-panel');
  if (newGame) newGame.addEventListener('click', () => game.startGame(true));
  if (cont) cont.addEventListener('click', () => game.startGame(false));
  if (resume) resume.addEventListener('click', () => game.resume());
  if (restart) restart.addEventListener('click', () => game.startGame(true));
  if (mute) {
    mute.addEventListener('click', () => {
      game.toggleMute();
      game.audio.start();
    });
  }
  if (help && helpPanel) {
    help.addEventListener('click', () => helpPanel.classList.add('show'));
  }
  if (helpBack && helpPanel) {
    helpBack.addEventListener('click', () => helpPanel.classList.remove('show'));
  }
  canvas.addEventListener('click', () => {
    if (game.state.screen === 'playing') game.audio.start();
  });
  // Enter on the title screen starts a new game, so the game is playable
  // without a mouse at all.
  window.addEventListener('keydown', (event) => {
    if (event.code === 'Enter' && game.state.screen === 'title') game.startGame(true);
  });
  // A save written in another tab (or by the autosave) re-enables Continue.
  window.addEventListener('pageshow', refreshContinue);
  window.addEventListener('focus', refreshContinue);
}

// Buttons are wired in shot mode too: the mute button sits on the HUD in
// every screenshot scene, and a dead button in a staged frame is a bug a
// judge can click.
bindButtons();

if (shot) {
  const scene = stageShot(shot, game);
  game.run();
  // Let the loop paint a few frames (traffic settles, the beacon pulses),
  // then tell the screenshot script the frame is ready.
  let painted = 0;
  function waitPaint() {
    painted += 1;
    if (painted >= 4) {
      window.__solmarReady = true;
      window.__solmarShot = scene;
    } else {
      requestAnimationFrame(waitPaint);
    }
  }
  requestAnimationFrame(waitPaint);
  announce(`Solmar Bay screenshot scene: ${scene.name}.`);
} else {
  refreshContinue();
  game.run();
  announce('Solmar Bay. A sun-soaked open-world crime game. Press New Game to start.');
}
