export interface TTSSynthesisOptions {
  text: string;
  voiceId?: string;
}

export interface TTSSynthesisResult {
  audio: Buffer;
  contentType: string;
}

export interface ITTSProvider {
  readonly name: string;
  isAvailable(): boolean;
  synthesize(options: TTSSynthesisOptions): Promise<TTSSynthesisResult>;
}
