# Latence Peter — Analyse & Plan d'optimisation

> **Dernière mise à jour** : 2026-05-02
> **Statut** : Plan validé, implémentation à venir
> **Périmètre** : latence de bout en bout entre la fin de la parole/saisie de l'élève et l'audio de Peter

---

## Sommaire

1. [Historique des analyses précédentes](#historique-des-analyses-précédentes)
2. [Diagnostic mai 2026 (mesures réelles)](#diagnostic-mai-2026-mesures-réelles)
3. [Causes ranked par impact](#causes-ranked-par-impact)
4. [Plan initial — 7 pistes étudiées](#plan-initial--7-pistes-étudiées)
5. [Plan choisi — implémentation complète](#plan-choisi--implémentation-complète)
6. [Tâches détaillées](#tâches-détaillées)
7. [Métriques cibles & instrumentation](#métriques-cibles--instrumentation)
8. [Références](#références)

---

## Historique des analyses précédentes

### Février 2026 — première analyse (Warp Agent)

Le document précédent identifiait 5 goulots et proposait 5 solutions. **Statut actuel** :

| Solution proposée (fév. 2026) | Statut |
|---|---|
| 1. Token batching React (50 ms) | ✅ **Appliquée** dans `client/src/hooks/use-flowise.ts` |
| 2. Pass-through serveur (parser uniquement `end`) | ❌ Non appliquée — le serveur parse toujours chaque token (compromis : nécessaire pour métriques + extraction JSON `Response`) |
| 3. Reconfigurer chatflow Flowise (texte plat sans JSON) | ❌ Non appliquée — le chatflow renvoie toujours du JSON (`{"Response": "..."}`) |
| 4. Migrer vers `flowise-sdk` officiel | ❌ Non appliquée |
| 5. Streaming direct client → Flowise (CORS) | ❌ Non appliquée |

**Optimisations latérales déjà appliquées** (non listées dans le doc fév.) :

- ✅ `returnSourceDocuments: false` côté serveur
- ✅ Cache LRU TTS (`server/providers/tts/cache.ts`) — 28× plus rapide sur répétitions
- ✅ Compression Express désactivée pour SSE via `Cache-Control: no-transform`
- ✅ `AbortController` pour annuler les streams concurrents
- ✅ `requestAnimationFrame` pour l'auto-scroll (anti-thrashing)

**Conclusion historique** : les pistes "client side" (batching, scroll) sont prises. Les pistes "Flowise side" (chatflow, SDK, CORS direct) restent ouvertes mais elles n'expliquent **pas** la latence observée aujourd'hui.

---

## Diagnostic mai 2026 (mesures réelles)

### Trace complète d'un échange (logs serveur du 2026-05-02 17:44)

```
17:43:21  Arrivée sur le chat
17:44:00  L'élève finit de parler
17:44:02  Fin transcription audio                       (1 902 ms STT)
17:44:03  POST /api/flowise/prediction/.../stream       ← début appel Flowise
          → 11 cycles d'événements `agentFlowEvent`,
            `nextAgentFlow`, `agentFlowExecutedData`
            (chaque cycle = un nœud du flow exécuté séquentiellement)
          → puis `calledTools`, `usedTools`, `usageMetadata`
17:44:15  Premier token reçu                            (12 420 ms après l'envoi !)
17:44:23  Stream terminé                                (313 tokens, ~20 s total)
17:44:23  POST /api/tts                                 ← TTS démarre seulement maintenant
17:44:32  TTS retourné                                  (9 451 ms — cache MISS)
17:44:32  Audio Peter audible
```

**Latence de bout en bout : ~30 secondes** entre la fin de la parole et l'audio.

### Décomposition par source

| Source | Latence observée | % du total | Sous notre contrôle ? |
|---|---|---|---|
| 🔴 **Flowise — premier token** | 12 420 ms | 41 % | Partiel (architecture chatflow + cold start) |
| 🟡 **Flowise — streaming reste** | ~8 000 ms | 27 % | Non (vitesse LLM choisi) |
| 🟡 **TTS synthèse 1ère fois** | 9 451 ms | 31 % | Oui (chunking, cache, pré-warm) |
| 🟢 **STT** | 1 902 ms | 6 % | Partiel (parallélisable) |
| 🟢 **Overhead serveur** (proxy SSE, JSON parse, compression) | ~30 ms | <1 % | Oui |

### Cause racine principale

Le chatflow `1a7e3c86-6cbd-4fcf-ac01-bbf8b59a5bd9` est un **Agent Flow Flowise multi-étapes**. Les logs montrent **11 cycles** d'exécution de nœuds **avant** que le LLM ne commence à générer :

```
agentFlowEvent → nextAgentFlow → nextAgentFlow → agentFlowExecutedData    ← cycle 1
agentFlowEvent → nextAgentFlow → nextAgentFlow → agentFlowExecutedData    ← cycle 2
... (×11)
calledTools → usedTools → usageMetadata
[Premier token]
```

Deux contributeurs probables aux 12,4 s :

1. **Architecture séquentielle du chatflow** : 11 nœuds exécutés l'un après l'autre. Si certains sont indépendants (RAG retrieval + classification d'intention par exemple), ils pourraient tourner en parallèle.
2. **Cold start** : la requête a été émise ~25 min après le démarrage du serveur, sans trafic Flowise entre temps. `replit.md` documentait "first token ~500 ms" en régime établi → les 12,4 s actuels suggèrent fortement un cold start de l'instance Flowise self-hostée.

---

## Causes ranked par impact

| Rang | Cause | Latence ajoutée | Levier |
|---|---|---|---|
| 1 | Cold start Flowise (instance idle) | jusqu'à 10-12 s | Keep-alive ping |
| 2 | Étapes séquentielles du chatflow | 5-8 s | Audit + simplification du flow |
| 3 | TTS attend la fin de la réponse complète | 5-9 s perçus | TTS streaming par phrase |
| 4 | TTS welcome message non préchauffé | 9 s sur 1er contact | Pré-warm au boot |
| 5 | STT séquentiel avant Flowise | 1,9 s | Pré-établissement connexion HTTP |
| 6 | Logs serveur verbeux (25 console.log/req) | 10-30 ms + bruit | Regroupement |
| 7 | Aucun feedback pendant les 12 s d'attente | 0 ms réel, perception −30 % | Indicateurs visuels d'étapes |

---

## Plan initial — 7 pistes étudiées

Détail des 7 pistes telles que présentées en mode Plan, avec pour/contre/enjeux/gain.

### 🥇 Piste 1 — Keep-alive Flowise (anti-cold-start)

| Aspect | Détail |
|---|---|
| **Idée** | Ping toutes les 30 s vers le chatflow Flowise pour garder l'instance chaude |
| **Gain estimé** | **−8 à −10 s** sur le premier token quand l'app est restée inactive |
| **Pour** | Élimine le pire cas. Triviale à implémenter. Self-host = gratuit. |
| **Contre** | Si Flowise tourne déjà always-on, ping inutile. À mesurer avant/après. |
| **Effort** | ~30 min |

### 🥇 Piste 2 — TTS streaming par phrase

| Aspect | Détail |
|---|---|
| **Idée** | Découper la réponse en phrases (`.`, `?`, `!`) et synthétiser chaque phrase au fur et à mesure qu'elle arrive plutôt qu'attendre la fin du stream. |
| **Gain estimé** | **Audio audible ~5 s plus tôt** (effet perçu énorme : Peter "commence à parler" presque tout de suite après son 1er token) |
| **Pour** | Effet ressenti maximal. Le cache LRU existant continue de servir pour les phrases répétées. |
| **Contre** | Découpage FR non trivial (M., etc., chiffres décimaux). +2-3× requêtes TTS (atténué par cache). Risque de blanc entre 2 segments. |
| **Effort** | ~2 h |

### 🥈 Piste 3 — Audit & simplification du chatflow Flowise

| Aspect | Détail |
|---|---|
| **Idée** | Récupérer la config du chatflow via `GET /api/v1/chatflows/{id}`, analyser les 11 nœuds séquentiels, identifier ce qui peut être (a) supprimé, (b) parallélisé, (c) caché. |
| **Gain estimé** | **−5 à −8 s** sur le premier token, en régime établi (sans cold start) |
| **Pour** | Attaque la cause racine. Bénéfice durable. |
| **Contre** | Modifier le chatflow = risque de casser la logique pédagogique de Peter. Demande accès Flowise UI pour les modifs réelles (l'audit lui peut se faire via API). |
| **Effort** | 30 min audit (script API) + 1-3 h modif Flowise UI |

### 🥈 Piste 4 — STT + Flowise en parallèle (HTTP keep-alive)

| Aspect | Détail |
|---|---|
| **Idée** | Pré-établir la connexion TCP/TLS vers Flowise dès que l'élève parle/tape. Utiliser un agent `undici` avec `keepAlive: true` pour réutiliser les connexions. |
| **Gain estimé** | **−200 à −500 ms** (DNS + TLS handshake économisés) |
| **Pour** | Gratuit. Améliore aussi les requêtes répétées. |
| **Contre** | Modeste. Connexion gaspillée si l'élève change d'avis. |
| **Effort** | ~30 min |

### 🥉 Piste 5 — Indicateurs visuels riches pendant l'attente

| Aspect | Détail |
|---|---|
| **Idée** | Afficher l'étape en cours pendant les 12 s : "Peter cherche dans ses sources…" pendant `agentFlowEvent`, "Peter consulte ses outils…" pendant `calledTools`, "Peter rédige…" au 1er token. |
| **Gain estimé** | **0 ms réel**, **perception +30 %** (loi de Hick) |
| **Pour** | Pédagogiquement riche. Utilise les événements déjà émis (qu'on ignore). |
| **Contre** | Ne change pas la latence réelle. |
| **Effort** | ~1 h |

### 🥉 Piste 6 — Nettoyage logs serveur

| Aspect | Détail |
|---|---|
| **Idée** | Remplacer les 25 `console.log("[Flowise Stream] Unknown event type: ...")` par requête par un seul log de fin synthétique : `{nodes_executed: 11, tools_called: 2, ttft_ms: 12420}`. |
| **Gain estimé** | **−10 à −30 ms** par requête + lisibilité logs ×10 |
| **Pour** | Trivial. |
| **Contre** | Aucun. |
| **Effort** | ~10 min |

### 🥉 Piste 7 — Pré-warm TTS du welcome message au boot

| Aspect | Détail |
|---|---|
| **Idée** | Dans le callback `serving on port`, lancer un `POST /api/tts` interne sur le texte exact du welcome message. Cache LRU déjà en place → 1ère lecture instantanée. |
| **Gain estimé** | **−9 s** sur le 1er contact (welcome audible immédiatement) |
| **Pour** | Premier contact avec Peter ressenti comme fluide. |
| **Contre** | Cache mémoire perdu à chaque restart → pré-warm utile à chaque déploiement. |
| **Effort** | ~20 min |

---

## Plan choisi — implémentation complète

Décision validée par le créateur (2026-05-02) : **on attaque les 7 pistes**, dans un ordre optimisé pour minimiser les dépendances et maximiser le ROI immédiat.

### Ordre d'exécution

```
T1 (Audit Flowise)  ──┐
                      ├──> T3 (Simplification chatflow)
T2 (Keep-alive)    ───┤
T6 (Logs)         ────┤
T4 (HTTP keep-alive) ─┤
T7 (Pré-warm TTS)  ───┤
                      ├──> T5 (Indicateurs visuels)
                      │
                      └──> T8 (TTS streaming par phrase)  ← le plus gros gain perçu
```

**Logique de priorisation** :
1. **T1 + T2 + T6 + T7** d'abord : quick-wins indépendants, baseline immédiate
2. **T4** : optimisation infra (HTTP pool) — peut tourner en parallèle de T2
3. **T3** : audit nourri par T1 → modification chatflow Flowise (hors codebase)
4. **T5** : utilise les événements Flowise → dépend de la stabilité du parsing actuel
5. **T8** : la pièce maîtresse côté client, à faire en dernier pour bénéficier de tous les gains amont

### Gain cumulé attendu

| Avant | Après plan complet (cible) |
|---|---|
| Premier token : 12,4 s (cold) / ~500 ms (warm) | **<800 ms en toutes circonstances** (keep-alive supprime cold start) |
| Audio audible après le 1er message : ~30 s | **<8 s** (T8 démarre l'audio après la 1ère phrase, ~2-3 s après le 1er token) |
| Welcome message audible : 9 s | **<200 ms** (T7) |
| Perception d'attente : silencieuse | Riche (T5) |

---

## Tâches détaillées

### T1 — Audit du chatflow Flowise via API

**Objectif** : récupérer et analyser la config JSON du chatflow `1a7e3c86-6cbd-4fcf-ac01-bbf8b59a5bd9` pour identifier les nœuds optimisables.

- **Bloquée par** : aucune
- **Fichiers à créer** :
  - `scripts/flowise-chatflow-audit.ts` (script TS one-shot)
  - `docs/flowise-chatflow-audit-report.md` (rapport généré)
- **Implémentation** :
  1. Appeler `GET ${FLOWISE_HOST}/api/v1/chatflows/${FLOWISE_CHATFLOW_ID}` avec `FLOWISE_API_KEY`
  2. Parser le `flowData` (JSON contenant nodes + edges)
  3. Détecter les patterns coûteux : RAG sequential retrieval, multiple LLM calls, tool calls non-paralléllisés, prompt long
  4. Générer un rapport markdown avec : liste des nœuds, ordre d'exécution observé (corrélation avec les `agentFlowEvent` des logs), recommandations classées
- **Acceptance** :
  - `npx tsx scripts/flowise-chatflow-audit.ts` produit un rapport lisible en <5 s
  - Le rapport identifie au moins 2 nœuds candidats à optimisation
  - 0 secret loggé/écrit

### T2 — Keep-alive Flowise (anti-cold-start)

**Objectif** : maintenir l'instance Flowise self-hostée chaude par un ping périodique.

- **Bloquée par** : aucune
- **Fichiers à modifier** :
  - `server/index.ts` (démarrage du ping après `serving on port`)
  - `server/routes.ts` (logging du résultat du ping pour observabilité)
  - `replit.md` (mise à jour section Flowise)
- **Implémentation** :
  1. Créer `server/flowise-warmer.ts` avec `startFlowiseWarmer({ intervalMs: 30_000 })`
  2. Endpoint pingé : `GET ${FLOWISE_HOST}/api/v1/ping` (à confirmer — sinon `HEAD /api/v1/chatflows/${id}`)
  3. Désactivable via env `FLOWISE_KEEPALIVE=0` (utile en tests)
  4. Log toutes les 5 min : "[FlowiseWarmer] N pings, M succès, latence moy X ms"
- **Acceptance** :
  - Au démarrage : "[FlowiseWarmer] Started (interval: 30s, target: ${FLOWISE_HOST})"
  - Après 5 min d'inactivité : 1ère requête utilisateur a un TTFT comparable à une requête immédiate (mesuré via logs T6)
  - Pas de spam log : groupe les pings en une seule ligne synthétique

### T3 — Simplification du chatflow Flowise (hors codebase)

**Objectif** : appliquer les recommandations du rapport T1 dans l'UI Flowise.

- **Bloquée par** : T1
- **Fichiers** : aucun (modifs dans Flowise UI). Documenter dans `docs/flowise-chatflow-changes.md` les changements appliqués.
- **Implémentation** : session interactive avec le créateur sur l'UI Flowise, guidée par le rapport T1.
- **Acceptance** :
  - Avant/après : nombre de nœuds, TTFT mesuré sur 5 requêtes types
  - Aucune régression sur la qualité pédagogique des réponses (validation manuelle sur 3 scénarios)

### T4 — HTTP keep-alive serveur → Flowise

**Objectif** : réutiliser les connexions TCP/TLS entre le serveur Express et Flowise.

- **Bloquée par** : aucune
- **Fichiers à modifier** :
  - `server/routes.ts` (remplacer `fetch()` global par un fetch utilisant un agent dédié)
  - `server/flowise-fetch.ts` (nouveau — wrapper avec agent `undici` keep-alive)
- **Implémentation** :
  1. Créer un singleton `undici.Agent` avec `keepAliveTimeout: 60_000, keepAliveMaxTimeout: 600_000`
  2. Exporter `flowiseFetch(path, opts)` qui injecte `dispatcher: agent`
  3. Remplacer les 2 `fetch()` Flowise (streaming + non-streaming) dans `routes.ts`
- **Acceptance** :
  - Logs montrent `connection: keep-alive` dans les requêtes vers Flowise (mesurable via instrumentation T6)
  - Sur 5 requêtes consécutives, le TLS handshake n'est mesuré qu'une seule fois

### T5 — Indicateurs visuels riches d'étapes

**Objectif** : informer l'élève de ce que Peter fait pendant l'attente, à partir des événements Flowise.

- **Bloquée par** : T6 (instrumentation des événements en place)
- **Fichiers à modifier** :
  - `server/routes.ts` (forwarder un événement `data: {event: 'progress', data: {label, nodeName}}` au client à chaque `agentFlowEvent`/`calledTools`)
  - `client/src/lib/flowise.ts` (parser l'événement `progress`)
  - `client/src/hooks/use-flowise.ts` (state `currentStepLabel`)
  - `client/src/components/chat/ChatMessage.tsx` (afficher le label sous "Peter réfléchit…")
- **Implémentation** :
  1. Mapping `nodeName → labelFR` dans `server/flowise-progress-labels.ts` (ex : `LLMChain` → "Peter rédige sa réponse", `VectorStoreRetriever` → "Peter cherche dans ses sources", `Tool` → "Peter consulte un outil")
  2. Fallback générique pour les nœuds non mappés
  3. Animation `…` discrète, désactivable via prefers-reduced-motion
- **Acceptance** :
  - Pendant un appel Flowise de 12 s, l'élève voit au moins 2 changements de label
  - Aucun label JSON brut n'est affiché
  - Test e2e couvre l'affichage et la disparition au 1er token

### T6 — Nettoyage logs serveur + instrumentation

**Objectif** : remplacer le bruit par 1 log synthétique structuré par requête, et ajouter timings fins.

- **Bloquée par** : aucune
- **Fichiers à modifier** :
  - `server/routes.ts` (refactor du parser SSE Flowise)
- **Implémentation** :
  1. Supprimer les `console.log("Unknown event type: ...")`
  2. Compteurs locaux : `nodesExecuted`, `toolsCalled`, `unknownEvents`
  3. Timings fins : `flowiseConnectMs` (entre `fetch()` et 1er chunk), `firstTokenMs` (entre 1er chunk et 1er token), `streamTotalMs`
  4. Log final unique : `[Flowise] chatId=... ttft=12420ms stream=20289ms tokens=313 chars=943 nodes=11 tools=2 unknownEvents=0`
- **Acceptance** :
  - Une requête Flowise = exactement 2 lignes de log (start + end)
  - Format parseable (regex / log aggregator friendly)
  - Pas de régression d'observabilité (toutes les infos précédentes restent accessibles)

### T7 — Pré-warm TTS welcome message au boot

**Objectif** : que la lecture vocale du welcome soit instantanée pour le 1er élève après chaque déploiement.

- **Bloquée par** : aucune
- **Fichiers à modifier** :
  - `server/index.ts` (appel après `serving on port`)
  - `server/providers/tts/prewarm.ts` (nouveau)
  - `client/src/hooks/use-flowise.ts` (le texte du welcome doit être centralisé pour éviter la divergence)
- **Implémentation** :
  1. Extraire le welcome text de `useFlowise.initializeChat` dans une constante partagée `shared/welcome-message.ts`
  2. Au boot, appeler la fonction `prewarmTTS(welcomeText)` qui utilise le provider actif et stocke dans le cache LRU
  3. Désactivable via `TTS_PREWARM=0`
  4. Async, non-bloquant pour le démarrage du serveur
- **Acceptance** :
  - Logs : `[TTS Prewarm] Welcome cached (XXX chars, YYY ms)`
  - Premier `POST /api/tts` du welcome retourne en <50 ms (cache HIT)

### T8 — TTS streaming par phrase

**Objectif** : démarrer la lecture vocale dès la 1ère phrase complète plutôt qu'à la fin du stream.

- **Bloquée par** : T6 (logs propres pour mesurer le gain)
- **Fichiers à modifier** :
  - `client/src/lib/tts-text.ts` (nouvelle fonction `splitIntoSentences(text)` FR-aware)
  - `client/src/components/chat/ChatInterface.tsx` (refactor de l'engine autoplay : segmenter par phrase, pipeline `synth → audio queue → play`)
  - `client/src/hooks/use-tts-queue.ts` (nouveau — file d'attente audio avec préchargement de la phrase N+1 pendant la lecture de N)
- **Implémentation** :
  1. **Découpage FR-aware** : regex `/(?<=[.!?])\s+(?=[A-ZÀÂÉÈÊÎÏÔÙÛÇ])/` + exceptions (`M.`, `Mme.`, `etc.`, `cf.`, nombres décimaux `3.14`, abréviations)
  2. Pendant le stream Flowise, à chaque update de `tokenBufferRef`, tester si une nouvelle phrase complète est apparue. Si oui : `enqueueSentence(text)`
  3. **Pipeline audio** :
     - File `pendingSentences[]`
     - Worker async : pop la 1ère, fetch `/api/tts`, push le blob dans `audioQueue[]`, lance la lecture si rien ne joue
     - Préfetch : dès que la phrase N est lue à 70 %, lancer le synth de N+1 (si pas déjà fait)
  4. **Mute global** (existant) : doit interrompre proprement la lecture en cours ET vider la queue
  5. **Cache LRU** continue de fonctionner (clé inchangée : `provider + voiceId + text`)
- **Acceptance** :
  - Sur une réponse de 5 phrases × ~100 chars, la 1ère phrase est audible <2 s après son apparition dans le stream
  - Aucun "blanc" perceptible entre les phrases (préfetch effectif)
  - Mute interrompt instantanément + vide la queue
  - Test e2e : envoie un message, vérifie le 1er chunk audio dans <8 s, vérifie 5 chunks au total
  - Cache HIT sur réponses identiques (welcome message rejoué)

---

## Métriques cibles & instrumentation

### KPIs avant/après (à mesurer sur 10 requêtes types)

| Métrique | Baseline (mai 2026) | Cible | Outil de mesure |
|---|---|---|---|
| TTFT Flowise (cold) | 12 420 ms | <800 ms | Log T6 + script bench |
| TTFT Flowise (warm) | ~500 ms | <500 ms | idem |
| Total stream Flowise | 20 289 ms | <15 000 ms | idem |
| TTS welcome (1er user) | 9 451 ms | <50 ms | Log TTS cache hit/miss |
| Audio audible après envoi message | ~30 s | <8 s | Test e2e chronométré |
| Re-renders React/réponse | <80 (déjà optimisé) | <80 | React DevTools Profiler |

### Instrumentation à ajouter (T6)

```
[Flowise] chatId=session_XXX ttft=12420ms stream=20289ms tokens=313 chars=943 \
          nodes=11 tools=2 unknownEvents=0 keepAliveReused=true
[TTS] provider=elevenlabs cacheHit=false synthMs=9451 chars=761 \
      sentence=1/5 audibleAfterMs=2300
```

### Bench reproductible

Réutiliser le pattern de `scripts/voice-bench.ts` pour créer `scripts/flowise-bench.ts` qui envoie 5 questions types et mesure TTFT + total + audible-time. À lancer avant et après chaque tâche.

---

## Références

- [Flowise Streaming Documentation](https://docs.flowiseai.com/using-flowise/streaming)
- [Flowise Prediction API](https://docs.flowiseai.com/using-flowise/prediction)
- [Flowise Chatflows API](https://docs.flowiseai.com/api-reference/chatflows) (pour T1)
- [undici Agent — keep-alive](https://undici.nodejs.org/#/docs/api/Agent) (pour T4)
- [SSE Best Practices](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
- Doc précédente (fév. 2026) : voir section [Historique](#historique-des-analyses-précédentes) ci-dessus — plusieurs solutions appliquées, certaines obsolètes
- Logs de référence : `Start_application_20260502_174937_004.log` (extrait dans Diagnostic)
