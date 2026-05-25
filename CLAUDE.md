# CLAUDE.md — Dilemme Plastique (Flowise)

> Lis d'abord : STORY.md, README.md, AGENTS.md (règles Warp/Codex)
> Contexte ulrfis : ~/CodeProjects/_shared/agent-context/00-memoways-context.md

## Contexte projet

Version desktop-only de Dilemme Plastique intégrant Flowise comme orchestrateur LLM pour "Peter". Interface split-screen : chat (1/3) + panel média (2/3) avec vidéos Gumlet et articles. Élèves 10-18 ans, français, sessions 20-30 min, sans authentification.

- Statut : 🟡 En cours (dernière session 2026-05-16 — monitoring PostHog)
- Outil principal : **Replit** (dev + hébergement + secrets)
- Passage par Claude Code : debug, optimisation, architecture

## Stack

- Frontend : React + TypeScript (client/)
- Backend : Express.js (API + proxy Flowise + SSE streaming)
- Base de données : Neon PostgreSQL via Drizzle ORM (`drizzle.config.ts`, migrations dans `migrations/`)
- LLM orchestration : **Flowise** (chatbot Peter, embeddings domaine plastique)
- Vidéos : Gumlet player (embeddings)
- Analytics : **PostHog** (replay sessions, web vitals, corrélation Flowise/TTS)
- Déploiement : Replit (intégré, secrets gérés dans Replit)

## Architecture clé

- Flowise est le cerveau de Peter — les appels passent par le proxy Express (`/api/flowise/*`)
- SSE (Server-Sent Events) pour le streaming des réponses Peter
- Desktop-only strict — ne pas introduire de responsive mobile sans décision explicite
- PostHog : monitoring poussé depuis 2026-05-16, corréler les métriques avant toute modif performance

## Commandes (depuis AGENTS.md)

```bash
npm run dev     # dev server (port 5000 ou $PORT)
npm run check   # TypeScript check
npm run build   # build prod (Vite + esbuild)
npm start       # server prod
npm run db:push # sync schéma Drizzle → Neon
```

## Règles projet

- **Flowise URL et tokens** : dans Replit secrets uniquement, jamais dans le code
- **Ne pas bypasser le proxy Express** pour appeler Flowise directement depuis le client
- **SSE streaming** : ne pas refactoriser sans comprendre la gestion des connexions longues
- Desktop-only : pas de breakpoints mobile, pas de touch events
- Drizzle : utiliser `npm run db:push` pour les migrations, ne pas modifier le schéma Neon en live
- Voir STORY.md pour l'historique PostHog et les décisions de monitoring

## Workflow multi-outils

Ce projet vit principalement sur Replit. Quand tu arrives depuis Claude Code :
1. `git pull` — vérifier que tu es à jour
2. Lire STORY.md §Dernière session pour reprendre le contexte
3. `npm run check` — TypeScript propre avant tout
4. Commit + push avant de repartir sur Replit
