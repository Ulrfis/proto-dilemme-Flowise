// PostHog client : initialisé une seule fois côté navigateur.
// Désactivé silencieusement quand VITE_POSTHOG_KEY n'est pas fournie
// (utile en local quand on ne veut pas polluer le projet PostHog de prod).
import posthog from "posthog-js";

let initialized = false;
let enabled = false;

export function initPostHog() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  const apiKey = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
  const apiHost =
    (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ||
    "https://eu.i.posthog.com";

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
      autocapture: false,
      disable_session_recording: true,
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

export function phIsEnabled() {
  return enabled;
}
