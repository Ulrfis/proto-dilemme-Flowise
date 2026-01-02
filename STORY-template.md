# [Project Name] — Development Story

> **Status**: 🔴 Not Started / 🟡 In Progress / 🟢 Complete  
> **Creator**: [Your Name]  
> **Started**: [YYYY-MM-DD]  
> **Last Updated**: [YYYY-MM-DD]  

---

## Genesis Block

*Fill this section BEFORE starting development. This is your "before" snapshot.*

### The Friction

*What personal pain, frustration, or observation sparked this project? Be specific and honest.*

```
[Describe the problem you're solving. What frustration or gap did you notice?
What's broken in the current state of things? Be specific and personal.]
```

### The Conviction

*Why does this matter? Why you? Why now?*

```
[Why are you the right person to build this? What unique perspective do you bring?
What makes this the right moment to tackle this problem?]
```

### Initial Vision

*What did you imagine building? Paste your original PRD, brief, or first prompt here.*

```
[Your original project description, requirements, or first prompt to the AI.
This becomes your "before" snapshot to compare against later.]
```

### Target Human

*Who is this for? One specific person archetype.*

```
[Name], [age/role], [context]
Context: [Where/when will they use this?]
Struggle: [What problem do they face? What frustrates them?]
Success: [What does success look like for them after using your product?]
How this helps: [Specifically how your solution addresses their struggle]
```

### Tools Arsenal

*What vibe-coding tools are you using?*

| Tool | Role |
|------|------|
| [Tool 1] | [What you use it for] |
| [Tool 2] | [What you use it for] |
| [Tool 3] | [What you use it for] |

---

## Feature Chronicle

*Each feature gets an entry. Major features (🔷) get full treatment. Minor features (🔹) get brief notes.*

### [YYYY-MM-DD] — [Feature Name] 🔷

**Intent**: [One sentence: what were you trying to achieve?]

**Prompt(s)**: 
```
[The actual prompt(s) you gave to the AI or your internal brief]
```

**Tool**: [Which AI/tool did you use?]

**Outcome**: 
- [What actually got built]
- [Key technical decisions]
- [What works now]

**Surprise**: 
[Something unexpected that emerged—technical, creative, or insight]

**Friction**: 
[What didn't work at first? What was harder than expected?]

**Resolution**: 
[How did you solve the friction? What approach worked?]

**Time**: [Approximate time spent]

---

### [YYYY-MM-DD] — [Minor Feature Name] 🔹

**Intent**: [Brief description]

**Outcome**: 
- [What got done]

**Time**: [Approximate time]

---

## Pivots & Breakages

*Major direction changes, things that broke badly, abandoned approaches. This is where story gold lives.*

### [YYYY-MM-DD] — [What Broke/Changed]

**What broke / What changed**: 
[Describe what happened—be specific about the failure or pivot]

**Why**: 
[Root cause analysis—why did this happen?]

**What you learned**: 
- [Lesson 1]
- [Lesson 2]
- [Transferable insight for future projects]

**Emotional state**: 
[How did this feel? Frustration, relief, surprise? This humanizes the story.]

---

## Pulse Checks

*Subjective snapshots. AI should prompt these every 3-5 features or at major moments.*

### [YYYY-MM-DD] — Pulse Check #1

**Energy level** (1-10): [X]/10

**Current doubt**: 
[What's your biggest uncertainty right now?]

**Current satisfaction**: 
[What's working well? What are you proud of?]

**If you stopped now, what would you regret?**: 
[What feels incomplete or unfinished?]

**One word for how this feels**: 
[Single word that captures your emotional state]

---

## Insights Vault

*Learnings that transcend this specific project. Things you'd tell someone starting a similar journey.*

- **[YYYY-MM-DD]**: [Transferable learning about technology, process, or craft]
- **[YYYY-MM-DD]**: [Another insight worth preserving]

---

## Artifact Links

*Screenshots, recordings, deployed URLs, social posts — external evidence of the journey.*

| Date | Type | Link/Location | Note |
|------|------|---------------|------|
| [YYYY-MM-DD] | [Screenshot/Video/URL/Code] | [Link or file path] | [Brief description] |

---

## Narrative Seeds

*Raw material for the final story. Quotes, moments, metaphors that emerged during the build.*

- "[A quote or phrase that captures a moment]"
- "[A metaphor that emerged]"
- "[A surprising realization in your own words]"

---

## Story Synthesis Prompt

*When ready to generate the narrative, use this prompt with the entire STORY.md as context:*

```
You are helping me write the genesis story of [Project Name]. 

Using the documented journey in this file, craft a compelling narrative following this structure:
1. Open with the Friction (make readers feel the problem viscerally)
2. Establish the Conviction (why this solution, why now, why you)
3. Show the messy Process (failures, pivots, unexpected challenges)
4. Highlight key Progression moments (breakthroughs, things clicking into place)
5. Weave in Human moments (frustration → insight cycles, emotional journey)
6. Close with Durable Insights (what you learned that applies beyond this project)

Tone: Honest, specific, humble but confident. 
Length: [Choose: Tweet thread (280 chars x 5-10) / Blog post (800-1200 words) / Case study (2000-2500 words)]
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
