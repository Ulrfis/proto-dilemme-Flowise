export interface STTTranscribeOptions {
  audio: Buffer;
  filename: string;
  mimeType?: string;
  language?: string;
}

export interface STTTranscribeResult {
  text: string;
  language?: string;
}

export interface ISTTProvider {
  readonly name: string;
  isAvailable(): boolean;
  transcribe(options: STTTranscribeOptions): Promise<STTTranscribeResult>;
}
