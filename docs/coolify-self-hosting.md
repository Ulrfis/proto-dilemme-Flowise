# Déployer Dilemme Plastique sur Coolify — Tutoriel complet

> **Objectif :** Sortir l'application de Replit et l'héberger de façon 100 % autonome sur un serveur VPS ou dédié, via [Coolify](https://coolify.io) (self-hosted PaaS open-source). À la fin de ce guide l'app tourne dans un conteneur Docker, avec sa propre base PostgreSQL, sans aucune dépendance à l'environnement Replit.

---

## Table des matières

1. [Prérequis](#1-prérequis)
2. [Modifications de code obligatoires](#2-modifications-de-code-obligatoires)
   - 2.1 Remplacer le driver Neon par le driver PostgreSQL standard
   - 2.2 Nettoyer les plugins Vite propres à Replit
   - 2.3 Nettoyer `client/index.html`
   - 2.4 Mettre à jour la page À propos
   - 2.5 Adapter le `trust proxy` pour Coolify
3. [Variables d'environnement complètes](#3-variables-denvironnement-complètes)
4. [Schéma de base de données](#4-schéma-de-base-de-données)
5. [Dockerfile de production](#5-dockerfile-de-production)
6. [docker-compose.yml (stack complète)](#6-docker-composeyml-stack-complète)
7. [Migration des données Neon → PostgreSQL auto-hébergé](#7-migration-des-données-neon--postgresql-auto-hébergé)
8. [Déploiement dans Coolify pas à pas](#8-déploiement-dans-coolify-pas-à-pas)
9. [Vérification post-déploiement](#9-vérification-post-déploiement)
10. [Résolution des problèmes courants](#10-résolution-des-problèmes-courants)

---

## 1. Prérequis

### Côté serveur
| Composant | Version minimale | Notes |
|-----------|-----------------|-------|
| VPS / serveur dédié | — | 2 vCPU, 2 Go RAM minimum recommandé |
| Docker Engine | 24+ | Installé avant Coolify |
| Coolify | v4.x | [docs.coolify.io/installation](https://docs.coolify.io/installation) |
| Nom de domaine | — | Pointé vers l'IP du serveur (A record) |

### Côté développement (machine locale)
- `git` pour cloner et pousser le code
- `node` 20+ + `npm` (pour tester le build localement si besoin)
- `psql` ou DBeaver pour l'éventuelle migration de données

### Accès aux services externes (inchangés)
- Compte [Flowise](https://flowiseai.com) (self-hosted ou cloud) avec chatflow configuré
- Compte [ElevenLabs](https://elevenlabs.io) (TTS/STT) — ou OpenAI
- Compte [PostHog](https://posthog.com) (analytics) — optionnel
- Compte [Rectify](https://rectify.so) (enregistrement sessions) — optionnel

---

## 2. Modifications de code obligatoires

Toutes les modifications ci-dessous doivent être faites dans le dépôt Git **avant** de configurer Coolify.

### 2.1 Remplacer le driver Neon par le driver PostgreSQL standard

Le fichier `server/db.ts` utilise `@neondatabase/serverless` qui passe par WebSocket — c'est spécifique à Neon. Pour PostgreSQL auto-hébergé (ou tout autre PostgreSQL), il faut le remplacer par `postgres` (driver `postgres.js`).

**Étape A — Installer le nouveau package**

```bash
npm install postgres
npm uninstall @neondatabase/serverless
```

**Étape B — Remplacer `server/db.ts`**

```typescript
// server/db.ts  (version Coolify / PostgreSQL standard)
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL n'est pas définie. La base est nécessaire pour persister les conversations.",
  );
}

const client = postgres(process.env.DATABASE_URL, {
  max: 5,
  idle_timeout: 20,
  connect_timeout: 5,
});

export const db = drizzle(client, { schema });
```

> **Note :** Si vous préférez conserver Neon (cloud managé), vous pouvez aussi utiliser le driver HTTP de Neon sans WebSocket. Dans ce cas ne modifiez que le pool config et remplacez `drizzle-orm/neon-serverless` par `drizzle-orm/neon-http`.

**Étape C — Mettre à jour `drizzle.config.ts`** (si vous utilisez `drizzle-kit push` pour les migrations)

Aucune modification nécessaire — `drizzle.config.ts` lit `DATABASE_URL` directement.

---

### 2.2 Nettoyer les plugins Vite propres à Replit

Dans `vite.config.ts`, les plugins Replit sont déjà gardés derrière `process.env.REPL_ID !== undefined` — ils ne se chargent donc pas en dehors de Replit. Cependant les packages sont encore dans `devDependencies` et peuvent lever des avertissements au build. Il est propre de les supprimer.

```bash
npm uninstall @replit/vite-plugin-cartographer @replit/vite-plugin-runtime-error-modal
```

Puis éditer `vite.config.ts` pour supprimer les deux imports et la condition :

```typescript
// vite.config.ts  (version Coolify)
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
```

---

### 2.3 Nettoyer `client/index.html`

Deux éléments à corriger :

**A — Supprimer le script bannière Replit** (dernière balise `<script>` dans `<body>`) :

```html
<!-- À SUPPRIMER : -->
<script type="text/javascript" src="https://replit.com/public/js/replit-dev-banner.js"></script>
```

**B — Mettre à jour les URLs Open Graph** (remplacer `dilemme-plastique.replit.app` par votre domaine) :

```html
<meta property="og:url" content="https://votre-domaine.com/" />
<meta property="twitter:url" content="https://votre-domaine.com/" />
```

---

### 2.4 Mettre à jour la page À propos

Dans `client/src/pages/about.tsx`, deux mentions "Replit" sont à remplacer par votre infrastructure réelle :

```tsx
// Ligne ~97 — Avant :
<p>... L'infrastructure Replit et le serveur Flowise (Suisse) peuvent techniquement accéder aux conversations</p>

// Après :
<p>... Notre infrastructure d'hébergement et le serveur Flowise (Suisse) peuvent techniquement accéder aux conversations</p>

// Ligne ~142 — Avant :
<p><span className="font-medium">Hébergement :</span> Plateforme Replit avec chiffrement HTTPS</p>

// Après :
<p><span className="font-medium">Hébergement :</span> Serveur auto-hébergé avec chiffrement HTTPS (Let's Encrypt via Coolify)</p>
```

---

### 2.5 Adapter le `trust proxy` pour Coolify

Dans `server/index.ts`, la ligne :

```typescript
app.set('trust proxy', 1);
```

est **à conserver** — Coolify utilise Traefik comme reverse proxy, et cette configuration est nécessaire pour que le rate limiting fonctionne sur la vraie IP cliente. Le commentaire peut être mis à jour :

```typescript
// Trust the reverse proxy (Traefik via Coolify) so req.ip reflects the real client IP
// (needed for per-user rate limiting instead of per-proxy rate limiting)
app.set('trust proxy', 1);
```

---

## 3. Variables d'environnement complètes

Ces variables doivent être configurées dans Coolify (section **Environment Variables** de l'application).

> Les variables préfixées `VITE_` sont injectées **au moment du build** dans le bundle frontend. Elles doivent être connues avant le `npm run build`.

### Variables obligatoires

| Variable | Exemple | Description |
|----------|---------|-------------|
| `NODE_ENV` | `production` | Mode de l'application |
| `PORT` | `5000` | Port interne du serveur Express |
| `DATABASE_URL` | `postgresql://user:pass@host:5432/dbname` | URL de connexion PostgreSQL (format standard) |
| `FLOWISE_HOST` | `https://flowise.mon-serveur.com` | URL de base de l'instance Flowise |
| `FLOWISE_CHATFLOW_ID` | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` | ID du chatflow "Peter" dans Flowise |
| `VITE_FLOWISE_CHATFLOW_ID` | *(même valeur)* | Même ID, exposé au frontend au build |
| `TTS_PROVIDER` | `elevenlabs` | Provider TTS actif : `elevenlabs`, `openai`, ou `none` |
| `STT_PROVIDER` | `openai` | Provider STT actif : `elevenlabs`, `openai`, `deepgram`, ou `none` |

### Variables selon le provider TTS/STT choisi

| Variable | Requis si | Exemple | Description |
|----------|-----------|---------|-------------|
| `ELEVENLABS_API_KEY` | TTS ou STT = `elevenlabs` | `sk_...` | Clé API ElevenLabs |
| `ELEVENLABS_VOICE_ID` | TTS = `elevenlabs` | `pNInz6obpgDQGcFmaJgB` | ID de la voix ElevenLabs pour Peter |
| `OPENAI_API_KEY` | TTS ou STT = `openai` | `sk-...` | Clé API OpenAI |
| `OPENAI_TTS_VOICE` | TTS = `openai` (optionnel) | `nova` | Voix OpenAI (défaut : `nova`) |
| `DEEPGRAM_API_KEY` | STT = `deepgram` | `...` | Clé API Deepgram |
| `DEEPGRAM_MODEL` | STT = `deepgram` (optionnel) | `nova-2` | Modèle Deepgram (défaut : `nova-2`) |

### Variables optionnelles

| Variable | Défaut | Description |
|----------|--------|-------------|
| `FLOWISE_API_KEY` | *(vide)* | Clé API Flowise si l'instance est protégée |
| `FLOWISE_KEEPALIVE` | `true` | Active le warmer HTTP Flowise (recommandé) |
| `ADMIN_PASSWORD` | *(vide)* | Mot de passe pour les endpoints admin `/api/admin/*` |
| `DEBUG_TRACES_RETENTION_DAYS` | `30` | Rétention des traces debug en jours |
| `TTS_CACHE_MAX_ENTRIES` | `100` | Taille max du cache TTS en mémoire |
| `TTS_PREWARM` | `1` | `0` pour désactiver le pré-chauffage TTS au démarrage |
| `POSTHOG_SERVER_KEY` | *(vide)* | Clé PostHog server-side (analytics backend) |
| `VITE_POSTHOG_KEY` | *(vide)* | Clé PostHog frontend (injectée au build) |
| `VITE_POSTHOG_HOST` | *(vide)* | Host PostHog (`https://eu.posthog.com`) |
| `ALLOW_VOICE_BENCH` | *(vide)* | Active l'endpoint de benchmark voix (dev uniquement) |

---

## 4. Schéma de base de données

La base PostgreSQL doit contenir 4 tables. Le SQL complet est dans `migrations/0000_old_zemo.sql`. Voici comment l'appliquer sur une base fraîche :

```bash
# Connexion à la base et application du schéma
psql "$DATABASE_URL" -f migrations/0000_old_zemo.sql
```

Ou avec `drizzle-kit` si vous avez accès à l'environnement de build :

```bash
DATABASE_URL="postgresql://..." npm run db:push
```

### Tables créées

| Table | Description |
|-------|-------------|
| `conversation_sessions` | Une ligne par session élève (id UUID, prénom, horodatage) |
| `conversation_messages` | Messages échangés (user / peter) avec FK vers la session |
| `flowise_traces` | Mesures de latence Flowise (TTFT, total, tokens, statut) |
| `tts_traces` | Mesures de latence TTS (durée, cache hit, provider, statut) |

### SQL complet de référence

```sql
CREATE TABLE "conversation_sessions" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "first_name" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "conversation_messages" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "session_id" uuid NOT NULL,
    "sender" text NOT NULL,
    "content" text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "flowise_traces" (
    "id" text PRIMARY KEY NOT NULL,
    "chat_id" text NOT NULL,
    "question" text NOT NULL,
    "started_at" timestamp with time zone NOT NULL,
    "finished_at" timestamp with time zone NOT NULL,
    "connect_ms" integer NOT NULL,
    "ttft_ms" integer NOT NULL,
    "total_ms" integer NOT NULL,
    "tokens" integer NOT NULL,
    "chars" integer NOT NULL,
    "nodes" integer NOT NULL,
    "tools" integer NOT NULL,
    "unknown_events" integer NOT NULL,
    "status" text NOT NULL,
    "error_message" text
);

CREATE TABLE "tts_traces" (
    "id" text PRIMARY KEY NOT NULL,
    "text_preview" text NOT NULL,
    "chars" integer NOT NULL,
    "started_at" timestamp with time zone NOT NULL,
    "duration_ms" integer NOT NULL,
    "cache_hit" boolean NOT NULL,
    "provider" text NOT NULL,
    "status" text NOT NULL,
    "error_message" text
);

ALTER TABLE "conversation_messages"
    ADD CONSTRAINT "conversation_messages_session_id_fk"
    FOREIGN KEY ("session_id") REFERENCES "conversation_sessions"("id")
    ON DELETE cascade ON UPDATE no action;

CREATE INDEX "conv_msg_session_idx" ON "conversation_messages"
    USING btree ("session_id", "created_at");

CREATE INDEX "flowise_traces_started_at_idx" ON "flowise_traces"
    USING btree ("started_at");

CREATE INDEX "tts_traces_started_at_idx" ON "tts_traces"
    USING btree ("started_at");
```

---

## 5. Dockerfile de production

Créer ce fichier à la **racine du projet** :

```dockerfile
# ─── Stage 1 : Build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Dépendances d'abord (couche cache Docker)
COPY package*.json ./
RUN npm ci

# Code source complet
COPY . .

# Les variables VITE_ doivent être disponibles au build.
# Passez-les via --build-arg dans Coolify (voir section 8).
ARG VITE_FLOWISE_CHATFLOW_ID
ARG VITE_POSTHOG_KEY
ARG VITE_POSTHOG_HOST

ENV VITE_FLOWISE_CHATFLOW_ID=$VITE_FLOWISE_CHATFLOW_ID
ENV VITE_POSTHOG_KEY=$VITE_POSTHOG_KEY
ENV VITE_POSTHOG_HOST=$VITE_POSTHOG_HOST

# Build frontend (Vite) + backend (esbuild)
RUN npm run build

# ─── Stage 2 : Production ────────────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

# Seulement les dépendances de production
COPY package*.json ./
RUN npm ci --omit=dev

# Artefacts de build
COPY --from=builder /app/dist ./dist

# Assets statiques publics (favicon, og-image…)
COPY --from=builder /app/client/public ./dist/public/

ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000

# Health check : le serveur répond sur /api/debug/health
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD wget -qO- http://localhost:5000/api/debug/health || exit 1

CMD ["node", "dist/index.js"]
```

> **Pourquoi deux stages ?** Le stage `builder` contient tous les devDependencies et outils de build (tsx, esbuild, vite, typescript…). Le stage `production` ne garde que les packages runtime — l'image finale est ~2× plus légère.

---

## 6. docker-compose.yml (stack complète)

Si vous voulez faire tourner l'app **et** PostgreSQL ensemble (par exemple sur un VPS sans Coolify), voici un `docker-compose.yml` de référence :

```yaml
version: "3.9"

services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: dilemme_plastique
      POSTGRES_USER: dp_user
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}   # via .env
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./migrations/0000_old_zemo.sql:/docker-entrypoint-initdb.d/01_schema.sql:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U dp_user -d dilemme_plastique"]
      interval: 10s
      timeout: 5s
      retries: 5

  app:
    build:
      context: .
      dockerfile: Dockerfile
      args:
        VITE_FLOWISE_CHATFLOW_ID: ${VITE_FLOWISE_CHATFLOW_ID}
        VITE_POSTHOG_KEY: ${VITE_POSTHOG_KEY}
        VITE_POSTHOG_HOST: ${VITE_POSTHOG_HOST}
    restart: unless-stopped
    ports:
      - "5000:5000"
    environment:
      NODE_ENV: production
      PORT: "5000"
      DATABASE_URL: postgresql://dp_user:${POSTGRES_PASSWORD}@postgres:5432/dilemme_plastique
      FLOWISE_HOST: ${FLOWISE_HOST}
      FLOWISE_CHATFLOW_ID: ${FLOWISE_CHATFLOW_ID}
      FLOWISE_API_KEY: ${FLOWISE_API_KEY}
      TTS_PROVIDER: ${TTS_PROVIDER}
      STT_PROVIDER: ${STT_PROVIDER}
      ELEVENLABS_API_KEY: ${ELEVENLABS_API_KEY}
      ELEVENLABS_VOICE_ID: ${ELEVENLABS_VOICE_ID}
      OPENAI_API_KEY: ${OPENAI_API_KEY}
      ADMIN_PASSWORD: ${ADMIN_PASSWORD}
      POSTHOG_SERVER_KEY: ${POSTHOG_SERVER_KEY}
    depends_on:
      postgres:
        condition: service_healthy

volumes:
  postgres_data:
```

Créez un fichier `.env` à la racine (jamais commité en git) :

```bash
# .env — exemple
POSTGRES_PASSWORD=motdepasse_tres_long_et_aleatoire
FLOWISE_HOST=https://flowise.mon-serveur.com
FLOWISE_CHATFLOW_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
FLOWISE_API_KEY=
TTS_PROVIDER=elevenlabs
STT_PROVIDER=openai
ELEVENLABS_API_KEY=sk_...
ELEVENLABS_VOICE_ID=pNInz6obpgDQGcFmaJgB
OPENAI_API_KEY=sk-...
ADMIN_PASSWORD=motdepasse_debug
POSTHOG_SERVER_KEY=phc_...
VITE_FLOWISE_CHATFLOW_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
VITE_POSTHOG_KEY=phc_...
VITE_POSTHOG_HOST=https://eu.posthog.com
```

---

## 7. Migration des données Neon → PostgreSQL auto-hébergé

Si vous voulez conserver l'historique des sessions et des traces, exportez-les depuis Neon avant de couper.

### Export depuis Neon

```bash
# Récupérez la DATABASE_URL Neon depuis les secrets Replit
# puis :
pg_dump \
  --no-owner \
  --no-acl \
  --format=custom \
  --table=conversation_sessions \
  --table=conversation_messages \
  --table=flowise_traces \
  --table=tts_traces \
  "$NEON_DATABASE_URL" \
  -f dilemme_plastique_backup.dump
```

### Import vers le nouveau PostgreSQL

```bash
# Appliquer d'abord le schéma sur la base vide :
psql "$NEW_DATABASE_URL" -f migrations/0000_old_zemo.sql

# Puis restaurer les données :
pg_restore \
  --no-owner \
  --no-acl \
  --data-only \
  -d "$NEW_DATABASE_URL" \
  dilemme_plastique_backup.dump
```

### Export simplifié avec psql (si pg_dump non disponible)

```bash
# Export CSV session par session
psql "$NEON_DATABASE_URL" -c "\COPY conversation_sessions TO 'sessions.csv' CSV HEADER"
psql "$NEON_DATABASE_URL" -c "\COPY conversation_messages TO 'messages.csv' CSV HEADER"
psql "$NEON_DATABASE_URL" -c "\COPY flowise_traces TO 'flowise.csv' CSV HEADER"
psql "$NEON_DATABASE_URL" -c "\COPY tts_traces TO 'tts.csv' CSV HEADER"

# Import
psql "$NEW_DATABASE_URL" -c "\COPY conversation_sessions FROM 'sessions.csv' CSV HEADER"
psql "$NEW_DATABASE_URL" -c "\COPY conversation_messages FROM 'messages.csv' CSV HEADER"
psql "$NEW_DATABASE_URL" -c "\COPY flowise_traces FROM 'flowise.csv' CSV HEADER"
psql "$NEW_DATABASE_URL" -c "\COPY tts_traces FROM 'tts.csv' CSV HEADER"
```

> **Important :** Les données de sessions/messages sont anonymes (pas d'identifiant personnel persisté côté serveur), donc la migration est optionnelle. Les traces debug (flowise_traces, tts_traces) sont purement opérationnelles.

---

## 8. Déploiement dans Coolify pas à pas

### 8.1 Préparer le dépôt Git

L'app doit être dans un dépôt Git accessible par Coolify (GitHub, GitLab, Gitea auto-hébergé, ou dépôt public).

```bash
# Depuis Replit ou votre machine locale :
git remote add coolify git@github.com:votre-org/dilemme-plastique.git
git push coolify main
```

Assurez-vous que le `Dockerfile` et le `docker-compose.yml` sont à la racine et commités.

### 8.2 Créer la base PostgreSQL dans Coolify

1. Dans Coolify → **Databases** → **+ New Database**
2. Choisir **PostgreSQL 16**
3. Nom : `dilemme-plastique-db`
4. Définir un mot de passe fort
5. Cliquer **Deploy** — noter l'URL de connexion interne générée (format `postgresql://...`)

### 8.3 Créer l'application

1. **Projects** → **+ New Project** → nommez-le `dilemme-plastique`
2. **+ New Resource** → **Application**
3. **Source** : choisir votre dépôt Git et la branche `main`
4. **Build Pack** : sélectionner **Dockerfile** (le Dockerfile est à la racine)

### 8.4 Configurer les variables d'environnement

Dans l'onglet **Environment Variables** de l'application, ajouter toutes les variables du [tableau section 3](#3-variables-denvironnement-complètes).

**Variables critiques `VITE_*` :** Les marquer comme **Build Variables** (elles seront passées en `--build-arg` lors du `docker build`). Sans cela le chatbot et les analytics ne fonctionneront pas en production.

| Variable | Type Coolify |
|----------|-------------|
| `VITE_FLOWISE_CHATFLOW_ID` | **Build variable** |
| `VITE_POSTHOG_KEY` | **Build variable** |
| `VITE_POSTHOG_HOST` | **Build variable** |
| Toutes les autres | Runtime variable |

### 8.5 Configurer le domaine et HTTPS

1. Onglet **Domains** → **+ Add Domain**
2. Entrer votre domaine : `dilemme-plastique.votre-domaine.com`
3. Coolify configure automatiquement Let's Encrypt (Traefik)
4. Le port interne est `5000` — vérifier que c'est bien ce port qui est configuré

### 8.6 Configurer le health check

1. Onglet **Health Check**
2. Path : `/api/debug/health`
3. Port : `5000`
4. Interval : `30s`, Timeout : `10s`, Start period : `45s`

### 8.7 Appliquer le schéma DB

Avant le premier démarrage (ou juste après le premier déploiement) :

**Option A — Via le terminal Coolify**

Dans Coolify → Application → **Terminal** :

```bash
node -e "
const { exec } = require('child_process');
exec('node dist/index.js migrate', (e,o,r) => { console.log(o,r); });
"
```

**Option B — Depuis votre machine locale** (recommandée)

```bash
# Récupérer l'URL DB depuis Coolify → Database → Connection Details
DATABASE_URL="postgresql://..." npm run db:push
```

**Option C — Via docker-compose** (si vous utilisez la stack complète)

Le fichier SQL est monté dans `/docker-entrypoint-initdb.d/` — PostgreSQL l'applique automatiquement à la première initialisation du volume.

### 8.8 Premier déploiement

1. Cliquer **Deploy** dans Coolify
2. Suivre les logs de build (Vite + esbuild — environ 2-3 minutes)
3. Vérifier les logs de démarrage : chercher `[express] serving on port 5000`, `[FlowiseWarmer] Started`, `[TTS Prewarm]`

---

## 9. Vérification post-déploiement

### Checklist rapide

| Test | URL / commande | Résultat attendu |
|------|----------------|-----------------|
| Page d'accueil | `https://votre-domaine.com/` | Écran de bienvenue, bouton "Démarrer l'aventure" |
| Console debug | `https://votre-domaine.com/debug` | Tous les services verts ou amber |
| Santé API | `https://votre-domaine.com/api/debug/health` | JSON avec `services` et `generatedAt` |
| Flowise warmer | Console debug → "Flowise Warmer (Keep-Alive)" | Status : Actif, dernier ping < 60s |
| TTS prewarm | Logs du conteneur | `[TTS Prewarm] intro cached` et `welcome cached` |
| Chat Peter | Page d'accueil → démarrer | Premier message de Peter sans erreur |
| Voix TTS | Interagir avec Peter | Audio joué (si TTS_PROVIDER ≠ none) |

### Vérifier les logs en direct

```bash
# Via Coolify UI : Application → Logs → Live

# Ou directement sur le serveur :
docker logs -f <container_id>
```

### Vérifier la connexion DB

```bash
# Depuis le terminal du conteneur (Coolify → Terminal) :
node -e "
const { db } = await import('./dist/index.js');
console.log('DB OK');
"
# Ou plus simplement, visiter /debug et vérifier la section "Rétention des traces DB"
```

---

## 10. Résolution des problèmes courants

### ❌ `DATABASE_URL n'est pas définie`

**Cause :** La variable n'est pas injectée au runtime.  
**Fix :** Dans Coolify → Environment Variables, vérifier que `DATABASE_URL` est bien une **Runtime variable** (pas seulement Build).

---

### ❌ Le chatbot ne répond pas / `FLOWISE_HOST non configuré`

**Cause :** Variables `FLOWISE_HOST` ou `FLOWISE_CHATFLOW_ID` manquantes.  
**Fix :** Ajouter les deux variables en Runtime. Vérifier que l'instance Flowise est accessible depuis le réseau du serveur Coolify (`curl https://flowise.mon-serveur.com/health` depuis le conteneur).

---

### ❌ La voix TTS ne fonctionne pas

**Cause :** `TTS_PROVIDER` configuré mais clé API manquante ou incorrecte.  
**Fix :** Vérifier `ELEVENLABS_API_KEY` / `OPENAI_API_KEY` selon le provider. Tester depuis `/debug` → section "Services connectés" — le badge TTS doit être vert.

---

### ❌ Build échoué : `Cannot find module '@replit/vite-plugin-...'`

**Cause :** Les packages Replit n'ont pas été désinstallés mais le code y fait encore référence.  
**Fix :** Vérifier que `vite.config.ts` a bien été mis à jour (section 2.2) et que les packages sont bien absents de `package.json`.

---

### ❌ VITE_ variables vides en production (`undefined`)

**Cause :** Les variables `VITE_*` ne sont pas marquées comme **Build variables** dans Coolify — elles ne sont donc pas passées au `docker build`.  
**Fix :** Dans Coolify → Environment Variables, cocher "Build variable" pour chaque variable `VITE_*`. Puis relancer un déploiement complet (pas seulement un restart).

---

### ❌ Rate limiting bloque les utilisateurs légitimes

**Cause :** Le `trust proxy` n'est pas correctement configuré, toutes les requêtes semblent venir de l'IP de Traefik.  
**Fix :** Vérifier que `app.set('trust proxy', 1)` est bien présent dans `server/index.ts`. Si Coolify utilise plusieurs niveaux de proxy, essayer `app.set('trust proxy', 'loopback, linklocal, uniquelocal')`.

---

### ❌ PostgreSQL : `password authentication failed`

**Cause :** URL de connexion incorrecte (caractères spéciaux non encodés dans le mot de passe).  
**Fix :** Encoder les caractères spéciaux du mot de passe : `@` → `%40`, `#` → `%23`, etc. Ou utiliser les paramètres séparés : `postgresql://user:pass@host:5432/db?sslmode=require`.

---

### ❌ Migrations non appliquées : `relation "conversation_sessions" does not exist`

**Cause :** Le schéma n'a pas été appliqué sur la nouvelle base.  
**Fix :** Exécuter `psql "$DATABASE_URL" -f migrations/0000_old_zemo.sql` ou `npm run db:push` avec la bonne `DATABASE_URL`.

---

## Annexe — Récapitulatif des fichiers modifiés

| Fichier | Modification |
|---------|-------------|
| `server/db.ts` | Remplacer driver Neon par `postgres` standard |
| `vite.config.ts` | Supprimer imports et plugins `@replit/*` |
| `client/index.html` | Supprimer script bannière Replit, mettre à jour OG URLs |
| `client/src/pages/about.tsx` | Remplacer mentions "Replit" par infrastructure réelle |
| `server/index.ts` | Mettre à jour le commentaire `trust proxy` |
| `package.json` | Retirer `@replit/vite-plugin-*` des devDependencies |
| `Dockerfile` | **Créer** — build multi-stage (voir section 5) |
| `docker-compose.yml` | **Créer** — stack app + postgres (voir section 6) |
| `.env` | **Créer** localement (ne pas commiter) — toutes les variables |

---

*Document rédigé pour la version de l'application au commit `572918a1` (mai 2026). À mettre à jour si le schéma DB ou les providers TTS/STT évoluent.*
