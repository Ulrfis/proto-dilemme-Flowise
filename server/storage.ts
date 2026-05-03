import { eq, asc, desc, sql, and, gte, lte, ilike, type SQL } from "drizzle-orm";
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

export interface SessionListItem extends ConversationSession {
  messageCount: number;
}

export interface SessionListPage {
  items: SessionListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface IStorage {
  // Analytics (best-effort, console-only en dev)
  logAnalyticsEvent(event: AnalyticsEvent): Promise<void>;

  // Conversations persistées
  createConversationSession(input?: InsertConversationSession): Promise<ConversationSession>;
  updateConversationSessionFirstName(id: string, firstName: string): Promise<void>;
  appendConversationMessage(input: InsertConversationMessage): Promise<ConversationMessage>;
  listConversationSessions(opts?: {
    page?: number;
    pageSize?: number;
    q?: string;
    from?: Date;
    to?: Date;
  }): Promise<SessionListPage>;
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
    input: InsertConversationSession = {},
  ): Promise<ConversationSession> {
    const [row] = await db
      .insert(conversationSessions)
      .values(input)
      .returning();
    return row;
  }

  async updateConversationSessionFirstName(id: string, firstName: string): Promise<void> {
    await db
      .update(conversationSessions)
      .set({ firstName: firstName.trim().slice(0, 80) })
      .where(eq(conversationSessions.id, id));
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

  async listConversationSessions(
    opts: {
      page?: number;
      pageSize?: number;
      q?: string;
      from?: Date;
      to?: Date;
    } = {},
  ): Promise<SessionListPage> {
    const page = Math.max(1, opts.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, opts.pageSize ?? 50));
    const offset = (page - 1) * pageSize;

    const filters: SQL[] = [];
    if (opts.q && opts.q.trim()) {
      filters.push(ilike(conversationSessions.firstName, `%${opts.q.trim()}%`));
    }
    if (opts.from) {
      filters.push(gte(conversationSessions.createdAt, opts.from));
    }
    if (opts.to) {
      filters.push(lte(conversationSessions.createdAt, opts.to));
    }
    const whereClause: SQL | undefined =
      filters.length > 0 ? and(...filters) : undefined;

    const rows = await db
      .select({
        id: conversationSessions.id,
        firstName: conversationSessions.firstName,
        createdAt: conversationSessions.createdAt,
        messageCount: sql<number>`COALESCE(COUNT(${conversationMessages.id}), 0)::int`,
      })
      .from(conversationSessions)
      .leftJoin(
        conversationMessages,
        eq(conversationMessages.sessionId, conversationSessions.id),
      )
      .where(whereClause)
      .groupBy(conversationSessions.id)
      .orderBy(desc(conversationSessions.createdAt))
      .limit(pageSize)
      .offset(offset);

    const [{ count }] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(conversationSessions)
      .where(whereClause);

    return { items: rows as SessionListItem[], total: count, page, pageSize };
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
