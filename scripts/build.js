// Construit dist/ à partir de app/ et tamponne la version publiée.
//
// Version = version de package.json + commit court, ex. "0.1.0+a1b2c3d".
// Elle est affichée dans le jeu et sert de nom au cache du service worker :
// Jack voit sur son téléphone exactement quel commit tourne (règle studio :
// "vérifier le commit réellement publié").
//
// Usage : node scripts/build.js [commit]
//   commit : par défaut $GITHUB_SHA, sinon "local".
import { cpSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'app');
const out = join(root, 'dist');

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const commit = (process.argv[2] || process.env.GITHUB_SHA || 'local').slice(0, 7);
const version = `${pkg.version}+${commit}`;

if (existsSync(out)) rmSync(out, { recursive: true, force: true });
cpSync(src, out, { recursive: true });

for (const file of ['index.html', 'sw.js']) {
  const path = join(out, file);
  const before = readFileSync(path, 'utf8');
  if (!before.includes('__VERSION__')) {
    throw new Error(`${file} ne contient pas __VERSION__ : impossible de tamponner la version.`);
  }
  writeFileSync(path, before.replaceAll('__VERSION__', version));
}

// Pour GitHub Pages : pas de traitement Jekyll.
writeFileSync(join(out, '.nojekyll'), '');
writeFileSync(join(out, 'version.txt'), `${version}\n`);

console.log(`dist/ prêt — version ${version}`);
