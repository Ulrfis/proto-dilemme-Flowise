# Dilemme Plastique - Educational Web App

## Project Overview
A desktop-only French educational web app integrating Flowise chatbot "Peter" for plastic pollution education. Features in-app Gumlet video player and webview navigation for links clicked within the chat conversation.

## Architecture
- Frontend: React with TypeScript using Wouter for routing
- Backend: Express.js with in-memory storage
- Chat: Flowise chatbot integration with custom embedding
- Video: Gumlet video player for media playback
- Navigation: In-app webview for external links

## Key Features
1. **Split-Screen Interface**: Chat interface (1/3 width) with media panel (2/3 width)
2. **Homepage with Peter Chat**: Flowise chatbot integration for educational conversations
3. **À propos Page**: Static information about the app and learning objectives
4. **Gumlet Video Player**: Integrated video player for educational content in dedicated panel
5. **In-App Webview**: External links open within the app in dedicated article panel
6. **Desktop-Only**: Optimized for classroom desktop/laptop use
7. **French Language**: All content and UI in French

## Technical Requirements
- Desktop viewport minimum 1024px width
- No user authentication or accounts
- Anonymous usage with basic analytics
- WCAG 2.1 AA accessibility compliance
- CORS handling for Flowise API calls

## User Preferences
- Language: French for all user-facing content
- Target audience: Students (10-18 years) and teachers
- Session duration: 20-30 minutes typical usage
- No audio components in first version (text-only conversations)

## Current State (Feb 2026)
The application is published and functional with the following complete features:

### Core Features
- **Split-screen layout**: Chat (1/3) + Media panel (2/3) always visible
- **Flowise chatbot "Peter"**: SSE streaming with ~500ms first-token latency
- **Three-layer JSON protection**: Client accumulation → Server extraction → Hook rendering (zero raw JSON displayed)
- **Gumlet video player**: HLS streaming for educational videos in media panel
- **YouTube integration**: Clean embed player without distracting overlays
- **In-app webview**: External links open within the app
- **Message types**: Information (thumbs up), open questions, choices, links (bold formatting)
- **Rectify Analytics**: Session recording and behavior tracking
- **Visual consistency**: Unified teal color (#14B8A7) throughout UI

### Video Onboarding
- Single intro video (16/9): ID `69577dbaf3928b38fc32c32b`
- Flow: Welcome screen → "Démarrer l'aventure" → Video → Chat
- GumletPlayer for HLS streaming support
- Skip button available during playback

### SSE Streaming Architecture
- Endpoint: `/api/flowise/prediction/:chatflowId/stream`
- Flowise SSE format: `data: {"event":"token","data":"text"}` (JSON payload in data line)
- Three-layer architecture prevents raw JSON from ever reaching the UI
- Chatflow: `1a7e3c86-6cbd-4fcf-ac01-bbf8b59a5bd9`
- Chatflow must use streaming-compatible LLM (OpenAI, Anthropic, etc.)

### Performance
- Response time: 3-5s (down from 7-12s)
- First token latency: ~500ms
- Payload optimized: sourceDocuments disabled, conditional media extraction

## Development Guidelines
Following fullstack_js blueprint with:
- React frontend with shadcn/ui components
- Express backend for API proxying
- In-memory storage (no database needed)
- Tailwind CSS for styling
- TypeScript for type safety

### STORY DOCUMENTATION RULE
**After completing any feature (major or minor), update STORY.md following its internal structure:**
- **Major features** (new capability, significant UI change, integration): Add full entry in "Feature Chronicle" + trigger a "Pulse Check" question
- **Minor features** (bug fixes, tweaks, small improvements): Add brief entry in "Feature Chronicle"
- **On errors/pivots**: Document immediately in "Pivots & Breakages" section
- **Every 3-5 features**: Ask the creator one "Pulse Check" question about their current state
- **Update** "Last Updated" date at top of STORY.md after each entry

## Providers vocaux (TTS / STT)

Architecture multi-providers pour la voix de Peter, configurable via variables d'environnement.

- **Choix de production figé (mai 2026)** : `TTS_PROVIDER=elevenlabs` et `STT_PROVIDER=elevenlabs` (Scribe). Évaluation comparative complète et résultats bruts dans `docs/voice-providers-eval.md` (Scribe a 3× moins d'erreurs que Whisper sur notre corpus FR ; ElevenLabs TTS est 1,5× plus rapide qu'OpenAI et plus naturel sur la cible 10–18 ans).
- **TTS** (lecture des messages) : `TTS_PROVIDER=elevenlabs|openai|none`. En dev, auto-détection (ElevenLabs si `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID` présents, sinon OpenAI, sinon `none` = bouton lecture désactivé).
- **STT** (transcription du micro) : `STT_PROVIDER=openai|elevenlabs|deepgram` (défaut `openai`/Whisper en dev, `elevenlabs`/Scribe en prod).
- **Endpoints** : `POST /api/tts` (`{ text, voiceId? }` → audio MP3), `POST /api/transcribe` (multipart `audio` → `{ text, language }`, signature inchangée), `GET /api/providers` (introspection).
- **Endpoints dev-only** : `POST /api/_bench/tts` et `POST /api/_bench/transcribe` permettent d'override le provider par requête (utilisés par `scripts/voice-bench.ts`). Désactivés en production sauf `ALLOW_VOICE_BENCH=1`.
- **Bench reproductible** : `npx tsx scripts/voice-bench.ts` (serveur dev doit tourner) → `scripts/voice-bench-results.json`. Mesure WER, CER, latence et coût pour tous les providers disponibles.
- **Ajouter un provider** en 3 étapes : 1) créer `server/providers/tts/<name>.ts` (ou `/stt/`) implémentant `ITTSProvider` / `ISTTProvider`, 2) l'enregistrer dans `REGISTRY` du `index.ts` correspondant, 3) ajouter le nom au type union. Les clients sont instanciés paresseusement (pas de warnings au boot).
- **Secrets requis** : `OPENAI_API_KEY` (existant), `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID` (TTS ElevenLabs / STT Scribe), `DEEPGRAM_API_KEY` (optionnel, pour Deepgram Nova-3 — non testé empiriquement, voir doc d'évaluation).
- **UI** : bouton haut-parleur sur chaque message Peter + toggle "Lecture auto" dans l'en-tête (persisté dans `localStorage` sous `tts-autoplay`).
- **Sélecteur de voix runtime** : `<Select>` (icône `Mic2`) dans l'en-tête du chat, alimenté par `GET /api/tts/voices`. Choix persisté dans `localStorage:tts-voice-id`, propagé à `POST /api/tts` (clé `voiceId`). Fallback automatique sur la voix par défaut du provider si la voix mémorisée n'existe plus. Implémentation provider via `listVoices()` / `getDefaultVoiceId()` optionnels sur `ITTSProvider`.
- **Cache TTS** : `server/providers/tts/cache.ts` — LRU mémoire (clé SHA-256 sur `provider + voiceId + text`, 100 entrées par défaut, override via `TTS_CACHE_MAX_ENTRIES`). Auto-invalidation totale dès que `TTS_PROVIDER` ou `ELEVENLABS_VOICE_ID` changent. En-têtes de réponse `X-TTS-Cache: hit|miss` pour observabilité (~40 ms sur hit vs ~1.1 s sur miss).

## Integration Priorities
1. Flowise chatbot API integration with proxy for security
2. Gumlet video player for video URLs in chat
3. In-app webview component for external links
4. French localization throughout
5. Desktop-responsive design