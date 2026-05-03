# Tests end-to-end (Playwright)

Ces tests valident les parcours critiques de bout en bout.

## Prérequis

- L'application doit tourner localement sur `http://127.0.0.1:5000`
  (workflow `Start application` ou `npm run dev`).
- La variable d'environnement `ADMIN_PASSWORD` doit être disponible
  (sinon les tests admin sont automatiquement `skipped`).
- Chromium est installé via Nix (`installSystemDependencies(["chromium"])`).
  Le chemin du binaire est passé à Playwright via la variable
  `CHROMIUM_BIN` ou `PLAYWRIGHT_CHROMIUM_PATH`.

## Lancer les tests

L'application doit déjà être démarrée (workflow `Start application`).

```bash
# Toute la suite e2e
CHROMIUM_BIN=$(which chromium) npx playwright test

# Uniquement le scénario identité + persistance
CHROMIUM_BIN=$(which chromium) npx playwright test tests/e2e/identity-persistence.spec.ts
```

> Note : un script `npm run test:e2e` n'est pas ajouté à `package.json`
> volontairement (le fichier est marqué "fragile" dans la configuration
> projet). Utiliser `npx playwright test` est strictement équivalent.

## Notes

- La session est créée anonyme côté serveur (le prénom n'est plus
  capturé via formulaire — il est recueilli plus tard en conversation).
  Le test génère uniquement un suffixe unique pour le message
  utilisateur afin de retrouver la conversation sans collisionner avec
  les données réelles.
- Le message de bienvenue de Peter (déclenché par
  `button-watched-video`) sert d'assertion déterministe : il prouve la
  persistance d'un message Peter sans dépendre de Flowise.
- En complément, le test attend (best-effort, jusqu'à 30 s) qu'un
  second message Peter — la réponse au message utilisateur — soit
  persisté. Si Flowise est indisponible dans l'env de test, l'assertion
  best-effort est consignée mais ne fait pas échouer le test.
