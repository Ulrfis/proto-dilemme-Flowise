import type { Express } from "express";
import { createServer, type Server } from "http";
import { analyticsEventSchema } from "@shared/schema";
import OpenAI from "openai";
import multer from "multer";
import fs from "fs/promises";
import { createReadStream } from "fs";

// Allowed domains for the content proxy (prevents SSRF to internal networks)
const PROXY_ALLOWED_DOMAINS = new Set([
  'lemonde.fr',
  'liberation.fr',
  'lefigaro.fr',
  'francetvinfo.fr',
  'reporterre.net',
  'novethic.fr',
  '20minutes.fr',
  'bfmtv.com',
  'ouest-france.fr',
  'futura-sciences.com',
  'nationalgeographic.fr',
  'wwf.fr',
  'greenpeace.fr',
  'ademe.fr',
  'ecologie.gouv.fr',
  'wikipedia.org',
  'wikimedia.org',
  'our-sea.org',
  'plasticpollutioncoalition.org',
  'plasticsoupfoundation.org',
  'surfrider.eu',
  'zerowaste.fr',
]);

function isPrivateIP(hostname: string): boolean {
  // Block localhost and private IP ranges
  const privatePatterns = [
    /^localhost$/i,
    /^127\./,
    /^10\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^192\.168\./,
    /^::1$/,
    /^0\.0\.0\.0$/,
    /^169\.254\./,
  ];
  return privatePatterns.some(p => p.test(hostname));
}

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
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(url);
      } catch {
        return res.status(400).json({ error: "Invalid URL format" });
      }

      // Security: only allow HTTPS
      if (parsedUrl.protocol !== 'https:') {
        return res.status(400).json({ error: "Only HTTPS URLs are allowed" });
      }

      // Security: block private/internal IPs (SSRF protection)
      if (isPrivateIP(parsedUrl.hostname)) {
        return res.status(403).json({ error: "Access to internal addresses is not allowed" });
      }

      // Security: check against allowlist of known educational domains
      const hostname = parsedUrl.hostname.replace(/^www\./, '');
      const isAllowed = [...PROXY_ALLOWED_DOMAINS].some(domain =>
        hostname === domain || hostname.endsWith(`.${domain}`)
      );
      if (!isAllowed) {
        console.warn(`[Proxy] Blocked request to non-allowlisted domain: ${parsedUrl.hostname}`);
        return res.status(403).json({ error: "Domain not allowed by proxy" });
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

  // NOUVEAU: Flowise streaming endpoint with SSE
  app.post("/api/flowise/prediction/:chatflowId/stream", async (req, res) => {
    const perfStart = Date.now();

    try {
      const { chatflowId } = req.params;
      const { question, chatId } = req.body;

      console.log(`[Flowise Stream] Starting stream for chatId: ${chatId}`);

      // Configuration SSE
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      const actualChatflowId = process.env.FLOWISE_CHATFLOW_ID || chatflowId;
      const flowiseHost = process.env.FLOWISE_HOST;
      const flowiseApiKey = process.env.FLOWISE_API_KEY;

      if (!flowiseHost) {
        res.write(`data: ${JSON.stringify({ error: 'FLOWISE_HOST not configured' })}\n\n`);
        return res.end();
      }

      if (!actualChatflowId) {
        res.write(`data: ${JSON.stringify({ error: 'FLOWISE_CHATFLOW_ID not configured' })}\n\n`);
        return res.end();
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      };

      if (flowiseApiKey) {
        headers['Authorization'] = `Bearer ${flowiseApiKey}`;
      }

      const requestBody = {
        question,
        chatId: chatId || `session_${Date.now()}`,
        streaming: true,
        returnSourceDocuments: false,
      };

      console.log(`[Flowise Stream] Requesting stream from Flowise...`);

      const response = await fetch(`${flowiseHost}/api/v1/prediction/${actualChatflowId}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Flowise Stream] Error: ${response.status} ${errorText}`);
        res.write(`data: ${JSON.stringify({ error: `Flowise API error: ${response.status}` })}\n\n`);
        return res.end();
      }

      const reader = response.body?.getReader();
      if (!reader) {
        res.write(`data: ${JSON.stringify({ error: 'No response body from Flowise' })}\n\n`);
        return res.end();
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let firstTokenTime = 0;
      let tokenCount = 0;
      let fullText = '';
      let metadata: any = {};

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            console.log(`[Flowise Stream] Stream complete. Tokens: ${tokenCount}, First token: ${firstTokenTime}ms`);
            console.log(`[Flowise Stream] Full text received (${fullText.length} chars):`, fullText.substring(0, 100));
            break;
          }

          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk;

          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmedLine = line.trim();
            
            if (!trimmedLine) {
              continue;
            }

            // Flowise SSE format: data: {"event":"token","data":"text"}
            if (trimmedLine.startsWith('data:')) {
              const payload = trimmedLine.slice(5).trim();
              
              if (!payload || payload === '[DONE]' || payload === '"[DONE]"') {
                continue;
              }

              try {
                const obj = JSON.parse(payload);
                
                if (obj.event === 'token') {
                  // Token event: accumulate and forward
                  if (tokenCount === 0) {
                    firstTokenTime = Date.now() - perfStart;
                    console.log(`[Flowise Stream] First token received in ${firstTokenTime}ms`);
                  }
                  
                  fullText += obj.data;
                  tokenCount++;
                  res.write(`data: ${JSON.stringify({ event: 'token', data: obj.data })}\n\n`);
                  
                } else if (obj.event === 'start') {
                  console.log(`[Flowise Stream] Stream started`);
                  res.write(`data: ${JSON.stringify({ event: 'start' })}\n\n`);
                  
                } else if (obj.event === 'metadata') {
                  metadata = obj.data || {};
                  console.log(`[Flowise Stream] Metadata received:`, metadata);
                  res.write(`data: ${JSON.stringify({ event: 'metadata', data: metadata })}\n\n`);
                  
                } else if (obj.event === 'end') {
                  console.log(`[Flowise Stream] End event received`);
                  // Don't send end yet, we'll send our own with performance metrics
                  
                } else if (obj.event === 'error') {
                  console.error(`[Flowise Stream] ❌ Error event from Flowise:`, obj.data);
                  res.write(`data: ${JSON.stringify({ event: 'error', data: obj.data })}\n\n`);
                } else {
                  console.log(`[Flowise Stream] Unknown event type:`, obj.event);
                }
                
              } catch (parseError) {
                // Not JSON or malformed - skip it
                console.warn(`[Flowise Stream] Failed to parse SSE data:`, payload.substring(0, 100));
              }
            }
          }
        }

        const totalTime = Date.now() - perfStart;
        
        // CRITICAL: Extract Response field from JSON if present
        // Sometimes Flowise returns entire response as JSON: {"Response": "text..."}
        let finalText = fullText;
        const trimmedFullText = fullText.trim();
        
        console.log(`[Flowise Stream DEBUG] fullText length: ${trimmedFullText.length}, starts with: ${trimmedFullText.substring(0, 50)}`);
        
        if (trimmedFullText.startsWith('{')) {
          try {
            // Try to parse as JSON
            const jsonResponse = JSON.parse(trimmedFullText);
            console.log(`[Flowise Stream DEBUG] Successfully parsed JSON, keys:`, Object.keys(jsonResponse));
            
            if (jsonResponse.Response && typeof jsonResponse.Response === 'string') {
              finalText = jsonResponse.Response;
              console.log(`[Flowise Stream] ✅ Extracted Response field from JSON (${jsonResponse.Response.length} chars)`);
            } else {
              console.log(`[Flowise Stream] JSON parsed but no Response field found`);
            }
          } catch (parseError) {
            // Parsing failed - log the error and the problematic JSON
            console.error(`[Flowise Stream] ❌ JSON parsing failed:`, parseError);
            console.error(`[Flowise Stream] Problematic JSON preview (first 200 chars):`, trimmedFullText.substring(0, 200));
            console.error(`[Flowise Stream] Problematic JSON preview (last 200 chars):`, trimmedFullText.substring(Math.max(0, trimmedFullText.length - 200)));
            
            // Try regex extraction as fallback
            const responseMatch = trimmedFullText.match(/"Response"\s*:\s*"([^"]*(?:\\.[^"]*)*)"/);
            if (responseMatch && responseMatch[1]) {
              finalText = responseMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n');
              console.log(`[Flowise Stream] ✅ Extracted Response via regex fallback (${finalText.length} chars)`);
            } else {
              console.log(`[Flowise Stream] Using fullText as-is (regex extraction also failed)`);
            }
          }
        }
        
        res.write(`data: ${JSON.stringify({
          event: 'end',
          metadata: {
            ...metadata,
            totalTime,
            firstTokenTime,
            tokenCount,
            fullText: finalText
          }
        })}\n\n`);

      } catch (streamError) {
        console.error('[Flowise Stream] Stream error:', streamError);
        res.write(`data: ${JSON.stringify({ error: 'Stream interrupted' })}\n\n`);
      } finally {
        reader.releaseLock();
        res.end();
      }

    } catch (error) {
      console.error('[Flowise Stream] Error:', error);
      res.write(`data: ${JSON.stringify({
        error: 'Erreur lors du streaming',
        details: error instanceof Error ? error.message : String(error)
      })}\n\n`);
      res.end();
    }
  });

  // Flowise proxy endpoint for secure API calls
  app.post("/api/flowise/prediction/:chatflowId", async (req, res) => {
    const perfStart = Date.now();
    try {
      const { chatflowId } = req.params;
      const { question, chatId } = req.body;

      // IMPORTANT: Cache is DISABLED for this application
      // Peter needs full conversational context to remember user's name and maintain continuity
      // Every message is sent with a sessionId (chatId) for context tracking
      console.log(`[Flowise] Processing question in conversation (chatId: ${chatId})`);
      
      // Note: Cache functionality preserved but not used. Can be re-enabled for
      // different use cases where conversational context is not required.

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
        returnSourceDocuments: false,
      };

      // Add timeout and connection optimization
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s for complex responses
      
      const fetchStart = Date.now();
      const response = await fetch(`${flowiseHost}/api/v1/prediction/${actualChatflowId}`, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });
      const fetchDuration = Date.now() - fetchStart;
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Flowise API error: ${response.status} ${response.statusText}`);
      }

      const responseText = await response.text();
      const payloadSize = new Blob([responseText]).size;
      
      // Streamlined JSON parsing - minimal processing
      const parseStart = Date.now();
      let data;
      try {
        data = JSON.parse(responseText);
        
        // Fast text field processing with optimized logic
        if (data.text && typeof data.text === 'string') {
          const textField = data.text.trim();
          
          // Try to detect and parse JSON in the text field
          // Check if it looks like JSON (starts with { and has typical JSON structure)
          const looksLikeJSON = textField.startsWith('{') || 
                                textField.includes('"Response"') || 
                                textField.includes('"theme"');
          
          if (looksLikeJSON) {
            try {
              // Direct parsing - fastest approach
              const parsedText = JSON.parse(textField);
              data.parsedContent = parsedText;
              console.log('[Flowise] Successfully parsed nested JSON from text field');
            } catch (parseError) {
              // Try to clean up the JSON and parse again
              console.warn('[Flowise] First JSON parse attempt failed, trying cleanup...');
              try {
                // Remove any leading/trailing whitespace and try again
                const cleanedText = textField
                  .replace(/^\s+|\s+$/g, '')  // trim whitespace
                  .replace(/\n/g, ' ')         // replace newlines with spaces
                  .replace(/\s+/g, ' ');       // collapse multiple spaces
                
                const parsedText = JSON.parse(cleanedText);
                data.parsedContent = parsedText;
                console.log('[Flowise] Successfully parsed cleaned JSON');
              } catch (secondError) {
                // If still fails, try to extract Response field manually using regex
                console.error('[Flowise] Failed to parse JSON after cleanup:', secondError);
                console.error('[Flowise] Raw text field:', textField.substring(0, 200));
                
                // Try to extract Response field with regex as last resort
                const responseMatch = textField.match(/"Response"\s*:\s*"((?:[^"\\]|\\.)*)"/);

                if (responseMatch) {
                  console.log('[Flowise] Extracted Response field via regex');
                  data.parsedContent = { Response: responseMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n') };
                } else {
                  // Ultimate fallback: return friendly error message instead of raw JSON
                  console.error('[Flowise] Could not extract Response field, using error message');
                  data.parsedContent = { 
                    Response: "Je rencontre des difficultés à formuler ma réponse. Pouvez-vous reformuler votre question ?" 
                  };
                }
              }
            }
          } else {
            // Plain text response, wrap it
            data.parsedContent = { Response: textField };
          }
        }
      } catch (parseError) {
        console.error("Failed to parse Flowise response:", parseError);
        throw new Error("Invalid JSON response from Flowise");
      }
      const parseDuration = Date.now() - parseStart;
      
      // Add performance metrics
      data._performance = {
        totalTime: Date.now() - perfStart,
        flowiseFetchTime: fetchDuration,
        parsingTime: parseDuration,
        payloadSizeBytes: payloadSize,
        payloadSizeKB: (payloadSize / 1024).toFixed(2)
      };
      
      console.log(`[Flowise Performance] Total: ${data._performance.totalTime}ms | Fetch: ${fetchDuration}ms | Parse: ${parseDuration}ms | Size: ${data._performance.payloadSizeKB}KB`);

      // Cache is disabled to preserve conversational context
      // (Peter needs to remember user's name and conversation history)

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
