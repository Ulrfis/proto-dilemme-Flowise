# Dilemme Plastique — Development Story

> **Status**: 🟡 In Progress  
> **Creator**: Ulrich Fischer  
> **Started**: 2025-11-06  
> **Last Updated**: 2025-11-14  

---

## Genesis Block

*Fill this section BEFORE starting development. This is your "before" snapshot.*

### The Friction

*What personal pain, frustration, or observation sparked this project? Be specific and honest.*

```
Students aged 10-18 lack engaging, interactive ways to understand plastic pollution's real impact. 
Traditional educational resources are static and don't maintain conversational context. 
Teachers need tools that can personalize learning while maintaining educational rigor.
The gap: Interactive chatbot-based learning that adapts to student interests and prior knowledge, 
combined with rich media (videos, articles) that reinforces key concepts about chemical dangers 
and environmental impact of plastics.
```

### The Conviction

*Why does this matter? Why you? Why now?*

```
Plastic pollution is one of the defining environmental challenges of our generation. 
Young people need to understand the science, the interconnections, and their agency to make changes.
Technology enables personalized, conversational learning at scale — but only if we build it thoughtfully.
Plastic contamination in soil, water, and human bodies creates urgency.
Peter (our AI guide) can humanize complex chemistry and make it relatable, memorable, and actionable.
```

### Initial Vision

*What did you imagine building? Paste your original PRD, brief, or first prompt here.*

```
Desktop-only French educational web app integrating Flowise chatbot "Peter" for plastic pollution education.
Features:
- Split-screen interface: Chat (1/3 width) + Media panel (2/3 width)
- Flowise chatbot integration for conversational learning
- Gumlet video player for embedded educational content
- In-app webview for external links and resources
- Response buttons (OK, choices) for guiding conversation flow
- Theme tracking and learning indicators
- Anonymous usage with basic analytics
- WCAG 2.1 AA accessibility compliance
- French language throughout
Target: Students 10-18 and teachers in French-speaking regions
Session duration: 20-30 minutes typical usage
No authentication required
```

### Target Human

*Who is this for? One specific person archetype.*

```
Marie, 14 years old, French-speaking student in Switzerland
Context: Science class, assigned to learn about plastic pollution for a 20-minute interactive session
Struggle: Plastic pollution feels abstract and disconnected from her daily life; 
          traditional worksheets bore her; she needs concrete examples and visual proof
Success: She understands *why* plastic additives are dangerous, can explain the difference 
         between types of plastic, and feels motivated to make small lifestyle changes
How Peter helps: Conversational guide who asks questions, shares surprising facts, provides videos, 
               remembers what she said earlier in the conversation, and validates her ideas
```

### Tools Arsenal

*What vibe-coding tools are you using?*

| Tool | Role |
|------|------|
| Replit | Full-stack development environment, deployment, secrets management |
| Claude / Replit Agent | Feature planning, debugging, architecture decisions, prompt engineering |
| Flowise | Chatbot LLM orchestration, custom embeddings for plastic pollution domain |
| React + TypeScript | Frontend UI, component architecture |
| Express.js | Backend API, Flowise proxy, SSE streaming |
| Tailwind CSS + shadcn/ui | Styling, accessible components |
| TanStack Query | State management, API caching |

---

## Feature Chronicle

*Each feature gets an entry. Major features (🔷) get full treatment. Minor features (🔹) get brief notes.*

### [2025-11-14] — SSE Streaming with Three-Layer JSON Extraction Architecture 🔷

**Intent**: Eliminate JSON brut from appearing in chat bubbles while maintaining <500ms first-token latency

**Prompt(s)**: 
```
Client accumulates all tokens without filtering → Server extracts Response field from complete JSON 
→ Hook uses server-cleaned metadata.fullText with fallback to local
Handles fragmented JSON tokens like: {, then "Response"..., then }
```

**Tool**: Replit Agent (server/routes.ts, client/src/lib/flowise.ts, client/src/hooks/use-flowise.ts)

