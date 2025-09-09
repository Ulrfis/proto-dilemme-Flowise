import { useState, useCallback } from "react";
import { ChatMessage } from "../types/chat";
import { FlowiseClient, extractMediaFromText } from "../lib/flowise";
import { analytics } from "../lib/analytics";

interface InfoPanelData {
  theme?: string;
  nombre_d_indices?: string;
  score_globale?: string | number;
}

interface ParsedFlowiseResponse {
  displayText: string;
  infoData?: InfoPanelData;
  flowiseURL?: string;
  flowiseYouTubeURL?: string;
}

function parseFlowiseResponse(response: any): ParsedFlowiseResponse {
  // Ultra-fast parsing - server already processed the data
  if (response.parsedContent) {
    const parsed = response.parsedContent;
    
    const result: ParsedFlowiseResponse = {
      displayText: parsed.Response || response.text || 'Réponse non disponible',
    };
    
    // Direct assignment - no additional processing needed
    if (parsed.URL) result.flowiseURL = parsed.URL;
    if (parsed.URLYOUTUBE) result.flowiseYouTubeURL = parsed.URLYOUTUBE;
    
    // Build info data object in one pass
    const infoData: InfoPanelData = {};
    if (parsed.theme) infoData.theme = parsed.theme;
    if (parsed.nombre_d_indices) infoData.nombre_d_indices = parsed.nombre_d_indices;
    if (parsed.score_globale) infoData.score_globale = parsed.score_globale;
    
    if (Object.keys(infoData).length > 0) {
      result.infoData = infoData;
    }
    
    return result;
  }
  
  // Minimal fallback - no complex regex processing
  return {
    displayText: response.text || response.toString() || 'Réponse non disponible',
  };
}

export function useFlowise(chatflowId: string, onInfoDataUpdate?: (data: InfoPanelData | null) => void) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [client] = useState(() => new FlowiseClient(chatflowId));

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim()) return;

    const userMessage: ChatMessage = {
      id: `user_${Date.now()}`,
      content: content.trim(),
      sender: 'user',
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    analytics.trackMessageSent(content.length);

    try {
      const response = await client.sendMessage(content.trim());
      
      // Parse the response to extract structured data
      const { displayText, infoData, flowiseURL, flowiseYouTubeURL } = parseFlowiseResponse(response);
      
      // Update info panel data if new data is available
      if (infoData && onInfoDataUpdate) {
        onInfoDataUpdate(infoData);
      }
      
      // Extract media from display text
      const { cleanText, videos, links } = extractMediaFromText(displayText);
      
      // Add Flowise URLs to links array
      const allLinks = [...links];
      if (flowiseURL) {
        // Clean up the URL by removing markdown formatting and extra whitespace
        const cleanURL = flowiseURL.replace(/\[\*\*([^\]]+)\]\([^)]+\)/g, '$1').replace(/\n/g, '').trim();
        if (cleanURL && cleanURL.startsWith('http')) {
          allLinks.push(cleanURL);
        }
      }
      
      // Add YouTube videos to videos array  
      const allVideos = [...videos];
      if (flowiseYouTubeURL) {
        // Clean up the YouTube URL by removing markdown formatting and extra whitespace
        const cleanYouTubeURL = flowiseYouTubeURL.replace(/\[\*\*([^\]]+)\]\([^)]+\)/g, '$1').replace(/\n/g, '').trim();
        if (cleanYouTubeURL && cleanYouTubeURL.includes('youtube.com')) {
          allVideos.push(cleanYouTubeURL);
        }
      }
      
      const peterMessage: ChatMessage = {
        id: `peter_${Date.now()}`,
        content: displayText, // Use the parsed display text
        sender: 'peter',
        timestamp: new Date().toISOString(),
        metadata: {
          hasVideo: allVideos.length > 0,
          hasLinks: allLinks.length > 0,
          videoUrl: allVideos[0],
          links: allLinks,
        },
      };

      setMessages(prev => [...prev, peterMessage]);

      // Track media if present
      if (allVideos.length > 0) {
        allVideos.forEach(video => analytics.trackVideoOpened(video));
      }
      if (allLinks.length > 0) {
        allLinks.forEach(link => analytics.trackLinkOpened(link));
      }

    } catch (error) {
      console.error("Error sending message:", error);
      
      const errorMessage: ChatMessage = {
        id: `error_${Date.now()}`,
        content: "Désolé, je rencontre des difficultés techniques. Pouvez-vous réessayer votre message ?",
        sender: 'peter',
        timestamp: new Date().toISOString(),
      };

      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }, [client]);

  const resetSession = useCallback(() => {
    setMessages([]);
    client.resetSession();
    analytics.trackSessionReset();
  }, [client]);

  const initializeChat = useCallback(() => {
    const welcomeMessage: ChatMessage = {
      id: 'peter_welcome',
      content: `Salut, c'est toi l'enquêteur écologique avec qui je dois collaborer ? Ne sois pas surpris, en 2025, ils ont bien fait le taf lorsqu'ils ont enregistré mon fantôme digital, je suis plus vrai que nature ! Alors, à qui ai-je affaire, comment tu t'appelles ?`,
      sender: 'peter',
      timestamp: new Date().toISOString(),
    };

    setMessages([welcomeMessage]);
    analytics.trackChatStart();
  }, []);

  return {
    messages,
    isLoading,
    sendMessage,
    resetSession,
    initializeChat,
    sessionId: client.getSessionId(),
  };
}
