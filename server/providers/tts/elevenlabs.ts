import type {
  ITTSProvider,
  TTSSynthesisOptions,
  TTSSynthesisResult,
  TTSVoice,
} from "./types";

const ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1";
const DEFAULT_MODEL_ID = "eleven_multilingual_v2";
const VOICES_CACHE_TTL_MS = 5 * 60 * 1000;

interface ElevenLabsVoiceLabels {
  accent?: string;
  gender?: string;
  description?: string;
  use_case?: string;
  language?: string;
}

interface ElevenLabsFineTuning {
  language?: string;
}

interface ElevenLabsRawVoice {
  voice_id: string;
  name?: string;
  category?: string;
  labels?: ElevenLabsVoiceLabels;
  fine_tuning?: ElevenLabsFineTuning;
}

interface ElevenLabsVoicesResponse {
  voices?: ElevenLabsRawVoice[];
}

export class ElevenLabsTTSProvider implements ITTSProvider {
  readonly name = "elevenlabs";

  private voicesCache: { voices: TTSVoice[]; fetchedAt: number } | null = null;

  isAvailable(): boolean {
    return Boolean(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_ID);
  }

  getDefaultVoiceId(): string | undefined {
    return process.env.ELEVENLABS_VOICE_ID || undefined;
  }

  async listVoices(): Promise<TTSVoice[]> {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      throw new Error("ELEVENLABS_API_KEY n'est pas configurée");
    }

    if (
      this.voicesCache &&
      Date.now() - this.voicesCache.fetchedAt < VOICES_CACHE_TTL_MS
    ) {
      return this.voicesCache.voices;
    }

    const response = await fetch(`${ELEVENLABS_API_BASE}/voices`, {
      method: "GET",
      headers: {
        "xi-api-key": apiKey,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const status = response.status;
      let detail = "";
      try {
        detail = await response.text();
      } catch {
        // ignore
      }
      console.error(
        `[TTS:elevenlabs] Erreur listVoices ${status}: ${detail.substring(0, 300)}`,
      );
      if (status === 401) {
        throw new Error("Clé API ElevenLabs invalide ou expirée");
      }
      throw new Error(`Erreur ElevenLabs (${status})`);
    }

    const data = (await response.json()) as ElevenLabsVoicesResponse;
    const defaultVoiceId = this.getDefaultVoiceId();

    const voices: TTSVoice[] = (data.voices || []).map((raw) => {
      const labels = raw.labels || {};
      const descriptionParts = [
        raw.category,
        labels.gender,
        labels.accent,
        labels.description,
        labels.use_case,
      ].filter((part): part is string => typeof part === "string" && part.length > 0);
      const language =
        typeof raw.fine_tuning?.language === "string"
          ? raw.fine_tuning.language
          : labels.language;
      return {
        id: String(raw.voice_id),
        name: String(raw.name || raw.voice_id),
        description: descriptionParts.join(" • ") || undefined,
        language: language || undefined,
        isDefault: defaultVoiceId ? raw.voice_id === defaultVoiceId : false,
      };
    });

    voices.sort((a, b) => {
      if (a.isDefault && !b.isDefault) return -1;
      if (b.isDefault && !a.isDefault) return 1;
      return a.name.localeCompare(b.name, "fr");
    });

    this.voicesCache = { voices, fetchedAt: Date.now() };
    return voices;
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
