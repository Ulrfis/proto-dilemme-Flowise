import { flowiseFetch } from "./flowise-fetch";

interface WarmerStats {
  totalPings: number;
  successfulPings: number;
  failedPings: number;
  totalLatencyMs: number;
  lastError?: string;
}

let stats: WarmerStats = {
  totalPings: 0,
  successfulPings: 0,
  failedPings: 0,
  totalLatencyMs: 0,
};

let timer: NodeJS.Timeout | null = null;
let summaryTimer: NodeJS.Timeout | null = null;

const DEFAULT_INTERVAL_MS = 30_000;
const SUMMARY_INTERVAL_MS = 5 * 60_000;

async function pingFlowise(): Promise<void> {
  const flowiseHost = process.env.FLOWISE_HOST;
  const chatflowId = process.env.FLOWISE_CHATFLOW_ID;
  const apiKey = process.env.FLOWISE_API_KEY;
  if (!flowiseHost || !chatflowId) return;

  const headers: Record<string, string> = {};
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  const start = Date.now();
  stats.totalPings++;
  try {
    // HEAD on the chatflow endpoint is the cheapest way to confirm:
    // - DNS + TLS still resolve
    // - Flowise process is alive
    // - The chatflow exists (auth ok)
    // Falls back to GET if HEAD is not supported by Flowise.
    const url = `${flowiseHost}/api/v1/chatflows/${chatflowId}`;
    let { response, connectMs } = await flowiseFetch(url, { method: "HEAD", headers });
    if (response.status === 404 || response.status === 405) {
      const fallback = await flowiseFetch(url, { method: "GET", headers });
      response = fallback.response;
      connectMs = fallback.connectMs;
    }
    if (response.status >= 200 && response.status < 500) {
      stats.successfulPings++;
      stats.totalLatencyMs += Date.now() - start;
    } else {
      stats.failedPings++;
      stats.lastError = `HTTP ${response.status}`;
    }
    // Drain body to free the connection back to the pool
    try { await response.arrayBuffer(); } catch { /* ignore */ }
  } catch (err) {
    stats.failedPings++;
    stats.lastError = err instanceof Error ? err.message : String(err);
  }
}

function logSummary(): void {
  if (stats.totalPings === 0) return;
  const avg =
    stats.successfulPings > 0
      ? Math.round(stats.totalLatencyMs / stats.successfulPings)
      : 0;
  console.log(
    `[FlowiseWarmer] ${stats.totalPings} pings (${stats.successfulPings} ok, ${stats.failedPings} ko)` +
      ` avgLatency=${avg}ms` +
      (stats.lastError ? ` lastError="${stats.lastError}"` : ""),
  );
  // Reset window stats after each summary
  stats = {
    totalPings: 0,
    successfulPings: 0,
    failedPings: 0,
    totalLatencyMs: 0,
    lastError: stats.lastError,
  };
}

export function startFlowiseWarmer(opts: { intervalMs?: number } = {}): void {
  if (process.env.FLOWISE_KEEPALIVE === "0") {
    console.log("[FlowiseWarmer] Disabled via FLOWISE_KEEPALIVE=0");
    return;
  }
  if (!process.env.FLOWISE_HOST || !process.env.FLOWISE_CHATFLOW_ID) {
    console.log("[FlowiseWarmer] Disabled: FLOWISE_HOST or FLOWISE_CHATFLOW_ID missing");
    return;
  }
  if (timer) return;

  const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;
  console.log(
    `[FlowiseWarmer] Started (interval=${intervalMs}ms, target=${process.env.FLOWISE_HOST})`,
  );

  // Fire immediately to warm up at boot
  void pingFlowise();
  timer = setInterval(() => void pingFlowise(), intervalMs);
  if (timer.unref) timer.unref();

  summaryTimer = setInterval(logSummary, SUMMARY_INTERVAL_MS);
  if (summaryTimer.unref) summaryTimer.unref();
}

export function stopFlowiseWarmer(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (summaryTimer) {
    clearInterval(summaryTimer);
    summaryTimer = null;
  }
}
