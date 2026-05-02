import type { FlowiseTraceDTO, TTSTraceDTO } from "../shared/debug-types";

const MAX_FLOWISE = 50;
const MAX_TTS = 200;

class DebugTraceBuffer {
  private flowise: FlowiseTraceDTO[] = [];
  private tts: TTSTraceDTO[] = [];

  recordFlowise(trace: FlowiseTraceDTO): void {
    this.flowise.unshift(trace);
    if (this.flowise.length > MAX_FLOWISE) {
      this.flowise.length = MAX_FLOWISE;
    }
  }

  recordTTS(trace: TTSTraceDTO): void {
    this.tts.unshift(trace);
    if (this.tts.length > MAX_TTS) {
      this.tts.length = MAX_TTS;
    }
  }

  snapshot(): { flowise: FlowiseTraceDTO[]; tts: TTSTraceDTO[] } {
    // Return shallow copies so the caller can't mutate our buffers
    return { flowise: this.flowise.slice(), tts: this.tts.slice() };
  }
}

export const debugTraces = new DebugTraceBuffer();

/** Stable id helper for trace records (short, non-cryptographic). */
export function newTraceId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
