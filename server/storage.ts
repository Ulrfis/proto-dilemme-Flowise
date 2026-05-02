import { eq, asc, desc } from "drizzle-orm";
import {
  AnalyticsEvent,
  conversationMessages,
  conversationSessions,
  type ConversationMessage,
  type ConversationSession,
  type InsertConversationMessage,
  type InsertConversationSession,
} from "@shared/schema";
import { db } from "./db";

export interface IStorage {
  // Analytics (best-effort, console-only en dev)
  logAnalyticsEvent(event: AnalyticsEvent): Promise<void>;

  // Conversations persistées
  createConversationSession(input: InsertConversationSession): Promise<ConversationSession>;
  appendConversationMessage(input: InsertConversationMessage): Promise<ConversationMessage>;
  listConversationSessions(limit?: number): Promise<ConversationSession[]>;
  getConversationSession(id: string): Promise<ConversationSession | null>;
  listSessionMessages(sessionId: string): Promise<ConversationMessage[]>;
}

export class DbStorage implements IStorage {
  private analyticsLog: AnalyticsEvent[] = [];

  async logAnalyticsEvent(event: AnalyticsEvent): Promise<void> {
    this.analyticsLog.push(event);
    if (this.analyticsLog.length > 200) this.analyticsLog.shift();
    console.log("[Analytics Storage]", event.event, event.data || "");
  }

  async createConversationSession(
    input: InsertConversationSession,
  ): Promise<ConversationSession> {
    const [row] = await db
      .insert(conversationSessions)
      .values(input)
      .returning();
    return row;
  }

  async appendConversationMessage(
    input: InsertConversationMessage,
  ): Promise<ConversationMessage> {
    const [row] = await db
      .insert(conversationMessages)
      .values(input)
      .returning();
    return row;
  }

  async listConversationSessions(limit = 200): Promise<ConversationSession[]> {
    return db
      .select()
      .from(conversationSessions)
      .orderBy(desc(conversationSessions.createdAt))
      .limit(limit);
  }

  async getConversationSession(id: string): Promise<ConversationSession | null> {
    const [row] = await db
      .select()
      .from(conversationSessions)
      .where(eq(conversationSessions.id, id))
      .limit(1);
    return row ?? null;
  }

  async listSessionMessages(sessionId: string): Promise<ConversationMessage[]> {
    return db
      .select()
      .from(conversationMessages)
      .where(eq(conversationMessages.sessionId, sessionId))
      .orderBy(asc(conversationMessages.createdAt));
  }
}

export const storage: IStorage = new DbStorage();
