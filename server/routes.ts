import type { Express } from "express";
import { createServer, type Server } from "http";
import { analyticsEventSchema } from "@shared/schema";
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
import { debugTraces, newTraceId } from "./debug-traces";
import { buildHealthResponse } from "./debug-health";

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
  // returns { text, language }.
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

      const cached = ttsCache.get(cacheKey);
      if (cached) {
        console.log(
          `[TTS:${provider.name}] Cache HIT (${safeText.length} caractères, ${cached.size} octets)`,
        );
        debugTraces.recordTTS({
          id: newTraceId("tts"),
          textPreview,
          chars: safeText.length,
          startedAt: ttsStart,
          durationMs: Date.now() - ttsStart,
          cacheHit: true,
          provider: provider.name,
          status: "ok",
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

        debugTraces.recordTTS({
          id: newTraceId("tts"),
          textPreview,
          chars: safeText.length,
          startedAt: ttsStart,
          durationMs: Date.now() - ttsStart,
          cacheHit: false,
          provider: provider.name,
          status: "ok",
        });

        res.setHeader('Content-Type', result.contentType);
        res.setHeader('Content-Length', String(result.audio.length));
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-TTS-Provider', provider.name);
        res.setHeader('X-TTS-Cache', 'miss');
        res.send(result.audio);
      } catch (providerError) {
        console.error(`[TTS:${provider.name}] Provider error:`, providerError);
        debugTraces.recordTTS({
          id: newTraceId("tts"),
          textPreview,
          chars: safeText.length,
          startedAt: ttsStart,
          durationMs: Date.now() - ttsStart,
          cacheHit: false,
          provider: provider.name,
          status: "error",
          errorMessage: providerError instanceof Error ? providerError.message : String(providerError),
        });
        res.status(502).json({
          error: "Erreur lors de la synthèse vocale",
          details: providerError instanceof Error ? providerError.message : "Le service vocal a rencontré un problème",
          provider: provider.name,
        });
      }
    } catch (error) {
      console.error("[TTS] Endpoint error:", error);
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

      // Security: check against allowlist of known educational domains
      const hostname = parsedUrl.hostname.replace(/^www\./, '');
      const isAllowed = [...PROXY_ALLOWED_DOMAINS].some(domain =>
        hostname === domain || hostname.endsWith(`.${domain}`)
      );
      if (!isAllowed) {
        console.warn(`[Proxy] Blocked request to non-allowlisted domain: ${parsedUrl.hostname}`);
        return res.status(403).json({ error: "Domain not allowed by proxy" });
      }

      console.log(`[Proxy] Fetching: ${url}`);

      // Enhanced headers to maximize compatibility
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Cache-Control': 'max-age=0'
      };

      const response = await fetch(url, {
        method: 'GET',
        headers,
        redirect: 'follow'
      });

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

  // Flowise streaming endpoint (SSE proxy)
  // Forwards Flowise events to the client AND emits a `progress` event with a
  // human-friendly FR label whenever Flowise transitions between agent steps.
  // Logs are minimal: 1 line at start, 1 structured line at end.
  app.post("/api/flowise/prediction/:chatflowId/stream", async (req, res) => {
    const perfStart = Date.now();
    const { chatflowId } = req.params;
    const { question, chatId } = req.body;
    const sessionTag = (chatId || `anon_${Date.now()}`).slice(0, 24);

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
      res.write(`data: ${JSON.stringify({ error: 'Flowise unreachable', details: msg })}\n\n`);
      return res.end();
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error(`[Flowise] end chatId=${sessionTag} status=${response.status} body="${errorText.slice(0, 120)}"`);
      res.write(`data: ${JSON.stringify({ error: `Flowise API error: ${response.status}` })}\n\n`);
      return res.end();
    }

    const reader = response.body?.getReader();
    if (!reader) {
      console.error(`[Flowise] end chatId=${sessionTag} status=no_body`);
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
          totalTime: totalMs,
          firstTokenTime: firstTokenMs,
          tokenCount,
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
        id: newTraceId("fw"),
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
    } catch (streamError) {
      const msg = streamError instanceof Error ? streamError.message : String(streamError);
      console.error(`[Flowise] end chatId=${sessionTag} status=stream_error error="${msg}"`);
      debugTraces.recordFlowise({
        id: newTraceId("fw"),
        chatId: sessionTag,
        question: (question || "").slice(0, 120),
        startedAt: perfStart,
        finishedAt: Date.now(),
        connectMs,
        ttftMs: firstTokenMs,
        totalMs: Date.now() - perfStart,
        tokens: tokenCount,
        chars: fullText.length,
        nodes: nodesExecuted,
        tools: toolsCalled,
        unknownEvents,
        status: msg.includes("aborted") ? "aborted" : "error",
        errorMessage: msg,
      });
      res.write(`data: ${JSON.stringify({ error: 'Stream interrupted', details: msg })}\n\n`);
    } finally {
      try { reader.releaseLock(); } catch { /* ignore */ }
      res.end();
    }
  });

  // ────────────────────────────────────────────────────────────────────
  // Debug endpoints — surface internal state for the /debug panel.
  // No auth: read-only, no secrets exposed, only aggregated metrics.
  // ────────────────────────────────────────────────────────────────────
  const serverStartedAt = Date.now();

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
