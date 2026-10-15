// CIBLE — couche navigateur : DOM, boucle d'animation, entrées tactiles, meilleur score.
// Toute la logique de jeu est dans ./logic.js (pure, testée sous Node).

import {
  createGame,
  update,
  handleTap,
  isOver,
  remainingMs,
  resize,
  shiftTime,
} from './logic.js';

const BEST_KEY = 'cible.bestScore';

const $ = (sel) => document.querySelector(sel);

const els = {
  screens: {
    home: $('#screen-home'),
    game: $('#screen-game'),
    end: $('#screen-end'),
  },
  playBtn: $('#btn-play'),
  replayBtn: $('#btn-replay'),
  homeBest: $('#home-best'),
  area: $('#play-area'),
  hudScore: $('#hud-score'),
  hudTime: $('#hud-time'),
  hudCombo: $('#hud-combo'),
  endScore: $('#end-score'),
  endBest: $('#end-best'),
  endRecord: $('#end-record'),
  endStats: $('#end-stats'),
  versionLabels: document.querySelectorAll('[data-version-label]'),
};

// ---------- Meilleur score (localStorage protégé) ----------

let memoryBest = 0; // repli si localStorage est indisponible

function loadBest() {
  try {
    const raw = window.localStorage.getItem(BEST_KEY);
    const n = Number.parseInt(raw ?? '0', 10);
    if (Number.isFinite(n) && n > memoryBest) memoryBest = n;
  } catch {
    /* stockage indisponible : on garde la valeur en mémoire */
  }
  return memoryBest;
}

function saveBest(score) {
  if (score > memoryBest) memoryBest = score;
  try {
    window.localStorage.setItem(BEST_KEY, String(memoryBest));
  } catch {
    /* stockage indisponible : ignoré */
  }
}

// ---------- Version ----------

function readVersion() {
  const el = document.getElementById('app-version');
  const text = el ? el.textContent.trim() : '';
  if (!text || text === '__VERSION__') return 'dev';
  return text;
}

// ---------- Écrans ----------

function showScreen(name) {
  for (const [key, el] of Object.entries(els.screens)) {
    if (!el) continue;
    const active = key === name;
    el.hidden = !active;
    el.classList.toggle('is-active', active);
  }
}

// ---------- Partie ----------

let state = null;
let rafId = 0;
const targetEls = new Map(); // id -> élément DOM
let hiddenAt = null;
let lastHud = { score: -1, time: -1, combo: -1 };

const rng = Math.random;
const now = () => performance.now();

function areaSize() {
  const r = els.area.getBoundingClientRect();
  return { width: Math.max(1, r.width), height: Math.max(1, r.height) };
}

function targetRadius(width, height) {
  // Cibles généreuses au doigt : ~11 % du plus petit côté, entre 28 et 48 px.
  return Math.round(Math.min(48, Math.max(28, Math.min(width, height) * 0.11)));
}

function startGame() {
  clearTargets();
  showScreen('game');
  // La zone doit être visible pour être mesurée.
  const { width, height } = areaSize();
  state = createGame({ width, height, radius: targetRadius(width, height), startMs: now() });
  lastHud = { score: -1, time: -1, combo: -1 };
  renderHud();
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(loop);
  // Signale à sw-register.js qu'une mise à jour doit attendre la fin de partie.
  document.documentElement.dataset.enPartie = '1';
}

function loop() {
  if (!state) return;
  const t = now();
  const res = update(state, t, rng);
  for (const target of res.expired) removeTarget(target.id, 'expire');
  for (const target of res.spawned) addTarget(target);
  renderHud();
  if (isOver(state)) {
    endGame();
    return;
  }
  rafId = requestAnimationFrame(loop);
}

function endGame() {
  cancelAnimationFrame(rafId);
  delete document.documentElement.dataset.enPartie;
  clearTargets();
  const previousBest = loadBest();
  const score = state.score;
  const record = score > previousBest;
  saveBest(score);
  els.endScore.textContent = String(score);
  els.endBest.textContent = String(memoryBest);
  els.endRecord.hidden = !record;
  els.endStats.textContent =
    `${state.hits} touchée${state.hits > 1 ? 's' : ''} · ` +
    `${state.misses} ratée${state.misses > 1 ? 's' : ''} · ` +
    `meilleur combo ×${state.bestCombo}`;
  els.homeBest.textContent = String(memoryBest);
  showScreen('end');
  // Évite qu'un tap encore en cours déclenche immédiatement « Rejouer ».
  els.replayBtn.disabled = true;
  setTimeout(() => {
    els.replayBtn.disabled = false;
  }, 600);
}

