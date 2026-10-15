# studio-ia-laboratoire

Laboratoire du studio : la chaîne complète **mission → code → tests → bêta PWA sur Android**,
démontrée avec le mini-jeu **CIBLE** (touche un maximum de cibles en 30 secondes).

## Comment ça marche pour Jack
1. Tu donnes une mission à Claude dans l'app (ou via une Issue « Nouvelle mission »).
2. Claude et ses sous-agents codent sur une branche, testent, et ouvrent une **Pull Request**.
3. Tu reçois la notification GitHub. ✓ vert = tests OK. Tu fusionnes depuis l'app GitHub.
4. La bêta est publiée automatiquement : https://scuillerjack-oss.github.io/studio-ia-laboratoire/
5. Le jeu installé sur ton téléphone se met à jour tout seul à la prochaine ouverture.
   La version affichée en bas de l'accueil (ex. `v0.1.0+a1b2c3d`) te dit quel commit tourne.

## Mise en route (une seule fois, depuis le téléphone)
1. **Settings → General → Danger Zone → Change visibility → Public**
   (GitHub Pages gratuit n'existe que pour les dépôts publics ; tes jeux sont déjà publics).
2. **Settings → Pages → Build and deployment → Source : GitHub Actions**.
3. Fusionner la Pull Request de la mission M-001.
4. Ouvrir l'URL de bêta dans Chrome → menu ⋮ → **Installer l'application**.

## Développement
- `npm test` — 23 tests (logique du jeu, installabilité PWA, mise à jour, garde-fous de rendu).
- `npm run build` — produit `dist/` avec la version tamponnée.
- Règles du studio : [`CLAUDE.md`](CLAUDE.md). Fiches de mission : [`docs/missions/`](docs/missions/).