**Outcome**: 
- Three-layer architecture: Client → Server (extraction) → Hook (rendering)
- Successful E2E tests: 208-character French message displayed cleanly without JSON
- Streaming cursor animation working correctly
- Action buttons hidden during streaming, visible on completion

**Surprise**: 
Flowise sometimes sends entire response as single JSON token with fragmented parts arriving over multiple SSE events. 
Previous client-side parsing strategy lost text because it tried to parse incomplete JSON fragments.

**Friction**: 
Initial attempt to filter JSON tokens client-side caused loss of content. 
Regex fallback needed for malformed JSON extraction.

**Resolution**: 
Simplified client to accumulate without filtering, moved all JSON handling to server after full accumulation.
Added regex fallback in server for extraction if standard JSON.parse fails.

**Time**: ~2 hours (diagnosis + implementation + testing)

---

### [2025-11-14] — Chatflow Migration & Debugging Infrastructure 🔷

**Intent**: Migrate to correct Flowise chatflow endpoint and identify configuration issues

**Prompt(s)**: 
```
Update to chatflow d7b33ea2-941b-4b8c-b390-8bbb09ddd63c
Enhanced logging for JSON parsing debugging
Better error identification for Flowise API responses
```

**Tool**: Replit Agent (server/routes.ts, secrets management)

**Outcome**: 
- Chatflow ID updated in FLOWISE_CHATFLOW_ID and VITE_FLOWISE_CHATFLOW_ID secrets
- Comprehensive debug logging for first/last 200 chars of JSON
- Identified temperature parameter incompatibility in Flowise config
- Error handling now clearly logs which layer fails (JSON parse vs regex extraction)

**Surprise**: 
New chatflow has `temperature: 0.9` parameter but the LLM only accepts default `temperature: 1`.
Flowise doesn't validate this configuration client-side—error only appears at runtime.

**Friction**: 
Temperature parameter issue is in Flowise configuration, not in our code. 
Requires manual adjustment in Flowise UI.

**Resolution**: 
Created detailed changelog documenting the issue and required fix.
Set up proper error logging to help diagnose similar issues in future.

**Time**: ~1 hour (investigation + logging improvements)

---

### [2025-11-14] — Improved Error Handling & Fallback Extraction 🔹

**Intent**: Add robust fallback when JSON parsing fails (regex-based Response field extraction)

