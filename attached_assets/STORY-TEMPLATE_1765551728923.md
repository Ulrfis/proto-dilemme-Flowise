# [PROJECT_NAME] — Development Story

> **Status**: 🟡 In Progress | 🟢 Complete | 🔴 Paused  
> **Creator**: [Name]  
> **Started**: [YYYY-MM-DD]  
> **Last Updated**: [YYYY-MM-DD]  

---

## Genesis Block

*Fill this section BEFORE starting development. This is your "before" snapshot.*

### The Friction

*What personal pain, frustration, or observation sparked this project? Be specific and honest.*

```
[Your authentic starting point — the "I was frustrated because..." or "I noticed that..." moment]
```

### The Conviction

*Why does this matter? Why you? Why now?*

```
[Your "why" — not the business case, but the personal belief]
```

### Initial Vision

*What did you imagine building? Paste your original PRD, brief, or first prompt here.*

```
[Original PRD or initial description — preserve exactly as written, warts and all]
```

### Target Human

*Who is this for? One specific person archetype.*

```
[Describe them: their context, their struggle, what success looks like for them]
```

### Tools Arsenal

*What vibe-coding tools are you using?*

| Tool | Role |
|------|------|
| [e.g., Lovable] | [e.g., UI prototyping] |
| [e.g., Claude] | [e.g., Logic & integrations] |

---

## Feature Chronicle

*Each feature gets an entry. Major features (🔷) get full treatment. Minor features (🔹) get brief notes.*

### Entry Template

```markdown
### [DATE] — [FEATURE NAME] 🔷/🔹

**Intent**: What you wanted to achieve
**Prompt(s)**: Key prompts used (can be summarized)
**Tool**: Which tool handled this
**Outcome**: What actually happened
**Surprise**: Anything unexpected (good or bad)
**Friction**: Blockers encountered
**Resolution**: How blockers were solved (if solved)
**Time**: Approximate duration
```

---

### [YYYY-MM-DD] — [Feature Name] 🔷

**Intent**: 

**Prompt(s)**: 
```
[paste key prompt or summarize]
```

**Tool**: 

**Outcome**: 

**Surprise**: 

**Friction**: 

**Resolution**: 

**Time**: 

---

## Pivots & Breakages

*Major direction changes, things that broke badly, abandoned approaches. This is where story gold lives.*

### [DATE] — [What Happened]

**What broke / What changed**: 

**Why**: 

**What you learned**: 

**Emotional state**: 

---

## Pulse Checks

*Subjective snapshots. AI should prompt these every 3-5 features or at major moments.*

### [DATE] — Pulse Check #[N]

**Energy level** (1-10): 

**Current doubt**: 

**Current satisfaction**: 

**If you stopped now, what would you regret?**: 

**One word for how this feels**: 

---

## Insights Vault

*Learnings that transcend this specific project. Things you'd tell someone starting a similar journey.*

- [DATE]: [Insight]
- [DATE]: [Insight]

---

## Artifact Links

*Screenshots, recordings, deployed URLs, social posts — external evidence of the journey.*

| Date | Type | Link/Location | Note |
|------|------|---------------|------|
| | | | |

---

## Narrative Seeds

*Raw material for the final story. Quotes, moments, metaphors that emerged during the build.*

- "[Something you said or thought that captures a moment]"
- "[A metaphor that emerged]"
- "[A user reaction worth preserving]"

---

## Story Synthesis Prompt

*When ready to generate the narrative, use this prompt with the entire STORY.md as context:*

```
You are helping me write the genesis story of [PROJECT_NAME]. 

Using the documented journey in this file, craft a compelling narrative following this structure:
1. Open with the Friction (make readers feel the problem)
2. Establish my Conviction (why I had to build this)
3. Show the messy Process (failures, pivots, surprises)
4. Highlight key Progression moments (the wins that built momentum)
5. Weave in Human moments (from Pulse Checks)
6. Close with Durable Insights (what transcends this project)

Tone: Honest, specific, humble but confident. Like Pieter Levels meets Julia Evans.
Length: [specify: tweet thread / blog post / case study]
```

---

## AI Instructions

*These instructions are for the AI assistant helping build this project:*

```
STORY.md MAINTENANCE PROTOCOL:

1. AFTER EACH FEATURE:
   - Add entry to "Feature Chronicle"
   - 🔷 Major = new capability, significant UI change, integration
   - 🔹 Minor = bug fix, tweak, small improvement
   
2. ON ERRORS/PIVOTS:
   - Add entry to "Pivots & Breakages" immediately
   - Capture emotional context if shared
   
3. EVERY 3-5 FEATURES:
   - Trigger Pulse Check: Ask creator ONE question from:
     * "How's your energy right now, 1-10?"
     * "What's your biggest doubt at this moment?"
     * "What's giving you satisfaction in this build?"
     * "If you had to stop now, what would you regret not finishing?"
     * "One word for how this project feels today?"
   - Record answer in "Pulse Checks" section
   
4. ON INSIGHTS:
   - When creator expresses a learning, add to "Insights Vault"
   
5. ON ARTIFACTS:
   - When screenshots/links are shared, add to "Artifact Links"
   
6. ALWAYS:
   - Update "Last Updated" date
   - Preserve exact prompts when significant
   - Don't sanitize failures or confusion
```
