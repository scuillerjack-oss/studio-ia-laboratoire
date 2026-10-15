/*
 * Enregistre le service worker et applique les mises à jour sans action
 * de l'utilisateur : quand un nouveau déploiement prend la main, la page
 * se recharge une fois sur la nouvelle version.
 */
(function () {
  if (!('serviceWorker' in navigator)) return;

  var hadController = !!navigator.serviceWorker.controller;
  var reloading = false;

  navigator.serviceWorker.addEventListener('controllerchange', function () {
    // Première installation : pas de rechargement, la page est déjà à jour.
    if (!hadController) { hadController = true; return; }
    if (reloading) return;
    reloading = true;
    // Ne jamais couper une partie ni masquer le score de fin : si une partie
    // est en cours, la nouvelle version s'applique quand on quitte l'appli.
    // (Le nouveau service worker sert déjà les nouveaux fichiers.)
    if (document.documentElement.dataset.enPartie) {
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') window.location.reload();
      });
      return;
    }
    window.location.reload();
  });

  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').then(function (registration) {
      // Vérifie une nouvelle version à chaque retour dans l'appli.
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') {
          registration.update().catch(function () {});
        }
      });
    }).catch(function () {});
  });
})();
