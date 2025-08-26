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

  // Web content proxy endpoint to bypass CORS and X-Frame-Options
  app.get("/api/proxy", async (req, res) => {
    try {
      const { url } = req.query;
      
      if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: "URL parameter is required" });
      }

      // Validate URL format
      try {
        new URL(url);
      } catch {
        return res.status(400).json({ error: "Invalid URL format" });
      }

      console.log(`[Proxy] Fetching: ${url}`);

      // Enhanced headers to maximize compatibility
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Cache-Control': 'max-age=0'
      };

      const response = await fetch(url, {
        method: 'GET',
        headers,
        redirect: 'follow'
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      let content = await response.text();
      
      // Remove X-Frame-Options and CSP headers that block embedding
      const contentType = response.headers.get('content-type') || 'text/html';
      
      // Inject base tag and modify content for iframe compatibility
      if (contentType.includes('text/html')) {
        const baseUrl = new URL(url).origin;
        
        // Add base tag for relative URLs
        content = content.replace(
          /<head[^>]*>/i,
          `<head><base href="${baseUrl}/">`
        );
        
        // Remove frame-busting scripts
        content = content.replace(
          /(if\s*\(\s*top\s*[!=]==?\s*self\s*\)|if\s*\(\s*self\s*[!=]==?\s*top\s*\)|if\s*\(\s*window\s*[!=]==?\s*top\s*\)|if\s*\(\s*top\s*\.location\s*[!=]==?\s*self\s*\.location\s*\))[^}]*}/gi,
          ''
        );
        
        // Remove X-Frame-Options meta tags
        content = content.replace(
          /<meta[^>]*http-equiv\s*=\s*["\']?x-frame-options["\']?[^>]*>/gi,
          ''
        );
      }

      // Set permissive headers
      res.set({
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=300',
        'X-Frame-Options': 'ALLOWALL',
        'Content-Security-Policy': 'frame-ancestors *;',
        'X-Content-Type-Options': 'nosniff'
      });

      res.send(content);
      
    } catch (error) {
      console.error("[Proxy] Error:", error);
      res.status(500).json({ 
        error: "Failed to proxy content",
        details: error instanceof Error ? error.message : String(error)
      });
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
      console.log('[Flowise] Raw response first 1000 chars:', responseText.substring(0, 1000));
      console.log('[Flowise] Raw response last 500 chars:', responseText.substring(responseText.length - 500));
      

      if (!response.ok) {
        throw new Error(`Flowise API error: ${response.status} ${response.statusText} - ${responseText}`);
      }

      let data;
      try {
        data = JSON.parse(responseText);
        console.log('[Flowise] Parsed response keys:', Object.keys(data));
        
        // The response might have a 'text' field containing the actual message
        if (data.text) {
          console.log('[Flowise] Found text field, first 500 chars:', data.text.substring(0, 500));
          
          // Try to parse the text field as JSON
          try {
            const parsedText = JSON.parse(data.text);
            console.log('[Flowise] Text field is JSON with keys:', Object.keys(parsedText));
            // Replace the text with the parsed JSON
            data.parsedContent = parsedText;
          } catch (textParseError) {
            console.log('[Flowise] Text field is not JSON, keeping as is');
          }
        }
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
