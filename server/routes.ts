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

      const flowiseHost = process.env.FLOWISE_HOST || process.env.VITE_FLOWISE_HOST || "http://localhost:3000";
      const flowiseApiKey = process.env.FLOWISE_API_KEY || process.env.VITE_FLOWISE_API_KEY;

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (flowiseApiKey) {
        headers["Authorization"] = `Bearer ${flowiseApiKey}`;
      }

      const response = await fetch(`${flowiseHost}/api/v1/prediction/${chatflowId}`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          question,
          chatId,
          returnSourceDocuments: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`Flowise API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error("Flowise proxy error:", error);
      res.status(500).json({ 
        error: "Erreur de communication avec l'assistant Peter. Veuillez réessayer." 
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
