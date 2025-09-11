import type { Express } from "express";
import { createServer, type Server } from "http";
import { analyticsEventSchema } from "@shared/schema";
import OpenAI from "openai";
import multer from "multer";
import fs from "fs/promises";
import { createReadStream } from "fs";

export async function registerRoutes(app: Express): Promise<Server> {
  
  // Initialize OpenAI for Whisper API
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  // Configure multer for audio file uploads
  const upload = multer({
    dest: '/tmp/',
    limits: {
      fileSize: 25 * 1024 * 1024, // 25MB limit for audio files
    },
    fileFilter: (req, file, cb) => {
      // Accept audio files
      if (file.mimetype.startsWith('audio/')) {
        cb(null, true);
      } else {
        cb(new Error('Only audio files are allowed'));
      }
    },
  });

  // Speech-to-text endpoint using OpenAI Whisper
  app.post("/api/transcribe", upload.single('audio'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No audio file provided" });
      }

      console.log(`[Whisper] Processing audio file: ${req.file.originalname}, size: ${req.file.size} bytes`);

      // Create a readable stream for OpenAI
      const audioStream = await fs.readFile(req.file.path);
      const audioBuffer = Buffer.from(audioStream);

      // Create a temporary file with the correct extension
      const tempFile = {
        name: req.file.originalname || 'audio.webm',
        buffer: audioBuffer,
      };

      // Save buffer to file for OpenAI API
      const tempPath = `/tmp/audio_${Date.now()}.webm`;
      await fs.writeFile(tempPath, audioBuffer);

      try {
        // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
        const transcription = await openai.audio.transcriptions.create({
          file: createReadStream(tempPath),
          model: "whisper-1",
          language: "fr", // French language
          response_format: "json",
        });

        console.log(`[Whisper] Transcription successful: "${transcription.text.substring(0, 100)}..."`);

        // Clean up temporary files
        await fs.unlink(req.file.path).catch(err => console.warn('Failed to delete temp file:', err));
        await fs.unlink(tempPath).catch(err => console.warn('Failed to delete processed file:', err));

        res.json({
          text: transcription.text,
          language: 'fr',
        });

      } catch (openaiError) {
        console.error('[Whisper] OpenAI API error:', openaiError);
        
        // Clean up files on error
        await fs.unlink(req.file.path).catch(() => {});
        await fs.unlink(tempPath).catch(() => {});
        
        res.status(500).json({
          error: "Erreur lors de la transcription audio",
          details: "Le service de reconnaissance vocale a rencontré un problème"
        });
      }

    } catch (error) {
      console.error("[Whisper] Transcription error:", error);
      
      // Clean up file if it exists
      if (req.file) {
        await fs.unlink(req.file.path).catch(() => {});
      }
      
      res.status(500).json({
        error: "Erreur lors du traitement audio",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
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

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Connection": "keep-alive"
      };

      if (flowiseApiKey) {
        headers["Authorization"] = `Bearer ${flowiseApiKey}`;
      }

      const requestBody = {
        question,
        chatId: chatId || `session_${Date.now()}`,
        returnSourceDocuments: true,
      };

      // Add timeout and connection optimization
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000); // Balanced timeout - fast enough but allows for complex responses
      
      const response = await fetch(`${flowiseHost}/api/v1/prediction/${actualChatflowId}`, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Flowise API error: ${response.status} ${response.statusText}`);
      }

      const responseText = await response.text();
      
      // Streamlined JSON parsing - minimal processing
      let data;
      try {
        data = JSON.parse(responseText);
        
        // Fast text field processing with optimized logic
        if (data.text && typeof data.text === 'string') {
          const textField = data.text;
          
          // Quick JSON detection - avoid expensive regex
          if (textField.trim().startsWith('{') && textField.trim().endsWith('}')) {
            try {
              // Direct parsing - fastest approach
              const parsedText = JSON.parse(textField);
              data.parsedContent = parsedText;
            } catch {
              // Fallback: extract only essential fields with single regex
              const combinedPattern = /"(Response|theme|nombre_d_indices|score_globale|URL|URLYOUTUBE)":\s*"?([^",}]*)"?/g;
              const extracted: Record<string, string> = {};
              let match;
              
              while ((match = combinedPattern.exec(textField)) !== null) {
                extracted[match[1]] = match[2];
              }
              
              if (Object.keys(extracted).length > 0) {
                data.parsedContent = extracted;
              }
            }
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
