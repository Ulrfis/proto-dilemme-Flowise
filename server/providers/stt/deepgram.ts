import type { ISTTProvider, STTTranscribeOptions, STTTranscribeResult } from "./types";

const DEEPGRAM_URL = "https://api.deepgram.com/v1/listen";

interface DeepgramAlternative {
  transcript?: string;
}
interface DeepgramChannel {
  alternatives?: DeepgramAlternative[];
  detected_language?: string;
}
interface DeepgramResponse {
  results?: {
    channels?: DeepgramChannel[];
  };
}

export class DeepgramSTTProvider implements ISTTProvider {
  readonly name = "deepgram";

  isAvailable(): boolean {
    return Boolean(process.env.DEEPGRAM_API_KEY);
  }

  async transcribe({ audio, mimeType, language }: STTTranscribeOptions): Promise<STTTranscribeResult> {
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
      throw new Error("DEEPGRAM_API_KEY n'est pas configurée");
    }

    const params = new URLSearchParams({
      model: process.env.DEEPGRAM_MODEL || "nova-3",
      language: language || "fr",
      smart_format: "true",
      punctuate: "true",
    });

    const response = await fetch(`${DEEPGRAM_URL}?${params.toString()}`, {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": mimeType || "audio/webm",
      },
      body: new Uint8Array(audio),
    });

    if (!response.ok) {
      const status = response.status;
      const detail = await response.text().catch(() => "");
      console.error(`[STT:deepgram] Erreur ${status}: ${detail.substring(0, 300)}`);
      if (status === 401) {
        throw new Error("Clé API Deepgram invalide ou expirée");
      }
      if (status === 429) {
        throw new Error("Quota Deepgram dépassé, veuillez réessayer plus tard");
      }
      throw new Error(`Erreur Deepgram (${status})`);
    }

    const data = (await response.json()) as DeepgramResponse;
    const channel = data.results?.channels?.[0];
    const text = channel?.alternatives?.[0]?.transcript || "";
    const detectedLang = channel?.detected_language || language;

    return {
      text,
      language: detectedLang,
    };
  }
}
