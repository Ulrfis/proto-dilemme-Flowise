# Changelog

Toutes les modifications notables de ce projet seront documentées dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/),
et ce projet adhère au [Versioning Sémantique](https://semver.org/lang/fr/).

## [Non publié]

### Ajouté
- Interface en écran partagé : interface de chat (1/3 largeur) avec panneau média (2/3 largeur) toujours visible
- Intégration du chatbot Flowise "Peter" pour conversations éducatives
- Lecteur vidéo Gumlet intégré pour le contenu éducatif dans un panneau dédié
- Webview in-app : les liens externes s'ouvrent dans l'application dans un panneau d'article dédié
- Système de défilement indépendant du chat - le chat défile sans affecter le panneau média
- Gestion des types de messages : messages d'information (bouton pouce levé), questions ouvertes, et messages avec liens (formatage en gras)
- Intégration vidéo YouTube avec lecteur embarqué propre - sans superpositions distrayantes ou vidéos connexes
- Analyses de base pour l'utilisation anonyme
- Conformité d'accessibilité WCAG 2.1 AA

### Modifié
- Mise à jour du message initial de Peter pour correspondre au ton futuriste spécifié 2025
- Amélioration du panneau média avec des composants lecteur vidéo et webview améliorés
- Nettoyage des URL pour supprimer la ponctuation finale de tous les liens
- Focus sur l'intégration simple du chat avec intégration de médias

### Supprimé
- Fonctionnalité de chemins de conversation ramifiés
- Conversations interactives pilotées par scénario

### Technique
- Configuration initiale du projet terminée
- Intégration Flowise entièrement opérationnelle et testée
- Frontend React avec TypeScript utilisant Wouter pour le routage
- Backend Express.js avec stockage en mémoire
- Gestion CORS pour les appels API Flowise
- Composants shadcn/ui avec Tailwind CSS
- Sécurité TypeScript pour la sûreté des types

## Structure du Projet

### Architecture
- **Frontend** : React avec TypeScript et Wouter pour le routage
- **Backend** : Express.js avec stockage en mémoire
- **Chat** : Intégration chatbot Flowise avec embedding personnalisé  
- **Vidéo** : Lecteur Gumlet pour la lecture de médias
- **Navigation** : Webview in-app pour les liens externes

### Exigences Techniques
- Viewport de bureau minimum 1024px de largeur
- Pas d'authentification utilisateur ou de comptes
- Utilisation anonyme avec analyses de base
- Optimisé pour l'utilisation en classe sur desktop/laptop
- Langue française pour tout le contenu et l'interface utilisateur
- Durée de session : 20-30 minutes d'utilisation typique
- Pas de composants audio dans la première version (conversations texte uniquement)