**Outcome**: 
- JSON parse → Regex fallback → Use fullText as-is
- Handles escaped characters (\", \n) in extracted Response field
- Detailed console logging for debugging each layer

**Time**: ~30 minutes

---

### [2025-11-06] — Initial Project Setup & Split-Screen Layout 🔷

**Intent**: Establish architecture for chat (1/3) + media panel (2/3) with independent scrolling

**Outcome**: 
- Express backend + React frontend running on single port
- Split-screen CSS layout with fixed media panel
- Chat scrolling independent from media panel
- Flowise integration proxy endpoint (`/api/flowise/prediction/:chatflowId`)

**Time**: ~2 hours

---

### [2025-11-06] — Gumlet Video Player Integration 🔷

**Intent**: Embed Gumlet video player for educational content streaming

**Outcome**: 
- Video URLs detected from chat messages via regex
- Gumlet player embedded in media panel with no overlays or related videos
- Clean, distraction-free viewing experience

**Time**: ~1 hour

---

### [2025-11-06] — Message Type Handling & Action Buttons 🔷

**Intent**: Support different message flows (information → OK button, questions, choices, links)

**Outcome**: 
- Information messages show thumbs-up button
- Choice-based messages show quick-reply buttons
- Links appear bold and clickable
- Buttons hidden during streaming, shown after completion

**Time**: ~1.5 hours

---

### [2025-11-06] — URL Cleaning & In-App Webview 🔷

**Intent**: Extract URLs from responses and open in in-app article panel

**Outcome**: 
- Regex URL extraction with trailing punctuation removal
- Links open in dedicated webview component
- External resource access without leaving app

**Time**: ~1 hour

---

### [2025-11-06] — Rectify Analytics Integration 🔹

**Intent**: Add session recording and user behavior tracking for educational insights

**Outcome**: 
- Widget loads successfully across app
- Tracks page views, chat starts, message counts, link clicks, video opens
- Non-blocking async initialization

**Time**: ~45 minutes

---

### [2025-11-06] — Flowise API Performance Optimization 🔹

**Intent**: Reduce response latency from 7-12s to 3-5s

**Outcome**: 
- Disabled `returnSourceDocuments` for 50-90% payload reduction
- Removed expensive regex fallbacks for fast JSON parsing
- Conditional media extraction only when URLs present
- Comprehensive performance metrics logging

**Time**: ~1 hour

---

## Pivots & Breakages

*Major direction changes, things that broke badly, abandoned approaches. This is where story gold lives.*

### [2025-11-14] — Chatflow Response Format Incompatibility

**What broke / What changed**: 
New chatflow `d7b33ea2...` returns error "temperature does not support 0.9 with this model"
This breaks entire conversation flow—Peter never responds.

**Why**: 
Flowise chatflow is configured with a parameter incompatible with the underlying LLM model.
Configuration validation happens only at runtime, not at Flowise config time.

**What you learned**: 
- Always test chatflow configurations with actual LLM model being used
- Flowise configuration issues are separate from application code issues
- The error message itself is helpful—"only default (1) value is supported"
- Building with external services means debugging extends into their configuration layers

**Emotional state**: 
Frustration at discovering the issue is external to our code, but also relief that 
our JSON extraction architecture is robust enough to handle multiple response formats.

---

### [2025-11-14] — JSON Token Fragmentation Issue

**What broke / What changed**: 
Chat bubbles showed raw JSON or were empty when Flowise sent responses as single JSON token
broken across multiple SSE events: `{`, then `"Response"...`, then `}`

**Why**: 
Client-side parsing tried to parse each token individually, failing on incomplete JSON fragments.
Combined with streaming that immediately renders tokens, incomplete JSON appeared in UI.

**What you learned**: 
- Never parse streaming JSON tokens individually—always accumulate and parse complete
- Client-side filtering of "JSON-like" tokens causes data loss
- Move all parsing logic to server-side after complete accumulation
- Multiple layers of protection (client accumulation, server extraction, hook fallback) 
  provide resilience against different response formats

**Emotional state**: 
Initial alarm at seeing JSON in production, then satisfaction with elegant three-layer solution.

---

## Pulse Checks

*Subjective snapshots. AI should prompt these every 3-5 features or at major moments.*

### [2025-11-14] — Pulse Check #1

**Energy level** (1-10): 7/10

**Current doubt**: 
Is the Flowise configuration actually optimal for our use case? 
Will temperature parameter fix resolve all response issues?

**Current satisfaction**: 
The architecture is solid. Three-layer JSON extraction + SSE streaming + error handling 
feels robust and testable. Very proud of the regex fallback strategy.

**If you stopped now, what would you regret?**: 
Not getting the new chatflow working end-to-end. The incomplete work feels like 
we're close but not there yet.

**One word for how this feels**: 
Tantalizingly-close.

---

## Insights Vault

*Learnings that transcend this specific project. Things you'd tell someone starting a similar journey.*

- **[2025-11-14]**: Streaming JSON requires three-layer architecture (client accumulation → server extraction → client rendering) rather than client-side filtering
- **[2025-11-14]**: External service integrations (Flowise) have configuration layers that live outside your code—always test with the actual LLM being used
- **[2025-11-14]**: Building regex fallbacks for JSON extraction is cheaper than investing in multiple parsing strategies
- **[2025-11-14]**: ChatGPT/Claude as coding partner works best when you explain the problem clearly—they'll identify issues you missed
- **[2025-11-06]**: Educational tech needs conversational context persistence; stateless chat loses learning opportunities
- **[2025-11-06]**: Media rich learning requires synchronizing UI state across chat/video/article panels without blocking scrolling
- **[2025-11-06]**: French localization goes beyond translation—cultural context matters for education

---

## Artifact Links

*Screenshots, recordings, deployed URLs, social posts — external evidence of the journey.*

| Date | Type | Link/Location | Note |
|------|------|---------------|------|
| 2025-11-14 | Code | server/routes.ts, lines 276-420 | Three-layer JSON extraction architecture |
| 2025-11-14 | Code | client/src/hooks/use-flowise.ts, lines 153-170 | Hook-side text selection logic |
| 2025-11-14 | Logs | CHANGELOG.md | Complete technical changelog of all changes |
| 2025-11-06 | Code | client/src/components/media/MediaPanel.tsx | Split-screen media panel component |

---

## Narrative Seeds

*Raw material for the final story. Quotes, moments, metaphors that emerged during the build.*

- "Three layers of protection: client simplicity, server extraction, hook fallback—like a learning pyramid"
- "JSON fragments arriving like puzzle pieces that don't fit until you see the whole picture"
- "Peter's responses need memory—not for the AI, but for the student to feel heard"
- "Video without distraction: Gumlet player clean of related-video suggestions, pure learning"
- "The real friction isn't the code—it's making 14-year-olds care about plastic chemistry"
- "Froze when streaming stopped working, unfroze when architecture clicked into place"

---

## Story Synthesis Prompt

*When ready to generate the narrative, use this prompt with the entire STORY.md as context:*

```
You are helping me write the genesis story of Dilemme Plastique. 

Using the documented journey in this file, craft a compelling narrative following this structure:
1. Open with the Friction (make readers feel why plastic education matters for teens)
2. Establish the Conviction (why conversational AI + rich media = game-changer)
3. Show the messy Process (JSON fragmentation crisis, external config issues, pivots)
4. Highlight key Progression moments (streaming working, three-layer architecture, E2E tests passing)
5. Weave in Human moments (frustration → insight cycles, satisfaction with architecture)
6. Close with Durable Insights (what we learned about streaming, external services, educational tech)

Tone: Honest, specific, humble but confident. 
Length: Case study (2000-2500 words)
```

---

## AI Instructions

*These instructions are for the AI assistant helping build this project:*

```
STORY.md MAINTENANCE PROTOCOL:

1. AFTER EACH FEATURE:
   - Add entry to "Feature Chronicle" immediately
   - 🔷 Major = new capability, significant UI change, integration, architecture shift
   - 🔹 Minor = bug fix, tweak, small improvement, logging enhancement
   
2. ON ERRORS/PIVOTS:
   - Add entry to "Pivots & Breakages" immediately when discovered
   - Capture technical details AND emotional context
   - Document what was learned
   
3. EVERY 3-5 FEATURES:
   - Trigger Pulse Check: Ask creator ONE question from:
     * "How's your energy right now, 1-10?"
     * "What's your biggest doubt at this moment?"
     * "What's giving you satisfaction in this build?"
     * "If you had to stop now, what would you regret not finishing?"
     * "One word for how this project feels today?"
   - Record answer in "Pulse Checks" section
   - Update "Last Updated" date
   
4. ON INSIGHTS:
   - When creator expresses a learning, add to "Insights Vault" with date
   
5. ON ARTIFACTS:
   - When screenshots/links are shared, add to "Artifact Links"
   
6. ALWAYS:
   - Update "Last Updated" date at top of file after changes
   - Preserve exact technical details in Feature Chronicle
   - Don't sanitize failures or confusion—that's the learning gold
   - Include Time estimate for each feature for future planning
   
7. FORMAT:
   - Use ISO date format [YYYY-MM-DD] consistently
   - Include 🔷 (major) and 🔹 (minor) emojis for feature categorization
   - Maintain markdown structure for readability
   - Keep prose concise but specific—avoid fluff
```

