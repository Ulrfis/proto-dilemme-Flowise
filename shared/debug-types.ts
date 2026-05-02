export type ServiceHealthLevel = "green" | "orange" | "red" | "gray";

export interface ServiceHealth {
  /** Display name (e.g. "Flowise", "ElevenLabs TTS"). */
  name: string;
  /** Provider/category tag for grouping ("flowise", "tts", "stt", "cache"). */
  category: "flowise" | "tts" | "stt" | "cache" | "warmer";
  level: ServiceHealthLevel;
  /** Round-trip latency for the health probe (ms). Absent when unknown/skipped. */
  latencyMs?: number;
  /** Short human-readable status message. */
  message: string;
  /** Optional remediation hint shown in tooltip when the level is not green. */
  suggestion?: string;
  /** Free-form key/value details displayed under the card. */
  details?: Record<string, string | number | boolean>;
}

export interface FlowiseTraceDTO {
  id: string;
  chatId: string;
  question: string;
  startedAt: number;
  finishedAt: number;
  /** TLS+TCP+DNS handshake time to Flowise (ms). */
  connectMs: number;
  /** Time from request start to first SSE token (ms). 0 when no token received. */
  ttftMs: number;
  /** Total wall-clock time of the SSE stream (ms). */
  totalMs: number;
  tokens: number;
  chars: number;
  /** Number of agent flow nodes traversed (proxy for chatflow complexity). */
  nodes: number;
  /** Number of tool calls observed. */
  tools: number;
  /** Number of SSE events the proxy could not classify. */
  unknownEvents: number;
  status: "ok" | "error" | "aborted";
  errorMessage?: string;
}

export interface TTSTraceDTO {
  id: string;
  /** First ~80 chars of the synthesized text. */
  textPreview: string;
  chars: number;
  startedAt: number;
  durationMs: number;
  cacheHit: boolean;
  provider: string;
  status: "ok" | "error";
  errorMessage?: string;
}

export interface DebugTracesResponse {
  generatedAt: number;
  /** Most recent first. */
  flowise: FlowiseTraceDTO[];
  tts: TTSTraceDTO[];
}

export interface TTSCacheStats {
  size: number;
  maxEntries: number;
  hits: number;
  misses: number;
  signature: string;
}

export interface FlowiseWarmerStats {
  enabled: boolean;
  intervalMs: number;
  targetHost: string;
  totalPings: number;
  successfulPings: number;
  failedPings: number;
  lastPingAt?: number;
  lastPingOk?: boolean;
  lastPingMs?: number;
  lastError?: string;
}

export interface DebugHealthResponse {
  generatedAt: number;
  services: ServiceHealth[];
  warmer: FlowiseWarmerStats;
  cache: TTSCacheStats;
  /** Active providers as reported by /api/providers (mirrored for convenience). */
  providers: { tts: string; stt: string };
  /** Server uptime (ms). */
  uptimeMs: number;
}

/** Phase breakdown shown in the latency bar. */
export interface LatencyPhase {
  key: "connect" | "preTtft" | "stream";
  label: string;
  ms: number;
  /** Tailwind background color class. */
  color: string;
  /** Tooltip explanation. */
  tooltip: string;
  /** Optional remediation hint shown when the phase exceeds a soft budget. */
  warningSuggestion?: string;
}
