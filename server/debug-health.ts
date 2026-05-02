import { flowiseFetch } from "./flowise-fetch";
import { ttsCache } from "./providers/tts/cache";
import { getFlowiseWarmerStats } from "./flowise-warmer";
import { getActiveTTSProviderName } from "./providers/tts";
import { getActiveSTTProviderName } from "./providers/stt";
import type {
  DebugHealthResponse,
  ServiceHealth,
  ServiceHealthLevel,
} from "../shared/debug-types";

const PROBE_TIMEOUT_MS = 3000;

function pickLevel(latencyMs: number, thresholds: { greenMax: number; orangeMax: number }): ServiceHealthLevel {
  if (latencyMs <= thresholds.greenMax) return "green";
  if (latencyMs <= thresholds.orangeMax) return "orange";
  return "red";
}

async function probeFlowise(): Promise<ServiceHealth> {
  const flowiseHost = process.env.FLOWISE_HOST;
  const chatflowId = process.env.FLOWISE_CHATFLOW_ID;
  const apiKey = process.env.FLOWISE_API_KEY;
  if (!flowiseHost || !chatflowId) {
    return {
      name: "Flowise",
      category: "flowise",
      level: "red",
      message: "Configuration manquante",
      suggestion: "Définir FLOWISE_HOST et FLOWISE_CHATFLOW_ID dans les secrets.",
    };
  }
  const headers: Record<string, string> = {};
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
  const start = Date.now();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
  try {
    const url = `${flowiseHost}/api/v1/chatflows/${chatflowId}`;
    let { response, connectMs } = await flowiseFetch(url, { method: "HEAD", headers, signal: ctrl.signal });
    if (response.status === 404 || response.status === 405) {
      const fallback = await flowiseFetch(url, { method: "GET", headers, signal: ctrl.signal });
      response = fallback.response;
      connectMs = fallback.connectMs;
    }
    try { await response.arrayBuffer(); } catch { /* ignore */ }
    const total = Date.now() - start;
    if (response.status >= 500) {
      return {
        name: "Flowise",
        category: "flowise",
        level: "red",
        latencyMs: total,
        message: `HTTP ${response.status}`,
        suggestion: "L'instance Flowise répond mais en erreur — vérifier ses logs côté hébergeur.",
        details: { connectMs, host: flowiseHost },
      };
    }
    const level = pickLevel(total, { greenMax: 600, orangeMax: 1500 });
    return {
      name: "Flowise",
      category: "flowise",
      level,
      latencyMs: total,
      message:
        level === "green"
          ? "Réactif"
          : level === "orange"
            ? "Lent (>600 ms)"
            : "Très lent (>1500 ms)",
      suggestion:
        level === "green"
          ? undefined
          : "L'instance est joignable mais lente : vérifier la charge du serveur Flowise et que le keep-alive HTTP fonctionne (connectMs).",
      details: { connectMs, status: response.status, host: flowiseHost },
    };
  } catch (err) {
    return {
      name: "Flowise",
      category: "flowise",
      level: "red",
      message: "Injoignable",
      suggestion:
        "L'instance Flowise n'a pas répondu sous 3s. Vérifier qu'elle tourne, que FLOWISE_HOST est correct et que le réseau sortant est ouvert.",
      details: { error: err instanceof Error ? err.message : String(err) },
    };
  } finally {
    clearTimeout(t);
  }
}

async function probeElevenLabs(): Promise<ServiceHealth | null> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return null;
  const start = Date.now();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.elevenlabs.io/v1/voices", {
      headers: { "xi-api-key": apiKey },
      signal: ctrl.signal,
    });
    const total = Date.now() - start;
    if (res.status === 401 || res.status === 403) {
      return {
        name: "ElevenLabs",
        category: "tts",
        level: "red",
        latencyMs: total,
        message: `Clé API rejetée (${res.status})`,
        suggestion: "Vérifier que la clé ELEVENLABS_API_KEY est valide et a accès au compte.",
      };
    }
    if (!res.ok) {
      return {
        name: "ElevenLabs",
        category: "tts",
        level: "red",
        latencyMs: total,
        message: `HTTP ${res.status}`,
        suggestion: "Réponse anormale de l'API ElevenLabs. Vérifier le statut de leur service.",
      };
    }
    const level = pickLevel(total, { greenMax: 800, orangeMax: 2000 });
    return {
      name: "ElevenLabs",
      category: "tts",
      level,
      latencyMs: total,
      message:
        level === "green"
          ? "Réactif"
          : level === "orange"
            ? "Lent (>800 ms)"
            : "Très lent (>2 s)",
      suggestion:
        level === "green"
          ? undefined
          : "L'API ElevenLabs répond mais lentement — penser au cache TTS pour absorber la latence.",
      details: { voiceConfigured: !!process.env.ELEVENLABS_VOICE_ID },
    };
  } catch (err) {
    return {
      name: "ElevenLabs",
      category: "tts",
      level: "red",
      message: "Injoignable",
      suggestion: "Pas de réponse sous 3s. Vérifier la connexion sortante vers api.elevenlabs.io.",
      details: { error: err instanceof Error ? err.message : String(err) },
    };
  } finally {
    clearTimeout(t);
  }
}

function checkOpenAI(): ServiceHealth {
  if (!process.env.OPENAI_API_KEY) {
    return {
      name: "OpenAI",
      category: "tts",
      level: "gray",
      message: "Non configuré",
      suggestion: "Optionnel : OPENAI_API_KEY active le fallback TTS et le STT Whisper.",
    };
  }
  return {
    name: "OpenAI",
    category: "tts",
    level: "green",
    message: "Clé présente (pas de ping)",
    details: { note: "Aucun ping pour ne pas consommer de quota inutilement." },
  };
}

function checkDeepgram(): ServiceHealth {
  if (!process.env.DEEPGRAM_API_KEY) {
    return {
      name: "Deepgram",
      category: "stt",
      level: "gray",
      message: "Non configuré",
      suggestion: "Optionnel — non utilisé en production actuellement.",
    };
  }
  return {
    name: "Deepgram",
    category: "stt",
    level: "green",
    message: "Clé présente (pas de ping)",
  };
}

function checkActiveProviders(): ServiceHealth[] {
  const ttsName = getActiveTTSProviderName();
  const sttName = getActiveSTTProviderName();
  const out: ServiceHealth[] = [
    {
      name: `TTS actif: ${ttsName}`,
      category: "tts",
      level: ttsName === "none" ? "red" : "green",
      message: ttsName === "none" ? "Aucun provider TTS actif — voix de Peter désactivée" : "Configuré",
      suggestion:
        ttsName === "none"
          ? "Configurer TTS_PROVIDER (elevenlabs ou openai) + la clé correspondante."
          : undefined,
    },
    {
      name: `STT actif: ${sttName}`,
      category: "stt",
      level: "green",
      message: "Configuré",
    },
  ];
  return out;
}

export async function buildHealthResponse(uptimeMs: number): Promise<DebugHealthResponse> {
  const [flowise, eleven] = await Promise.all([probeFlowise(), probeElevenLabs()]);
  const services: ServiceHealth[] = [flowise];
  if (eleven) services.push(eleven);
  services.push(checkOpenAI(), checkDeepgram(), ...checkActiveProviders());

  return {
    generatedAt: Date.now(),
    services,
    warmer: getFlowiseWarmerStats(),
    cache: ttsCache.stats(),
    providers: {
      tts: getActiveTTSProviderName(),
      stt: getActiveSTTProviderName(),
    },
    uptimeMs,
  };
}
