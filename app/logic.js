/**
 * CIBLE — logique de jeu pure.
 *
 * Ce module n'utilise ni le DOM, ni window, ni localStorage : il est testable
 * sous Node. Le hasard (rng) et le temps (nowMs, en millisecondes) sont toujours
 * fournis par l'appelant.
 *
 * Convention : les fonctions qui font évoluer la partie MODIFIENT l'objet state
 * reçu (simple et économe pour une boucle d'animation) et renvoient un petit
 * objet « événement » décrivant ce qui s'est passé, utile pour l'affichage.
 *
 * Structures
 * ----------
 * GameState = {
 *   width, height      : dimensions de la zone de jeu (px, origine en haut à gauche)
 *   radius             : rayon des cibles (px)
 *   hitSlop            : tolérance de touche (multiplicateur du rayon, ≥ 1)
 *   durationMs         : durée de la partie (30 000 ms par défaut)
 *   startMs            : instant de début (ms)
 *   nowMs              : dernier instant connu (ms)
 *   over               : true quand la partie est terminée
 *   score              : points cumulés
 *   combo              : touches réussies consécutives en cours
 *   bestCombo          : meilleur combo de la partie
 *   hits, misses, expired : compteurs statistiques
 *   targets            : Target[] — cibles actuellement visibles
 *   nextId             : identifiant de la prochaine cible
 *   nextSpawnMs        : instant de la prochaine apparition automatique
 *   maxTargets         : nombre maximal de cibles simultanées
 * }
 *
 * Target = { id, x, y, r, bornMs, expiresMs }   (x, y = centre de la cible)
 *
 * Difficulty = { spawnIntervalMs, lifetimeMs }
 */

export const GAME_DURATION_MS = 30_000;
export const COMBO_BONUS_EVERY = 5;

/** Bornes de difficulté : début de partie (facile) → fin de partie (difficile). */
export const DIFFICULTY = Object.freeze({
  spawnIntervalStartMs: 900,
  spawnIntervalMinMs: 350,
  lifetimeStartMs: 1600,
  lifetimeMinMs: 700,
});

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Crée une nouvelle partie.
 * @param {object} [options]
 * @param {number} [options.width=360]
 * @param {number} [options.height=640]
 * @param {number} [options.radius=36]
 * @param {number} [options.hitSlop=1.2]
 * @param {number} [options.durationMs=30000]
 * @param {number} [options.startMs=0]
 * @param {number} [options.maxTargets=4]
 * @returns {GameState}
 */
export function createGame(options = {}) {
  const {
    width = 360,
    height = 640,
    radius = 36,
    hitSlop = 1.2,
    durationMs = GAME_DURATION_MS,
    startMs = 0,
    maxTargets = 4,
  } = options;
  return {
    width,
    height,
    radius,
    hitSlop,
    durationMs,
    startMs,
    nowMs: startMs,
    over: false,
    score: 0,
    combo: 0,
    bestCombo: 0,
    hits: 0,
    misses: 0,
    expired: 0,
    targets: [],
    nextId: 1,
    nextSpawnMs: startMs,
    maxTargets,
  };
}

/**
 * Difficulté en fonction du temps écoulé : progression linéaire de la valeur
 * de départ vers la valeur minimale sur la durée de la partie, bornée des deux côtés.
 * @param {number} elapsedMs
 * @param {number} [durationMs=30000]
 * @returns {{spawnIntervalMs:number, lifetimeMs:number}}
 */
export function difficultyAt(elapsedMs, durationMs = GAME_DURATION_MS) {
  const t = clamp((Number(elapsedMs) || 0) / durationMs, 0, 1);
  return {
    spawnIntervalMs: Math.round(lerp(DIFFICULTY.spawnIntervalStartMs, DIFFICULTY.spawnIntervalMinMs, t)),
    lifetimeMs: Math.round(lerp(DIFFICULTY.lifetimeStartMs, DIFFICULTY.lifetimeMinMs, t)),
  };
}

/** Partie terminée ? */
export function isOver(state) {
  return state.over === true;
}

/** Temps restant en ms (jamais négatif). */
export function remainingMs(state, nowMs = state.nowMs) {
  if (state.over) return 0;
  return Math.max(0, state.startMs + state.durationMs - nowMs);
}

/** Met à jour les dimensions de la zone (rotation, redimensionnement). */
export function resize(state, width, height) {
  state.width = width;
  state.height = height;
  return state;
}

