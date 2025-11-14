import { FlowiseResponse } from "@shared/schema";

export class FlowiseClient {
  private chatflowId: string;
  private sessionId: string;

  constructor(chatflowId: string) {
    this.chatflowId = chatflowId;
    this.sessionId = `session_${Date.now()}_${crypto.randomUUID().replace(/-/g, '')}`;
  }

  async sendMessageStreaming(
    message: string,
    onToken: (token: string) => void,
    onMetadata: (metadata: any) => void,
    onComplete: (fullText: string, metadata: any) => void,
    onError: (error: Error) => void
  ): Promise<void> {
    let fullText = '';
    let accumulatedMetadata: any = {};

    try {
      console.log('[Flowise Client] Starting SSE stream...');
      const perfStart = Date.now();
      let firstTokenTime = 0;

      const url = `/api/flowise/prediction/${this.chatflowId}/stream`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify({
          question: message,
          chatId: this.sessionId,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          console.log('[Flowise Client] Stream complete');
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();

            if (!data || data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);

              if (parsed.error) {
                console.error('[Flowise Client] Stream error:', parsed.error);
                throw new Error(parsed.error);
              }

              if (parsed.event === 'token') {
                let token = parsed.data || '';
                
                // CRITICAL: Never display raw JSON to users
                // Sometimes Flowise sends the entire response as a single JSON token: {"Response": "text..."}
                // Try to extract the Response field if it's JSON
                if (token.trim().startsWith('{')) {
                  try {
                    const jsonToken = JSON.parse(token);
                    if (jsonToken.Response && typeof jsonToken.Response === 'string') {
                      // Extract the Response field
                      token = jsonToken.Response;
                      console.log('[Flowise Client] Extracted Response from JSON token');
                    } else {
                      // Unknown JSON structure - skip it
                      console.warn('[Flowise Client] Skipping unknown JSON token:', token.substring(0, 50));
                      continue;
                    }
                  } catch {
                    // Not valid JSON or incomplete JSON - skip it
                    console.warn('[Flowise Client] Skipping malformed JSON token:', token.substring(0, 50));
                    continue;
                  }
                } else if (token.trim().startsWith('[')) {
                  // Skip array tokens
                  console.warn('[Flowise Client] Skipping array token:', token.substring(0, 50));
                  continue;
                }
                
                fullText += token;
                onToken(token);

                if (firstTokenTime === 0) {
                  firstTokenTime = Date.now() - perfStart;
                  console.log(`[Flowise Client] First token in ${firstTokenTime}ms`);
                }
              } else if (parsed.event === 'metadata') {
                accumulatedMetadata = { ...accumulatedMetadata, ...parsed.data };
                onMetadata(parsed.data);
              } else if (parsed.event === 'end') {
                console.log(`[Flowise Client] Stream ended. Total time: ${Date.now() - perfStart}ms`);
                if (parsed.metadata) {
                  accumulatedMetadata = { ...accumulatedMetadata, ...parsed.metadata };
                }
              } else if (parsed.event === 'start') {
                console.log('[Flowise Client] Stream started');
              } else {
                console.warn('[Flowise Client] Unknown event type:', parsed.event);
              }
            } catch (parseError) {
              console.warn('[Flowise Client] Failed to parse SSE data:', data);
            }
          }
        }
      }

      onComplete(fullText, accumulatedMetadata);

    } catch (error) {
      console.error('[Flowise Client] Streaming error:', error);
      onError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async sendMessage(message: string): Promise<FlowiseResponse> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(`/api/flowise/prediction/${this.chatflowId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Connection": "keep-alive"
        },
        body: JSON.stringify({
          question: message,
          chatId: this.sessionId,
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error("Flowise client error:", error);
      throw new Error("Impossible de communiquer avec Peter. Vérifiez votre connexion et réessayez.");
    }
  }

  resetSession() {
    this.sessionId = `session_${Date.now()}_${crypto.randomUUID().replace(/-/g, '')}`;
  }

  getSessionId() {
    return this.sessionId;
  }
}

function cleanUrl(url: string): string {
  return url.replace(/[.,;:!?)\]}\s]+$/, '').replace(/\)+\.?\s*$/, '').replace(/\.$/, '').trim();
}

const MEDIA_REGEX = /(https?:\/\/[^\s]+)/gi;
const VIDEO_DOMAINS = /(?:gumlet\.io|youtube\.com\/watch|youtu\.be|vimeo\.com)/;

export function extractMediaFromText(text: string): {
  cleanText: string;
  videos: string[];
  links: string[];
} {
  const videos: string[] = [];
  const links: string[] = [];

  if (!text.includes('http://') && !text.includes('https://')) {
    return { cleanText: text, videos, links };
  }

  MEDIA_REGEX.lastIndex = 0;
  const cleanText = text.replace(MEDIA_REGEX, (match) => {
    const cleanedUrl = match.replace(/[.,;:!?)\]}\s]+$/, '').trim();

    if (VIDEO_DOMAINS.test(cleanedUrl)) {
      videos.push(cleanedUrl);
      return `[Vidéo disponible dans le panneau média]`;
    } else {
      links.push(cleanedUrl);
      return `[Lien disponible dans le panneau média]`;
    }
  });

  return { cleanText, videos, links };
}
