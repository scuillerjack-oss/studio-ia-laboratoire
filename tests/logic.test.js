import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame,
  spawnTarget,
  handleTap,
  update,
  difficultyAt,
  isOver,
  remainingMs,
  shiftTime,
  GAME_DURATION_MS,
  DIFFICULTY,
} from '../app/logic.js';

/** rng déterministe renvoyant les valeurs données en boucle. */
function seq(...values) {
  let i = 0;
  return () => values[i++ % values.length];
}

/** Ajoute une cible fixe à (x, y) et la renvoie. */
function placeTarget(state, x, y, nowMs) {
  const r = state.radius;
  const rng = seq((x - r) / (state.width - 2 * r), (y - r) / (state.height - 2 * r));
  return spawnTarget(state, nowMs, rng);
}

test('createGame : état initial', () => {
  const s = createGame({ width: 400, height: 800, startMs: 1000 });
  assert.equal(s.score, 0);
  assert.equal(s.combo, 0);
  assert.equal(s.over, false);
  assert.deepEqual(s.targets, []);
  assert.equal(s.durationMs, GAME_DURATION_MS);
  assert.equal(GAME_DURATION_MS, 30_000);
  assert.equal(s.width, 400);
  assert.equal(s.height, 800);
  assert.equal(isOver(s), false);
  assert.equal(remainingMs(s, 1000), 30_000);
});

test('spawnTarget : position déterministe et dans la zone', () => {
  const s = createGame({ width: 400, height: 800, radius: 40 });
  const t = spawnTarget(s, 0, seq(0.5, 0.25));
  assert.ok(t);
  assert.equal(t.x, 40 + 0.5 * 320);
  assert.equal(t.y, 40 + 0.25 * 720);
  assert.equal(t.r, 40);
  assert.equal(t.bornMs, 0);
  assert.equal(t.expiresMs, difficultyAt(0).lifetimeMs);
  assert.equal(s.targets.length, 1);

  // Bords : rng = 0 et rng ≈ 1 restent dans la zone
  const a = spawnTarget(s, 10, seq(0, 0));
  const b = spawnTarget(s, 20, seq(0.999999, 0.999999));
  for (const c of [a, b]) {
    assert.ok(c.x - c.r >= 0 && c.x + c.r <= 400);
    assert.ok(c.y - c.r >= 0 && c.y + c.r <= 800);
  }
  assert.notEqual(a.id, b.id);
});

test('spawnTarget : même rng → même résultat', () => {
  const s1 = createGame();
  const s2 = createGame();
  const t1 = spawnTarget(s1, 100, seq(0.3, 0.7));
  const t2 = spawnTarget(s2, 100, seq(0.3, 0.7));
  assert.deepEqual(t1, t2);
});

test('spawnTarget : respecte maxTargets', () => {
  const s = createGame({ maxTargets: 2 });
  assert.ok(spawnTarget(s, 0, seq(0.1)));
  assert.ok(spawnTarget(s, 0, seq(0.5)));
  assert.equal(spawnTarget(s, 0, seq(0.9)), null);
  assert.equal(s.targets.length, 2);
});

test('handleTap : touche réussie', () => {
  const s = createGame({ width: 400, height: 800, radius: 40 });
  const t = placeTarget(s, 200, 300, 0);
  const res = handleTap(s, 205, 295, 100);
  assert.equal(res.type, 'hit');
  assert.equal(res.target.id, t.id);
  assert.equal(s.score, 1);
  assert.equal(s.combo, 1);
  assert.equal(s.targets.length, 0);
});

test('handleTap : touche ratée casse le combo', () => {
  const s = createGame({ width: 400, height: 800, radius: 40 });
  placeTarget(s, 200, 300, 0);
  placeTarget(s, 100, 600, 0);
  handleTap(s, 200, 300, 50);
  assert.equal(s.combo, 1);
  const res = handleTap(s, 380, 50, 60);
  assert.equal(res.type, 'miss');
  assert.equal(s.combo, 0);
  assert.equal(s.score, 1, 'le score ne baisse pas');
  assert.equal(s.misses, 1);
  assert.equal(s.targets.length, 1, 'la cible restante est intacte');
});

test('handleTap : bonus +1 à chaque 5e touche consécutive', () => {
  const s = createGame({ width: 400, height: 800, radius: 40 });
  const scores = [];
  for (let i = 1; i <= 10; i++) {
    placeTarget(s, 200, 400, i * 100);
    const res = handleTap(s, 200, 400, i * 100 + 10);
    assert.equal(res.type, 'hit');
    assert.equal(res.bonus, i % 5 === 0);
    scores.push(s.score);
  }
  assert.deepEqual(scores, [1, 2, 3, 4, 6, 7, 8, 9, 10, 12]);
  assert.equal(s.combo, 10);
  assert.equal(s.bestCombo, 10);
});