/**
 * Décale toutes les échéances de deltaMs (reprise après une pause, par
 * exemple quand l'onglet repasse au premier plan).
 */
export function shiftTime(state, deltaMs) {
  if (state.over || !(deltaMs > 0)) return state;
  state.startMs += deltaMs;
  state.nowMs += deltaMs;
  state.nextSpawnMs += deltaMs;
  for (const t of state.targets) {
    t.bornMs += deltaMs;
    t.expiresMs += deltaMs;
  }
  return state;
}

/** Termine la partie si la durée est atteinte. Renvoie true si elle est finie. */
function checkEnd(state, nowMs) {
  if (state.over) return true;
  if (nowMs - state.startMs >= state.durationMs) {
    state.over = true;
    state.targets = [];
    state.nowMs = Math.max(state.nowMs, nowMs);
    return true;
  }
  return false;
}

/**
 * Fait apparaître une cible à une position aléatoire entièrement dans la zone.
 * @param {GameState} state
 * @param {number} nowMs
 * @param {() => number} rng fonction renvoyant un nombre dans [0, 1)
 * @returns {Target|null} la cible créée, ou null (partie finie / zone pleine)
 */
export function spawnTarget(state, nowMs, rng) {
  if (checkEnd(state, nowMs)) return null;
  const { spawnIntervalMs, lifetimeMs } = difficultyAt(nowMs - state.startMs, state.durationMs);
  state.nextSpawnMs = nowMs + spawnIntervalMs;
  if (state.targets.length >= state.maxTargets) return null;

  const r = state.radius;
  const spanX = Math.max(0, state.width - 2 * r);
  const spanY = Math.max(0, state.height - 2 * r);
  const target = {
    id: state.nextId++,
    x: r + rng() * spanX,
    y: r + rng() * spanY,
    r,
    bornMs: nowMs,
    expiresMs: nowMs + lifetimeMs,
  };
  state.targets.push(target);
  state.nowMs = Math.max(state.nowMs, nowMs);
  return target;
}

/**
 * Traite une touche aux coordonnées (x, y) de la zone de jeu.
 * Réussite : +1 point, +1 combo, +1 bonus quand le combo est multiple de 5.
 * Ratée : combo remis à 0.
 * @returns {{type:'hit', target:Target, points:number, bonus:boolean, combo:number}
 *          |{type:'miss'}|{type:'ignored'}}
 */
export function handleTap(state, x, y, nowMs) {
  if (checkEnd(state, nowMs)) return { type: 'ignored' };
  state.nowMs = Math.max(state.nowMs, nowMs);

  let best = null;
  let bestDist = Infinity;
  for (const t of state.targets) {
    if (t.expiresMs <= nowMs) continue;
    const d = Math.hypot(x - t.x, y - t.y);
    if (d <= t.r * state.hitSlop && d < bestDist) {
      best = t;
      bestDist = d;
    }
  }

  if (!best) {
    state.combo = 0;
    state.misses += 1;
    return { type: 'miss' };
  }

  state.targets = state.targets.filter((t) => t !== best);
  state.combo += 1;
  state.hits += 1;
  state.bestCombo = Math.max(state.bestCombo, state.combo);
  const bonus = state.combo % COMBO_BONUS_EVERY === 0;
  const points = 1 + (bonus ? 1 : 0);
  state.score += points;
  return { type: 'hit', target: best, points, bonus, combo: state.combo };
}

/**
 * Avance la partie jusqu'à nowMs : fin de partie, expiration des cibles
 * (combo remis à 0) et, si rng est fourni, apparition automatique des cibles.
 * @param {GameState} state
 * @param {number} nowMs
 * @param {() => number} [rng]
 * @returns {{ended:boolean, expired:Target[], spawned:Target[]}}
 */
export function update(state, nowMs, rng) {
  const result = { ended: false, expired: [], spawned: [] };
  if (state.over) return result;
  if (checkEnd(state, nowMs)) {
    result.ended = true;
    return result;
  }
  state.nowMs = Math.max(state.nowMs, nowMs);

  const alive = [];
  for (const t of state.targets) {
    if (t.expiresMs <= nowMs) result.expired.push(t);
    else alive.push(t);
  }
  if (result.expired.length > 0) {
    state.targets = alive;
    state.expired += result.expired.length;
    state.combo = 0;
  }

  if (typeof rng === 'function' && nowMs >= state.nextSpawnMs) {
    const t = spawnTarget(state, nowMs, rng);
    if (t) result.spawned.push(t);
  }
  return result;
}
