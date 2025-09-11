# Changelog - Dilemme Plastique

Tous les changements notables de ce projet seront documentés dans ce fichier.

## [2025-09-11] 19:50:00

### ⚡ Optimisation majeure des performances de conversation
- **Optimisations serveur** : Simplification du parsing JSON avec suppression des boucles regex complexes
- **Réduction des logs** : Suppression des logs verbeux pour améliorer les temps de réponse
- **Parsing optimisé** : Traitement du champ texte en un seul passage avec regex pré-compilées
- **Compression HTTP** : Ajout du middleware gzip pour réduire la taille des réponses JSON
- **Timeout équilibré** : Ajustement à 20 secondes pour permettre les réponses complexes tout en restant rapide
- **Optimisations client** : Extraction média en un seul passage regex au lieu de passes multiples
- **Nettoyage URL réduit** : Simplification des opérations de nettoyage d'URL
- **Analytics non-bloquantes** : Tous les appels de tracking rendus asynchrones avec setTimeout
- **Résultat** : Amélioration de la stabilité des conversations et réduction des timeouts. Temps de réponse actuels : 7-12 secondes (contre 6-10s+ avec erreurs fréquentes avant). **Note**: Le goulot d'étranglement principal reste le temps de traitement de l'API Flowise elle-même.

## [2025-01-09] 12:20:00

### ✅ Cohérence visuelle de la couleur verte #14B8A7
- **Harmonisation des couleurs** : Unification de la couleur verte (#14B8A7) dans toute l'interface
- **Phrase "Ton guide plastique"** : Changement de `text-green-600` vers `text-teal-500` pour correspondre aux bulles de Peter
- **Boîte d'informations du header** : Application de la couleur exacte #14B8A7 à la boîte affichant thématique/indices/score
- **Résultat** : Cohérence visuelle parfaite entre les bulles de messages de Peter, la phrase descriptive et la boîte d'informations

## [2025-01-09] 11:20:00

### ✅ Intégration complète du widget Rectify Analytics
- **Composant React dédié** : Création de `RectifyWidget.tsx` pour une intégration propre
- **CSP mis à jour** : Autorisation des domaines Rectify (api.rectify.so et *.rectify.so) dans la sécurité
- **Intégration globale** : Widget maintenant disponible sur toute l'application via le composant App principal
- **Chargement asynchrone** : Optimisation pour éviter d'impacter les performances
- **Project ID** : 67fa3feb2c561c2729b9fc5d configuré et fonctionnel
- **Logs de confirmation** : Widget se charge avec succès et s'initialise correctement

## [2025-01-09] 11:00:00

### 🔧 Tentative d'intégration initiale Rectify
- **Script HTML** : Première tentative d'ajout du script Rectify dans `index.html`
- **Problème détecté** : Widget non visible, nécessité d'une intégration React plus robuste
- **Leçon apprise** : L'approche par composant React est plus fiable que l'injection directe de script

---

## Instructions d'utilisation

Ce fichier sert à documenter tous les changements apportés au projet. Pour chaque mise à jour :

1. **Format de date** : [YYYY-MM-DD] HH:MM:SS
2. **Titre descriptif** : Description claire du changement principal
3. **Détails techniques** : Liste des modifications spécifiques avec puces
4. **Impact utilisateur** : Résultat visible ou fonctionnel pour l'utilisateur final

### Catégories de changements
- ✅ **Fonctionnalité ajoutée** : Nouvelles fonctionnalités
- 🔧 **Correction** : Corrections de bugs ou problèmes
- 🎨 **Interface** : Améliorations visuelles ou UX
- ⚡ **Performance** : Optimisations de performance
- 🔒 **Sécurité** : Améliorations de sécurité
- 📱 **Responsive** : Améliorations pour mobiles/tablettes
- 🧪 **Tests** : Ajout ou modification de tests