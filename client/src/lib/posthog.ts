// PostHog client : initialisé une seule fois côté navigateur.
// Désactivé silencieusement quand VITE_POSTHOG_KEY n'est pas fournie
// (utile en local quand on ne veut pas polluer le projet PostHog de prod).
import posthog from "posthog-js";
import type { CapturedNetworkRequest } from "posthog-js";

let initialized = false;
let enabled = false;

const SENSITIVE_API_PATHS = [
  "/api/flowise/",
  "/api/tts",
  "/api/transcribe",
  "/api/sessions",
  "/api/analytics",
];

const SENSITIVE_HEADER_REGEX = /^(authorization|cookie|set-cookie|x-api-key)$/i;

export function normalizePostHogHost(host?: string) {
  return (host || "https://eu.i.posthog.com").trim().replace(/\/+$/, "");
}

function isSensitiveNetworkUrl(rawUrl?: string) {
  if (!rawUrl) return false;
  try {
    const url = new URL(rawUrl, window.location.origin);
    return SENSITIVE_API_PATHS.some((path) => url.pathname.startsWith(path));
  } catch {
    return SENSITIVE_API_PATHS.some((path) => rawUrl.includes(path));
  }
}

function redactHeaders(headers?: Record<string, any>) {
  if (!headers) return headers;
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key,
      SENSITIVE_HEADER_REGEX.test(key) ? "[redacted]" : value,
    ]),
  );
}

export function buildPostHogNetworkRequestMasker() {
  return (request: CapturedNetworkRequest): CapturedNetworkRequest | undefined => {
    if (!request) return request;

    const next: CapturedNetworkRequest = {
      ...request,
      requestHeaders: redactHeaders(request.requestHeaders as Record<string, any>) as any,
      responseHeaders: redactHeaders(request.responseHeaders as Record<string, any>) as any,
    };

    if (isSensitiveNetworkUrl(request.name)) {
      next.requestBody = undefined;
      next.responseBody = undefined;
    }

    return next;
  };
}

export function initPostHog() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  const apiKey = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
  const apiHost = normalizePostHogHost(
    import.meta.env.VITE_POSTHOG_HOST as string | undefined,
  );

  if (!apiKey) {
    console.info("[PostHog] désactivé (VITE_POSTHOG_KEY manquante)");
    return;
  }

  try {
    posthog.init(apiKey, {
      api_host: apiHost,
      person_profiles: "identified_only",
      capture_pageview: false, // on appelle nous-mêmes trackPageView
      capture_pageleave: true,
      autocapture: true,
      capture_performance: {
        web_vitals: true,
        network_timing: true,
        web_vitals_allowed_metrics: ["LCP", "CLS", "FCP", "INP"],
      },
      disable_session_recording: false,
      enable_recording_console_log: true,
      session_recording: {
        maskAllInputs: true,
        recordHeaders: true,
        recordBody: false,
        maskCapturedNetworkRequestFn: buildPostHogNetworkRequestMasker(),
      },
      loaded: (ph) => {
        if (import.meta.env.DEV) ph.debug(false);
      },
    });
    enabled = true;
    console.info("[PostHog] initialisé ", apiHost);
  } catch (err) {
    console.warn("[PostHog] init failed", err);
  }
}

export function phCapture(event: string, props?: Record<string, any>) {
  if (!enabled) return;
  try {
    posthog.capture(event, props);
  } catch (err) {
    console.warn("[PostHog] capture failed", err);
  }
}

export function phIdentify(
  distinctId: string,
  props?: Record<string, any>,
) {
  if (!enabled) return;
  try {
    posthog.identify(distinctId, props);
  } catch (err) {
    console.warn("[PostHog] identify failed", err);
  }
}

export function phReset() {
  if (!enabled) return;
  try {
    posthog.reset();
  } catch (err) {
    console.warn("[PostHog] reset failed", err);
  }
}

export function phGetSessionId(): string | undefined {
  if (!enabled) return undefined;
  try {
    return posthog.get_session_id?.();
  } catch {
    return undefined;
  }
}

export function phIsEnabled() {
  return enabled;
}
