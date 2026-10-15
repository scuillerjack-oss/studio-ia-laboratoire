#!/usr/bin/env python3
"""Aspire une PWA publiée (HTML, JS, CSS, manifest, service worker, images,
sons, données) pour en conserver une copie fidèle dans le dépôt.

Sert à sauver les jeux dont le code source a été perdu mais dont la version
publiée est encore en ligne. Lecture seule sur le site distant.

Usage : python3 aspirer_pwa.py <url_de_depart> <dossier_de_sortie>
"""
import json
import re
import sys
import urllib.parse
import urllib.error
import urllib.request
from collections import deque
from pathlib import Path

START, OUT = sys.argv[1], Path(sys.argv[2])
BASE = urllib.parse.urlsplit(START)
HOST = BASE.netloc
MAX_FILES = 3000
TEXT_EXT = ('.html', '.htm', '.js', '.mjs', '.css', '.json', '.webmanifest', '.txt', '.svg', '.xml', '.map')
ASSET_EXT = ('js mjs css json webmanifest html htm png jpg jpeg webp gif svg ico avif mp3 ogg wav m4a '
             'woff woff2 ttf otf txt xml map wasm glb gltf bin csv').split()
COMMON = ['manifest.webmanifest', 'manifest.json', 'sw.js', 'service-worker.js', 'serviceworker.js',
          'version.json', 'version.txt', 'asset-manifest.json', 'robots.txt', 'favicon.ico']

ext_re = '|'.join(ASSET_EXT)
PATTERNS = [
    re.compile(r'''(?:src|href|data-src|poster)\s*=\s*["']([^"'#]+)["']''', re.I),
    re.compile(r'''url\(\s*["']?([^"')]+)["']?\s*\)''', re.I),
    re.compile(r'''(?:import|from|importScripts\(|fetch\()\s*["']([^"']+)["']'''),
    re.compile(r'''["'`]((?:\.{0,2}/)?[\w\-./@%]+\.(?:''' + ext_re + r'''))(?:\?[^"'`]*)?["'`]''', re.I),
]


def same_site(url):
    p = urllib.parse.urlsplit(url)
    return p.scheme in ('http', 'https') and p.netloc == HOST


def local_path(url):
    p = urllib.parse.urlsplit(url)
    path = urllib.parse.unquote(p.path)
    if path.endswith('/') or path == '':
        path += 'index.html'
    return OUT / path.lstrip('/')


def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Linux; Android 14) archive-studio'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.status, r.read(), r.headers.get('content-type', '')


OUT.mkdir(parents=True, exist_ok=True)
root = f'{BASE.scheme}://{HOST}/'
queue = deque([START, root] + [root + c for c in COMMON])
seen, saved, missing = set(), [], []

while queue and len(saved) < MAX_FILES:
    url = urllib.parse.urldefrag(queue.popleft())[0]
    key = url.split('?')[0]
    if key in seen or not same_site(url):
        continue
    seen.add(key)
    try:
        status, body, ctype = fetch(url)
    except urllib.error.HTTPError as e:  # 404 attendus pour les noms « courants » devinés
        detail = e.read()[:300].decode('utf-8', 'replace').replace('\n', ' ')
        missing.append(f'{key} -> HTTP {e.code} {detail}')
        continue
    except Exception as e:
        missing.append(f'{key} -> {type(e).__name__}: {e}')
        continue
    dest = local_path(key)
    # Une page d'erreur HTML servie à la place d'un .js/.json n'est pas gardée.
    if 'text/html' in ctype and not dest.suffix.lower() in ('.html', '.htm', ''):
        missing.append(f'{key} -> page HTML renvoyée (fichier absent)')
        continue
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(body)
    saved.append(key)

    if dest.suffix.lower() in TEXT_EXT or 'text' in ctype or 'javascript' in ctype or 'json' in ctype:
        text = body.decode('utf-8', 'replace')
        for pat in PATTERNS:
            for m in pat.findall(text):
                ref = m.strip()
                if ref.startswith(('data:', 'blob:', 'javascript:', 'mailto:', '#')):
                    continue
                queue.append(urllib.parse.urljoin(url, ref))
                # Les chemins relatifs dans un JS sont souvent relatifs à la racine du site.
                if not ref.startswith(('/', 'http', '.')):
                    queue.append(urllib.parse.urljoin(root, ref))

(OUT / '_archive.json').write_text(json.dumps({
    'source': START,
    'fichiers_sauves': sorted(saved),
    'introuvables': sorted(missing),
}, indent=2, ensure_ascii=False))
print(f'{START} : {len(saved)} fichiers sauvés, {len(missing)} introuvables')
