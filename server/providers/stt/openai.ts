import OpenAI from "openai";
import { createReadStream } from "fs";
import { writeFile, unlink } from "fs/promises";
import type { ISTTProvider, STTTranscribeOptions, STTTranscribeResult } from "./types";

export class OpenAISTTProvider implements ISTTProvider {
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

  async transcribe({ audio, filename, language }: STTTranscribeOptions): Promise<STTTranscribeResult> {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY n'est pas configurée");
    }

    const ext = filename.split(".").pop() || "webm";
    const tempPath = `/tmp/stt_openai_${Date.now()}.${ext}`;
    await writeFile(tempPath, audio);

    try {
      const transcription = await this.getClient().audio.transcriptions.create({
        file: createReadStream(tempPath),
        model: "whisper-1",
        language: language || "fr",
        response_format: "json",
      });

      return {
        text: transcription.text,
        language: language || "fr",
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[STT:openai] Erreur:", message);
      throw new Error("Erreur lors de la transcription OpenAI Whisper");
    } finally {
      await unlink(tempPath).catch(() => {});
    }
  }
}
