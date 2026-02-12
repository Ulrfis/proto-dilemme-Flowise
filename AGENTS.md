# AGENTS.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

Dilemme Plastique is a desktop-only French educational web app that integrates a Flowise chatbot named "Peter" to teach students (ages 10-18) about plastic pollution. The app features a split-screen layout: chat interface (1/3 width) + media panel (2/3 width) for videos and articles.

## Development Commands

```bash
# Start development server (runs on PORT env or 5000)
npm run dev

# Type check
npm run check

# Production build (Vite + esbuild)
npm run build

# Run production server
npm start

# Push database schema (Drizzle + Neon PostgreSQL)
npm run db:push
```

## Architecture

### Monorepo Structure
- `client/` – React frontend (Vite, TypeScript, TailwindCSS, shadcn/ui)
- `server/` – Express backend (API proxy, SSE streaming)
- `shared/` – Shared Zod schemas between client and server

### Path Aliases
- `@/*` → `client/src/*`
- `@shared/*` → `shared/*`
- `@assets/*` → `attached_assets/*`

### Key Technologies
- **Routing**: Wouter (not React Router)
- **State**: TanStack Query for API state, React useState for local state
- **UI**: shadcn/ui components with Radix primitives
- **Styling**: Tailwind CSS v3 with `tailwind-merge` and `class-variance-authority`
- **Video**: Gumlet player (`@gumlet/react-embed-player`) for HLS streaming

## Three-Layer JSON Extraction Architecture

Flowise sometimes returns responses as fragmented JSON tokens across SSE events. The app uses a three-layer architecture to prevent raw JSON from appearing in chat:

1. **Client accumulation** (`lib/flowise.ts`): Accumulates all SSE tokens without filtering
2. **Server extraction** (`server/routes.ts` lines 386-420): Extracts `Response` field from complete JSON after stream ends
3. **Hook rendering** (`hooks/use-flowise.ts`): Uses server-cleaned `metadata.fullText` with fallback to local accumulation

**Critical**: Never parse streaming JSON tokens individually—always accumulate and parse complete.

## SSE Streaming

Flowise streaming endpoint: `POST /api/flowise/prediction/:chatflowId/stream`

SSE event format from Flowise:
```
data: {"event":"token","data":"text chunk"}
data: {"event":"metadata","data":{...}}
data: {"event":"end","metadata":{...}}
```

The server proxies these events and adds performance metrics in the final `end` event.

## Environment Variables

Required secrets (configured in Replit Secrets or `.env`):
- `FLOWISE_HOST` – Flowise API base URL
- `FLOWISE_CHATFLOW_ID` – Target chatflow ID
- `FLOWISE_API_KEY` – Optional API key for Flowise auth
- `OPENAI_API_KEY` – For Whisper transcription endpoint

## Key Patterns

### Media Extraction
`extractMediaFromText()` in `lib/flowise.ts` detects URLs in chat responses:
- Gumlet/YouTube/Vimeo URLs → displayed in video player
- Other URLs → displayed in webview panel

### Session Management
Each chat session has a unique ID (`session_{timestamp}_{uuid}`) that's sent with every Flowise request for conversational context. Cache is disabled to preserve Peter's memory of user names.

### Rate Limiting
- General API: 30 requests/minute/IP
- Flowise endpoint: 10 messages/minute/IP
- Limits are skipped in development mode

## French Language

All user-facing content is in French. Error messages, UI labels, and chatbot responses should maintain French localization.

## Documentation Protocol

After completing features, update `STORY.md` following its internal structure:
- **Major features** (🔷): New capability, significant UI change, integration
- **Minor features** (🔹): Bug fixes, tweaks, small improvements
- Update "Last Updated" date after each entry
