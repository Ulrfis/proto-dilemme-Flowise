import { AnalyticsEvent } from "@shared/schema";
import { phCapture, phGetSessionId } from "./posthog";

class Analytics {
  private sessionId: string;
  private startedAt = Date.now();
  private lastEventAt = Date.now();

  constructor() {
    this.sessionId = `session_${Date.now()}_${crypto.randomUUID().replace(/-/g, '')}`;
  }

  async track(event: string, data?: Record<string, any>) {
    const now = Date.now();
    const stepMs = now - this.lastEventAt;
    const sessionMs = now - this.startedAt;
    this.lastEventAt = now;

    const enriched = {
      sessionId: this.sessionId,
      posthogSessionId: phGetSessionId(),
      stepMs,
      sessionMs,
      ...(data || {}),
    };

    phCapture(event, enriched);
    try {
      const analyticsEvent: AnalyticsEvent = {
        event,
        data: enriched,
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

  getSessionId(): string {
    return this.sessionId;
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
    this.lastEventAt = Date.now();
    this.track("session_started", props);
  }

  trackIdentityCaptured(props?: Record<string, any>) {
    this.track("identity_captured", props);
  }

  trackAdventureStarted(props?: Record<string, any>) {
    this.track("aventure_demarree", props);
  }

  // ────────────────────────────────────────────────────────────────────
  // Chat
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
  // Recording / STT
  trackRecordingStart(props?: { provider?: string }) {
    this.track("recording_started", { provider: "browser", ...props });
  }

  trackRecordingStop(props?: { durationMs?: number }) {
    this.track("recording_stopped", props);
  }

  trackSTTCompleted(props: {
    latencyMs: number;
    provider: string;
    wordCount: number;
    success: boolean;
    errorType?: string;
  }) {
    this.track("stt_completed", props);
  }

  // ────────────────────────────────────────────────────────────────────
  // AI / Flowise
  trackAIRequest(props: { provider: string; sessionId?: string; requestId?: string }) {
    this.track("ai_request_sent", props);
  }

  trackAIResponse(props: {
    ttftMs?: number;
    totalMs?: number;
    connectMs?: number;
    streamMs?: number;
    tokenCount?: number;
    charCount?: number;
    nodes?: number;
    tools?: number;
    unknownEvents?: number;
    requestId?: string;
    flowiseTraceId?: string;
    flowiseChatId?: string;
    provider: string;
    success: boolean;
    errorType?: string;
  }) {
    this.track("ai_response_received", props);
  }

  // ────────────────────────────────────────────────────────────────────
  // Article / media engagement
  trackArticleOpened(props: { url: string; title?: string }) {
    this.track("article_opened", props);
  }

  trackArticleLoadMethod(props: {
    url: string;
    method: "proxy" | "reader" | "archive" | "failed";
    latencyMs?: number;
  }) {
    this.track("article_load_method", props);
  }

  trackArticleReadTime(props: { url: string; readTimeSec: number }) {
    this.track("article_read_time_sec", props);
  }

  trackVideoProgress(props: { url: string; progressPct: 25 | 50 | 75 | 100 }) {
    this.track("video_progress_pct", props);
  }

  trackFlowiseProgress(props: { step: string; label: string; requestId?: string; elapsedMs?: number }) {
    this.track("chat_progress_step_changed", props);
  }

  trackChatWaitingShown(props: { requestId?: string }) {
    this.track("chat_waiting_state_shown", props);
  }

  trackChatResponseAborted(props: { requestId?: string; totalMs?: number; reason: string }) {
    this.track("chat_response_aborted", props);
  }

  trackTTSQueueEvent(event: string, props: Record<string, any>) {
    this.track(event, props);
  }

  // ────────────────────────────────────────────────────────────────────
  // Error tracking
  trackError(props: {
    component: string;
    errorType: string;
    message: string;
    provider?: string;
  }) {
    this.track("error_occurred", props);
  }

  // ────────────────────────────────────────────────────────────────────
  // Médias (legacy helpers kept for backward compat)
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
    this.lastEventAt = Date.now();
  }

  trackSessionComplete() {
    const durationMs = Date.now() - this.startedAt;
    this.track("session_terminee", { durationMs });
    this.track("session_complete", { durationMs });
  }
}

export const analytics = new Analytics();
