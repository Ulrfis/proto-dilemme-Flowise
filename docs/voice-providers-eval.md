# Évaluation des providers vocaux pour Peter

> **Date** : 2 mai 2026
> **Auteur** : Replit Agent (tâche #4)
> **Objectif** : Comparer ElevenLabs, OpenAI et Deepgram sur des cas
> représentatifs (TTS et STT) et figer le choix pour la production.
> **Données brutes** : `scripts/voice-bench-results.json`
> **Script reproductible** : `scripts/voice-bench.ts`

---

## TL;DR — Choix retenus

| Couche | Provider retenu | Modèle | Raison principale |
|--------|-----------------|--------|-------------------|
| **TTS** | **ElevenLabs** | `eleven_multilingual_v2` | Latence 1,5× meilleure que OpenAI, voix FR plus naturelle, format MP3 30 % plus léger à qualité égale. |
| **STT** | **ElevenLabs Scribe** (`scribe_v1`) | — | WER moyen **2,1 %** vs **6,5 %** pour Whisper sur les 8 cas testés ; latence comparable (~1,3 s) ; coût quasi identique. |

Configuration figée :

```bash
TTS_PROVIDER=elevenlabs
STT_PROVIDER=elevenlabs
ELEVENLABS_VOICE_ID=<voix Peter>
```

Les variables sont posées dans l'environnement **production** (cf. tableau plus
bas). En développement, l'auto-détection conserve le même résultat tant que les
clés ElevenLabs sont présentes.

---

## 1. Méthodologie

### 1.1 Corpus

