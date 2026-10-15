// Vérifie que la PWA reste installable et se met à jour seule.
// Ces tests protègent la chaîne de livraison : si l'un casse, la bêta ne
// sera pas déployée (le workflow lance npm test avant le build).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = (p) => join(root, 'app', p);
const read = (p) => readFileSync(app(p), 'utf8');

function pngSize(file) {
  const buf = readFileSync(file);
  assert.equal(buf.toString('ascii', 1, 4), 'PNG', `${file} n'est pas un PNG`);
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

test('le manifest contient ce que Chrome Android exige pour installer', () => {
  const m = JSON.parse(read('manifest.webmanifest'));
  for (const key of ['name', 'short_name', 'start_url', 'display', 'icons']) {
    assert.ok(m[key], `champ manquant : ${key}`);
  }
  assert.ok(['standalone', 'fullscreen', 'minimal-ui'].includes(m.display));
  assert.ok(!m.start_url.startsWith('/'), 'start_url doit être relatif (site servi en sous-dossier)');
  const sizes = m.icons.map((i) => i.sizes);
  assert.ok(sizes.includes('192x192') && sizes.includes('512x512'), 'icônes 192 et 512 obligatoires');
  for (const icon of m.icons) {
    const [w, h] = pngSize(app(icon.src));
    assert.equal(`${w}x${h}`, icon.sizes, `taille réelle de ${icon.src} différente du manifest`);
  }
});

test('index.html déclare le manifest, la version et le service worker', () => {
  const html = read('index.html');
  assert.match(html, /<link rel="manifest" href="manifest\.webmanifest">/);
  assert.match(html, /id="app-version"[^>]*>__VERSION__</);
  assert.match(html, /<script[^>]+src="sw-register\.js"/);
  assert.match(html, /name="viewport"/);
  assert.doesNotMatch(html, /(src|href)="\//, 'aucun chemin absolu : le site est servi sous /studio-ia-laboratoire/');
});

test('tous les fichiers mis en cache par le service worker existent', () => {
  const sw = read('sw.js');
  const list = sw.match(/const PRECACHE = \[([\s\S]*?)\]/)[1];
  const files = [...list.matchAll(/'\.\/([^']*)'/g)].map((m) => m[1]).filter(Boolean);
  assert.ok(files.length > 5);
  for (const f of files) assert.ok(existsSync(app(f)), `fichier précaché introuvable : ${f}`);
});

test('le service worker se met à jour seul à chaque version', () => {
  const sw = read('sw.js');
  assert.match(sw, /const VERSION = '__VERSION__'/);
  assert.match(sw, /cible-\$\{VERSION\}/, 'le nom du cache doit dépendre de la version');
  assert.match(sw, /skipWaiting\(\)/);
  assert.match(sw, /clients\.claim\(\)/);
  assert.match(read('sw-register.js'), /controllerchange/);
});

test('le build tamponne la version partout et ne laisse aucun __VERSION__', () => {
  execFileSync('node', [join(root, 'scripts/build.js'), 'abc1234def'], { cwd: root });
  const dist = (p) => readFileSync(join(root, 'dist', p), 'utf8');
  const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const expected = `${version}+abc1234`;
  assert.equal(dist('version.txt').trim(), expected);
  assert.ok(dist('index.html').includes(expected));
  assert.ok(dist('sw.js').includes(`'${expected}'`));
  assert.ok(!dist('index.html').includes('__VERSION__'));
  assert.ok(!dist('sw.js').includes('__VERSION__'));
  rmSync(join(root, 'dist'), { recursive: true, force: true });
});
