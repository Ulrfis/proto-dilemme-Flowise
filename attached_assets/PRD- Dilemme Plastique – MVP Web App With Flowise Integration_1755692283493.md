# PRD: Dilemme Plastique – MVP Web App With Flowise Integration

### TL;DR

Dilemme Plastique is a desktop-only educational MVP that guides students through real-world plastic pollution dilemmas via an interactive chatbot, “Peter,” powered by Flowise. The MVP consists of two pages—a Homepage hosting the chat-based learning experience and an À propos page—deployed with simple toggles to Lovable, Replit, or Bolt. The goal is rapid pilot readiness, higher engagement, and clear, actionable understanding without logins or accounts.

---

## Goals

### User Goals

* Students engage in an interactive, scenario-driven experience that feels dynamic and personal.

* Learners develop clarity on trade-offs behind plastic use and alternatives (social, economic, environmental).

* Give students a sense of agency via choices and actionable next steps.

* Enable teachers to facilitate with minimal prep and no technical overhead.

### Non-Goals

* No mobile support in MVP (desktop-only).

* No LMS integration (e.g., Google Classroom, Moodle).

* No user accounts, authentication, or saved progress.

---

## User Stories

* Persona: Élève (10–18)

  * As a student, I want to chat with Peter on the Homepage, so that I can explore plastic dilemmas in a fun, guided way.

  * As a student, I want quick choices to branch the story, so that I can compare different consequences.

  * As a student, I want to see pictures and short videos, so that I better understand real examples.

  * As a student, I want to open links for more information, so that I can go deeper if I’m curious.

  * As a student, I want to reset the session, so that I can try a new path.

* Persona: Enseignant(e)

  * As a teacher, I want a clear first step on the Homepage, so that my class can begin with minimal instruction.

  * As a teacher, I want an À propos page that explains learning goals and how to facilitate, so that I can plan a 20–30 minute activity.

  * As a teacher, I want visible progress hints, so that I can time activities and transitions.

---

## Functional Requirements

* Chat Experience (Priority: P0) -- Flowise Chat with “Peter”: Embed chat UI connected to a Flowise chatflow endpoint (ChatFlow ID + API Key/URL).-- Scenario Prompts: Seed conversation with predefined dilemmas (e.g., packaging vs. waste, recycling trade-offs).-- Branching Choices: Quick-reply buttons for key decision points that steer the conversation.-- Media Embedding: Display images and short videos inline or in a modal (captions + attributions).-- Link-out Actions: Open vetted external resources in new tabs with clear labels.-- Progress Hints: Non-persistent visual indicator (e.g., “Step 2 of 5”) and subtle breadcrumb dots.-- Reset Session: Clear local chat state to restart from the beginning.

* Content & Information (Priority: P0) -- À propos Page: Static page describing goals, pedagogy, credits, and how to use in class.-- Content Model: Structured config for scenarios (titles, intros, prompts, choices, media, links).

* Analytics & Observability (Priority: P1) -- Basic Analytics: Anonymous event logs for key interactions (page views, chat start, message send/receive, choice select, media open, session complete).-- Error Handling: Friendly UI states, retry on network failure, capture error events.

* Accessibility & Compliance (Priority: P0) -- Accessibility: WCAG 2.1 AA considerations (contrast, keyboard navigation, ARIA labels, focus states).-- Privacy: No PII, cookie-less by default, clear external link disclosures.

* Deployment & Configuration (Priority: P0) -- Environment Toggles: Single env-driven configuration for Lovable, Replit, and Bolt.-- CORS & Proxy: Optional proxy configuration if Flowise endpoint requires it.-- Feature Flags: Enable/disable analytics and media embedding.

---

## User Experience

* End-to-end journey (desktop-only):

  * Land on Homepage via shared link or QR code in class.

  * Read a short intro headline and CTA to “Commencer avec Peter.”

  * First chat message from Peter sets context; student chooses a dilemma to explore.

  * Student interacts via free text and quick choices; Peter responds with tailored explanations, media, and choices.

  * Student may open video and links in the integrated url viewer and video player (made with Gumlet) to deepen understanding.

  * Progress hints indicate approximate stage; session can be reset anytime.

  * Student reaches a concluding summary and suggested actions; session ends or restarts.

**Entry Point & First-Time User Experience**

* Discovery: Teacher shares URL or displays QR code; students open on classroom desktops/laptops.

* Onboarding: Minimal—one-paragraph intro; optional “How it works” tooltip; no login.

**Core Experience**

* Step 1: Landing on Homepage

  * Clear headline, 1–2 sentence description, “Commencer expérience” button.

  * Validate desktop viewport (>=1024px); show notice if width too small.

  * Success: On click, chat panel opens with Peter’s greeting and scenario options.

* Step 2: Chat within Flowise

  * Peter asks reflective questions; student replies via text or voice.

* Step 3: Media and links

  * Open video urls and source urls clicked within the Flowise Chat in the integrated tab

* Step 4: À propos page

  * Static content: learning objectives, facilitation tips (20–30 min plan), credits, contact.

  * Back to Homepage link persistent.

**Advanced Features & Edge Cases**

* Network loss: Show offline banner; queue messages locally; retry with backoff.

* Flowise error/timeout: Show fallback message and “Réessayer” button; log error event.

**UI/UX Highlights**

* Desktop-only responsive layout (optimal width 1200px; max-width 1440px).

* High-contrast theme; large targets (44px minimum); keyboard navigable.

* Visible focus states; ARIA roles for chat, buttons, and modals.

* Readable, friendly microcopy; progress hints without pressure.

* Safe external links with rel="noopener noreferrer" and clear source labels.

---

## Technical Considerations

* Architecture favors a static web app with a Flowise chatflow integration, zero-auth, and anonymous analytics. Desktop-only reduces complexity and QA surface.

### Technical Needs

* Front-end: Single-page desktop UI (HTML/CSS/JS or lightweight framework) with chat panel, media modal, and À propos page.

* API: Flowise chatflow REST endpoint with ChatFlow ID, API key (optional), and base URL.

* Data Models:

  * Scenario: {id, title, intro, systemPrompt, choices\[\], media\[\], links\[\]}

  * Choice: {id, label, nextPromptKey, analyticsTag}

  * Media: {id, type(image|video), src, caption, attribution, alt}

* State: In-memory + optional localStorage for ephemeral session only (reset clears).

* Analytics: Simple event POST to a lightweight endpoint or privacy-friendly provider.

### Integration Points

* Flowise: Self-hosted .

* 

* External Resources: Pre-vetted links from within the conversation.

### Data Storage & Privacy

* No PII collected; no accounts; cookie-less by default.

* Session transcript remains client-side; only anonymous events sent.

* Comply with GDPR principles for minimization; publish a concise privacy note on À propos.

### Scalability & Performance

* Expected load: 30 sessions/day during pilots; up to 3 concurrent.

* Apply request timeouts and retries to Flowise.