import { FlowiseResponse } from "@shared/schema";
import { extractNewCompleteSentences } from "./sentence-split";

export interface FlowiseProgressLabel {
  step: string;
  label: string;
}

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
    onError: (error: Error) => void,
    signal?: AbortSignal,
    onProgress?: (label: FlowiseProgressLabel) => void,
    onSentence?: (sentence: string) => void,
  ): Promise<void> {
    let fullText = '';
    let accumulatedMetadata: any = {};
    let sentenceConsumedUpTo = 0;

    const flushSentences = () => {
      if (!onSentence) return;
      const { sentences, consumedUpTo } = extractNewCompleteSentences(fullText, sentenceConsumedUpTo);
      sentenceConsumedUpTo = consumedUpTo;
      for (const s of sentences) {
        try { onSentence(s); } catch (err) { console.warn('[Flowise Client] onSentence threw', err); }
      }
    };

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
        signal,
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
                const token = parsed.data || '';

                // NOTE: We accumulate all tokens as-is without filtering
                // The server will extract the Response field from JSON after full accumulation
                // This prevents issues with fragmented JSON tokens
                fullText += token;
                onToken(token);

                // Cheap fast-path: only attempt sentence extraction if the new
                // token contains a sentence-ending punctuation. Saves a regex
                // scan on every single token.
                if (onSentence && /[.!?]/.test(token)) {
                  flushSentences();
                }

                if (firstTokenTime === 0) {
                  firstTokenTime = Date.now() - perfStart;
                  console.log(`[Flowise Client] First token in ${firstTokenTime}ms`);
                }
              } else if (parsed.event === 'metadata') {
                accumulatedMetadata = { ...accumulatedMetadata, ...parsed.data };
                onMetadata(parsed.data);
              } else if (parsed.event === 'progress') {
                if (onProgress && parsed.data) {
                  try { onProgress(parsed.data as FlowiseProgressLabel); }
                  catch (err) { console.warn('[Flowise Client] onProgress threw', err); }
                }
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

      // Final flush: emit any remaining sentence (the server-extracted
      // `fullText` from metadata may differ from the accumulated raw stream;
      // if so, we feed the remainder through the splitter).
      const serverFullText = accumulatedMetadata?.fullText;
      if (onSentence && typeof serverFullText === 'string' && serverFullText !== fullText) {
        // Replace and re-extract from scratch for the part not yet consumed
        // to avoid duplicate sentences. We compute how much of the server text
        // matches what we already played.
        // Simpler approach: extract any sentence we haven't consumed yet from
        // the server text by checking if it adds new complete sentences.
        const remainder = serverFullText.slice(Math.min(sentenceConsumedUpTo, serverFullText.length));
        if (remainder.trim()) {
          // Only send what's truly new and was never streamed
          const trimmed = remainder.trim();
          // Skip if this is just the trailing fragment we already streamed
          if (trimmed.length > 5) {
            onSentence(trimmed);
          }
        }
      } else {
        // Flush any final sentence still buffered
        flushSentences();
        // If there's leftover text without a final terminator, emit it as a
        // sentence too so it gets spoken.
        const leftover = fullText.slice(sentenceConsumedUpTo).trim();
        if (onSentence && leftover) {
          onSentence(leftover);
          sentenceConsumedUpTo = fullText.length;
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

// Match raw URLs in text BUT skip URLs already inside a markdown link `](url)`.
// We use a negative lookbehind on `](` to avoid double-rewriting links Peter
// already wrote in markdown form.
const MEDIA_REGEX = /(?<!\]\()(https?:\/\/[^\s)<>"']+)/gi;
const VIDEO_DOMAINS = /(?:gumlet\.io|gumlet\.tv|youtube\.com\/watch|youtu\.be|vimeo\.com|player\.vimeo\.com)/;
const MARKDOWN_LINK_REGEX = /\[([^\]]+)\]\(([^)]+)\)/g;

/**
 * Build a short, human-readable label from a URL.
 * Examples:
 *   https://journals.plos.org/plosone/article?id=...   -> "journals.plos.org"
 *   https://www.lemonde.fr/planete/article/...          -> "lemonde.fr"
 *   https://vimeo.com/123456789                         -> "vimeo.com"
 */
function friendlyLabelFromUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return rawUrl;
  }
}

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

  // 1) Collect URLs from existing markdown links (so the media panel still has them)
  //    without rewriting their visible text.
  MARKDOWN_LINK_REGEX.lastIndex = 0;
  let mdMatch: RegExpExecArray | null;
  while ((mdMatch = MARKDOWN_LINK_REGEX.exec(text)) !== null) {
    const url = mdMatch[2].replace(/[.,;:!?)\]}\s]+$/, '').trim();
    if (!/^https?:\/\//i.test(url)) continue;
    if (VIDEO_DOMAINS.test(url)) videos.push(url);
    else links.push(url);
  }

  // 2) Rewrite raw URLs into inline markdown links so they render as proper
  //    clickable text in the chat (instead of an ugly "[Lien disponible…]" placeholder).
  MEDIA_REGEX.lastIndex = 0;
  const cleanText = text.replace(MEDIA_REGEX, (match) => {
    const cleanedUrl = match.replace(/[.,;:!?)\]}\s]+$/, '').trim();
    const label = friendlyLabelFromUrl(cleanedUrl);

    if (VIDEO_DOMAINS.test(cleanedUrl)) {
      videos.push(cleanedUrl);
      return `[📹 ${label}](${cleanedUrl})`;
    } else {
      links.push(cleanedUrl);
      return `[${label}](${cleanedUrl})`;
    }
  });

  return { cleanText, videos, links };
}
