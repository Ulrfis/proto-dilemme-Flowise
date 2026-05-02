import type { ITTSProvider } from "./types";
import { ElevenLabsTTSProvider } from "./elevenlabs";
import { OpenAITTSProvider } from "./openai";
import { NoneTTSProvider } from "./none";

export type TTSProviderName = "elevenlabs" | "openai" | "none";

const REGISTRY: Record<TTSProviderName, () => ITTSProvider> = {
  elevenlabs: () => new ElevenLabsTTSProvider(),
  openai: () => new OpenAITTSProvider(),
  none: () => new NoneTTSProvider(),
};

const instanceCache = new Map<TTSProviderName, ITTSProvider>();

function getProvider(name: TTSProviderName): ITTSProvider {
  let instance = instanceCache.get(name);
  if (!instance) {
    instance = REGISTRY[name]();
    instanceCache.set(name, instance);
  }
  return instance;
}

function resolveActiveName(): TTSProviderName {
  const raw = (process.env.TTS_PROVIDER || "").toLowerCase().trim();
  if (raw === "elevenlabs" || raw === "openai" || raw === "none") {
    return raw;
  }
  if (raw) {
    console.warn(`[TTS] Provider inconnu "${raw}", fallback sur auto-détection`);
  }
  if (process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_ID) {
    return "elevenlabs";
  }
  if (process.env.OPENAI_API_KEY) {
    return "openai";
  }
  return "none";
}

export function getActiveTTSProvider(): ITTSProvider {
  const name = resolveActiveName();
  return getProvider(name);
}

export function getActiveTTSProviderName(): TTSProviderName {
  return resolveActiveName();
}

export function getAvailableTTSProviders(): TTSProviderName[] {
  return (Object.keys(REGISTRY) as TTSProviderName[]).filter((name) => {
    if (name === "none") return true;
    return getProvider(name).isAvailable();
  });
}
