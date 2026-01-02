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

## Recent Changes
- Initial project setup completed
- Removed branching conversation paths feature
- Removed interactive scenario-driven conversations feature
- Focus on simple chat integration with media embedding
- Updated Peter's initial message to match specified 2025 futuristic tone
- Flowise integration fully operational and tested
- **Chatflow Migration (Nov 14, 2025)** : Updated to chatflow `d7b33ea2-941b-4b8c-b390-8bbb09ddd63c`
  - Migrated from previous chatflow to use correct endpoint
  - Enhanced error logging and JSON extraction with regex fallback
  - Identified temperature parameter configuration issue requiring Flowise adjustment
- Implemented split-screen layout: chat (1/3) + media panel (2/3) always visible
- Enhanced media panel with improved video player and webview components
- Added independent chat scrolling system - chat scrolls without affecting media panel
- Implemented message type handling: information messages (thumbs up button), open questions, and messages with links (bold formatting)
- Fixed URL cleaning to remove trailing punctuation from all links
- YouTube video integration with clean embed player - no distracting overlays or related videos
- **Rectify Analytics Integration** : Widget fully integrated across the application for user analytics
- **Visual Consistency** : Unified green color (#14B8A7) across Peter's message bubbles, guide text, and header info box
- **Changelog System** : Added CHANGELOG.md file for tracking all project changes with timestamps
- **Performance Optimizations (Nov 2025)** : Major Flowise API performance improvements
  - Disabled sourceDocuments for 50-90% payload reduction
  - Streamlined JSON parsing without expensive regex fallbacks
  - Conditional media extraction only when URLs present
  - Comprehensive performance metrics logging
  - **Result**: Response time reduced from 7-12s to 3-5s
- **UX Fixes (Nov 2025)** : Critical conversation experience improvements
  - Removed debug JSON messages from chat interface
  - Disabled caching to preserve conversational context
  - Peter now maintains memory throughout conversation (remembers user's name, etc.)
  - Fixed conversation loop bug where Peter would forget previous context
- **SSE Streaming Implementation (Nov 14, 2025)** : Real-time progressive text display
  - Implemented Server-Sent Events (SSE) streaming for Peter's responses
  - New endpoint `/api/flowise/prediction/:chatflowId/stream` with native SSE support
  - **CRITICAL FIX (Nov 14, 7:24)**: Corrected SSE format parsing based on Flowise documentation
    - Flowise uses: `data: {"event":"token","data":"text"}` (JSON payload in data line)
    - NOT the standard SSE format: `event: token\ndata: text`
    - Server now correctly parses JSON from each `data:` line
  - **ULTIMATE FIX (Nov 14, 7:55)**: Three-layer architecture for zero JSON display
    - **Layer 1 (Client)**: Accumulates all tokens without filtering (prevents fragment loss)
    - **Layer 2 (Server)**: Extracts Response field from complete JSON after full accumulation
    - **Layer 3 (Hook)**: Uses server-cleaned metadata.fullText with fallback to local fullText
    - Handles fragmented JSON tokens sent by Flowise (`{`, then `"Response"...`, then `}`)
    - Server-side extraction ensures no JSON ever reaches the UI
  - First token appears in ~500ms instead of waiting 10+ seconds for full response
  - Progressive word-by-word display with streaming cursor animation
  - Separate metadata handling (theme, score) sent via dedicated event
  - **UI FIX**: Response buttons (OK, choices, etc.) hidden during streaming, appear only after completion
  - **Result**: Peter's responses display correctly with zero JSON visible, even with fragmented tokens
  - **Flowise Configuration**: Chatflow must use streaming-compatible LLM (OpenAI, Anthropic, etc.)
- **Multi-Video Onboarding (Jan 2, 2026)**: Immersive video onboarding sequence
  - Device detection via `useDeviceType` hook (desktop vs smartphone)
  - 2-video sequence: Initial (16/9 all devices) → Device-specific (16/9 desktop, 9/16 smartphone)
  - GumletPlayer for HLS streaming support
  - Progress indicators, skip/next controls, 300ms fade transitions
  - Video IDs: initial=69577dbaf3928b38fc32c32b, desktop=69577d67d73a53e69e607fbf, smartphone=69577d67f3928b38fc32bb95

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

## Integration Priorities
1. Flowise chatbot API integration with proxy for security
2. Gumlet video player for video URLs in chat
3. In-app webview component for external links
4. French localization throughout
5. Desktop-responsive design