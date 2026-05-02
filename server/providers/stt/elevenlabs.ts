import type { ISTTProvider, STTTranscribeOptions, STTTranscribeResult } from "./types";

const ELEVENLABS_STT_URL = "https://api.elevenlabs.io/v1/speech-to-text";
const DEFAULT_MODEL_ID = "scribe_v1";

export class ElevenLabsSTTProvider implements ISTTProvider {
  readonly name = "elevenlabs";

  isAvailable(): boolean {
    return Boolean(process.env.ELEVENLABS_API_KEY);
  }

  async transcribe({ audio, filename, mimeType, language }: STTTranscribeOptions): Promise<STTTranscribeResult> {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      throw new Error("ELEVENLABS_API_KEY n'est pas configurée");
    }

    const blob = new Blob([new Uint8Array(audio)], { type: mimeType || "audio/webm" });
    const form = new FormData();
    form.append("file", blob, filename || "audio.webm");
    form.append("model_id", DEFAULT_MODEL_ID);
    if (language) {
      form.append("language_code", language);
    }

    const response = await fetch(ELEVENLABS_STT_URL, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
      },
      body: form,
    });

    if (!response.ok) {
      const status = response.status;
      const detail = await response.text().catch(() => "");
      console.error(`[STT:elevenlabs] Erreur ${status}: ${detail.substring(0, 300)}`);
      if (status === 401) {
        throw new Error("Clé API ElevenLabs invalide ou expirée");
      }
      if (status === 429) {
        throw new Error("Quota ElevenLabs dépassé, veuillez réessayer plus tard");
      }
      throw new Error(`Erreur ElevenLabs Scribe (${status})`);
    }

    const data = (await response.json()) as { text?: string; language_code?: string };
    return {
      text: data.text || "",
      language: data.language_code || language,
    };
  }
}
