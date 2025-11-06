import { FlowiseResponse } from "@shared/schema";

export class FlowiseClient {
  private chatflowId: string;
  private sessionId: string;

  constructor(chatflowId: string) {
    this.chatflowId = chatflowId;
    // Generate cryptographically secure session ID
    this.sessionId = `session_${Date.now()}_${crypto.randomUUID().replace(/-/g, '')}`;
  }

  async sendMessage(message: string): Promise<FlowiseResponse> {
    try {
      // Add timeout and request optimization
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout for complex Flowise responses
      
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
    // Generate cryptographically secure session ID
    this.sessionId = `session_${Date.now()}_${crypto.randomUUID().replace(/-/g, '')}`;
  }

  getSessionId() {
    return this.sessionId;
  }
}

// Optimized URL cleaning function
function cleanUrl(url: string): string {
  return url.replace(/[.,;:!?)\]}\s]+$/, '').replace(/\)+\.?\s*$/, '').replace(/\.$/, '').trim();
}

// Pre-compiled regex patterns for optimal performance
const MEDIA_REGEX = /(https?:\/\/[^\s]+)/gi;
const VIDEO_DOMAINS = /(?:gumlet\.io|youtube\.com\/watch|youtu\.be|vimeo\.com)/;

// Ultra-optimized single-pass media extraction with early exit
export function extractMediaFromText(text: string): { 
  cleanText: string; 
  videos: string[]; 
  links: string[]; 
} {
  const videos: string[] = [];
  const links: string[] = [];
  
  // Quick check: if no http in text, skip expensive regex
  if (!text.includes('http://') && !text.includes('https://')) {
    return { cleanText: text, videos, links };
  }
  
  // Single regex pass - much faster than multiple passes
  MEDIA_REGEX.lastIndex = 0;
  const cleanText = text.replace(MEDIA_REGEX, (match) => {
    // Quick URL cleaning - minimal operations
    const cleanedUrl = match.replace(/[.,;:!?)\]}\s]+$/, '').trim();
    
    // Fast domain check without complex regex
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
