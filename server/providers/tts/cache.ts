import crypto from "crypto";
import type { TTSSynthesisResult } from "./types";

const DEFAULT_MAX_ENTRIES = 100;

export interface TTSCacheKeyInput {
  text: string;
  voiceId?: string;
  provider: string;
}

interface CacheEntry {
  audio: Buffer;
  contentType: string;
  size: number;
}

class LRUTTSCache {
  private readonly maxEntries: number;
  private store = new Map<string, CacheEntry>();
  private signature = "";

  constructor(maxEntries: number = DEFAULT_MAX_ENTRIES) {
    this.maxEntries = maxEntries;
  }

  private currentSignature(): string {
    const provider = (process.env.TTS_PROVIDER || "").trim().toLowerCase();
    const voice = (process.env.ELEVENLABS_VOICE_ID || "").trim();
    return `${provider}::${voice}`;
  }

  private ensureSignature(): void {
    const sig = this.currentSignature();
    if (sig !== this.signature) {
      if (this.store.size > 0) {
        console.log(
          `[TTS:cache] Signature changée (${this.signature} -> ${sig}), invalidation de ${this.store.size} entrée(s)`,
        );
      }
      this.store.clear();
      this.signature = sig;
    }
  }

  buildKey(input: TTSCacheKeyInput): string {
    const hash = crypto
      .createHash("sha256")
      .update(input.provider)
      .update("\u0000")
      .update(input.voiceId || "")
      .update("\u0000")
      .update(input.text)
      .digest("hex");
    return hash;
  }

  get(key: string): CacheEntry | undefined {
    this.ensureSignature();
    const entry = this.store.get(key);
    if (!entry) return undefined;
    // Refresh recency
    this.store.delete(key);
    this.store.set(key, entry);
    return entry;
  }

  set(key: string, value: TTSSynthesisResult): void {
    this.ensureSignature();
    const entry: CacheEntry = {
      audio: value.audio,
      contentType: value.contentType,
      size: value.audio.length,
    };
    if (this.store.has(key)) {
      this.store.delete(key);
    }
    this.store.set(key, entry);
    while (this.store.size > this.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey === undefined) break;
      this.store.delete(oldestKey);
    }
  }

  size(): number {
    return this.store.size;
  }
}

export const ttsCache = new LRUTTSCache(
  Number.parseInt(process.env.TTS_CACHE_MAX_ENTRIES || "", 10) > 0
    ? Number.parseInt(process.env.TTS_CACHE_MAX_ENTRIES!, 10)
    : DEFAULT_MAX_ENTRIES,
);
