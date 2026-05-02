import OpenAI from "openai";
import type { ITTSProvider, TTSSynthesisOptions, TTSSynthesisResult } from "./types";

type OpenAIVoice = "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";
const SUPPORTED_VOICES: readonly OpenAIVoice[] = [
  "alloy",
  "echo",
  "fable",
  "onyx",
  "nova",
  "shimmer",
] as const;
const DEFAULT_VOICE: OpenAIVoice = "alloy";
const DEFAULT_MODEL = "tts-1";

function resolveVoice(voiceId?: string): OpenAIVoice {
  const raw = (voiceId || process.env.OPENAI_TTS_VOICE || DEFAULT_VOICE).toLowerCase();
  const match = SUPPORTED_VOICES.find((v) => v === raw);
  if (!match) {
    throw new Error(
      `Voix OpenAI invalide "${raw}". Voix supportées: ${SUPPORTED_VOICES.join(", ")}`,
    );
  }
  return match;
}

export class OpenAITTSProvider implements ITTSProvider {
  readonly name = "openai";
  private client: OpenAI | null = null;

  private getClient(): OpenAI {
    if (!this.client) {
      this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    return this.client;
  }

  isAvailable(): boolean {
    return Boolean(process.env.OPENAI_API_KEY);
  }

  async synthesize({ text, voiceId }: TTSSynthesisOptions): Promise<TTSSynthesisResult> {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY n'est pas configurée");
    }
    if (!text || !text.trim()) {
      throw new Error("Le texte à synthétiser est vide");
    }

    const voice = resolveVoice(voiceId);

    try {
      const response = await this.getClient().audio.speech.create({
        model: DEFAULT_MODEL,
        voice,
        input: text,
        response_format: "mp3",
      });

      const arrayBuffer = await response.arrayBuffer();
      return {
        audio: Buffer.from(arrayBuffer),
        contentType: "audio/mpeg",
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const status =
        typeof error === "object" && error !== null && "status" in error
          ? (error as { status?: unknown }).status
          : undefined;
      console.error("[TTS:openai] Erreur:", message);
      if (status === 401) {
        throw new Error("Clé API OpenAI invalide ou expirée");
      }
      if (status === 429) {
        throw new Error("Quota OpenAI dépassé, veuillez réessayer plus tard");
      }
      throw new Error("Erreur lors de la synthèse vocale OpenAI");
    }
  }
}
