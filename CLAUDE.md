# Règles du studio — à lire par toute session Claude sur ce dépôt

Jack est le propriétaire et le seul décideur. Il pilote depuis son téléphone Android,
souvent depuis un chantier : messages courts, livrables prêts à l'emploi, en français.

## Le cycle du studio
1. **Brainstorming** avec Jack → idées triées.
2. **Cahier des charges** → `docs/missions/M-XXX.md` (modèle : `docs/FICHE-PROJET.md`). Jack valide.
3. **Développement** → Claude + sous-agents, sur une branche `mission/M-XXX-description`.
4. **Pull Request** → tests automatiques (workflow `Tests`). Jack lit le résumé, fusionne.
5. **Bêta** → la fusion dans `main` déploie sur GitHub Pages ; la PWA installée se met à jour seule.
6. **Retour de bêta** de Jack → nouveau brainstorming ou nouvelle mission.

## Interdits sans accord explicite de Jack, écrit dans la conversation
- Fusionner dans `main`, pousser directement sur `main`, `git push --force`, `git reset --hard`
  sur une branche partagée, supprimer une branche, un fichier de jeu ou un dépôt.
- Reconstruire un jeu « de zéro » à la place de l'existant.
- Créer ou activer quoi que ce soit de payant (API, hébergement, abonnement).
- Mettre une clé, un mot de passe ou un keystore dans le dépôt (→ GitHub Secrets uniquement).
- Travailler sur plusieurs missions en même temps.

## Obligatoire à chaque mission
- `npm test` vert avant tout push. Ajouter un test pour chaque bug corrigé.
- Vérifier le jeu dans un vrai navigateur mobile (Playwright est disponible dans l'environnement).
- Mettre à jour la fiche de mission (état, décisions, version publiée).
- Monter `version` dans `package.json` pour chaque nouvelle bêta.
- En cas de doute ou d'ambiguïté : s'arrêter et poser UNE question claire à Jack.

## Technique
- PWA sans build ni dépendance : `app/` est servi tel quel ; `scripts/build.js` copie vers
  `dist/` et remplace `__VERSION__` par `version+commit` (affiché dans le jeu, nom du cache SW).
- Tous les chemins sont relatifs : le site vit sous `/<nom-du-depot>/`.
- `app/logic.js` reste pur (pas de DOM) pour être testable sous Node.
