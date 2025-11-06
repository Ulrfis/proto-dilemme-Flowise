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
  - In-memory caching (5-min TTL) for instant repeated question responses
  - Disabled sourceDocuments for 50-90% payload reduction
  - Streamlined JSON parsing without expensive regex fallbacks
  - Conditional media extraction only when URLs present
  - Comprehensive performance metrics logging
  - **Result**: Response time reduced from 7-12s to 3-5s (new questions), <100ms (cached)

## Development Guidelines
Following fullstack_js blueprint with:
- React frontend with shadcn/ui components
- Express backend for API proxying
- In-memory storage (no database needed)
- Tailwind CSS for styling
- TypeScript for type safety

## Integration Priorities
1. Flowise chatbot API integration with proxy for security
2. Gumlet video player for video URLs in chat
3. In-app webview component for external links
4. French localization throughout
5. Desktop-responsive design