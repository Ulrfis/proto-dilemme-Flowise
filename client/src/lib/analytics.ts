import { AnalyticsEvent } from "@shared/schema";
import { phCapture } from "./posthog";

class Analytics {
  private sessionId: string;

  constructor() {
    // Generate cryptographically secure session ID
    this.sessionId = `session_${Date.now()}_${crypto.randomUUID().replace(/-/g, '')}`;
  }

  async track(event: string, data?: Record<string, any>) {
    // Forward vers PostHog (no-op si non configuré)
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
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(analyticsEvent),
      });
    } catch (error) {
      console.error("Analytics tracking error:", error);
    }
  }

  // Common tracking methods
  trackPageView(page: string) {
    this.track("page_view", { page });
  }

  trackChatStart() {
    this.track("chat_start");
  }

  trackMessageSent(messageLength: number) {
    this.track("message_sent", { length: messageLength });
  }

  trackPeterReplied(messageLength: number, ttftMs?: number, totalMs?: number) {
    this.track("peter_replied", { length: messageLength, ttftMs, totalMs });
  }

  trackVideoOpened(videoUrl: string) {
    this.track("video_opened", { url: videoUrl });
  }

  trackLinkOpened(linkUrl: string) {
    this.track("link_opened", { url: linkUrl });
  }

  trackSessionReset() {
    this.track("session_reset");
    // Generate new secure session ID
    this.sessionId = `session_${Date.now()}_${crypto.randomUUID().replace(/-/g, '')}`;
  }

  trackSessionComplete() {
    this.track("session_complete");
  }

  trackAdventureStarted(props?: Record<string, any>) {
    this.track("aventure_demarree", props);
  }

  trackIdentityCaptured(props?: Record<string, any>) {
    this.track("identity_captured", props);
  }
}

export const analytics = new Analytics();
