import { AnalyticsEvent } from "@shared/schema";

// This app doesn't require user storage, only analytics tracking
// All data is ephemeral and stored client-side

export interface IStorage {
  // Placeholder for future storage needs
  logAnalyticsEvent(event: AnalyticsEvent): Promise<void>;
}

export class MemStorage implements IStorage {
  private analyticsLog: AnalyticsEvent[];

  constructor() {
    this.analyticsLog = [];
  }

  async logAnalyticsEvent(event: AnalyticsEvent): Promise<void> {
    this.analyticsLog.push(event);
    // In production, this would send to an analytics service
    console.log('[Analytics Storage]', event);
  }

  // Optional: Get analytics summary for debugging
  getAnalyticsSummary() {
    return {
      totalEvents: this.analyticsLog.length,
      recentEvents: this.analyticsLog.slice(-10)
    };
  }
}

export const storage = new MemStorage();