// ---------- Rendu ----------

function renderHud() {
  if (!state) return;
  const secs = Math.ceil(remainingMs(state, now()) / 1000);
  if (secs !== lastHud.time) {
    els.hudTime.textContent = String(secs);
    els.hudTime.parentElement.classList.toggle('is-urgent', secs <= 5);
    lastHud.time = secs;
  }
  if (state.score !== lastHud.score) {
    els.hudScore.textContent = String(state.score);
    lastHud.score = state.score;
  }
  if (state.combo !== lastHud.combo) {
    els.hudCombo.textContent = `×${state.combo}`;
    els.hudCombo.parentElement.classList.toggle('is-hot', state.combo >= 5);
    lastHud.combo = state.combo;
  }
}

function addTarget(t) {
  const el = document.createElement('div');
  el.className = 'target';
  el.style.width = el.style.height = `${t.r * 2}px`;
  // Position via left/top, PAS via transform : les animations CSS utilisent
  // la propriété `scale`, qui s'applique avant `transform` et décalerait la
  // cible affichée par rapport à la zone de touche calculée par logic.js.
  el.style.left = `${t.x - t.r}px`;
  el.style.top = `${t.y - t.r}px`;
  el.style.setProperty('--life', `${t.expiresMs - t.bornMs}ms`);
  el.setAttribute('aria-hidden', 'true');
  els.area.appendChild(el);
  targetEls.set(t.id, el);
}

function removeTarget(id, reason) {
  const el = targetEls.get(id);
  if (!el) return;
  targetEls.delete(id);
  el.classList.add(reason === 'hit' ? 'is-hit' : 'is-expired');
  setTimeout(() => el.remove(), 220);
}

function clearTargets() {
  for (const el of targetEls.values()) el.remove();
  targetEls.clear();
  if (els.area) {
    for (const el of els.area.querySelectorAll('.target, .pop')) el.remove();
  }
}

function popText(x, y, text, kind) {
  const el = document.createElement('div');
  el.className = `pop pop--${kind}`;
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  els.area.appendChild(el);
  setTimeout(() => el.remove(), 650);
}

function flashMiss() {
  els.area.classList.remove('is-miss');
  // force un reflow pour relancer l'animation
  void els.area.offsetWidth;
  els.area.classList.add('is-miss');
}

// ---------- Entrées ----------

function onPointerDown(ev) {
  if (!state || isOver(state)) return;
  ev.preventDefault();
  const rect = els.area.getBoundingClientRect();
  const x = ev.clientX - rect.left;
  const y = ev.clientY - rect.top;
  const t = now();
  const res = handleTap(state, x, y, t);
  if (res.type === 'hit') {
    removeTarget(res.target.id, 'hit');
    popText(res.target.x, res.target.y, res.bonus ? '+2 COMBO' : '+1', res.bonus ? 'bonus' : 'hit');
    if (res.bonus && navigator.vibrate) {
      try { navigator.vibrate(30); } catch { /* ignoré */ }
    }
  } else if (res.type === 'miss') {
    flashMiss();
  }
  renderHud();
  if (isOver(state)) endGame();
}

function onResize() {
  if (!state || isOver(state)) return;
  const { width, height } = areaSize();
  resize(state, width, height);
}

function onVisibility() {
  if (!state || isOver(state)) return;
  if (document.hidden) {
    hiddenAt = now();
    cancelAnimationFrame(rafId);
  } else if (hiddenAt !== null) {
    // Pause : le temps passé en arrière-plan ne compte pas.
    const delta = now() - hiddenAt;
    hiddenAt = null;
    shiftTime(state, delta);
    rafId = requestAnimationFrame(loop);
  }
}

// ---------- Initialisation ----------

function init() {
  const version = readVersion();
  for (const el of els.versionLabels) el.textContent = `v${version}`.replace(/^vv/, 'v');

  els.homeBest.textContent = String(loadBest());
  els.playBtn.addEventListener('click', startGame);
  els.replayBtn.addEventListener('click', startGame);
  els.area.addEventListener('pointerdown', onPointerDown, { passive: false });
  els.area.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', onVisibility);
  showScreen('home');
}

init();
