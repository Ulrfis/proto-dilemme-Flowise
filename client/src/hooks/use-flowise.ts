import { useState, useCallback, useRef } from "react";
import { ChatMessage } from "../types/chat";
import { FlowiseClient, extractMediaFromText } from "../lib/flowise";
import { analytics } from "../lib/analytics";

// Token batching configuration for smoother streaming
const TOKEN_BATCH_INTERVAL_MS = 50; // Update UI every 50ms max

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
  
  // Refs for token batching - reduces re-renders from 200+ to ~60-80 per response
  const tokenBufferRef = useRef<string>('');
  const batchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentMessageIdRef = useRef<string>('');

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
      let streamMetadata: any = {};
      
      // Reset token buffer for new message
      tokenBufferRef.current = '';
      currentMessageIdRef.current = peterMessageId;
      if (batchTimeoutRef.current) {
        clearTimeout(batchTimeoutRef.current);
        batchTimeoutRef.current = null;
      }

      await client.sendMessageStreaming(
        content.trim(),
        // Token callback with batching - updates UI every 50ms instead of every token
        (token: string) => {
          tokenBufferRef.current += token;
          
          // Only schedule a new batch update if one isn't pending
          if (!batchTimeoutRef.current) {
            batchTimeoutRef.current = setTimeout(() => {
              const bufferedContent = tokenBufferRef.current;
              const messageId = currentMessageIdRef.current;
              
              setMessages(prev => prev.map(msg =>
                msg.id === messageId
                  ? { ...msg, content: bufferedContent, isStreaming: true }
                  : msg
              ));
              
              batchTimeoutRef.current = null;
            }, TOKEN_BATCH_INTERVAL_MS);
          }
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
          console.log('[use-flowise] Stream complete, processing final message...');
          
          // Clear any pending batch update
          if (batchTimeoutRef.current) {
            clearTimeout(batchTimeoutRef.current);
            batchTimeoutRef.current = null;
          }

          // CRITICAL: Use metadata.fullText from server if available (server extracts JSON Response field)
          // Otherwise fall back to locally accumulated fullText (from tokenBufferRef)
          const finalText = metadata?.fullText || tokenBufferRef.current || fullText;
          console.log('[use-flowise] Using text:', finalText.length, 'chars (from', metadata?.fullText ? 'server metadata' : 'local accumulation', ')');

          // Extract media from the full streamed text
          const { cleanText, videos, links } = extractMediaFromText(finalText);

          setMessages(prev => prev.map(msg =>
            msg.id === peterMessageId
              ? {
                  ...msg,
                  content: finalText,
                  isStreaming: false,
                  rawJson: metadata, // Store raw Flowise metadata for debugging
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

          // Analytics tracking
          if (videos.length > 0 || links.length > 0) {
            setTimeout(() => {
              videos.forEach(video => analytics.trackVideoOpened(video));
              links.forEach(link => analytics.trackLinkOpened(link));
            }, 0);
          }

          // Update info panel with final metadata if available
          if (onInfoDataUpdate && metadata) {
            const infoData: any = {};
            if (metadata.theme) infoData.theme = metadata.theme;
            if (metadata.nombre_d_indices) infoData.nombre_d_indices = metadata.nombre_d_indices;
            if (metadata.score_globale) infoData.score_globale = metadata.score_globale;

            if (Object.keys(infoData).length > 0) {
              console.log('[use-flowise] Final metadata update:', infoData);
              onInfoDataUpdate(infoData);
            }
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
