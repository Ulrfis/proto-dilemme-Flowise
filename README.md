# Dilemme Plastique

A French-language educational web application that guides students aged 10–18 through an interactive journey on plastic pollution, facilitated by an AI companion named **Peter**.

Built for classroom use with a 20–30 minute session format, the app combines a live AI chat, embedded videos, and external article browsing — all in a single split-screen interface, with voice input/output.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Project Structure](#project-structure)
- [Key Design Decisions](#key-design-decisions)
- [Admin Console](#admin-console)
- [Analytics](#analytics)
- [TTS / STT Pipeline](#tts--stt-pipeline)
- [Testing](#testing)
- [Docs](#docs)

---

## Overview

Dilemme Plastique is a **desktop-only** classroom tool. A student opens the app, clicks "Démarrer l'aventure !", and is immediately placed into a guided conversation with Peter — an AI character powered by [Flowise](https://flowiseai.com). Peter asks questions, shares videos, and links to articles, adapting the experience in real time.

No login, no account — sessions are anonymous by default. Peter captures the student's first name naturally during the conversation.

---

## Features

### Student experience
- **Split-screen layout** — Chat panel (1/3) + Media panel (2/3) always side-by-side
- **AI companion "Peter"** — Streaming SSE responses with optimised first-token latency
- **Voice input** — Microphone button with live audio waveform visualisation (Web Audio API, violet bars matching the UI accent colour)
- **Voice output** — Peter speaks every response via TTS; sentence-level streaming so the first sentence plays before the full answer is generated
- **Smart link handling** — Markdown links in Peter's responses open videos in the Gumlet player or articles in the in-app webview; Peter never reads URLs aloud
- **Avatar customisation** — Students pick a personalised avatar from a thumbnail grid
- **Confetti celebration** — Engagement animation on key moments

### Teacher / admin
- **Admin console** (`/admin/sessions`) — paginated list of sessions with search by first name and date range filters
- **Session detail** — full conversation replay with CSV and PDF export
- **Debug console** (`/debug`) — live health check for Flowise, TTS, and STT; latency traces

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (React + TypeScript)                               │
│                                                             │
│  ┌──────────────────┐    ┌───────────────────────────────┐  │
│  │  Chat panel      │    │  Media panel                  │  │
│  │  ChatInterface   │    │  VideoPlayer (Gumlet/YouTube)  │  │
│  │  ChatInput       │    │  WebView (article iframe)     │  │
│  │  ChatMessage     │    │  InfoPanel                    │  │
│  └──────────────────┘    └───────────────────────────────┘  │
│                                                             │
│  Hooks: use-flowise · use-tts-queue · use-user-avatar       │
│  Libs:  sentence-split · tts-text · conversation-session    │
└─────────────────────────────────────────────────────────────┘
                          │ REST + SSE
┌─────────────────────────────────────────────────────────────┐
│  Express.js server (Node / tsx)                             │
│                                                             │
│  /api/flowise/…    → proxy to Flowise (SSE streaming)       │
│  /api/tts          → TTS provider (ElevenLabs / OpenAI)     │
│  /api/transcribe   → STT provider (ElevenLabs / OpenAI /    │
│                       Deepgram)                             │
│  /api/sessions     → anonymous session CRUD                 │
│  /api/admin/…      → session list + messages (auth)         │
│                                                             │
│  TTS cache (LRU in-memory) · Flowise keep-alive             │
└─────────────────────────────────────────────────────────────┘
                          │ SQL (Neon serverless WebSocket)
┌─────────────────────────────────────────────────────────────┐
│  PostgreSQL (Neon)                                          │
│                                                             │
│  conversation_sessions  (id, first_name, created_at)        │
│  conversation_messages  (id, session_id, sender, content,   │
│                          created_at)                        │
└─────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite |
| Routing | Wouter |
| UI components | shadcn/ui + Radix UI primitives |
| Styling | Tailwind CSS |
| Data fetching | TanStack Query v5 |
| Forms | react-hook-form + Zod |
| Animations | Framer Motion |
| Backend | Express.js, Node (tsx) |
| Database | PostgreSQL via Neon serverless, Drizzle ORM |
| AI chatbot | Flowise (SSE streaming) |
| TTS | ElevenLabs (primary) · OpenAI · configurable |
| STT | ElevenLabs · OpenAI Whisper · Deepgram |
| Video player | Gumlet `@gumlet/react-embed-player` |
| Audio viz | Web Audio API (native, no library) |
| Analytics | PostHog (product events) · Rectify (session recording) |
| Testing | Playwright (e2e) |

---

## Getting Started

### Prerequisites

- Node.js 20+
- A running [Flowise](https://flowiseai.com) instance with a configured chatflow
- A [Neon](https://neon.tech) (or standard PostgreSQL) database
- API keys for at least one TTS provider (ElevenLabs or OpenAI)

### Installation

```bash
git clone https://github.com/your-org/dilemme-plastique
cd dilemme-plastique
npm install
```

### Database setup

```bash
npm run db:push          # applies the Drizzle schema to your Postgres instance
```

### Development

```bash
npm run dev              # starts Express (port 5000) + Vite HMR together
```

Open `http://localhost:5000`.

---

## Environment Variables

Copy `.env.example` (or create `.env`) at the project root.

### Required

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (e.g. Neon `postgresql://…`) |
| `FLOWISE_HOST` | Base URL of your Flowise instance (e.g. `https://flowise.example.com`) |
| `FLOWISE_CHATFLOW_ID` | ID of the Flowise chatflow used by Peter |
| `ADMIN_PASSWORD` | Bearer token for the `/api/admin/…` endpoints |
| `VITE_FLOWISE_CHATFLOW_ID` | Same chatflow ID — exposed to the browser for direct stream URL construction |

### TTS (at least one provider)

| Variable | Description |
|---|---|
| `TTS_PROVIDER` | `elevenlabs` (default) or `openai` |
| `ELEVENLABS_API_KEY` | ElevenLabs API key |
| `ELEVENLABS_VOICE_ID` | Voice ID for Peter |
| `ELEVENLABS_API_BASE` | Override ElevenLabs API base URL (optional) |
| `OPENAI_API_KEY` | OpenAI API key (used for TTS and/or Whisper STT) |
| `OPENAI_TTS_VOICE` | OpenAI voice name (e.g. `onyx`) |
| `DEFAULT_VOICE` | Fallback voice identifier |

### STT (optional — microphone input)

| Variable | Description |
|---|---|
| `DEEPGRAM_API_KEY` | Deepgram API key |
| `DEEPGRAM_URL` | Deepgram transcription endpoint |
| `DEEPGRAM_MODEL` | Model name (e.g. `nova-2`) |
| `ELEVENLABS_STT_URL` | ElevenLabs STT endpoint |

### Analytics (optional)

| Variable | Description |
|---|---|
| `VITE_POSTHOG_KEY` | PostHog project API key |
| `VITE_POSTHOG_HOST` | PostHog ingestion host (default `https://eu.i.posthog.com`) |
| `POSTHOG_SERVER_KEY` | Optional server-side PostHog key for Flowise/TTS events |

### Other

| Variable | Description |
|---|---|
| `FLOWISE_API_KEY` | Flowise API key if your instance requires authentication |
| `FLOWISE_KEEPALIVE` | Interval (ms) for the Flowise keep-alive ping (default `30000`) |

---

## Project Structure

```
.
├── client/
│   └── src/
│       ├── components/
│       │   ├── chat/           # ChatInterface, ChatMessage, ChatInput, ThinkingIndicator
│       │   ├── media/          # MediaPanel, VideoPlayer, WebView, InfoPanel
│       │   ├── avatar/         # AvatarSelector
│       │   ├── effects/        # ConfettiEffect
│       │   └── layout/         # Header, DesktopValidator
│       ├── hooks/
│       │   ├── use-flowise.ts  # Flowise SSE streaming + first-name capture
│       │   ├── use-tts-queue.ts# Sequential TTS sentence queue with prefetch
│       │   └── use-user-avatar.ts
│       ├── lib/
│       │   ├── flowise.ts      # FlowiseClient + extractMediaFromText
│       │   ├── sentence-split.ts # French-aware sentence splitter (URL-safe)
│       │   ├── tts-text.ts     # plainifyForTTS — strips links/URLs/markdown
│       │   ├── conversation-session.ts
│       │   └── analytics.ts   # PostHog event wrappers
│       └── pages/
│           ├── homepage.tsx    # Landing + main split-screen interface
│           ├── admin-sessions.tsx
│           ├── admin-session-detail.tsx
│           └── debug.tsx
├── server/
│   ├── routes.ts               # All API endpoints
│   ├── storage.ts              # DbStorage (Drizzle) implementing IStorage
│   ├── db.ts                   # Neon client
│   └── providers/
│       ├── tts/                # ElevenLabs · OpenAI · cache · prewarm
│       └── stt/                # ElevenLabs · OpenAI · Deepgram
├── shared/
│   └── schema.ts               # Drizzle schema + Zod types (shared client/server)
├── scripts/
│   └── posthog-setup-dashboard.mjs  # Idempotent PostHog dashboard creation
├── tests/
│   └── e2e/                    # Playwright tests
└── docs/
    ├── flowise-latency-analysis.md
    ├── voice-providers-eval.md
    ├── voice-waveform-spec.md
    └── posthog-funnel-dashboard.md
```

---

## Key Design Decisions

### Anonymous sessions
There is no login or registration. When a student clicks "Démarrer l'aventure !", an anonymous session is created server-side. Peter naturally asks for the student's first name early in the conversation; the first short reply (≤ 40 characters) is used as the `first_name` via a `PATCH /api/sessions/:id` call.

### TTS streaming pipeline
Flowise responses arrive token-by-token via SSE. The sentence splitter (`sentence-split.ts`) emits complete sentences as they arrive, with a URL-safe protection layer that prevents dots inside `lemonde.fr/...` or `[label](url)` from fragmenting sentences mid-stream. Each sentence goes through `plainifyForTTS` (strips all links, URLs, domains, markdown silently) before reaching the TTS queue. The queue prefetches sentence N+1 while sentence N is playing, minimising pauses.

### Link handling
Peter's responses often contain markdown links and bare URLs. The frontend renders them as clickable elements that open the video player or in-app article webview. `plainifyForTTS` ensures Peter never reads URLs or domain names aloud — they are stripped silently and the surrounding sentence text is preserved and spoken in full.

### TTS provider abstraction
The `TTS_PROVIDER` environment variable switches between ElevenLabs and OpenAI without any code change. The same abstraction covers STT, with ElevenLabs, OpenAI Whisper, and Deepgram as options.

### Desktop-only
The app targets classroom desktops and laptops (min-width 1024 px). `DesktopValidator` component shows a friendly message on smaller viewports.

---

## Admin Console

Access at `/admin/sessions` with the `ADMIN_PASSWORD` secret (HTTP Basic / Bearer prompt in the browser).

- **Session list** — paginated, searchable by first name, filterable by date range
- **Session detail** — full message history with timestamps
- **Export CSV** — UTF-8 BOM, formula-injection hardened for Excel/Sheets
- **Export PDF** — opens a styled print window; use browser "Save as PDF"

---

## Analytics

PostHog is used for product analytics. Key events tracked:

| Event | When |
|---|---|
| `page_view` | App load |
| `adventure_started` | "Démarrer l'aventure !" clicked |
| `session_started` | Anonymous session persisted |
| `identity_captured` | First name extracted from conversation |
| `message_sent` | Student sends a message |
| `peter_replied` | Peter's full response received (+ latency metrics) |
| `flowise_stream_completed` | Server-side Flowise stream finished (+ connect/TTFT/total/tokens/nodes/tools) |
| `ai_response_received` | Browser-observed AI response finished (+ request/trace correlation IDs) |
| `chat_progress_step_changed` | Flowise progress label changed while Peter is preparing the answer |
| `tts_audio_ready` | TTS sentence audio fetched, with provider/cache/latency |
| `tts_playback_started` | TTS playback begins after queue/fetch wait |
| `video_opened` | Video link clicked |
| `link_opened` | Article link clicked |
| `mute_toggled` | TTS muted/unmuted |
| `session_complete` | Session ended |

Recommended PostHog project settings:
- Enable Session Replay and Network recording.
- Keep request/response bodies disabled or redacted; the app also strips bodies for `/api/flowise`, `/api/tts`, `/api/transcribe`, `/api/sessions`, and `/api/analytics`.
- Enable Web Vitals and monitor LCP, INP, CLS, and FCP at p75/p90.
- Use `requestId`, `flowiseTraceId`, `flowiseChatId`, and `posthogSessionId` to correlate PostHog events with `/debug` traces.

The PostHog dashboard and funnel can be re-created idempotently:

```bash
POSTHOG_PERSONAL_API_KEY=phx_… POSTHOG_PROJECT_ID=123456 \
  node scripts/posthog-setup-dashboard.mjs
```

See [`docs/posthog-funnel-dashboard.md`](docs/posthog-funnel-dashboard.md) for the full event spec.

---

## TTS / STT Pipeline

```
User speaks → MediaRecorder (webm/opus) → POST /api/transcribe
                                              │
                                    STT provider (ElevenLabs / Whisper / Deepgram)
                                              │
                                    Transcribed text → ChatInput → onSendMessage

Peter replies (SSE stream)
  → extractNewCompleteSentences (URL-safe sentence splitter)
  → enqueueSentence
      → plainifyForTTS (strips links / URLs / markdown)
      → POST /api/tts  (LRU-cached)
      → AudioElement.play()    ← prefetched while previous sentence is playing
```

---

## Testing

End-to-end tests use Playwright:

```bash
# Make sure the dev server is running (npm run dev), then:
CHROMIUM_BIN=$(which chromium) npx playwright test
```

The test suite covers:
- Session creation (anonymous `POST /api/sessions`)
- Welcome message persistence (Peter's first message stored in DB)
- User message submission and chat bubble rendering
- Admin console — session row visible and conversation messages displayed

See [`tests/e2e/README.md`](tests/e2e/README.md) for setup details.

---

## Docs

| File | Contents |
|---|---|
| [`docs/flowise-latency-analysis.md`](docs/flowise-latency-analysis.md) | First-token latency measurements and optimisation notes |
| [`docs/voice-providers-eval.md`](docs/voice-providers-eval.md) | Comparative evaluation of TTS/STT providers |
| [`docs/voice-waveform-spec.md`](docs/voice-waveform-spec.md) | Spec for the Web Audio API waveform visualisation |
| [`docs/posthog-funnel-dashboard.md`](docs/posthog-funnel-dashboard.md) | PostHog funnel definition and dashboard tile spec |

---

## License

Private project — all rights reserved.
