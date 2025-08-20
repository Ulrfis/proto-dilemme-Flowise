import { z } from "zod";

// Analytics event schema
export const analyticsEventSchema = z.object({
  event: z.string(),
  data: z.record(z.any()).optional(),
  timestamp: z.string(),
  sessionId: z.string().optional(),
});

export type AnalyticsEvent = z.infer<typeof analyticsEventSchema>;

// Chat message schema for local storage
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

// Flowise response schema
export const flowiseResponseSchema = z.object({
  id: z.string().optional(),
  text: z.string(),
  sourceDocuments: z.array(z.any()).optional(),
  chatId: z.string().optional(),
});

export type FlowiseResponse = z.infer<typeof flowiseResponseSchema>;
