import type { FlowiseTraceDTO, TTSTraceDTO } from "../shared/debug-types";
import { db } from "./db";
import { flowiseTraces, ttsTraces } from "@shared/schema";

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
    db.insert(flowiseTraces)
      .values({
        id: trace.id,
        chatId: trace.chatId,
        question: trace.question,
        startedAt: new Date(trace.startedAt),
        finishedAt: new Date(trace.finishedAt),
        connectMs: trace.connectMs,
        ttftMs: trace.ttftMs,
        totalMs: trace.totalMs,
        tokens: trace.tokens,
        chars: trace.chars,
        nodes: trace.nodes,
        tools: trace.tools,
        unknownEvents: trace.unknownEvents,
        status: trace.status,
        errorMessage: trace.errorMessage ?? null,
      })
      .catch((err) => console.error("[debug-traces] flowise insert error:", err));
  }

  recordTTS(trace: TTSTraceDTO): void {
    this.tts.unshift(trace);
    if (this.tts.length > MAX_TTS) {
      this.tts.length = MAX_TTS;
    }
    db.insert(ttsTraces)
      .values({
        id: trace.id,
        textPreview: trace.textPreview,
        chars: trace.chars,
        startedAt: new Date(trace.startedAt),
        durationMs: trace.durationMs,
        cacheHit: trace.cacheHit,
        provider: trace.provider,
        status: trace.status,
        errorMessage: trace.errorMessage ?? null,
      })
      .catch((err) => console.error("[debug-traces] tts insert error:", err));
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
