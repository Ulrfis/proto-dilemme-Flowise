import type { ITTSProvider, TTSSynthesisOptions, TTSSynthesisResult } from "./types";

const ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1";
const DEFAULT_MODEL_ID = "eleven_multilingual_v2";

export class ElevenLabsTTSProvider implements ITTSProvider {
  readonly name = "elevenlabs";

  isAvailable(): boolean {
    return Boolean(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_ID);
  }

  async synthesize({ text, voiceId }: TTSSynthesisOptions): Promise<TTSSynthesisResult> {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    const defaultVoiceId = process.env.ELEVENLABS_VOICE_ID;
    const finalVoiceId = voiceId || defaultVoiceId;

    if (!apiKey) {
      throw new Error("ELEVENLABS_API_KEY n'est pas configurée");
    }
    if (!finalVoiceId) {
      throw new Error("ELEVENLABS_VOICE_ID n'est pas configurée");
    }
    if (!text || !text.trim()) {
      throw new Error("Le texte à synthétiser est vide");
    }

    const url = `${ELEVENLABS_API_BASE}/text-to-speech/${finalVoiceId}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: DEFAULT_MODEL_ID,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true,
        },
      }),
    });

    if (!response.ok) {
      const status = response.status;
      let detail = "";
      try {
        detail = await response.text();
      } catch {
        // ignore
      }
      console.error(`[TTS:elevenlabs] Erreur ${status}: ${detail.substring(0, 300)}`);

      if (status === 401) {
        throw new Error("Clé API ElevenLabs invalide ou expirée");
      }
      if (status === 429) {
        throw new Error("Quota ElevenLabs dépassé, veuillez réessayer plus tard");
      }
      if (status === 422) {
        throw new Error("Voix ElevenLabs introuvable ou texte invalide");
      }
      throw new Error(`Erreur ElevenLabs (${status})`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return {
      audio: Buffer.from(arrayBuffer),
      contentType: "audio/mpeg",
    };
  }
}
