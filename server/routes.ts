import type { Express } from "express";
import { createServer, type Server } from "http";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import { PostHog } from "posthog-node";
import {
  analyticsEventSchema,
  insertConversationSessionSchema,
  insertConversationMessageSchema,
  flowiseTraces,
  ttsTraces,
  conversationSessions,
} from "@shared/schema";
import { db } from "./db";
import { and, gte, lte, desc, asc, eq, sql } from "drizzle-orm";
import { storage } from "./storage";
import multer from "multer";
import fs from "fs/promises";
import {
  getActiveTTSProvider,
  getActiveTTSProviderName,
  getAvailableTTSProviders,
} from "./providers/tts";
import { ttsCache } from "./providers/tts/cache";
import { ElevenLabsTTSProvider } from "./providers/tts/elevenlabs";
import { OpenAITTSProvider } from "./providers/tts/openai";
import {
  getActiveSTTProvider,
  getActiveSTTProviderName,
  getAvailableSTTProviders,
} from "./providers/stt";
import { ElevenLabsSTTProvider } from "./providers/stt/elevenlabs";
import { OpenAISTTProvider } from "./providers/stt/openai";
import { DeepgramSTTProvider } from "./providers/stt/deepgram";
import { flowiseFetch } from "./flowise-fetch";
import { labelForFlowiseEvent, type ProgressLabel } from "./flowise-progress-labels";
import { debugTraces, newTraceId, startRetentionScheduler, getRetentionInfo } from "./debug-traces";
import { buildHealthResponse } from "./debug-health";

// ── Server-side PostHog client (TTS / STT analytics) ─────────────────────────
// Disabled silently when POSTHOG_SERVER_KEY / POSTHOG_PROJECT_API_KEY is absent.
function createServerPostHog(): PostHog | null {
  const key =
    process.env.POSTHOG_SERVER_KEY ||
    process.env.VITE_POSTHOG_KEY ||
    "";
  if (!key) return null;
  const host = (process.env.VITE_POSTHOG_HOST || "https://eu.i.posthog.com")
    .trim()
    .replace(/\/+$/, "");
  try {
    const ph = new PostHog(key, { host, flushAt: 1, flushInterval: 0 });
    return ph;
  } catch (err) {
    console.warn("[PostHog:server] init failed:", err);
    return null;
  }
}

const serverPostHog = createServerPostHog();

function phServerCapture(distinctId: string, event: string, props: Record<string, any>) {
  if (!serverPostHog) return;
  try {
    serverPostHog.capture({ distinctId, event, properties: props });
  } catch {}
}

// Allowed domains for the content proxy (prevents SSRF to internal networks)
const PROXY_ALLOWED_DOMAINS = new Set([
  'lemonde.fr',
  'liberation.fr',
  'lefigaro.fr',
  'francetvinfo.fr',
  'reporterre.net',
  'novethic.fr',
  '20minutes.fr',
  'bfmtv.com',
  'ouest-france.fr',
  'futura-sciences.com',
  'nationalgeographic.fr',
  'wwf.fr',
  'greenpeace.fr',
  'ademe.fr',
  'ecologie.gouv.fr',
  'wikipedia.org',
  'wikimedia.org',
  'our-sea.org',
  'plasticpollutioncoalition.org',
  'plasticsoupfoundation.org',
  'surfrider.eu',
  'zerowaste.fr',
]);

function isPrivateIP(hostname: string): boolean {
  // Block localhost and private IP ranges
  const privatePatterns = [
    /^localhost$/i,
    /^127\./,
    /^10\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^192\.168\./,
    /^::1$/,
    /^0\.0\.0\.0$/,
    /^169\.254\./,
  ];
  return privatePatterns.some(p => p.test(hostname));
}

