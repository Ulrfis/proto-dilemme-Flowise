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

function parseFlowiseResponse(response: any): ParsedFlowiseResponse {
  console.log('[Flowise] Parsing response:', typeof response, Object.keys(response || {}));
  
  let targetText = '';
  
  // Check if we have parsedContent (JSON extracted from text field by server)
  if (response.parsedContent) {
    console.log('[Flowise] Found parsedContent:', Object.keys(response.parsedContent));
    const parsed = response.parsedContent;
    
    const result: ParsedFlowiseResponse = {
      displayText: parsed.Response || response.text || 'Réponse non disponible',
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
    }
    
    return result;
  }
  
  // Fallback: try to parse text field directly
  if (response.text) {
    targetText = response.text;
    console.log('[Flowise] Using text field, first 200 chars:', targetText.substring(0, 200));
    
    // Try to extract JSON from text field with better handling of malformed JSON
    const cleanText = targetText.replace(/"/g, '\\"').replace(/\\"/g, '"'); // Basic quote escaping
    const jsonMatch = targetText.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      console.log('[Flowise] Found JSON pattern in text, using regex extraction instead of JSON parsing');
      
      // Use regex to extract data instead of trying to parse malformed JSON
      const jsonString = jsonMatch[0];
      console.log('[Flowise] JSON content first 500 chars:', jsonString.substring(0, 500));
      
      // Extract Response field - using multiline approach instead of 's' flag
      const responseMatch = jsonString.match(/"Response":\s*"([\s\S]*?)"/);
      const themeMatch = jsonString.match(/"theme":\s*"([\s\S]*?)"/);
      const indicesMatch = jsonString.match(/"nombre_d_indices":\s*"?([^",}]+)"?/);
      const scoreMatch = jsonString.match(/"score_globale":\s*"?([^",}]+)"?/);
      
      console.log('[Flowise] Regex extraction results:');
      console.log('- Response found:', !!responseMatch);
      console.log('- Theme found:', !!themeMatch);
      console.log('- Indices found:', !!indicesMatch);
      console.log('- Score found:', !!scoreMatch);
      
      if (responseMatch || themeMatch || indicesMatch || scoreMatch) {
        const result: ParsedFlowiseResponse = {
          displayText: responseMatch ? responseMatch[1] : targetText,
        };
        
        // Extract info panel data if available
        const infoData: InfoPanelData = {};
        let hasInfoData = false;
        
        if (themeMatch) {
          infoData.theme = themeMatch[1];
          hasInfoData = true;
          console.log('[Flowise] Extracted theme:', themeMatch[1]);
        }
        
        if (indicesMatch) {
          infoData.nombre_d_indices = indicesMatch[1].replace(/"/g, ''); // Remove any remaining quotes
          hasInfoData = true;
          console.log('[Flowise] Extracted indices:', indicesMatch[1]);
        }
        
        if (scoreMatch) {
          infoData.score_globale = scoreMatch[1].replace(/"/g, ''); // Remove any remaining quotes
          hasInfoData = true;
          console.log('[Flowise] Extracted score:', scoreMatch[1]);
        }
        
        if (hasInfoData) {
          console.log('[Flowise] Returning extracted info data:', infoData);
          result.infoData = infoData;
        }
        
        console.log('[Flowise] Using regex-extracted response:', result.displayText.substring(0, 100) + '...');
        return result;
      } else {
        console.log('[Flowise] No regex matches found');
      }
    }
  }
  
  // Final fallback: return as plain text
  const fallbackText = response.text || response.toString() || 'Réponse non disponible';
  console.log('[Flowise] Using fallback text');
  return {
    displayText: fallbackText,
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
      const { displayText, infoData } = parseFlowiseResponse(response);
      
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
