// Garde-fou contre un bug réel trouvé pendant la mission M-001 :
// les cibles étaient placées avec `transform: translate(...)` alors que
// les animations CSS utilisent la propriété `scale`. `scale` s'applique
// AVANT `transform`, donc le déplacement était lui aussi réduit : la cible
// affichée glissait loin de la zone de touche calculée par logic.js et
// presque toutes les touches comptaient comme ratées sur téléphone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const game = readFileSync(join(root, 'app/game.js'), 'utf8');
const css = readFileSync(join(root, 'app/style.css'), 'utf8');

test('les cibles sont placées avec left/top, jamais avec transform', () => {
  const addTarget = game.match(/function addTarget[\s\S]*?\n}/)[0];
  assert.match(addTarget, /style\.left\s*=/);
  assert.match(addTarget, /style\.top\s*=/);
  assert.doesNotMatch(addTarget, /style\.transform\s*=/);
});

test('aucune règle .target ne combine transform et animation de scale', () => {
  const blocks = [...css.matchAll(/\.target[^{]*\{([^}]*)\}/g)].map((m) => m[1]);
  for (const b of blocks) assert.doesNotMatch(b, /(^|[^-])transform\s*:/);
});
