import { z } from "zod";
import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

// ─── Analytics event (transitoire, envoyée au backend pour log) ─────────────
export const analyticsEventSchema = z.object({
  event: z.string(),
  data: z.record(z.any()).optional(),
  timestamp: z.string(),
  sessionId: z.string().optional(),
});

export type AnalyticsEvent = z.infer<typeof analyticsEventSchema>;

// ─── ChatMessage (rendu côté client uniquement) ─────────────────────────────
export const chatMessageSchema = z.object({
  id: z.string(),
  content: z.string(),
  sender: z.enum(['user', 'peter']),
  timestamp: z.string(),
  metadata: z.object({
    hasVideo: z.boolean().optional(),
    hasLinks: z.boolean().optional(),
    videoUrl: z.string().optional(),
    links: z.array(z.string()).optional(),
  }).optional(),
});

export type ChatMessage = z.infer<typeof chatMessageSchema>;

// ─── Flowise raw response ───────────────────────────────────────────────────
export const flowiseResponseSchema = z.object({
  id: z.string().optional(),
  text: z.string(),
  sourceDocuments: z.array(z.any()).optional(),
  chatId: z.string().optional(),
});

export type FlowiseResponse = z.infer<typeof flowiseResponseSchema>;

// ─── Persistance Postgres ───────────────────────────────────────────────────
// Une session = un ID unique + un prénom optionnel (capturé en conversation).
// Le prénom est renseigné plus tard via PATCH quand Peter le recueille.
// Volontairement simple : pas de updatedAt, pas de soft-delete, pas de nom.

export const conversationSessions = pgTable("conversation_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  firstName: text("first_name"),          // nullable — mis à jour en cours de conv
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const conversationMessages = pgTable(
  "conversation_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id")
      .references(() => conversationSessions.id, { onDelete: "cascade" })
      .notNull(),
    sender: text("sender", { enum: ["user", "peter"] }).notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    bySession: index("conv_msg_session_idx").on(t.sessionId, t.createdAt),
  }),
);

// Insert schemas (omit auto-generated fields)
export const insertConversationSessionSchema = createInsertSchema(
  conversationSessions,
).omit({ id: true, createdAt: true });

export const insertConversationMessageSchema = createInsertSchema(
  conversationMessages,
).omit({ id: true, createdAt: true });

export type InsertConversationSession = z.infer<typeof insertConversationSessionSchema>;
export type InsertConversationMessage = z.infer<typeof insertConversationMessageSchema>;
export type ConversationSession = typeof conversationSessions.$inferSelect;
export type ConversationMessage = typeof conversationMessages.$inferSelect;