export async function registerRoutes(app: Express): Promise<Server> {

  // Configure multer for audio file uploads
  const upload = multer({
    dest: '/tmp/',
    limits: {
      fileSize: 25 * 1024 * 1024, // 25MB limit for audio files
    },
    fileFilter: (req, file, cb) => {
      // Accept audio files
      if (file.mimetype.startsWith('audio/')) {
        cb(null, true);
      } else {
        cb(new Error('Only audio files are allowed'));
      }
    },
  });

  // Speech-to-text endpoint — delegates to the active STT provider.
  // Public signature MUST stay identical: multipart/form-data with field "audio",
  // returns { text, language, provider }.
  app.post("/api/transcribe", upload.single('audio'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No audio file provided" });
      }

      const provider = getActiveSTTProvider();
      console.log(`[STT:${provider.name}] Processing audio: ${req.file.originalname}, size: ${req.file.size} bytes`);

      const audioBuffer = await fs.readFile(req.file.path);

      try {
        const result = await provider.transcribe({
          audio: audioBuffer,
          filename: req.file.originalname || 'audio.webm',
          mimeType: req.file.mimetype,
          language: 'fr',
        });

        console.log(`[STT:${provider.name}] Transcription successful: "${result.text.substring(0, 100)}..."`);

        await fs.unlink(req.file.path).catch(err => console.warn('Failed to delete temp file:', err));

        res.json({
          text: result.text,
          language: result.language || 'fr',
          provider: provider.name,
        });

      } catch (providerError) {
        console.error(`[STT:${provider.name}] Provider error:`, providerError);
        await fs.unlink(req.file.path).catch(() => {});

        res.status(500).json({
          error: "Erreur lors de la transcription audio",
          details: providerError instanceof Error ? providerError.message : "Le service de reconnaissance vocale a rencontré un problème"
        });
      }

    } catch (error) {
      console.error("[STT] Transcription error:", error);

      if (req.file) {
        await fs.unlink(req.file.path).catch(() => {});
      }

      res.status(500).json({
        error: "Erreur lors du traitement audio",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Text-to-speech endpoint — delegates to the active TTS provider.
  // Body: { text: string, voiceId?: string }
  // Returns: audio stream (MP3 by default)
  app.post("/api/tts", async (req, res) => {
    try {
      const { text, voiceId } = req.body || {};

      if (!text || typeof text !== 'string' || !text.trim()) {
        return res.status(400).json({ error: "Le champ 'text' est requis" });
      }

      // Hard cap to avoid runaway synthesis costs
      const safeText = text.length > 5000 ? text.slice(0, 5000) : text;

      const provider = getActiveTTSProvider();

      if (provider.name === "none") {
        return res.status(503).json({
          error: "La synthèse vocale n'est pas configurée",
          details: "Configurez TTS_PROVIDER et la clé API correspondante (ex: ELEVENLABS_API_KEY)."
        });
      }

      const effectiveVoiceId =
        typeof voiceId === "string" && voiceId.trim()
          ? voiceId.trim()
          : provider.getDefaultVoiceId?.() || "";

      const cacheKey = ttsCache.buildKey({
        text: safeText,
        voiceId: effectiveVoiceId,
        provider: provider.name,
      });

      const ttsStart = Date.now();
      const textPreview = safeText.length > 80 ? safeText.slice(0, 80) + "…" : safeText;

      const distinctId = (typeof req.body?.sessionId === "string" && req.body.sessionId) ? req.body.sessionId : "server";

      // Server-side tts_requested — emitted before cache lookup so every
      // synthesis intent is captured regardless of cache outcome.
      phServerCapture(distinctId, "tts_requested", {
        provider: provider.name,
        charCount: safeText.length,
      });

      const cached = ttsCache.get(cacheKey);
      if (cached) {
        console.log(
          `[TTS:${provider.name}] Cache HIT (${safeText.length} caractères, ${cached.size} octets)`,
        );
        const latencyMs = Date.now() - ttsStart;
        debugTraces.recordTTS({
          id: newTraceId("tts"),
          textPreview,
          chars: safeText.length,
          startedAt: ttsStart,
          durationMs: latencyMs,
          cacheHit: true,
          provider: provider.name,
          status: "ok",
        });
        phServerCapture(distinctId, "tts_completed", {
          provider: provider.name,
          cacheHit: true,
          latencyMs,
          charCount: safeText.length,
          success: true,
        });
        res.setHeader('Content-Type', cached.contentType);
        res.setHeader('Content-Length', String(cached.audio.length));
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-TTS-Provider', provider.name);
        res.setHeader('X-TTS-Cache', 'hit');
        return res.send(cached.audio);
      }

      console.log(`[TTS:${provider.name}] Cache MISS — synthèse de ${safeText.length} caractères`);

      try {
        const result = await provider.synthesize({ text: safeText, voiceId: effectiveVoiceId || undefined });

        ttsCache.set(cacheKey, result);

        const latencyMs = Date.now() - ttsStart;
        debugTraces.recordTTS({
          id: newTraceId("tts"),
          textPreview,
          chars: safeText.length,
          startedAt: ttsStart,
          durationMs: latencyMs,
          cacheHit: false,
          provider: provider.name,
          status: "ok",
        });
        phServerCapture(distinctId, "tts_completed", {
          provider: provider.name,
          cacheHit: false,
          latencyMs,
          charCount: safeText.length,
          success: true,
        });

        res.setHeader('Content-Type', result.contentType);
        res.setHeader('Content-Length', String(result.audio.length));
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-TTS-Provider', provider.name);
        res.setHeader('X-TTS-Cache', 'miss');
        res.send(result.audio);
      } catch (providerError) {
        console.error(`[TTS:${provider.name}] Provider error:`, providerError);
        const latencyMs = Date.now() - ttsStart;
        const errMsg = providerError instanceof Error ? providerError.message : String(providerError);
        debugTraces.recordTTS({
          id: newTraceId("tts"),
          textPreview,
          chars: safeText.length,
          startedAt: ttsStart,
          durationMs: latencyMs,
          cacheHit: false,
          provider: provider.name,
          status: "error",
          errorMessage: errMsg,
        });
        phServerCapture(distinctId, "tts_completed", {
          provider: provider.name,
          cacheHit: false,
          latencyMs,
          charCount: safeText.length,
          success: false,
        });
        phServerCapture(distinctId, "error_occurred", {
          component: "tts",
          errorType: providerError instanceof Error ? providerError.name : "ProviderError",
          message: errMsg,
          provider: provider.name,
        });
        res.status(502).json({
          error: "Erreur lors de la synthèse vocale",
          details: errMsg,
          provider: provider.name,
        });
      }
    } catch (error) {
      console.error("[TTS] Endpoint error:", error);
      const topLevelDistinctId = (typeof req.body?.sessionId === "string" && req.body.sessionId) ? req.body.sessionId : "server";
      phServerCapture(topLevelDistinctId, "error_occurred", {
        component: "tts",
        errorType: error instanceof Error ? error.name : "UnknownError",
        message: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        error: "Erreur lors du traitement TTS",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // List available voices for the active TTS provider.
  // Returns: { provider: string, defaultVoiceId?: string, voices: TTSVoice[] }
  app.get("/api/tts/voices", async (_req, res) => {
    try {
      const provider = getActiveTTSProvider();

      if (provider.name === "none") {
        return res.json({
          provider: provider.name,
          defaultVoiceId: undefined,
          voices: [],
        });
      }

      if (typeof provider.listVoices !== "function") {
        return res.json({
          provider: provider.name,
          defaultVoiceId: provider.getDefaultVoiceId?.(),
          voices: [],
        });
      }

      try {
        const voices = await provider.listVoices();
        res.setHeader("Cache-Control", "private, max-age=60");
        res.json({
          provider: provider.name,
          defaultVoiceId: provider.getDefaultVoiceId?.(),
          voices,
        });
      } catch (providerError) {
        console.error(`[TTS:${provider.name}] listVoices error:`, providerError);
        res.status(502).json({
          error: "Impossible de récupérer la liste des voix",
          details:
            providerError instanceof Error
              ? providerError.message
              : "Le service vocal a rencontré un problème",
          provider: provider.name,
        });
      }
    } catch (error) {
      console.error("[TTS] Voices endpoint error:", error);
      res.status(500).json({
        error: "Erreur lors de la récupération des voix",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // ────────────────────────────────────────────────────────────────────
  // Bench endpoints (NOT for production traffic)
  // Allow per-request provider override so the bench script can compare
  // ElevenLabs / OpenAI / Deepgram on the same input. Disabled in
  // production by checking NODE_ENV. Bypasses TTS cache.
  // ────────────────────────────────────────────────────────────────────
  const benchEnabled = () =>
    process.env.NODE_ENV !== "production" || process.env.ALLOW_VOICE_BENCH === "1";

  app.post("/api/_bench/tts", async (req, res) => {
    if (!benchEnabled()) {
      return res.status(404).json({ error: "Not found" });
    }
    try {
      const { provider, text, voiceId } = req.body || {};
      if (!text || typeof text !== "string") {
        return res.status(400).json({ error: "text requis" });
      }
      let impl;
      switch (provider) {
        case "elevenlabs":
          impl = new ElevenLabsTTSProvider();
          break;
        case "openai":
          impl = new OpenAITTSProvider();
          break;
        default:
          return res.status(400).json({ error: `provider inconnu: ${provider}` });
      }
      if (!impl.isAvailable()) {
        return res.status(503).json({ error: `${provider} non disponible (clé manquante)` });
      }
      const result = await impl.synthesize({ text, voiceId });
      res.setHeader("Content-Type", result.contentType);
      res.setHeader("Content-Length", String(result.audio.length));
      res.setHeader("X-Bench-Provider", provider);
      res.send(result.audio);
    } catch (e) {
      console.error("[bench:tts] error:", e);
      res.status(502).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  app.post("/api/_bench/transcribe", upload.single("audio"), async (req, res) => {
    if (!benchEnabled()) {
      return res.status(404).json({ error: "Not found" });
    }
    try {
      if (!req.file) {
        return res.status(400).json({ error: "audio requis" });
      }
      const provider = (req.body?.provider || "").toString();
      let impl;
      switch (provider) {
        case "openai":
          impl = new OpenAISTTProvider();
          break;
        case "elevenlabs":
          impl = new ElevenLabsSTTProvider();
          break;
        case "deepgram":
          impl = new DeepgramSTTProvider();
          break;
        default:
          await fs.unlink(req.file.path).catch(() => {});
          return res.status(400).json({ error: `provider inconnu: ${provider}` });
      }
      if (!impl.isAvailable()) {
        await fs.unlink(req.file.path).catch(() => {});
        return res.status(503).json({ error: `${provider} non disponible (clé manquante)` });
      }
      const audioBuffer = await fs.readFile(req.file.path);
      try {
        const result = await impl.transcribe({
          audio: audioBuffer,
          filename: req.file.originalname || "audio.webm",
          mimeType: req.file.mimetype,
          language: "fr",
        });
        res.json({ text: result.text, language: result.language || "fr", provider });
      } finally {
        await fs.unlink(req.file.path).catch(() => {});
      }
    } catch (e) {
      console.error("[bench:stt] error:", e);
      if (req.file) await fs.unlink(req.file.path).catch(() => {});
      res.status(502).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  // Introspection endpoint — returns active and available voice providers.
  app.get("/api/providers", (_req, res) => {
    res.json({
      tts: {
        active: getActiveTTSProviderName(),
        available: getAvailableTTSProviders(),
      },
      stt: {
        active: getActiveSTTProviderName(),
        available: getAvailableSTTProviders(),
      },
    });
  });
  
  // ────────────────────────────────────────────────────────────────────
  // Persistance des conversations (Postgres via Drizzle)
  // POST /api/sessions          → crée une session (firstName, lastName)
  // POST /api/sessions/:id/messages → ajoute un message à la session
  // GET  /api/admin/sessions    → liste (Bearer ADMIN_PASSWORD)
  // GET  /api/admin/sessions/:id → détail + messages
  // ────────────────────────────────────────────────────────────────────
  const requireAdmin = (req: any, res: any): boolean => {
    const adminPwd = process.env.ADMIN_PASSWORD;
    if (!adminPwd) {
      res.status(503).json({ error: "ADMIN_PASSWORD non configuré sur le serveur" });
      return false;
    }
    const auth = req.headers["authorization"] || "";
    const token = typeof auth === "string" && auth.startsWith("Bearer ")
      ? auth.slice(7).trim()
      : "";
    if (token !== adminPwd) {
      res.status(401).json({ error: "Mot de passe invalide" });
      return false;
    }
    return true;
  };

  app.post("/api/sessions", async (req, res) => {
    try {
      // Session anonyme — le prénom sera mis à jour via PATCH quand Peter le recueille.
      const session = await storage.createConversationSession({});
      res.status(201).json({ id: session.id, createdAt: session.createdAt });
    } catch (err) {
      console.error("[sessions] create error", err);
      res.status(500).json({ error: "Création de session échouée" });
    }
  });

  app.patch("/api/sessions/:id", async (req, res) => {
    try {
      const sessionId = req.params.id;
      const firstName = String(req.body?.firstName ?? "").trim().slice(0, 80);
      if (!firstName) return res.status(400).json({ error: "firstName requis" });
      const exists = await storage.getConversationSession(sessionId);
      if (!exists) return res.status(404).json({ error: "session introuvable" });
      await storage.updateConversationSessionFirstName(sessionId, firstName);
      res.json({ ok: true });
    } catch (err) {
      console.error("[sessions] patch error", err);
      res.status(500).json({ error: "Mise à jour échouée" });
    }
  });

  app.post("/api/sessions/:id/messages", async (req, res) => {
    try {
      const sessionId = req.params.id;
      const parsed = insertConversationMessageSchema.parse({
        sessionId,
        sender: req.body?.sender,
        content: String(req.body?.content ?? "").slice(0, 20000),
      });
      if (!parsed.content.trim()) {
        return res.status(400).json({ error: "content vide" });
      }
      const exists = await storage.getConversationSession(sessionId);
      if (!exists) return res.status(404).json({ error: "session introuvable" });
      const msg = await storage.appendConversationMessage(parsed);
      res.status(201).json({ id: msg.id, createdAt: msg.createdAt });
    } catch (err) {
      console.error("[sessions] append message error", err);
      res.status(400).json({ error: "Données invalides" });
    }
  });

  app.get("/api/admin/sessions", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    try {
      const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
      const pageSize = Math.min(
        200,
        Math.max(1, parseInt(String(req.query.pageSize ?? "50"), 10) || 50),
      );
      const q = typeof req.query.q === "string" ? req.query.q.slice(0, 80) : undefined;
      const parseDate = (v: unknown): Date | undefined => {
        if (typeof v !== "string" || !v.trim()) return undefined;
        const d = new Date(v);
        return isNaN(d.getTime()) ? undefined : d;
      };
      const from = parseDate(req.query.from);
      const to = parseDate(req.query.to);
      const result = await storage.listConversationSessions({ page, pageSize, q, from, to });
      res.json(result);
    } catch (err) {
      console.error("[admin] list error", err);
      res.status(500).json({ error: "list failed" });
    }
  });

  app.get("/api/admin/sessions/:id", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    try {
      const session = await storage.getConversationSession(req.params.id);
      if (!session) return res.status(404).json({ error: "session introuvable" });
      const messages = await storage.listSessionMessages(session.id);
      res.json({ session, messages });
    } catch (err) {
      console.error("[admin] detail error", err);
      res.status(500).json({ error: "detail failed" });
    }
  });

  // GET /api/debug/sessions/:id — détail public d'une session (messages + traces Flowise)
  app.get("/api/debug/sessions/:id", async (req, res) => {
    try {
      const session = await storage.getConversationSession(req.params.id);
      if (!session) return res.status(404).json({ error: "session introuvable" });
      const messages = await storage.listSessionMessages(session.id);
      // Récupérer les traces Flowise liées à ce chatId
      const traces = await db
        .select({
          id: flowiseTraces.id,
          chatId: flowiseTraces.chatId,
          question: flowiseTraces.question,
          startedAt: flowiseTraces.startedAt,
          finishedAt: flowiseTraces.finishedAt,
          connectMs: flowiseTraces.connectMs,
          ttftMs: flowiseTraces.ttftMs,
          totalMs: flowiseTraces.totalMs,
          tokens: flowiseTraces.tokens,
          chars: flowiseTraces.chars,
          nodes: flowiseTraces.nodes,
          tools: flowiseTraces.tools,
          unknownEvents: flowiseTraces.unknownEvents,
          status: flowiseTraces.status,
          errorMessage: flowiseTraces.errorMessage,
        })
        .from(flowiseTraces)
        .where(eq(flowiseTraces.chatId, session.id))
        .orderBy(asc(flowiseTraces.startedAt));
      const traceDTOs = traces.map((r) => ({
        id: r.id,
        chatId: r.chatId,
        firstName: session.firstName ?? undefined,
        question: r.question,
        startedAt: r.startedAt.getTime(),
        finishedAt: r.finishedAt.getTime(),
        connectMs: r.connectMs,
        ttftMs: r.ttftMs,
        totalMs: r.totalMs,
        tokens: r.tokens,
        chars: r.chars,
        nodes: r.nodes,
        tools: r.tools,
        unknownEvents: r.unknownEvents,
        status: r.status,
        errorMessage: r.errorMessage ?? undefined,
      }));
      res.json({ session, messages, traces: traceDTOs });
    } catch (err) {
      console.error("[debug/sessions/:id] error", err);
      res.status(500).json({ error: "detail failed" });
    }
  });

  // GET /api/debug/sessions — liste publique des sessions (pas d'auth requise)
  app.get("/api/debug/sessions", async (req, res) => {
    try {
      const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize ?? "50"), 10) || 50));
      const q = typeof req.query.q === "string" ? req.query.q.slice(0, 80) : undefined;
      const result = await storage.listConversationSessions({ page, pageSize, q });
      res.json(result);
    } catch (err) {
      console.error("[debug/sessions] list error", err);
      res.status(500).json({ error: "list failed" });
    }
  });

  // Analytics endpoint for anonymous event tracking
  app.post("/api/analytics", async (req, res) => {
    try {
      const event = analyticsEventSchema.parse(req.body);
      
      // Log analytics event (in production, send to analytics service)
      console.log(`[Analytics] ${event.event}:`, event.data);
      
      res.json({ success: true });
    } catch (error) {
      console.error("Analytics error:", error);
      res.status(400).json({ error: "Invalid analytics event" });
    }
  });

  // Rotating User-Agent pool for anti-bot evasion
  const PROXY_USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  ];

  function buildProxyHeaders(): Record<string, string> {
    const ua = PROXY_USER_AGENTS[Math.floor(Math.random() * PROXY_USER_AGENTS.length)];
    return {
      'User-Agent': ua,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br',
      'Referer': 'https://www.google.com/',
      'Cookie': '',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'cross-site',
      'Cache-Control': 'max-age=0',
    };
  }

  async function fetchWithRetry(url: string, maxAttempts = 3): Promise<Response> {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) {
        const delay = Math.pow(2, attempt - 1) * 1000; // 1s, 2s
        await new Promise(r => setTimeout(r, delay));
      }
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000);
        const response = await fetch(url, {
          method: 'GET',
          headers: buildProxyHeaders(),
          redirect: 'follow',
          signal: controller.signal,
        });
        clearTimeout(timeout);
        console.log(`[Proxy] Attempt ${attempt + 1}: HTTP ${response.status} for ${url}`);
        if (response.status === 429 || response.status === 503) {
          lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
          continue; // retry
        }
        return response;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        console.warn(`[Proxy] Attempt ${attempt + 1} failed: ${lastError.message}`);
      }
    }
    throw lastError ?? new Error('All retry attempts failed');
  }

  // Web content proxy endpoint to bypass CORS and X-Frame-Options
  app.get("/api/proxy", async (req, res) => {
    try {
      const { url } = req.query;
      
      if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: "URL parameter is required" });
      }

      // Validate URL format
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(url);
      } catch {
        return res.status(400).json({ error: "Invalid URL format" });
      }

      // Security: only allow HTTPS
      if (parsedUrl.protocol !== 'https:') {
        return res.status(400).json({ error: "Only HTTPS URLs are allowed" });
      }

      // Security: block private/internal IPs (SSRF protection)
      if (isPrivateIP(parsedUrl.hostname)) {
        return res.status(403).json({ error: "Access to internal addresses is not allowed" });
      }

      // Security note: we used to enforce a strict allowlist of educational
      // domains, but Peter cites a wide variety of scientific sources
      // (frontiersin.org, journals.plos.org, rts.ch, …) that we can't enumerate
      // ahead of time. SSRF is still prevented by the isPrivateIP check above
      // and the HTTPS-only restriction; this proxy only fetches and re-emits
      // public web content with permissive frame headers, so opening it to any
      // public HTTPS host is acceptable for our use case.
      // PROXY_ALLOWED_DOMAINS is kept (unused) for reference / quick re-enable.
      void PROXY_ALLOWED_DOMAINS;

      console.log(`[Proxy] Fetching: ${url}`);

      const response = await fetchWithRetry(url);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      let content = await response.text();
      
      // Remove X-Frame-Options and CSP headers that block embedding
      const contentType = response.headers.get('content-type') || 'text/html';
      
      // Inject base tag and modify content for iframe compatibility
      if (contentType.includes('text/html')) {
        const baseUrl = new URL(url).origin;
        
        // Add base tag for relative URLs
        content = content.replace(
          /<head[^>]*>/i,
          `<head><base href="${baseUrl}/">`
        );
        
        // Remove frame-busting scripts
        content = content.replace(
          /(if\s*\(\s*top\s*[!=]==?\s*self\s*\)|if\s*\(\s*self\s*[!=]==?\s*top\s*\)|if\s*\(\s*window\s*[!=]==?\s*top\s*\)|if\s*\(\s*top\s*\.location\s*[!=]==?\s*self\s*\.location\s*\))[^}]*}/gi,
          ''
        );
        
        // Remove X-Frame-Options meta tags
        content = content.replace(
          /<meta[^>]*http-equiv\s*=\s*["\']?x-frame-options["\']?[^>]*>/gi,
          ''
        );
      }

      // Set permissive headers
      res.set({
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=300',
        'X-Frame-Options': 'ALLOWALL',
        'Content-Security-Policy': 'frame-ancestors *;',
        'X-Content-Type-Options': 'nosniff'
      });

      res.send(content);
      
    } catch (error) {
      console.error("[Proxy] Error:", error);
      res.status(500).json({ 
        error: "Failed to proxy content",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // ---------------------------------------------------------------------------
  // In-memory LRU cache for reader-mode extractions
  // Max 50 entries, 5-minute TTL.  Bypass with ?nocache=1.
  // ---------------------------------------------------------------------------
  const READER_CACHE_MAX = 50;
  const READER_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  interface ReaderCacheEntry {
    data: object;
    expiresAt: number;
  }

  const readerCache = new Map<string, ReaderCacheEntry>();

  function readerCacheGet(key: string): object | null {
    const entry = readerCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      readerCache.delete(key);
      return null;
    }
    // Refresh LRU order: delete then re-insert
    readerCache.delete(key);
    readerCache.set(key, entry);
    return entry.data;
  }

  function readerCacheSet(key: string, data: object): void {
    // Only evict when we are truly adding a new key (not updating an existing one)
    if (!readerCache.has(key) && readerCache.size >= READER_CACHE_MAX) {
      const oldestKey = readerCache.keys().next().value;
      if (oldestKey !== undefined) readerCache.delete(oldestKey);
    }
    readerCache.set(key, { data, expiresAt: Date.now() + READER_CACHE_TTL_MS });
  }

  // Reader mode endpoint: extracts clean article content using Readability
  app.get("/api/reader", async (req, res) => {
    try {
      const { url, nocache } = req.query;

      if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: "URL parameter is required" });
      }

      let parsedUrl: URL;
      try {
        parsedUrl = new URL(url);
      } catch {
        return res.status(400).json({ error: "Invalid URL format" });
      }

      if (parsedUrl.protocol !== 'https:') {
        return res.status(400).json({ error: "Only HTTPS URLs are allowed" });
      }

      if (isPrivateIP(parsedUrl.hostname)) {
        return res.status(403).json({ error: "Access to internal addresses is not allowed" });
      }

      // Check cache unless bypassed
      const bypassCache = nocache === '1' || nocache === 'true';
      if (!bypassCache) {
        const cached = readerCacheGet(url);
        if (cached) {
          console.log(`[Reader] Cache hit: ${url}`);
          return res.json(cached);
        }
      }

      console.log(`[Reader] Fetching: ${url}`);

      const response = await fetchWithRetry(url);

      if (!response.ok) {
        return res.status(response.status).json({
          error: `Upstream returned ${response.status}`,
          details: response.statusText,
        });
      }

      const html = await response.text();

      // Parse with JSDOM and extract with Readability
      const dom = new JSDOM(html, { url });
      const reader = new Readability(dom.window.document);
      const article = reader.parse();

      if (!article || !article.content) {
        return res.status(422).json({ error: "Could not extract article content" });
      }

      // Rewrite relative image URLs to absolute (use full page URL as base, not just origin)
      const withAbsoluteImages = article.content.replace(
        /(<img[^>]+src=["'])(?!https?:\/\/)([^"']+)(["'])/gi,
        (match, prefix, src, suffix) => {
          try {
            const abs = new URL(src, url).href;
            return `${prefix}${abs}${suffix}`;
          } catch {
            return match;
          }
        }
      );

      // Strip dangerous attributes server-side: event handlers and javascript: URLs.
      // Readability already removes <script> tags; this cleans up inline vectors.
      const content = withAbsoluteImages
        // Remove all event handler attributes (onerror="…", onclick="…", etc.)
        .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '')
        // Replace javascript: scheme in href/src/action with a safe placeholder
        .replace(/((?:href|src|action)\s*=\s*["'])javascript:[^"']*(?=["'])/gi, '$1#');

      const result = {
        title: article.title,
        content,
        byline: article.byline,
        siteName: article.siteName || parsedUrl.hostname,
        excerpt: article.excerpt,
      };

      if (!bypassCache) {
        readerCacheSet(url, result);
      }

      res.json(result);

    } catch (error) {
      console.error("[Reader] Error:", error);
      res.status(500).json({
        error: "Failed to extract article",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Flowise streaming endpoint (SSE proxy)
  // Forwards Flowise events to the client AND emits a `progress` event with a
  // human-friendly FR label whenever Flowise transitions between agent steps.
  // Logs are minimal: 1 line at start, 1 structured line at end.
  app.post("/api/flowise/prediction/:chatflowId/stream", async (req, res) => {
    const perfStart = Date.now();
    const { chatflowId } = req.params;
    const { question, chatId, requestId } = req.body;
    const sessionTag = (chatId || `anon_${Date.now()}`).slice(0, 24);
    const traceId = newTraceId("fw");

    // SSE headers (no-transform critical to bypass compression middleware)
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const actualChatflowId = process.env.FLOWISE_CHATFLOW_ID || chatflowId;
    const flowiseHost = process.env.FLOWISE_HOST;
    const flowiseApiKey = process.env.FLOWISE_API_KEY;

    if (!flowiseHost) {
      res.write(`data: ${JSON.stringify({ error: 'FLOWISE_HOST not configured' })}\n\n`);
      return res.end();
    }
    if (!actualChatflowId) {
      res.write(`data: ${JSON.stringify({ error: 'FLOWISE_CHATFLOW_ID not configured' })}\n\n`);
      return res.end();
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
    };
    if (flowiseApiKey) headers['Authorization'] = `Bearer ${flowiseApiKey}`;

    const requestBody = {
      question,
      chatId: chatId || `session_${Date.now()}`,
      requestId,
      streaming: true,
      returnSourceDocuments: false,
    };

    // Counters for the final structured log
    let firstTokenMs = 0;
    let tokenCount = 0;
    let nodesExecuted = 0;
    let toolsCalled = 0;
    let unknownEvents = 0;
    let lastProgressStep = '';
    let fullText = '';
    let metadata: any = {};
    let errorReason = '';

    console.log(`[Flowise] start chatId=${sessionTag} q="${(question || '').slice(0, 60)}"`);

    let response: Response;
    let connectMs = 0;
    try {
      const result = await flowiseFetch(
        `${flowiseHost}/api/v1/prediction/${actualChatflowId}`,
        { method: 'POST', headers, body: JSON.stringify(requestBody) },
      );
      response = result.response;
      connectMs = result.connectMs;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[Flowise] end chatId=${sessionTag} status=fetch_failed error="${msg}"`);
      phServerCapture(requestBody.chatId, "flowise_stream_completed", {
        requestId,
        traceId,
        chatId: requestBody.chatId,
        connectMs,
        ttftMs: 0,
        totalMs: Date.now() - perfStart,
        tokenCount: 0,
        charCount: 0,
        nodes: 0,
        tools: 0,
        unknownEvents: 0,
        success: false,
        errorType: "fetch_failed",
      });
      res.write(`data: ${JSON.stringify({ error: 'Flowise unreachable', details: msg })}\n\n`);
      return res.end();
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error(`[Flowise] end chatId=${sessionTag} status=${response.status} body="${errorText.slice(0, 120)}"`);
      phServerCapture(requestBody.chatId, "flowise_stream_completed", {
        requestId,
        traceId,
        chatId: requestBody.chatId,
        connectMs,
        ttftMs: 0,
        totalMs: Date.now() - perfStart,
        tokenCount: 0,
        charCount: 0,
        nodes: 0,
        tools: 0,
        unknownEvents: 0,
        success: false,
        errorType: `HTTP_${response.status}`,
      });
      res.write(`data: ${JSON.stringify({ error: `Flowise API error: ${response.status}` })}\n\n`);
      return res.end();
    }

    const reader = response.body?.getReader();
    if (!reader) {
      console.error(`[Flowise] end chatId=${sessionTag} status=no_body`);
      phServerCapture(requestBody.chatId, "flowise_stream_completed", {
        requestId,
        traceId,
        chatId: requestBody.chatId,
        connectMs,
        ttftMs: 0,
        totalMs: Date.now() - perfStart,
        tokenCount: 0,
        charCount: 0,
        nodes: 0,
        tools: 0,
        unknownEvents: 0,
        success: false,
        errorType: "no_body",
      });
      res.write(`data: ${JSON.stringify({ error: 'No response body from Flowise' })}\n\n`);
      return res.end();
    }

    const decoder = new TextDecoder();
    let buffer = '';

    const emitProgress = (event: string, data: unknown) => {
      const label = labelForFlowiseEvent(event, data);
      if (!label) return;
      if (label.step === lastProgressStep) return; // dedupe identical consecutive steps
      lastProgressStep = label.step;
      res.write(`data: ${JSON.stringify({ event: 'progress', data: label })}\n\n`);
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine || !trimmedLine.startsWith('data:')) continue;

          const payload = trimmedLine.slice(5).trim();
          if (!payload || payload === '[DONE]' || payload === '"[DONE]"') continue;

          let obj: any;
          try {
            obj = JSON.parse(payload);
          } catch {
            unknownEvents++;
            continue;
          }

          switch (obj.event) {
            case 'token': {
              if (tokenCount === 0) {
                firstTokenMs = Date.now() - perfStart;
                emitProgress('token', null);
              }
              fullText += obj.data;
              tokenCount++;
              res.write(`data: ${JSON.stringify({ event: 'token', data: obj.data })}\n\n`);
              break;
            }
            case 'start':
              res.write(`data: ${JSON.stringify({ event: 'start' })}\n\n`);
              break;
            case 'metadata':
              metadata = obj.data || {};
              res.write(`data: ${JSON.stringify({ event: 'metadata', data: metadata })}\n\n`);
              break;
            case 'end':
              // Will send our own end below with metrics
              break;
            case 'error':
              errorReason = typeof obj.data === 'string' ? obj.data : JSON.stringify(obj.data);
              res.write(`data: ${JSON.stringify({ event: 'error', data: obj.data })}\n\n`);
              break;
            case 'agentFlowEvent':
            case 'nextAgentFlow':
            case 'agentFlowExecutedData':
              nodesExecuted++;
              emitProgress(obj.event, obj.data);
              break;
            case 'calledTools':
            case 'usedTools':
              toolsCalled++;
              emitProgress(obj.event, obj.data);
              break;
            case 'usageMetadata':
              // Silent: not useful to client
              break;
            default:
              unknownEvents++;
              break;
          }
        }
      }

      // Extract `Response` field from the accumulated JSON if present
      let finalText = fullText;
      const trimmedFullText = fullText.trim();
      if (trimmedFullText.startsWith('{')) {
        try {
          const jsonResponse = JSON.parse(trimmedFullText);
          if (jsonResponse.Response && typeof jsonResponse.Response === 'string') {
            finalText = jsonResponse.Response;
          }
        } catch {
          const responseMatch = trimmedFullText.match(/"Response"\s*:\s*"([^"]*(?:\\.[^"]*)*)"/);
          if (responseMatch && responseMatch[1]) {
            finalText = responseMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n');
          }
        }
      }

      const totalMs = Date.now() - perfStart;
      res.write(`data: ${JSON.stringify({
        event: 'end',
        metadata: {
          ...metadata,
          chatId: requestBody.chatId,
          requestId,
          traceId,
          totalTime: totalMs,
          firstTokenTime: firstTokenMs,
          connectMs,
          tokenCount,
          nodes: nodesExecuted,
          tools: toolsCalled,
          unknownEvents,
          fullText: finalText,
        },
      })}\n\n`);

      console.log(
        `[Flowise] end chatId=${sessionTag}` +
          ` ttft=${firstTokenMs}ms total=${totalMs}ms connect=${connectMs}ms` +
          ` tokens=${tokenCount} chars=${finalText.length}` +
          ` nodes=${nodesExecuted} tools=${toolsCalled} unknownEvents=${unknownEvents}` +
          (errorReason ? ` error="${errorReason.slice(0, 80)}"` : ''),
      );

      debugTraces.recordFlowise({
        id: traceId,
        chatId: sessionTag,
        question: (question || "").slice(0, 120),
        startedAt: perfStart,
        finishedAt: Date.now(),
        connectMs,
        ttftMs: firstTokenMs,
        totalMs,
        tokens: tokenCount,
        chars: finalText.length,
        nodes: nodesExecuted,
        tools: toolsCalled,
        unknownEvents,
        status: errorReason ? "error" : "ok",
        errorMessage: errorReason || undefined,
      });
      phServerCapture(requestBody.chatId, "flowise_stream_completed", {
        requestId,
        traceId,
        chatId: requestBody.chatId,
        connectMs,
        ttftMs: firstTokenMs,
        totalMs,
        streamMs: firstTokenMs ? Math.max(0, totalMs - firstTokenMs) : undefined,
        tokenCount,
        charCount: finalText.length,
        nodes: nodesExecuted,
        tools: toolsCalled,
        unknownEvents,
        success: !errorReason,
        errorType: errorReason ? "FlowiseStreamError" : undefined,
      });
    } catch (streamError) {
      const msg = streamError instanceof Error ? streamError.message : String(streamError);
      console.error(`[Flowise] end chatId=${sessionTag} status=stream_error error="${msg}"`);
      const totalMs = Date.now() - perfStart;
      debugTraces.recordFlowise({
        id: traceId,
        chatId: sessionTag,
        question: (question || "").slice(0, 120),
        startedAt: perfStart,
        finishedAt: Date.now(),
        connectMs,
        ttftMs: firstTokenMs,
        totalMs,
        tokens: tokenCount,
        chars: fullText.length,
        nodes: nodesExecuted,
        tools: toolsCalled,
        unknownEvents,
        status: msg.includes("aborted") ? "aborted" : "error",
        errorMessage: msg,
      });
      phServerCapture(requestBody.chatId, "flowise_stream_completed", {
        requestId,
        traceId,
        chatId: requestBody.chatId,
        connectMs,
        ttftMs: firstTokenMs,
        totalMs,
        streamMs: firstTokenMs ? Math.max(0, totalMs - firstTokenMs) : undefined,
        tokenCount,
        charCount: fullText.length,
        nodes: nodesExecuted,
        tools: toolsCalled,
        unknownEvents,
        success: false,
        errorType: msg.includes("aborted") ? "aborted" : "stream_error",
      });
      res.write(`data: ${JSON.stringify({ error: 'Stream interrupted', details: msg })}\n\n`);
    } finally {
      try { reader.releaseLock(); } catch { /* ignore */ }
      res.end();
    }
  });

  // Start the trace retention scheduler (purge on boot + daily)
  startRetentionScheduler();

  // ────────────────────────────────────────────────────────────────────
  // Debug endpoints — surface internal state for the /debug panel.
  // No auth: read-only, no secrets exposed, only aggregated metrics.
  // ────────────────────────────────────────────────────────────────────
  const serverStartedAt = Date.now();

  // GET /api/debug/retention — row counts + last purge info (no auth required)
  app.get("/api/debug/retention", async (_req, res) => {
    try {
      const [flowiseCount, ttsCount] = await Promise.all([
        db.select({ count: sql<number>`COUNT(*)::int` }).from(flowiseTraces),
        db.select({ count: sql<number>`COUNT(*)::int` }).from(ttsTraces),
      ]);
      const info = getRetentionInfo();
      res.setHeader("Cache-Control", "no-store");
      res.json({
        retentionDays: info.retentionDays,
        flowiseCount: Number(flowiseCount[0]?.count ?? 0),
        ttsCount: Number(ttsCount[0]?.count ?? 0),
        lastPurge: info.lastPurge
          ? {
              ranAt: info.lastPurge.ranAt,
              flowiseDeleted: info.lastPurge.flowiseDeleted,
              ttsDeleted: info.lastPurge.ttsDeleted,
            }
          : null,
      });
    } catch (err) {
      console.error("[debug:retention] error:", err);
      res.status(500).json({ error: "retention query failed" });
    }
  });

  app.get("/api/debug/health", async (_req, res) => {
    try {
      const payload = await buildHealthResponse(Date.now() - serverStartedAt);
      res.setHeader("Cache-Control", "no-store");
      res.json(payload);
    } catch (err) {
      console.error("[debug:health] error:", err);
      res.status(500).json({
        error: "health check failed",
        details: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.get("/api/debug/traces", (_req, res) => {
    const snap = debugTraces.snapshot();
    res.setHeader("Cache-Control", "no-store");
    res.json({
      generatedAt: Date.now(),
      flowise: snap.flowise,
      tts: snap.tts,
    });
  });

  // GET /api/debug/traces/flowise?from=&to=&limit=&offset=&status=&sort=
  app.get("/api/debug/traces/flowise", async (req, res) => {
    try {
      const fromMs = parseInt(String(req.query.from ?? ""), 10);
      const toMs = parseInt(String(req.query.to ?? ""), 10);
      const limit = Math.min(1000, Math.max(1, parseInt(String(req.query.limit ?? "500"), 10) || 500));
      const offset = Math.max(0, parseInt(String(req.query.offset ?? "0"), 10) || 0);
      const statusFilter = String(req.query.status ?? "");
      const sortParam = String(req.query.sort ?? "date_desc");

      const filters = [];
      if (!isNaN(fromMs)) filters.push(gte(flowiseTraces.startedAt, new Date(fromMs)));
      if (!isNaN(toMs)) filters.push(lte(flowiseTraces.startedAt, new Date(toMs)));
      if (statusFilter === "ok" || statusFilter === "error" || statusFilter === "aborted") {
        filters.push(eq(flowiseTraces.status, statusFilter));
      }
      const where = filters.length > 0 ? and(...filters) : undefined;

      const orderBy =
        sortParam === "date_asc"
          ? asc(flowiseTraces.startedAt)
          : sortParam === "latency_asc"
            ? asc(flowiseTraces.totalMs)
            : sortParam === "latency_desc"
              ? desc(flowiseTraces.totalMs)
              : desc(flowiseTraces.startedAt);

      const [rows, [{ total }]] = await Promise.all([
        db
          .select({
            id: flowiseTraces.id,
            chatId: flowiseTraces.chatId,
            question: flowiseTraces.question,
            startedAt: flowiseTraces.startedAt,
            finishedAt: flowiseTraces.finishedAt,
            connectMs: flowiseTraces.connectMs,
            ttftMs: flowiseTraces.ttftMs,
            totalMs: flowiseTraces.totalMs,
            tokens: flowiseTraces.tokens,
            chars: flowiseTraces.chars,
            nodes: flowiseTraces.nodes,
            tools: flowiseTraces.tools,
            unknownEvents: flowiseTraces.unknownEvents,
            status: flowiseTraces.status,
            errorMessage: flowiseTraces.errorMessage,
            firstName: conversationSessions.firstName,
          })
          .from(flowiseTraces)
          .leftJoin(
            conversationSessions,
            sql`${conversationSessions.id}::text = ${flowiseTraces.chatId}`,
          )
          .where(where)
          .orderBy(orderBy)
          .limit(limit)
          .offset(offset),
        db
          .select({ total: sql<number>`COUNT(*)::int` })
          .from(flowiseTraces)
          .where(where),
      ]);
      const items = rows.map((r) => ({
        id: r.id,
        chatId: r.chatId,
        firstName: r.firstName ?? undefined,
        question: r.question,
        startedAt: r.startedAt.getTime(),
        finishedAt: r.finishedAt.getTime(),
        connectMs: r.connectMs,
        ttftMs: r.ttftMs,
        totalMs: r.totalMs,
        tokens: r.tokens,
        chars: r.chars,
        nodes: r.nodes,
        tools: r.tools,
        unknownEvents: r.unknownEvents,
        status: r.status,
        errorMessage: r.errorMessage ?? undefined,
      }));
      res.setHeader("Cache-Control", "no-store");
      res.json({ items, total, limit, offset });
    } catch (err) {
      console.error("[debug:traces/flowise] error:", err);
      res.status(500).json({ error: "query failed" });
    }
  });

  // GET /api/debug/traces/flowise/export?from=&to=&status=&sort=
  // Returns up to 10 000 rows as a CSV download (no pagination).
  app.get("/api/debug/traces/flowise/export", async (req, res) => {
    try {
      const fromMs = parseInt(String(req.query.from ?? ""), 10);
      const toMs = parseInt(String(req.query.to ?? ""), 10);
      const statusFilter = String(req.query.status ?? "");
      const sortParam = String(req.query.sort ?? "date_desc");

      const filters = [];
      if (!isNaN(fromMs)) filters.push(gte(flowiseTraces.startedAt, new Date(fromMs)));
      if (!isNaN(toMs)) filters.push(lte(flowiseTraces.startedAt, new Date(toMs)));
      if (statusFilter === "ok" || statusFilter === "error" || statusFilter === "aborted") {
        filters.push(eq(flowiseTraces.status, statusFilter));
      }
      const where = filters.length > 0 ? and(...filters) : undefined;

      const orderBy =
        sortParam === "date_asc"
          ? asc(flowiseTraces.startedAt)
          : sortParam === "latency_asc"
            ? asc(flowiseTraces.totalMs)
            : sortParam === "latency_desc"
              ? desc(flowiseTraces.totalMs)
              : desc(flowiseTraces.startedAt);

      const rows = await db
        .select({
          chatId: flowiseTraces.chatId,
          question: flowiseTraces.question,
          startedAt: flowiseTraces.startedAt,
          connectMs: flowiseTraces.connectMs,
          ttftMs: flowiseTraces.ttftMs,
          totalMs: flowiseTraces.totalMs,
          tokens: flowiseTraces.tokens,
          status: flowiseTraces.status,
          errorMessage: flowiseTraces.errorMessage,
          firstName: conversationSessions.firstName,
        })
        .from(flowiseTraces)
        .leftJoin(
          conversationSessions,
          sql`${conversationSessions.id}::text = ${flowiseTraces.chatId}`,
        )
        .where(where)
        .orderBy(orderBy)
        .limit(10_000);

      const escapeCsv = (v: unknown): string => {
        if (v == null) return "";
        let s = String(v);
        // Prevent formula injection: prefix cells starting with =, +, -, @ with a tab
        if (s.length > 0 && "=+-@".includes(s[0])) {
          s = `\t${s}`;
        }
        if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\t")) {
          return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
      };

      const header = "chatId,firstName,question,startedAt,status,totalMs,connectMs,ttftMs,tokens,errorMessage";
      const csvLines = rows.map((r) =>
        [
          escapeCsv(r.chatId),
          escapeCsv(r.firstName ?? ""),
          escapeCsv(r.question),
          escapeCsv(r.startedAt.toISOString()),
          escapeCsv(r.status),
          escapeCsv(r.totalMs),
          escapeCsv(r.connectMs),
          escapeCsv(r.ttftMs ?? ""),
          escapeCsv(r.tokens ?? ""),
          escapeCsv(r.errorMessage ?? ""),
        ].join(","),
      );

      const csv = [header, ...csvLines].join("\n");
      const filename = `flowise-traces-${new Date().toISOString().slice(0, 10)}.csv`;

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Cache-Control", "no-store");
      res.send(csv);
    } catch (err) {
      console.error("[debug:traces/flowise/export] error:", err);
      res.status(500).json({ error: "export failed" });
    }
  });

  // GET /api/debug/traces/tts?from=&to=&limit=&offset=
  app.get("/api/debug/traces/tts", async (req, res) => {
    try {
      const fromMs = parseInt(String(req.query.from ?? ""), 10);
      const toMs = parseInt(String(req.query.to ?? ""), 10);
      const limit = Math.min(1000, Math.max(1, parseInt(String(req.query.limit ?? "500"), 10) || 500));
      const offset = Math.max(0, parseInt(String(req.query.offset ?? "0"), 10) || 0);
      const filters = [];
      if (!isNaN(fromMs)) filters.push(gte(ttsTraces.startedAt, new Date(fromMs)));
      if (!isNaN(toMs)) filters.push(lte(ttsTraces.startedAt, new Date(toMs)));
      const where = filters.length > 0 ? and(...filters) : undefined;
      const [rows, [{ total }]] = await Promise.all([
        db
          .select()
          .from(ttsTraces)
          .where(where)
          .orderBy(desc(ttsTraces.startedAt))
          .limit(limit)
          .offset(offset),
        db
          .select({ total: sql<number>`COUNT(*)::int` })
          .from(ttsTraces)
          .where(where),
      ]);
      const items = rows.map((r) => ({
        id: r.id,
        textPreview: r.textPreview,
        chars: r.chars,
        startedAt: r.startedAt.getTime(),
        durationMs: r.durationMs,
        cacheHit: r.cacheHit,
        provider: r.provider,
        status: r.status,
        errorMessage: r.errorMessage ?? undefined,
      }));
      res.setHeader("Cache-Control", "no-store");
      res.json({ items, total, limit, offset });
    } catch (err) {
      console.error("[debug:traces/tts] error:", err);
      res.status(500).json({ error: "query failed" });
    }
  });

  // GET /api/debug/traces/stats?from=&to=&granularity=hour|day
  app.get("/api/debug/traces/stats", async (req, res) => {
    interface FlowiseStatRow {
      bucket: Date;
      median_total_ms: string | number | null;
      median_ttft_ms: string | number | null;
      count: number;
      error_count: number;
    }
    interface TtsStatRow {
      bucket: Date;
      count: number;
      error_count: number;
    }
    try {
      const fromMs = parseInt(String(req.query.from ?? ""), 10);
      const toMs = parseInt(String(req.query.to ?? ""), 10);
      const granularity = req.query.granularity === "day" ? "day" : "hour";

      const fromDate = !isNaN(fromMs) ? new Date(fromMs) : new Date(Date.now() - 86_400_000);
      const toDate = !isNaN(toMs) ? new Date(toMs) : new Date();

      const [flowiseResult, ttsResult] = await Promise.all([
        db.execute(sql`
          SELECT
            date_trunc(${granularity}, started_at) AS bucket,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY total_ms) AS median_total_ms,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY ttft_ms) AS median_ttft_ms,
            COUNT(*)::int AS count,
            COUNT(*) FILTER (WHERE status = 'error')::int AS error_count
          FROM flowise_traces
          WHERE started_at >= ${fromDate} AND started_at <= ${toDate}
          GROUP BY 1
          ORDER BY 1
        `),
        db.execute(sql`
          SELECT
            date_trunc(${granularity}, started_at) AS bucket,
            COUNT(*)::int AS count,
            COUNT(*) FILTER (WHERE status = 'error')::int AS error_count
          FROM tts_traces
          WHERE started_at >= ${fromDate} AND started_at <= ${toDate}
          GROUP BY 1
          ORDER BY 1
        `),
      ]);

      const flowiseRows = flowiseResult.rows as unknown as FlowiseStatRow[];
      const ttsRows = ttsResult.rows as unknown as TtsStatRow[];

      res.setHeader("Cache-Control", "no-store");
      res.json({
        granularity,
        flowise: flowiseRows.map((r) => ({
          bucket: r.bucket,
          medianTotalMs: Number(r.median_total_ms ?? 0),
          medianTtftMs: Number(r.median_ttft_ms ?? 0),
          count: Number(r.count),
          errorCount: Number(r.error_count),
        })),
        tts: ttsRows.map((r) => ({
          bucket: r.bucket,
          count: Number(r.count),
          errorCount: Number(r.error_count),
          errorRate: Number(r.count) > 0 ? Number(r.error_count) / Number(r.count) : 0,
        })),
      });
    } catch (err) {
      console.error("[debug:traces/stats] error:", err);
      res.status(500).json({ error: "stats query failed" });
    }
  });

  // Flowise proxy endpoint for secure API calls
  app.post("/api/flowise/prediction/:chatflowId", async (req, res) => {
    const perfStart = Date.now();
    try {
      const { chatflowId } = req.params;
      const { question, chatId } = req.body;

      // IMPORTANT: Cache is DISABLED for this application
      // Peter needs full conversational context to remember user's name and maintain continuity
      // Every message is sent with a sessionId (chatId) for context tracking
      console.log(`[Flowise] Processing question in conversation (chatId: ${chatId})`);
      
      // Note: Cache functionality preserved but not used. Can be re-enabled for
      // different use cases where conversational context is not required.

      // Use the configured chatflow ID or the one from URL params
      const actualChatflowId = process.env.FLOWISE_CHATFLOW_ID || chatflowId;
      const flowiseHost = process.env.FLOWISE_HOST;
      const flowiseApiKey = process.env.FLOWISE_API_KEY;

      // Validate configuration
      if (!flowiseHost) {
        throw new Error("FLOWISE_HOST environment variable is required");
      }

      if (!actualChatflowId) {
        throw new Error("FLOWISE_CHATFLOW_ID environment variable is required");
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Connection": "keep-alive"
      };

      if (flowiseApiKey) {
        headers["Authorization"] = `Bearer ${flowiseApiKey}`;
      }

      const requestBody = {
        question,
        chatId: chatId || `session_${Date.now()}`,
        returnSourceDocuments: false,
      };

      // Add timeout and connection optimization
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s for complex responses
      
      const fetchStart = Date.now();
      const response = await fetch(`${flowiseHost}/api/v1/prediction/${actualChatflowId}`, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });
      const fetchDuration = Date.now() - fetchStart;
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Flowise API error: ${response.status} ${response.statusText}`);
      }

      const responseText = await response.text();
      const payloadSize = new Blob([responseText]).size;
      
      // Streamlined JSON parsing - minimal processing
      const parseStart = Date.now();
      let data;
      try {
        data = JSON.parse(responseText);
        
        // Fast text field processing with optimized logic
        if (data.text && typeof data.text === 'string') {
          const textField = data.text.trim();
          
          // Try to detect and parse JSON in the text field
          // Check if it looks like JSON (starts with { and has typical JSON structure)
          const looksLikeJSON = textField.startsWith('{') || 
                                textField.includes('"Response"') || 
                                textField.includes('"theme"');
          
          if (looksLikeJSON) {
            try {
              // Direct parsing - fastest approach
              const parsedText = JSON.parse(textField);
              data.parsedContent = parsedText;
              console.log('[Flowise] Successfully parsed nested JSON from text field');
            } catch (parseError) {
              // Try to clean up the JSON and parse again
              console.warn('[Flowise] First JSON parse attempt failed, trying cleanup...');
              try {
                // Remove any leading/trailing whitespace and try again
                const cleanedText = textField
                  .replace(/^\s+|\s+$/g, '')  // trim whitespace
                  .replace(/\n/g, ' ')         // replace newlines with spaces
                  .replace(/\s+/g, ' ');       // collapse multiple spaces
                
                const parsedText = JSON.parse(cleanedText);
                data.parsedContent = parsedText;
                console.log('[Flowise] Successfully parsed cleaned JSON');
              } catch (secondError) {
                // If still fails, try to extract Response field manually using regex
                console.error('[Flowise] Failed to parse JSON after cleanup:', secondError);
                console.error('[Flowise] Raw text field:', textField.substring(0, 200));
                
                // Try to extract Response field with regex as last resort
                const responseMatch = textField.match(/"Response"\s*:\s*"((?:[^"\\]|\\.)*)"/);

                if (responseMatch) {
                  console.log('[Flowise] Extracted Response field via regex');
                  data.parsedContent = { Response: responseMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n') };
                } else {
                  // Ultimate fallback: return friendly error message instead of raw JSON
                  console.error('[Flowise] Could not extract Response field, using error message');
                  data.parsedContent = { 
                    Response: "Je rencontre des difficultés à formuler ma réponse. Pouvez-vous reformuler votre question ?" 
                  };
                }
              }
            }
          } else {
            // Plain text response, wrap it
            data.parsedContent = { Response: textField };
          }
        }
      } catch (parseError) {
        console.error("Failed to parse Flowise response:", parseError);
        throw new Error("Invalid JSON response from Flowise");
      }
      const parseDuration = Date.now() - parseStart;
      
      // Add performance metrics
      data._performance = {
        totalTime: Date.now() - perfStart,
        flowiseFetchTime: fetchDuration,
        parsingTime: parseDuration,
        payloadSizeBytes: payloadSize,
        payloadSizeKB: (payloadSize / 1024).toFixed(2)
      };
      
      console.log(`[Flowise Performance] Total: ${data._performance.totalTime}ms | Fetch: ${fetchDuration}ms | Parse: ${parseDuration}ms | Size: ${data._performance.payloadSizeKB}KB`);

      // Cache is disabled to preserve conversational context
      // (Peter needs to remember user's name and conversation history)

      res.json(data);
    } catch (error) {
      console.error("Flowise proxy error:", error);
      res.status(500).json({ 
        error: "Erreur de communication avec l'assistant Peter. Veuillez réessayer.",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
