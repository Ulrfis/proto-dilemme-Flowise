import type { ISTTProvider } from "./types";
import { OpenAISTTProvider } from "./openai";
import { ElevenLabsSTTProvider } from "./elevenlabs";
import { DeepgramSTTProvider } from "./deepgram";

export type STTProviderName = "openai" | "elevenlabs" | "deepgram";

const REGISTRY: Record<STTProviderName, () => ISTTProvider> = {
  openai: () => new OpenAISTTProvider(),
  elevenlabs: () => new ElevenLabsSTTProvider(),
  deepgram: () => new DeepgramSTTProvider(),
};

const instanceCache = new Map<STTProviderName, ISTTProvider>();

function getProvider(name: STTProviderName): ISTTProvider {
  let instance = instanceCache.get(name);
  if (!instance) {
    instance = REGISTRY[name]();
    instanceCache.set(name, instance);
  }
  return instance;
}

function resolveActiveName(): STTProviderName {
  const raw = (process.env.STT_PROVIDER || "").toLowerCase().trim();
  if (raw === "openai" || raw === "elevenlabs" || raw === "deepgram") {
    return raw;
  }
  if (raw) {
    console.warn(`[STT] Provider inconnu "${raw}", fallback sur openai`);
  }
  return "openai";
}

export function getActiveSTTProvider(): ISTTProvider {
  return getProvider(resolveActiveName());
}

export function getActiveSTTProviderName(): STTProviderName {
  return resolveActiveName();
}

export function getAvailableSTTProviders(): STTProviderName[] {
  return (Object.keys(REGISTRY) as STTProviderName[]).filter((name) =>
    getProvider(name).isAvailable(),
  );
}