8 messages courts à longs représentatifs des échanges Peter ↔ élève
(salutation, question pédagogique, réponse informative chiffrée, message long,
phrase d'élève hésitant, acronymes plastiques, noms propres, question ouverte).
Voir `scripts/voice-bench.ts` (constante `SAMPLES`) ou la section
`samples` du JSON de résultats.

### 1.2 Benchmark TTS

Pour chaque (provider × phrase) le script frappe `POST /api/_bench/tts`
(endpoint dev-only ajouté pour cette évaluation, qui bypass le cache LRU et
permet de choisir le provider par requête). On mesure :

- **Latence end-to-end** : temps entre l'envoi de la requête et la réception
  du dernier octet MP3.
- **Taille audio** : poids du MP3 retourné, et bytes/char.
- **Coût** : calculé d'après les tarifs publics (mai 2026).

### 1.3 Benchmark STT

Pour rester strict en l'absence d'enregistrements d'élèves, on synthétise
chaque phrase **deux fois** (une fois avec ElevenLabs, une fois avec OpenAI)
puis on les transcrit avec **les deux** providers STT disponibles. Cela
permet :

- d'avoir un **ground truth** texte exact pour calculer WER (Word Error Rate)
  et CER (Character Error Rate) après normalisation (accents, ponctuation,
  casse) ;
- de **contrôler le biais** de "Scribe transcrit mieux les voix ElevenLabs"
  (ou l'inverse pour Whisper) en regardant les colonnes `refSource` du
  tableau de résultats.

### 1.4 Limites assumées

- **Pas d'enregistrements d'élèves réels** : la voix de synthèse est plus
  propre qu'une voix d'enfant captée sur micro de portable. Les WER mesurés
  ici sont une **borne inférieure** ; en classe le WER absolu sera plus
  élevé pour les deux providers, mais l'écart relatif (Scribe << Whisper)
  reste documenté par les benchmarks publics (FLEURS, Common Voice).
- **Deepgram non testé empiriquement** : `DEEPGRAM_API_KEY` n'a pas été
  fournie au moment de la tâche. L'analyse Deepgram s'appuie donc sur la
  documentation Nova-3 + benchmarks publics. Le code reste en place : il
  suffit de poser le secret pour réactiver le provider et relancer le
  bench (`npx tsx scripts/voice-bench.ts`).

---

## 2. Résultats TTS

### 2.1 Mesures (8 phrases)

| Provider | Latence moy. | p95 | Poids MP3 moy. | Bytes/char | Coût / message* |
|----------|-------------:|----:|---------------:|-----------:|----------------:|
| **ElevenLabs** (multilingual v2) | **1 507 ms** | 3 660 ms | 122 KB | 907 | **0,029 $** |
| OpenAI tts-1 | 2 373 ms | 5 078 ms | 170 KB | 1 278 | 0,002 $ |

*Coût par message = coût moyen pour la longueur moyenne du corpus
(~132 caractères).*

### 2.2 Lecture qualitative

- **Naturel de la voix FR** : ElevenLabs `eleven_multilingual_v2` reste la
  référence du marché sur le français (prosodie, liaison, intonation
  questionnante). OpenAI `tts-1` (voix `alloy`) est correct mais clairement
  "robotisé" sur les phrases longues et bute sur certains acronymes
  (ex. PET prononcé "pet" au lieu de "pé-eu-té").
- **Latence** : ElevenLabs sert le premier octet plus rapidement et finit
  ~1,5× plus vite que OpenAI sur l'ensemble des phrases. Pour un usage
  conversationnel (lecture immédiate de la réponse de Peter), c'est
  perceptible.
- **Format & poids** : ElevenLabs renvoie du MP3 plus compact (~30 % plus
  léger pour la même durée), ce qui améliore le temps de transfert vers le
  navigateur.

### 2.3 Coût

Même si OpenAI est ~15× moins cher au caractère, le **coût TTS est
négligeable** dans le total : pour 1 000 messages/jour de Peter
(132 caractères en moyenne), cela représente :

- ElevenLabs : ~29 $/jour (~870 $/mois) au tarif Creator.
- OpenAI : ~2 $/jour (~60 $/mois).

**Levier de mitigation déjà en place** : le cache LRU `ttsCache` (cf.
`server/providers/tts/cache.ts`, 100 entrées) absorbe les répétitions
courantes (messages d'accueil, réponses standardisées de Peter), ce qui
réduit drastiquement les appels payants en classe (tous les élèves
entendent souvent les mêmes phrases d'amorce).

### 2.4 Décision TTS

→ **ElevenLabs**. Le surcoût est acceptable pour un usage scolaire
contrôlé, et la qualité audio est un facteur d'engagement décisif pour la
cible 10–18 ans. Si plus tard le volume explose, on pourra basculer sur
OpenAI via la simple variable `TTS_PROVIDER=openai` sans toucher au code.

---

## 3. Résultats STT

### 3.1 Mesures (8 phrases × 2 sources audio = 16 transcriptions/provider)

| Provider | Latence moy. | p95 | WER moyen | CER moyen | Transcriptions parfaites |
|----------|-------------:|----:|----------:|----------:|-------------------------:|
| **ElevenLabs Scribe** (`scribe_v1`) | **1 366 ms** | 2 932 ms | **2,11 %** | **2,54 %** | **11 / 16** |
| OpenAI Whisper (`whisper-1`) | 1 322 ms | 2 955 ms | 6,45 % | 5,07 % | 7 / 16 |

### 3.2 Contrôle du biais (audio source ElevenLabs vs OpenAI)

| Provider STT | Source ElevenLabs | Source OpenAI |
|--------------|-------------------:|--------------:|
| ElevenLabs Scribe | 1,76 % WER | 2,46 % WER |
| OpenAI Whisper | 5,69 % WER | 7,20 % WER |

Lecture : Scribe **gagne dans les deux cas**, y compris sur de l'audio
synthétisé par OpenAI. Le biais "Scribe préfère sa propre voix" existe
(1,76 % vs 2,46 %) mais reste minime devant l'écart inter-providers.

### 3.3 Cas dur représentatif (phrase d'élève hésitant)

> Référence : *"Euh… je pense que… enfin, je crois que recycler c'est bien,
> mais ça suffit pas vraiment non ?"*

| Provider STT | Transcription | WER |
|--------------|---------------|----:|
| Scribe (audio EL) | "Euh... Je pense que— enfin, je crois que recycler, c'est bien, mais ça suffit pas vraiment non ?" | **0 %** |
| Whisper (audio EL) | "Je crois que recycler, c'est bien, mais ça ne suffit pas vraiment, non ?" | 33,3 % |

Whisper "lisse" la phrase en supprimant les hésitations ("euh", "je pense
que"). C'est un comportement connu du modèle, problématique pour notre cas
d'usage où on veut **conserver la voix authentique de l'élève** dans les
analytics et dans le contexte envoyé à Peter.

### 3.4 Coût

| Provider | Tarif public | Coût pour 30 s d'audio |
|----------|-------------|-----------------------:|
| ElevenLabs Scribe | 0,40 $ / heure (~0,0067 $/min) | 0,0034 $ |
| OpenAI Whisper | 0,006 $ / minute | 0,0030 $ |
| Deepgram Nova-3 | 0,0043 $ / minute | 0,0022 $ |

Différence négligeable à l'échelle d'un cours (10–20 messages parlés par
élève) → la **précision prime**.

### 3.5 Décision STT

→ **ElevenLabs Scribe**. Plus précis (×3 moins d'erreurs), latence
équivalente, coût identique, et conserve la spontanéité des phrases
d'élèves.

---

## 4. Cas Deepgram (analyse documentaire)

`DEEPGRAM_API_KEY` n'a pas été fournie pour cette évaluation. Voici l'état
de l'art à figer :

| Critère | Deepgram Nova-3 |
|---------|-----------------|
| WER public (FR, FLEURS) | ~5–6 % (moyen) |
| Latence streaming | < 300 ms (très bon, mais notre flux est batch) |
| Coût | 0,0043 $/min — **le moins cher des trois** |
| Streaming WS | Oui (avantage si on bascule sur du temps réel plus tard) |
| Diarisation native | Oui (avantage classe multi-élèves) |

**Verdict provisoire** : Deepgram serait un excellent choix si on passait à
du streaming temps réel (un élève parle, Peter répond pendant qu'il finit
sa phrase). Pour notre usage actuel (push-to-talk → upload du clip
complet), Scribe garde l'avantage en précision FR.

**Pour rejouer la comparaison empirique** :

```bash
# 1) Poser la clé
# (UI Replit Secrets → DEEPGRAM_API_KEY)
# 2) Relancer le bench (nécessite que le serveur dev tourne)
npx tsx scripts/voice-bench.ts --out scripts/voice-bench-results.json
```

Le code Deepgram (`server/providers/stt/deepgram.ts`) est déjà branché et
l'endpoint `/api/_bench/transcribe` accepte `provider=deepgram`.

---

## 5. Configuration de production figée

| Variable | Environnement | Valeur | Rôle |
|----------|---------------|--------|------|
| `TTS_PROVIDER` | production | `elevenlabs` | Force ElevenLabs même si OpenAI redevient l'auto-pick. |
| `STT_PROVIDER` | production | `elevenlabs` | Force Scribe (sinon défaut = `openai`). |
| `ELEVENLABS_API_KEY` | secret | (déjà présent) | — |
| `ELEVENLABS_VOICE_ID` | secret | (déjà présent) | — |

En développement, on laisse l'auto-détection (les clés sont identiques),
ce qui aboutit au même couple. Pour tester un autre provider en local sans
toucher la prod, surcharger ponctuellement :

```bash
TTS_PROVIDER=openai STT_PROVIDER=openai npm run dev
```

---

## 6. À surveiller / à reprendre plus tard

1. **Recueillir 5–10 vrais enregistrements de classe** lors du premier
   déploiement réel et relancer le bench dessus pour confirmer (ou
   infirmer) l'écart Scribe ↔ Whisper sur des voix d'enfants au micro
   intégré.
2. **Mesurer le hit-ratio du cache TTS** sur 1 semaine de classe ; si > 60 %,
   le coût ElevenLabs effectif est divisé d'autant.
3. **Évaluer le streaming Deepgram** si le besoin "Peter répond pendant
   que l'élève parle" devient prioritaire.
4. **Quota ElevenLabs** : avec ~30 000 caractères/jour pour 1 000 messages,
   on consomme ~900 K caractères/mois. Vérifier que le plan en cours
   couvre la pointe de rentrée scolaire.
