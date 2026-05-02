export interface TTSSynthesisOptions {
  text: string;
  voiceId?: string;
}

export interface TTSSynthesisResult {
  audio: Buffer;
  contentType: string;
}

export interface TTSVoice {
  id: string;
  name: string;
  description?: string;
  language?: string;
  isDefault?: boolean;
}

export interface ITTSProvider {
  readonly name: string;
  isAvailable(): boolean;
  synthesize(options: TTSSynthesisOptions): Promise<TTSSynthesisResult>;
  listVoices?(): Promise<TTSVoice[]>;
  getDefaultVoiceId?(): string | undefined;
}
