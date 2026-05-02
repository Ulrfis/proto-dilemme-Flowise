import { getActiveTTSProvider, getActiveTTSProviderName } from "./index";
import { ttsCache } from "./cache";

/**
 * Pré-synthétise un texte (typiquement le welcome message) au démarrage du
 * serveur pour que le 1er élève entende Peter sans la latence de synthèse.
 *
 * Non-bloquant : retourne une promise mais ne fait jamais throw.
 * Désactivable via TTS_PREWARM=0.
 */
export async function prewarmTTS(text: string, label = "text"): Promise<void> {
  if (process.env.TTS_PREWARM === "0") {
    console.log(`[TTS Prewarm] Disabled via TTS_PREWARM=0`);
    return;
  }
  const trimmed = text?.trim();
  if (!trimmed) return;

  const providerName = getActiveTTSProviderName();
  if (providerName === "none") {
    console.log(`[TTS Prewarm] Skipped (${label}): no TTS provider configured`);
    return;
  }

  const provider = getActiveTTSProvider();
  const voiceId = provider.getDefaultVoiceId?.() || "";

  const cacheKey = ttsCache.buildKey({
    text: trimmed,
    voiceId,
    provider: provider.name,
  });

  if (ttsCache.get(cacheKey)) {
    console.log(`[TTS Prewarm] ${label}: already in cache, skipping`);
    return;
  }

  const start = Date.now();
  try {
    const result = await provider.synthesize({
      text: trimmed,
      voiceId: voiceId || undefined,
    });
    ttsCache.set(cacheKey, result);
    const elapsed = Date.now() - start;
    console.log(
      `[TTS Prewarm] ${label} cached (${trimmed.length} chars, ${result.audio.length} bytes, ${elapsed}ms)`,
    );
  } catch (err) {
    const elapsed = Date.now() - start;
    console.warn(
      `[TTS Prewarm] ${label} failed after ${elapsed}ms:`,
      err instanceof Error ? err.message : String(err),
    );
  }
}
