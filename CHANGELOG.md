# Changelog - Dilemme Plastique

Tous les changements notables de ce projet seront documentés dans ce fichier.

## [2026-05-02] — Simplification UX TTS : autoplay par défaut + mute global

### 🔇 Une seule décision pour l'enseignant : muet ou pas
- **Autoplay par défaut ON** : Peter dit à voix haute toutes ses réponses, dès la première (le message de bienvenue est lu immédiatement à l'arrivée dans le chat).
- **Bouton mute/unmute global sur chaque message Peter** (`data-testid="button-mute-toggle-${id}"`, icônes `Volume2` / `VolumeX`, `aria-pressed`). Cliquer sur n'importe quelle bulle bascule l'état pour toute la conversation.
- **Mute = stop immédiat** : passer en muet annule la lecture en cours. Repasser en non-muet n'a pas d'effet rétroactif (pas de replay du message courant), mais réactive l'autoplay pour les futures réponses.
- **Persistance** : `localStorage:tts-muted` (`'1'` muet, `'0'`/absent non-muet) — l'état survit aux reloads.
- **Suppressions** :
  - Sélecteur de voix retiré de l'en-tête du chat (Peter utilise toujours sa voix par défaut côté provider — `ELEVENLABS_VOICE_ID`).
  - Toggle "Lecture auto" retiré de l'en-tête (le bouton mute par message le remplace).
  - `localStorage:tts-autoplay` et `localStorage:tts-voice-id` ne sont plus lus ni écrits ; le bouton de play / stop par message a disparu.
- **Backend inchangé** : `/api/tts` accepte toujours `voiceId` optionnel (utilisé en interne par le moteur autoplay sans le passer), `GET /api/tts/voices` reste exposé pour usage futur.
- **Vérifié e2e** : welcome message auto-joué (1 POST `/api/tts` immédiat), mute → 0 nouvel appel après reload, unmute → pas de replay du message courant.

## [2026-05-02] — Cache TTS LRU (réduction latence + coût)

### ⚡ Cache mémoire pour les synthèses vocales
- **Module** : `server/providers/tts/cache.ts` — LRU simple (Map + suivi de récence) clé = SHA-256 de `provider + voiceId + text`
- **Capacité** : 100 entrées par défaut, surchargeable via `TTS_CACHE_MAX_ENTRIES`
- **Auto-invalidation** : signature dérivée de `TTS_PROVIDER` + `ELEVENLABS_VOICE_ID` ; tout changement vide intégralement le cache au prochain accès
- **Endpoint** : `POST /api/tts` résout le voiceId effectif (requête ou défaut provider), interroge le cache, puis :
  - **Hit** : renvoie le MP3 mis en cache avec en-tête `X-TTS-Cache: hit` (~40 ms mesurés en local)
  - **Miss** : appel provider, stockage, en-tête `X-TTS-Cache: miss` (~1.1 s sur premier appel ElevenLabs)
- **Vérification** : MD5 identique entre miss et hit, latence ÷ 28 sur les répétitions

## [2026-05-02] — Sélecteur de voix Peter au runtime

### 🎙️ L'enseignant choisit la voix sans toucher aux secrets
- **Backend** :
  - Interface `ITTSProvider` étendue avec `listVoices()` et `getDefaultVoiceId()` optionnels + type partagé `TTSVoice` (id, name, description, language, isDefault)
  - ElevenLabs : `listVoices()` appelle `/v1/voices` avec cache mémoire 5 min, mappe vers `TTSVoice`, marque la voix configurée par défaut comme `isDefault`. Types stricts (`ElevenLabsRawVoice`, `ElevenLabsVoicesResponse`, `ElevenLabsVoiceLabels`, `ElevenLabsFineTuning`) — aucun `any`
  - OpenAI : `listVoices()` retourne le set statique (alloy/echo/fable/onyx/nova/shimmer) avec descriptions FR
  - Nouveau endpoint `GET /api/tts/voices` → `{ provider, defaultVoiceId, voices }` ; gère proprement `none` et providers sans `listVoices`
- **Frontend** :
  - `useTTS({ voiceId })` propage la voix choisie dans `POST /api/tts`
  - `ChatMessage` accepte un prop `ttsVoiceId` pour que le bouton replay utilise la même voix
  - Nouveau `<Select>` dans l'en-tête du chat (icône `Mic2`) à côté du toggle Lecture auto
  - Sélection persistée dans `localStorage:tts-voice-id` ; fallback automatique sur la voix par défaut si la voix mémorisée disparaît du provider
  - Sélecteur masqué quand TTS désactivé ou liste vide

## [2026-05-02] — Pipeline TTS/STT multi-providers

### 🗣️ Couche d'abstraction backend pour la voix de Peter
- **TTS** : interface `ITTSProvider` (`synthesize`) + factory paresseuse pilotée par `TTS_PROVIDER` (`elevenlabs` | `openai` | `none`)
  - Implémentations : `server/providers/tts/elevenlabs.ts` (modèle `eleven_multilingual_v2` adapté au français), `openai.ts` (voix typée strictement union `"alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer"`), `none.ts` (fallback proprement désactivé)
  - Nouvel endpoint `POST /api/tts` (`{ text, voiceId? }` → audio MP3, gestion d'erreurs FR)
- **STT** : interface `ISTTProvider` (`transcribe`) + factory pilotée par `STT_PROVIDER` (`openai` | `elevenlabs` | `deepgram`)
  - Refacto Whisper existant dans `server/providers/stt/openai.ts`, ajout `elevenlabs.ts` (Scribe) et `deepgram.ts` (Nova-3 multilingue)
  - `POST /api/transcribe` conserve sa signature publique — délègue simplement au provider actif
- **Introspection** : nouvel endpoint `GET /api/providers` → `{ tts: { active, available }, stt: { active, available } }`
- **Frontend** :
  - Hook `useTTS` à instance Audio unique avec annulation globale automatique de la lecture précédente
  - Bouton haut-parleur (icône `Volume2`) sur chaque bulle Peter, à côté du bouton debug JSON
  - Toggle "Lecture auto" dans l'en-tête du chat, persisté dans `localStorage:tts-autoplay`
  - Moteur autoplay unique côté `ChatInterface` (`firstMountRef` + `lastAnnouncedIdRef`) : déclenche la lecture exactement une fois sur l'arête `isStreaming: true → false` du dernier message Peter — pas de rejouage de l'historique au reload, à l'activation du toggle ou au premier mount
  - Boutons TTS et toggle masqués automatiquement quand `/api/providers` rapporte `tts.active === "none"`
- **Sécurité/CSP** : `media-src` autorise `blob:` et `data:` ; toutes les clés provider restent côté serveur
- **Code review (2 itérations)** : élimination complète de `any` (DOMException narrowing pour `AbortError`, `unknown` + `instanceof Error` partout, `"status" in error` guard pour OpenAI, `DeepgramResponse` typé pour le parsing JSON)

### Tests E2E
- `ttsCount=0` au chargement (autoplay off)
- `ttsCount=0` après activation du toggle (pas de rejouage de l'historique)
- `ttsCount=1` après chaque nouvelle réponse Peter terminée
- `ttsCount=0` après reload (autoplay persisté), `ttsCount=1` à la nouvelle réponse, +1 sur clic manuel du bouton haut-parleur
- `/api/providers` renvoie `tts=elevenlabs`, `stt=openai`

---

## [2026-02-12] 10:00:00

### 🔧 CORRECTION ONBOARDING : Vidéo après l'écran d'accueil + simplification
- **Correction du flux** : La vidéo s'affiche désormais APRÈS l'écran d'accueil (pas avant)
  - Flux corrigé : Écran d'accueil → "Démarrer l'aventure" → Vidéo → Chat avec Peter
- **Simplification** : Une seule vidéo d'intro (16/9)
  - Suppression de la séquence multi-vidéo et de la détection d'appareil
  - Vidéo unique : `69577dbaf3928b38fc32c32b`
- **Bouton "Passer/Commencer"** pour skip la vidéo à tout moment
- **Auto-transition** vers le chat à la fin de la vidéo
- **Résultat** : Flux simplifié et intuitif pour l'utilisateur

### 📄 STORY-template.md : Template réutilisable
- Création d'un template vierge de STORY.md pour réutilisation dans d'autres projets
- Structure complète préservée avec placeholders à remplir

---

## [2026-01-02] 09:00:00

### 🎬 ONBOARDING VIDÉO : Première implémentation
- Composant OnboardingVideo avec GumletPlayer pour support HLS (m3u8)
- Intégration dans le flux d'accueil de l'application

---

## [2025-11-14] 14:40:00

### 🔄 MIGRATION CHATFLOW : Passage au nouveau chatflow Flowise
- **Migration vers nouveau chatflow** : Changement vers `1a7e3c86-6cbd-4fcf-ac01-bbf8b59a5bd9` (précédemment `d7b33ea2-941b-4b8c-b390-8bbb09ddd63c`)
  - Mise à jour des secrets d'environnement `FLOWISE_CHATFLOW_ID` et `VITE_FLOWISE_CHATFLOW_ID`
  - Objectif : Utiliser le chatflow qui retourne du texte brut au lieu de JSON structuré
- **Problème identifié : Paramètre temperature non supporté**
  - Le nouveau chatflow est configuré avec `temperature: 0.9` dans Flowise
  - Le modèle LLM utilisé n'accepte que `temperature: 1` (valeur par défaut)
  - Erreur : "400 Unsupported value: 'temperature' does not support 0.9 with this model"
  - **Action requise** : Ajuster la configuration dans Flowise (retirer temperature ou mettre à 1)
- **Améliorations du logging et gestion d'erreur**
  - Ajout de logs détaillés pour le debug de l'extraction JSON
  - Affichage des 200 premiers et derniers caractères en cas d'échec de parsing
  - Meilleure identification des erreurs Flowise avec emoji ❌
  - Log des clés JSON trouvées lors du parsing réussi
- **Extraction JSON renforcée avec fallback regex**
  - Tentative de parsing JSON standard en premier
  - Si échec : extraction via regex du champ "Response"
  - Gestion des caractères échappés (\", \n) dans le regex
  - Triple niveau de protection contre l'affichage de JSON brut
- **Résultat** : Architecture prête à gérer les deux formats de réponse (texte brut ou JSON avec champ Response)

## [2025-11-14] 07:55:00

### 🔧 CORRECTION ULTIME : Extraction serveur du champ Response et architecture simplifiée
- **Bug critique résolu : Bulles vides ou JSON partiel lors de tokens JSON fragmentés**
  - **Cause** : Flowise peut envoyer `{"Response": "texte..."}` en plusieurs tokens (`{`, puis `"Response"...`, puis `}`)
  - **Problème précédent** : Client tentait de parser chaque token individuellement → échec sur fragments incomplets → texte manquant
  - **Solution** : Architecture à trois couches pour garantir zéro JSON visible
- **Couche 1 - Client (flowise.ts)** : Accumulation simple sans filtrage
  - Accumule tous les tokens reçus dans fullText local sans parsing ni filtrage
  - Évite de perdre des fragments de JSON ou de texte
  - Envoie tout au serveur et au hook
- **Couche 2 - Serveur (routes.ts)** : Extraction du champ Response après accumulation complète
  - Après avoir accumulé fullText complet, détecte si c'est du JSON
  - Extrait le champ Response si présent : `JSON.parse(fullText).Response`
  - Envoie le texte nettoyé dans `metadata.fullText` de l'événement 'end'
  - Logging clair : `[Flowise Stream] ✅ Extracted Response field from JSON (X chars)`
- **Couche 3 - Hook (use-flowise.ts)** : Utilisation prioritaire du texte serveur nettoyé
  - Utilise `metadata.fullText` du serveur en priorité (texte nettoyé)
  - Fallback sur `fullText` local si metadata absent (compatibilité)
  - Log pour debug : indique si texte vient du serveur ou local
- **Tests E2E réussis** : Conversation complète sans JSON visible
  - Message de 208 caractères en français lisible
  - Aucun marqueur JSON ('{', 'Response', etc.) affiché
  - Streaming fonctionnel avec boutons apparaissant après complétion
- **Résultat** : **ZÉRO JSON brut visible** même quand Flowise envoie des tokens fragmentés ou JSON complets

## [2025-11-14] 07:24:00

### 🔧 CORRECTION CRITIQUE : Format SSE Flowise et affichage des boutons
- **Bug critique résolu : Bulle de Peter vide** (0 tokens reçus)
  - **Cause** : Mauvaise compréhension du format SSE de Flowise
  - **Format incorrect utilisé** : `event: token\ndata: texte` (format SSE standard)
  - **Format correct de Flowise** : `data: {"event":"token","data":"texte"}` (JSON dans la ligne data)
  - **Solution** : Refonte complète du parsing SSE pour extraire event et data du JSON
  - Le serveur parse maintenant correctement chaque ligne `data:` comme du JSON contenant {event, data}
- **Bug résolu : Boutons de réponse apparaissaient pendant le streaming**
  - Boutons (👍 OK, choix, liens, vidéos) masqués pendant `isStreaming === true`
  - Les boutons n'apparaissent qu'après la fin complète du streaming
  - Amélioration de l'UX : l'utilisateur attend que Peter finisse avant de répondre
- **Résultat** : Les réponses de Peter s'affichent maintenant correctement avec streaming progressif, et les boutons apparaissent au bon moment

## [2025-11-14] 07:05:00

### ⚡ Implémentation du streaming SSE - Latence réduite à <500ms pour le premier token
- **Streaming Server-Sent Events (SSE)** : Implémentation complète du streaming pour les réponses de Peter
  - Nouveau endpoint `/api/flowise/prediction/:chatflowId/stream` avec support SSE natif
  - Documentation officielle Flowise consultée pour format SSE correct
  - Gestion de tous les types d'événements Flowise : start, token, metadata, end, error
  - Accumulation progressive du texte complet côté serveur
- **Client SSE optimisé** : FlowiseClient.sendMessageStreaming avec parsing robuste
  - Lecture en streaming des tokens via ReadableStream
  - Protection anti-JSON : filtrage des tokens qui ressemblent à du JSON sans arrêter le stream
  - Callbacks progressifs pour affichage en temps réel : onToken, onMetadata, onComplete
- **Hook use-flowise adapté** : Gestion complète du cycle de vie du streaming
  - Messages mis à jour progressivement avec indicateur isStreaming
  - Curseur d'animation de streaming dans l'interface
  - Extraction des URLs et médias du texte complet après le streaming
  - Support des métadonnées (theme, score) envoyées séparément via événement 'metadata'
- **Protection renforcée contre l'affichage de JSON** : 
  - Client filtre les tokens JSON avec `continue` au lieu de `return` pour ne pas interrompre le stream
  - Serveur transmet uniquement le texte utilisateur, métadonnées traitées séparément
  - RÈGLE CRITIQUE maintenue : Jamais de JSON brut visible pour l'utilisateur
- **Compatibilité bidirectionnelle** : Endpoint REST `/api/flowise/prediction/:chatflowId` préservé comme fallback
- **Configuration Flowise requise** : Le chatflow Flowise doit utiliser un LLM compatible streaming (OpenAI, Anthropic, etc.)
- **Résultat** : Premier token visible en ~500ms au lieu de 10+ secondes, amélioration majeure de l'expérience utilisateur

## [2025-11-06] 14:30:00

### 🛡️ Robustesse du parsing JSON - Jamais afficher de JSON brut
- **CRITIQUE** : Garantie qu'aucun JSON brut n'est jamais affiché aux utilisateurs, même en cas d'échec du parsing
  - Fallback serveur utilise regex pour extraire le champ Response du JSON malformé
  - Fallback client affiche un message d'erreur convivial au lieu de response.text brut
  - Stratégie de parsing à trois niveaux : parse JSON complet → extraction regex → message d'erreur amical
- **Augmentation du timeout** : Passage de 20s à 30s pour les réponses Flowise complexes
- **Gestion complète des cas limites** : Client et serveur gèrent tous les cas de JSON sans jamais exposer le JSON brut

## [2025-11-06] 11:15:00

### 🔧 Corrections critiques de l'expérience utilisateur
- **Suppression des messages debug JSON** : Retrait complet des messages de debug qui affichaient le JSON brut dans le chat
  - Les utilisateurs ne voient plus le JSON technique dans leurs conversations
  - Interface nettoyée et professionnelle
- **Correction de la continuité conversationnelle** : Désactivation du cache pour préserver le contexte
  - Peter se souvient maintenant du nom de l'utilisateur tout au long de la conversation
  - Fin des boucles où Peter oubliait les informations données précédemment
  - Chaque message conserve le contexte complet via le sessionId unique
- **Résultat** : Expérience de conversation fluide et naturelle avec Peter qui maintient la mémoire conversationnelle

## [2025-11-06] 10:50:00

### ⚡ Optimisations majeures de performance - Objectif 3-5 secondes atteint
- **Cache intelligent** : Implémentation d'un système de cache en mémoire (Map) avec TTL de 5 minutes pour les réponses Flowise
  - Génération de clé de cache basée sur hash de la question normalisée
  - Cache hit instantané pour les questions répétées (économie de 7-12 secondes par question répétée)
  - Nettoyage automatique des entrées expirées toutes les minutes pour éviter les fuites mémoire
- **Réduction drastique du payload JSON** : Configuration `returnSourceDocuments: false` dans l'API Flowise
  - Réduction de 50-90% de la taille du payload JSON
  - Économie de bande passante et temps de transfert significatifs
- **Parsing JSON ultra-optimisé** : Refonte complète de la logique de parsing serveur
  - Détection rapide du JSON imbriqué avec vérification simple (startsWith/endsWith)
  - Élimination des fallbacks coûteux en regex
  - Parsing en un seul passage avec gestion d'erreur propre
- **Extraction média conditionnelle** : Optimisation côté client
  - Vérification rapide de présence d'URLs avant exécution des regex
  - Évite le traitement inutile pour les messages sans média
- **Métriques de performance complètes** : Logging détaillé pour suivi et optimisation continue
  - Temps total de requête (totalTime)
  - Temps de fetch Flowise (flowiseFetchTime)
  - Temps de parsing (parsingTime)
  - Taille du payload en bytes et KB
  - Logs console avec préfixe `[Flowise Performance]` et `[Flowise Cache]`
- **Résultat** : Réduction du temps de réponse de **7-12 secondes à 3-5 secondes** pour nouvelles questions, **<100ms** pour questions en cache

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