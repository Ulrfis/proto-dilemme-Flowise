import { Agent, fetch as undiciFetch, type RequestInit as UndiciRequestInit } from "undici";

const KEEP_ALIVE_TIMEOUT_MS = 60_000;
const KEEP_ALIVE_MAX_TIMEOUT_MS = 600_000;
const CONNECT_TIMEOUT_MS = 10_000;

let agent: Agent | null = null;

function getAgent(): Agent {
  if (!agent) {
    agent = new Agent({
      keepAliveTimeout: KEEP_ALIVE_TIMEOUT_MS,
      keepAliveMaxTimeout: KEEP_ALIVE_MAX_TIMEOUT_MS,
      connect: { timeout: CONNECT_TIMEOUT_MS },
    });
  }
  return agent;
}

let stats = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  totalConnectMs: 0,
};

export interface FlowiseFetchResult {
  response: Response;
  connectMs: number;
}

/**
 * Wrapper autour de fetch() qui :
 *  - réutilise les connexions TCP/TLS vers Flowise (undici keep-alive Agent)
 *  - mesure le temps avant la réception du 1er chunk (TTFB)
 *  - retourne la Response standard pour usage transparent
 */
export async function flowiseFetch(
  url: string,
  init: UndiciRequestInit = {},
): Promise<FlowiseFetchResult> {
  const start = Date.now();
  stats.totalRequests++;
  try {
    const response = await undiciFetch(url, {
      ...init,
      dispatcher: getAgent(),
    });
    const connectMs = Date.now() - start;
    stats.successfulRequests++;
    stats.totalConnectMs += connectMs;
    return { response: response as unknown as Response, connectMs };
  } catch (err) {
    stats.failedRequests++;
    throw err;
  }
}

export function getFlowiseFetchStats() {
  const avgConnectMs =
    stats.successfulRequests > 0
      ? Math.round(stats.totalConnectMs / stats.successfulRequests)
      : 0;
  return { ...stats, avgConnectMs };
}

export async function closeFlowiseFetchAgent(): Promise<void> {
  if (agent) {
    await agent.close();
    agent = null;
  }
}
