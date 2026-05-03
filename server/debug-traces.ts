import type { FlowiseTraceDTO, TTSTraceDTO } from "../shared/debug-types";
import { db } from "./db";
import { flowiseTraces, ttsTraces } from "@shared/schema";
import { sql } from "drizzle-orm";

const MAX_FLOWISE = 50;
const MAX_TTS = 200;

// ─── Retention policy ────────────────────────────────────────────────────────

const RETENTION_DAYS = Math.max(
  1,
  parseInt(process.env.DEBUG_TRACES_RETENTION_DAYS ?? "30", 10) || 30,
);
const RETENTION_MS = RETENTION_DAYS * 86_400_000;

interface PurgeResult {
  flowiseDeleted: number;
  ttsDeleted: number;
  ranAt: number;
}

let lastPurge: PurgeResult | null = null;
let schedulerStarted = false;

type CountRow = { n: number };

async function purgeOldTraces(): Promise<void> {
  const cutoff = new Date(Date.now() - RETENTION_MS);
  try {
    // Use a DELETE…RETURNING CTE to obtain a row count without materialising
    // all deleted IDs in memory — safe even for very large purges.
    const [fwResult, ttsResult] = await Promise.all([
      db.execute<CountRow>(sql`
        WITH deleted AS (
          DELETE FROM flowise_traces WHERE started_at < ${cutoff} RETURNING 1
        )
        SELECT COUNT(*)::int AS n FROM deleted
      `),
      db.execute<CountRow>(sql`
        WITH deleted AS (
          DELETE FROM tts_traces WHERE started_at < ${cutoff} RETURNING 1
        )
        SELECT COUNT(*)::int AS n FROM deleted
      `),
    ]);
    const flowiseDeleted = Number(fwResult.rows[0]?.n ?? 0);
    const ttsDeleted = Number(ttsResult.rows[0]?.n ?? 0);
    lastPurge = { flowiseDeleted, ttsDeleted, ranAt: Date.now() };
    console.log(
      `[debug-traces] Purge complete: ${flowiseDeleted} flowise + ${ttsDeleted} tts rows deleted (cutoff: ${cutoff.toISOString()})`,
    );
  } catch (err) {
    console.error("[debug-traces] Purge error:", err);
  }
}

/** Returns the last purge result and retention config. */
export function getRetentionInfo(): {
  retentionDays: number;
  lastPurge: PurgeResult | null;
} {
  return { retentionDays: RETENTION_DAYS, lastPurge };
}

/** Start the retention scheduler: purge immediately then repeat daily.
 *  Idempotent — safe to call multiple times; only one interval is created. */
export function startRetentionScheduler(): void {
  if (schedulerStarted) return;
  schedulerStarted = true;
  void purgeOldTraces();
  setInterval(purgeOldTraces, 86_400_000);
}

// ─── In-memory trace buffer ───────────────────────────────────────────────────

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
