import { FlowiseResponse } from "@shared/schema";

export class FlowiseClient {
  private chatflowId: string;
  private sessionId: string;

  constructor(chatflowId: string) {
    this.chatflowId = chatflowId;
    this.sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async sendMessage(message: string): Promise<FlowiseResponse> {
    try {
      const response = await fetch(`/api/flowise/prediction/${this.chatflowId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: message,
          chatId: this.sessionId,
        }),
      });

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
    this.sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  getSessionId() {
    return this.sessionId;
  }
}

// Helper function to detect and extract media from text
export function extractMediaFromText(text: string): { 
  cleanText: string; 
  videos: string[]; 
  links: string[]; 
} {
  const videoRegex = /(https?:\/\/[^\s]+(?:gumlet\.io|youtube\.com\/watch|youtu\.be|vimeo\.com)[^\s]*)/gi;
  const linkRegex = /(https?:\/\/[^\s]+)/gi;
  
  const videos: string[] = [];
  const allLinks: string[] = [];
  
  // Extract videos first
  let cleanText = text.replace(videoRegex, (match) => {
    // Comprehensive URL cleaning
    let cleanUrl = match.replace(/[.,;:!?)\]}\s]+$/, '').trim();
    cleanUrl = cleanUrl.replace(/\)+\.?\s*$/, '');
    cleanUrl = cleanUrl.replace(/\.$/, '');
    console.log(`Video URL cleaned: "${match}" -> "${cleanUrl}"`);
    videos.push(cleanUrl);
    return `[Vidéo disponible dans le panneau média]`;
  });
  
  // Extract remaining links
  cleanText = cleanText.replace(linkRegex, (match) => {
    // Comprehensive URL cleaning
    let cleanUrl = match.replace(/[.,;:!?)\]}\s]+$/, '').trim();
    cleanUrl = cleanUrl.replace(/\)+\.?\s*$/, '');
    cleanUrl = cleanUrl.replace(/\.$/, '');
    console.log(`Link URL cleaned: "${match}" -> "${cleanUrl}"`);
    if (!videos.includes(cleanUrl)) {
      allLinks.push(cleanUrl);
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
