import { AnalyticsEvent } from "@shared/schema";

class Analytics {
  private sessionId: string;

  constructor() {
    // Generate cryptographically secure session ID
    this.sessionId = `session_${Date.now()}_${crypto.randomUUID().replace(/-/g, '')}`;
  }

  async track(event: string, data?: Record<string, any>) {
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
}

export const analytics = new Analytics();
