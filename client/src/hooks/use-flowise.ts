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
}

function parseFlowiseResponse(responseText: string): ParsedFlowiseResponse {
  console.log('[Flowise] Parsing response, length:', responseText.length);
  
  try {
    // Try to parse as JSON
    const parsed = JSON.parse(responseText);
    console.log('[Flowise] Successfully parsed JSON:', Object.keys(parsed));
    
    // If it's a valid JSON with our expected structure
    if (typeof parsed === 'object' && parsed !== null) {
      const result: ParsedFlowiseResponse = {
        displayText: parsed.Response || responseText,
      };
      
      console.log('[Flowise] Response text to display:', result.displayText.substring(0, 100) + '...');
      
      // Extract info panel data if available
      const infoData: InfoPanelData = {};
      let hasInfoData = false;
      
      if (parsed.theme !== undefined) {
        console.log('[Flowise] Found theme:', parsed.theme);
        infoData.theme = parsed.theme;
        hasInfoData = true;
      }
      
      if (parsed.nombre_d_indices !== undefined) {
        console.log('[Flowise] Found nombre_d_indices:', parsed.nombre_d_indices);
        infoData.nombre_d_indices = parsed.nombre_d_indices;
        hasInfoData = true;
      }
      
      if (parsed.score_globale !== undefined) {
        console.log('[Flowise] Found score_globale:', parsed.score_globale);
        infoData.score_globale = parsed.score_globale;
        hasInfoData = true;
      }
      
      if (hasInfoData) {
        console.log('[Flowise] Returning info data:', infoData);
        result.infoData = infoData;
      } else {
        console.log('[Flowise] No info data found in JSON');
      }
      
      return result;
    }
  } catch (error) {
    console.log('[Flowise] Not valid JSON, treating as plain text');
  }
  
  // Return as plain text
  return {
    displayText: responseText,
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
      const { displayText, infoData } = parseFlowiseResponse(response.text);
      
      // Update info panel data if new data is available
      if (infoData && onInfoDataUpdate) {
        onInfoDataUpdate(infoData);
      }
      
      // Extract media from display text
      const { cleanText, videos, links } = extractMediaFromText(displayText);
      
      const peterMessage: ChatMessage = {
        id: `peter_${Date.now()}`,
        content: displayText, // Use the parsed display text
        sender: 'peter',
        timestamp: new Date().toISOString(),
        metadata: {
          hasVideo: videos.length > 0,
          hasLinks: links.length > 0,
          videoUrl: videos[0],
          links,
        },
      };

      setMessages(prev => [...prev, peterMessage]);

      // Track media if present
      if (videos.length > 0) {
        analytics.trackVideoOpened(videos[0]);
      }
      if (links.length > 0) {
        links.forEach(link => analytics.trackLinkOpened(link));
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
