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
  console.log('[Flowise] Parsing response:', typeof response, Object.keys(response || {}));
  
  let targetText = '';
  
  // Check if we have parsedContent (JSON extracted from text field by server)
  if (response.parsedContent) {
    console.log('[Flowise] Found parsedContent:', Object.keys(response.parsedContent));
    const parsed = response.parsedContent;
    
    const result: ParsedFlowiseResponse = {
      displayText: parsed.Response || response.text || 'Réponse non disponible',
    };
    
    // Extract URL and URLYOUTUBE if available
    if (parsed.URL !== undefined) {
      console.log('[Flowise] Found URL:', parsed.URL);
      result.flowiseURL = parsed.URL;
    }
    
    if (parsed.URLYOUTUBE !== undefined) {
      console.log('[Flowise] Found URLYOUTUBE:', parsed.URLYOUTUBE);
      result.flowiseYouTubeURL = parsed.URLYOUTUBE;
    }
    
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
      
      // Optimized regex patterns - compile once and reuse
      const patterns = {
        response: /"Response":\s*"([\s\S]*?)"/,
        theme: /"theme":\s*"([\s\S]*?)"/,
        indices: /"nombre_d_indices":\s*"?([^",}]+)"?/,
        score: /"score_globale":\s*"?([^",}]+)"?/,
        url: /"URL":\s*"([\s\S]*?)"/,
        youtube: /"URLYOUTUBE":\s*"([\s\S]*?)"/
      };
      
      const responseMatch = jsonString.match(patterns.response);
      const themeMatch = jsonString.match(patterns.theme);
      const indicesMatch = jsonString.match(patterns.indices);
      const scoreMatch = jsonString.match(patterns.score);
      const urlMatch = jsonString.match(patterns.url);
      const youtubeMatch = jsonString.match(patterns.youtube);
      
      console.log('[Flowise] Regex extraction results:');
      console.log('- Response found:', !!responseMatch);
      console.log('- Theme found:', !!themeMatch);
      console.log('- Indices found:', !!indicesMatch);
      console.log('- Score found:', !!scoreMatch);
      console.log('- URL found:', !!urlMatch);
      console.log('- YouTube URL found:', !!youtubeMatch);
      
      if (responseMatch || themeMatch || indicesMatch || scoreMatch || urlMatch || youtubeMatch) {
        const result: ParsedFlowiseResponse = {
          displayText: responseMatch ? responseMatch[1] : targetText,
        };
        
        // Extract URL and URLYOUTUBE if available
        if (urlMatch) {
          result.flowiseURL = urlMatch[1];
          console.log('[Flowise] Extracted URL:', urlMatch[1]);
        }
        
        if (youtubeMatch) {
          result.flowiseYouTubeURL = youtubeMatch[1];
          console.log('[Flowise] Extracted YouTube URL:', youtubeMatch[1]);
        }
        
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
