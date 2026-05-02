import { AnalyticsEvent } from "@shared/schema";
import { phCapture } from "./posthog";

class Analytics {
  private sessionId: string;
  private startedAt = Date.now();

  constructor() {
    this.sessionId = `session_${Date.now()}_${crypto.randomUUID().replace(/-/g, '')}`;
  }

  async track(event: string, data?: Record<string, any>) {
    phCapture(event, { sessionId: this.sessionId, ...(data || {}) });
    try {
      const analyticsEvent: AnalyticsEvent = {
        event,
        data,
        timestamp: new Date().toISOString(),
        sessionId: this.sessionId,
      };
      await fetch("/api/analytics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(analyticsEvent),
      });
    } catch (error) {
      console.error("Analytics tracking error:", error);
    }
  }

  // ────────────────────────────────────────────────────────────────────
  // Page lifecycle
  trackPageView(page: string) {
    this.track("page_view", { page });
  }

  // ────────────────────────────────────────────────────────────────────
  // Identité + démarrage
  trackSessionStarted(props?: Record<string, any>) {
    this.startedAt = Date.now();
    // Conservé en double : nom historique + nom FR demandé par le brief.
    this.track("session_started", props);
  }

  trackIdentityCaptured(props?: Record<string, any>) {
    this.track("identity_captured", props);
  }

  trackAdventureStarted(props?: Record<string, any>) {
    this.track("aventure_demarree", props);
  }

  // ────────────────────────────────────────────────────────────────────
  // Chat (français = source de vérité, alias EN gardés pour rétro-compat)
  trackChatStart() {
    this.track("chat_start");
  }

  trackMessageSent(messageLength: number) {
    this.track("message_envoye", { length: messageLength });
    this.track("message_sent", { length: messageLength });
  }

  trackPeterReplied(messageLength: number, ttftMs?: number, totalMs?: number) {
    this.track("peter_repondu", { length: messageLength, ttftMs, totalMs });
    this.track("peter_replied", { length: messageLength, ttftMs, totalMs });
  }

  // ────────────────────────────────────────────────────────────────────
  // Médias
  trackVideoOpened(videoUrl: string) {
    this.track("video_ouverte", { url: videoUrl });
    this.track("video_opened", { url: videoUrl });
  }

  trackLinkOpened(linkUrl: string) {
    this.track("article_ouvert", { url: linkUrl });
    this.track("link_opened", { url: linkUrl });
  }

  trackPanelChange(panel: string) {
    this.track("panneau_media_change", { panel });
  }

  // ────────────────────────────────────────────────────────────────────
  // Audio / interactions
  trackMuteToggled(muted: boolean) {
    this.track("mute_bascule", { muted });
  }

  // ────────────────────────────────────────────────────────────────────
  // Fin de session
  trackSessionReset() {
    this.track("session_reset");
    this.sessionId = `session_${Date.now()}_${crypto.randomUUID().replace(/-/g, '')}`;
    this.startedAt = Date.now();
  }

  trackSessionComplete() {
    const durationMs = Date.now() - this.startedAt;
    this.track("session_terminee", { durationMs });
    this.track("session_complete", { durationMs });
  }
}

export const analytics = new Analytics();