test('handleTap : le bonus repart de zéro après un raté', () => {
  const s = createGame({ width: 400, height: 800, radius: 40 });
  let now = 0;
  for (let i = 0; i < 4; i++) {
    placeTarget(s, 200, 400, (now += 100));
    handleTap(s, 200, 400, (now += 10));
  }
  handleTap(s, 10, 10, (now += 10)); // raté
  for (let i = 0; i < 4; i++) {
    placeTarget(s, 200, 400, (now += 100));
    handleTap(s, 200, 400, (now += 10));
  }
  assert.equal(s.score, 8, 'pas de bonus : jamais 5 touches consécutives');
});

test('update : une cible expirée disparaît et casse le combo', () => {
  const s = createGame({ width: 400, height: 800, radius: 40 });
  placeTarget(s, 200, 300, 0);
  handleTap(s, 200, 300, 10);
  const t = placeTarget(s, 100, 100, 20);
  assert.equal(s.combo, 1);

  let res = update(s, t.expiresMs - 1);
  assert.equal(res.expired.length, 0);
  assert.equal(s.targets.length, 1);

  res = update(s, t.expiresMs);
  assert.equal(res.expired.length, 1);
  assert.equal(res.expired[0].id, t.id);
  assert.equal(s.targets.length, 0);
  assert.equal(s.combo, 0);
  assert.equal(s.expired, 1);
  assert.equal(s.score, 1);
});

test('handleTap : une cible expirée ne peut plus être touchée', () => {
  const s = createGame({ width: 400, height: 800, radius: 40 });
  const t = placeTarget(s, 200, 300, 0);
  const res = handleTap(s, 200, 300, t.expiresMs);
  assert.equal(res.type, 'miss');
  assert.equal(s.score, 0);
});

test('update : apparition automatique avec rng', () => {
  const s = createGame();
  const rng = seq(0.4, 0.6);
  let res = update(s, 0, rng);
  assert.equal(res.spawned.length, 1);
  res = update(s, 10, rng);
  assert.equal(res.spawned.length, 0, 'pas avant l\'intervalle');
  res = update(s, difficultyAt(0).spawnIntervalMs, rng);
  assert.equal(res.spawned.length, 1);
});

test('difficultyAt : monte avec le temps et reste bornée', () => {
  const d0 = difficultyAt(0);
  const d10 = difficultyAt(10_000);
  const d20 = difficultyAt(20_000);
  const d30 = difficultyAt(30_000);
  assert.equal(d0.spawnIntervalMs, DIFFICULTY.spawnIntervalStartMs);
  assert.equal(d0.lifetimeMs, DIFFICULTY.lifetimeStartMs);
  assert.ok(d10.spawnIntervalMs < d0.spawnIntervalMs);
  assert.ok(d20.spawnIntervalMs < d10.spawnIntervalMs);
  assert.ok(d10.lifetimeMs < d0.lifetimeMs);
  assert.ok(d20.lifetimeMs < d10.lifetimeMs);
  assert.equal(d30.spawnIntervalMs, DIFFICULTY.spawnIntervalMinMs);
  assert.equal(d30.lifetimeMs, DIFFICULTY.lifetimeMinMs);
  // Bornes hors plage
  assert.deepEqual(difficultyAt(1_000_000), d30);
  assert.deepEqual(difficultyAt(-5000), d0);
  assert.deepEqual(difficultyAt(NaN), d0);
});

test('fin de partie à 30 s', () => {
  const s = createGame({ startMs: 5000 });
  update(s, 5000 + 29_999, seq(0.5));
  assert.equal(isOver(s), false);
  assert.ok(remainingMs(s, 5000 + 29_999) > 0);
  const res = update(s, 5000 + 30_000, seq(0.5));
  assert.equal(res.ended, true);
  assert.equal(isOver(s), true);
  assert.equal(s.targets.length, 0);
  assert.equal(remainingMs(s), 0);
});

test('aucune action après la fin', () => {
  const s = createGame({ width: 400, height: 800, radius: 40 });
  placeTarget(s, 200, 300, 0);
  handleTap(s, 200, 300, 10);
  update(s, 30_000);
  assert.equal(isOver(s), true);
  const snapshot = structuredClone(s);

  assert.equal(spawnTarget(s, 30_100, seq(0.5)), null);
  assert.equal(handleTap(s, 200, 300, 30_200).type, 'ignored');
  const res = update(s, 31_000, seq(0.5));
  assert.equal(res.ended, false);
  assert.equal(res.spawned.length, 0);
  assert.deepEqual(s, snapshot);
});

test('shiftTime : une pause ne consomme ni le temps ni les cibles', () => {
  const s = createGame({ width: 400, height: 800, radius: 40 });
  const t = placeTarget(s, 200, 300, 1000);
  const expires = t.expiresMs;
  shiftTime(s, 10_000);
  assert.equal(s.startMs, 10_000);
  assert.equal(t.expiresMs, expires + 10_000);
  assert.equal(update(s, expires + 5000).expired.length, 0);
  assert.equal(remainingMs(s, 11_000), 29_000);
});

test('touche après 30 s sans update préalable : ignorée et partie finie', () => {
  const s = createGame({ width: 400, height: 800, radius: 40 });
  placeTarget(s, 200, 300, 29_900);
  const res = handleTap(s, 200, 300, 30_000);
  assert.equal(res.type, 'ignored');
  assert.equal(s.score, 0);
  assert.equal(isOver(s), true);
});
