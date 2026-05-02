import type { ITTSProvider, TTSSynthesisOptions, TTSSynthesisResult } from "./types";

export class NoneTTSProvider implements ITTSProvider {
  readonly name = "none";

  isAvailable(): boolean {
    return true;
  }

  async synthesize(_options: TTSSynthesisOptions): Promise<TTSSynthesisResult> {
    throw new Error(
      "La synthèse vocale est désactivée. Configurez TTS_PROVIDER et la clé API correspondante.",
    );
  }
}
