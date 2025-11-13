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
  
  // Fallback: Try to parse JSON from response.text if server parsing failed
  if (response.text && typeof response.text === 'string') {
    const textField = response.text.trim();
    
    // Check if text looks like JSON
    if (textField.startsWith('{') || textField.includes('"Response"')) {
      try {
        console.log('[Client] Attempting to parse JSON fallback...');
        const parsed = JSON.parse(textField);
        
        const result: ParsedFlowiseResponse = {
          displayText: parsed.Response || textField,
        };
        
        // Extract URLs
        if (parsed.URL) result.flowiseURL = parsed.URL;
        if (parsed.URLYOUTUBE) result.flowiseYouTubeURL = parsed.URLYOUTUBE;
        
        // Extract info data
        const infoData: InfoPanelData = {};
        if (parsed.theme) infoData.theme = parsed.theme;
        if (parsed.nombre_d_indices) infoData.nombre_d_indices = parsed.nombre_d_indices;
        if (parsed.score_globale) infoData.score_globale = parsed.score_globale;
        
        if (Object.keys(infoData).length > 0) {
          result.infoData = infoData;
        }
        
        console.log('[Client] Successfully parsed JSON fallback');
        return result;
      } catch (parseError) {
        console.error('[Client] Failed to parse JSON fallback:', parseError);
        // If JSON parse fails, just use the text as-is (but this shouldn't show JSON)
      }
    }
  }
  
  // Last resort fallback - NEVER show raw JSON to users
  // If we get here, parsing failed both server and client-side
  console.error('[Client] All parsing attempts failed, showing error message');
  return {
    displayText: "Je rencontre des difficultés à traiter cette réponse. Pouvez-vous réessayer ?",
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
    setTimeout(() => analytics.trackMessageSent(content.length), 0);

    const peterMessageId = `peter_${Date.now()}`;
    const peterMessage: ChatMessage = {
      id: peterMessageId,
      content: '',
      sender: 'peter',
      timestamp: new Date().toISOString(),
      isStreaming: true,
    };

    setMessages(prev => [...prev, peterMessage]);

    try {
      console.log('[use-flowise] Starting streaming...');
      let accumulatedText = '';
      let streamMetadata: any = {};

      await client.sendMessageStreaming(
        content.trim(),
        (token: string) => {
          accumulatedText += token;
          setMessages(prev => prev.map(msg =>
            msg.id === peterMessageId
              ? { ...msg, content: accumulatedText, isStreaming: true }
              : msg
          ));
        },
        (metadata: any) => {
          streamMetadata = { ...streamMetadata, ...metadata };
          console.log('[use-flowise] Metadata received:', metadata);

          if (onInfoDataUpdate && metadata) {
            const infoData: any = {};
            if (metadata.theme) infoData.theme = metadata.theme;
            if (metadata.nombre_d_indices) infoData.nombre_d_indices = metadata.nombre_d_indices;
            if (metadata.score_globale) infoData.score_globale = metadata.score_globale;

            if (Object.keys(infoData).length > 0) {
              onInfoDataUpdate(infoData);
            }
          }
        },
        (fullText: string, metadata: any) => {
          console.log('[use-flowise] Stream complete');

          const { cleanText, videos, links } = extractMediaFromText(fullText);

          setMessages(prev => prev.map(msg =>
            msg.id === peterMessageId
              ? {
                  ...msg,
                  content: fullText,
                  isStreaming: false,
                  metadata: {
                    hasVideo: videos.length > 0,
                    hasLinks: links.length > 0,
                    videoUrl: videos[0],
                    links: links,
                  }
                }
              : msg
          ));

          setIsLoading(false);

          if (videos.length > 0 || links.length > 0) {
            setTimeout(() => {
              videos.forEach(video => analytics.trackVideoOpened(video));
              links.forEach(link => analytics.trackLinkOpened(link));
            }, 0);
          }
        },
        (error: Error) => {
          console.error('[use-flowise] Stream error:', error);

          const errorMessage: ChatMessage = {
            id: `error_${Date.now()}`,
            content: "Désolé, je rencontre des difficultés techniques. Pouvez-vous réessayer votre message ?",
            sender: 'peter',
            timestamp: new Date().toISOString(),
          };

          setMessages(prev => prev.map(msg =>
            msg.id === peterMessageId ? errorMessage : msg
          ));

          setIsLoading(false);
        }
      );

    } catch (error) {
      console.error("Error sending message:", error);

      const errorMessage: ChatMessage = {
        id: `error_${Date.now()}`,
        content: "Désolé, je rencontre des difficultés techniques. Pouvez-vous réessayer votre message ?",
        sender: 'peter',
        timestamp: new Date().toISOString(),
      };

      setMessages(prev => prev.map(msg =>
        msg.id === peterMessageId ? errorMessage : msg
      ));

      setIsLoading(false);
    }
  }, [client, onInfoDataUpdate]);

  const resetSession = useCallback(() => {
    setMessages([]);
    client.resetSession();
    // Non-blocking analytics
    setTimeout(() => analytics.trackSessionReset(), 0);
  }, [client]);

  const initializeChat = useCallback(() => {
    const welcomeMessage: ChatMessage = {
      id: 'peter_welcome',
      content: `Salut, c'est toi l'enquêteur écologique avec qui je dois collaborer ? Ne sois pas surpris, en 2025, ils ont bien fait le taf lorsqu'ils ont enregistré mon fantôme digital, je suis plus vrai que nature ! Alors, à qui ai-je affaire, comment tu t'appelles ?`,
      sender: 'peter',
      timestamp: new Date().toISOString(),
    };

    setMessages([welcomeMessage]);
    // Non-blocking analytics
    setTimeout(() => analytics.trackChatStart(), 0);
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
