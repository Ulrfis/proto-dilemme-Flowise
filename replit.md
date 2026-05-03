# Dilemme Plastique - Educational Web App

## Overview
Dilemme Plastique is a desktop-only French educational web application designed to educate students (10-18 years) and teachers about plastic pollution. It integrates an AI chatbot named "Peter" (powered by Flowise) and features a Gumlet video player and an in-app webview for navigating external links, all within a split-screen interface. The project aims to provide an engaging and informative experience, optimized for classroom use, with a typical session duration of 20-30 minutes. The application has no user authentication or accounts, focusing on anonymous usage with basic analytics.

## User Preferences
- Language: French for all user-facing content
- Target audience: Students (10-18 years) and teachers
- Session duration: 20-30 minutes typical usage
- No audio components in first version (text-only conversations)

## System Architecture
The application features a split-screen interface with a chat panel (1/3 width) and a media/article panel (2/3 width). It is optimized for desktop viewports (minimum 1024px width). The UI is designed with a consistent teal color (#14B8A7) and aims for WCAG 2.1 AA accessibility compliance.

**Frontend:**
- Built with React and TypeScript, utilizing Wouter for routing and shadcn/ui components for a consistent design.
- Tailwind CSS is used for styling.
- Features a welcome screen with a simple "Démarrer l'aventure" button — no form. The student's first name is captured automatically during the conversation with Peter.
- Handles Flowise chatbot streaming responses, including a three-layer JSON protection mechanism to prevent raw JSON from reaching the UI.
- Implements French-aware sentence splitting and a sequential queue for TTS streaming, allowing for prefetching of sentences.
- Markdown titles are detected and styled, and links are made clickable, routing to either video playback or the in-app webview.
- TTS functionality removes URLs and markdown formatting to ensure natural speech.

**Backend:**
- An Express.js server acts as an API proxy and handles persistence.
- Provides endpoints for Flowise chatbot predictions, TTS, and STT services.
- Implements a multi-provider architecture for TTS/STT, configurable via environment variables, with ElevenLabs and OpenAI as primary providers.
- Includes a TTS cache (LRU memory-based) to improve performance.
- Features a debug console (`/debug`) for diagnosing service health, latency, and traces of Flowise and TTS requests.
- Implements Flowise keep-alive and HTTP keep-alive for performance optimization.
- Stores conversation sessions and messages in a PostgreSQL database using Drizzle ORM.

**Core Features:**
- **Split-Screen Interface**: Chat (1/3) + Media panel (2/3) always visible.
- **Flowise Chatbot "Peter"**: Integrated for educational conversations with SSE streaming and optimized first-token latency.
- **Gumlet Video Player**: Integrated for HLS streaming of educational videos.
- **In-App Webview**: External links clicked within the chat open in a dedicated article panel.
- **Message Types**: Supports information messages, open questions, choices, and bold-formatted links.
- **Desktop-Only**: Optimized for classroom desktop/laptop use.
- **French Language**: All content and UI are in French.

## External Dependencies
- **Flowise**: AI chatbot platform for "Peter" (integrated via API).
- **PostgreSQL**: Database for persisting conversation sessions and messages (using Drizzle ORM).
- **Gumlet**: Video player for HLS streaming of educational content.
- **YouTube**: Integrated for playing video content without distracting overlays.
- **Rectify**: Session recording and behavior tracking analytics.
- **PostHog**: Product analytics for tracking events and user engagement.
  - Funnel & dashboard spec: see `docs/posthog-funnel-dashboard.md`.
  - Dashboard "Usage – Dilemme Plastique": https://eu.posthog.com/project/107669/dashboard/656972
  - Setup script (idempotent): `node scripts/posthog-setup-dashboard.mjs` (requires `POSTHOG_PERSONAL_API_KEY` + `POSTHOG_PROJECT_ID`).
- **ElevenLabs**: TTS (Text-to-Speech) and STT (Speech-to-Text) provider.
- **OpenAI**: TTS and STT provider.
- **Deepgram**: Optional STT provider.
- **Neon**: Serverless Postgres for database hosting.