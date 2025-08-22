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
1. **Homepage with Peter Chat**: Flowise chatbot integration for educational conversations
2. **À propos Page**: Static information about the app and learning objectives
3. **Gumlet Video Player**: Integrated video player for educational content
4. **In-App Webview**: External links open within the app instead of new tabs
5. **Desktop-Only**: Optimized for classroom desktop/laptop use
6. **French Language**: All content and UI in French

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