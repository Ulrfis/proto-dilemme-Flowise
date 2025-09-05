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
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
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

// Cached regex patterns for better performance
const VIDEO_REGEX = /(https?:\/\/[^\s]+(?:gumlet\.io|youtube\.com\/watch|youtu\.be|vimeo\.com)[^\s]*)/gi;
const LINK_REGEX = /(https?:\/\/[^\s]+)/gi;

// Optimized helper function to detect and extract media from text
export function extractMediaFromText(text: string): { 
  cleanText: string; 
  videos: string[]; 
  links: string[]; 
} {
  const videos: string[] = [];
  const allLinks: string[] = [];
  const videoUrls = new Set<string>(); // Use Set for faster lookups
  
  // Extract videos first - reset regex
  VIDEO_REGEX.lastIndex = 0;
  let cleanText = text.replace(VIDEO_REGEX, (match) => {
    const cleanedUrl = cleanUrl(match);
    videos.push(cleanedUrl);
    videoUrls.add(cleanedUrl);
    return `[Vidéo disponible dans le panneau média]`;
  });
  
  // Extract remaining links - reset regex
  LINK_REGEX.lastIndex = 0;
  cleanText = cleanText.replace(LINK_REGEX, (match) => {
    const cleanedUrl = cleanUrl(match);
    if (!videoUrls.has(cleanedUrl)) {
      allLinks.push(cleanedUrl);
      return `[Lien disponible dans le panneau média]`;
    }
    return match;
  });
  
  return {
    cleanText,
    videos,
    links: allLinks,
  };
}
