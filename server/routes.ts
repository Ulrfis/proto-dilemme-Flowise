import type { Express } from "express";
import { createServer, type Server } from "http";
import { analyticsEventSchema } from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  
  // Analytics endpoint for anonymous event tracking
  app.post("/api/analytics", async (req, res) => {
    try {
      const event = analyticsEventSchema.parse(req.body);
      
      // Log analytics event (in production, send to analytics service)
      console.log(`[Analytics] ${event.event}:`, event.data);
      
      res.json({ success: true });
    } catch (error) {
      console.error("Analytics error:", error);
      res.status(400).json({ error: "Invalid analytics event" });
    }
  });

  // Flowise proxy endpoint for secure API calls
  app.post("/api/flowise/prediction/:chatflowId", async (req, res) => {
    try {
      const { chatflowId } = req.params;
      const { question, chatId } = req.body;

      // Use the configured chatflow ID or the one from URL params
      const actualChatflowId = process.env.FLOWISE_CHATFLOW_ID || chatflowId;
      const flowiseHost = process.env.FLOWISE_HOST;
      const flowiseApiKey = process.env.FLOWISE_API_KEY;

      // Validate configuration
      if (!flowiseHost) {
        throw new Error("FLOWISE_HOST environment variable is required");
      }

      if (!actualChatflowId) {
        throw new Error("FLOWISE_CHATFLOW_ID environment variable is required");
      }

      console.log(`[Flowise] Connecting to: ${flowiseHost}`);
      console.log(`[Flowise] Using chatflow: ${actualChatflowId}`);

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (flowiseApiKey) {
        headers["Authorization"] = `Bearer ${flowiseApiKey}`;
      }

      const requestBody = {
        question,
        chatId: chatId || `session_${Date.now()}`,
        returnSourceDocuments: true,
      };

      // Only log non-sensitive request info
      console.log(`[Flowise] Request to chatflow: ${actualChatflowId}, chatId: ${requestBody.chatId}`);

      const response = await fetch(`${flowiseHost}/api/v1/prediction/${actualChatflowId}`, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
      });

      const responseText = await response.text();
      console.log(`[Flowise] Response status: ${response.status}`);
      // Log response status only, not content for privacy
      console.log(`[Flowise] Response received: ${response.status}, length: ${responseText.length} chars`);
      
      // DEBUG: Log first part of response to see format
      console.log(`[DEBUG] Response preview:`, responseText.substring(0, 1000));

      if (!response.ok) {
        throw new Error(`Flowise API error: ${response.status} ${response.statusText} - ${responseText}`);
      }

      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error("Failed to parse Flowise response:", parseError);
        throw new Error("Invalid JSON response from Flowise");
      }

      res.json(data);
    } catch (error) {
      console.error("Flowise proxy error:", error);
      res.status(500).json({ 
        error: "Erreur de communication avec l'assistant Peter. Veuillez réessayer.",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
