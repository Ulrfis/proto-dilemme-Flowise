import { useState, useCallback, useRef, useEffect } from "react";
import { ChatMessage } from "../types/chat";
import { FlowiseClient, extractMediaFromText, type FlowiseProgressLabel } from "../lib/flowise";
import { analytics } from "../lib/analytics";
import { recordMessage, updateSessionFirstName } from "../lib/conversation-session";
import { PETER_WELCOME_MESSAGE, PETER_INTRO_MESSAGE } from "../../../shared/welcome-message";

// Token batching configuration for smoother streaming
const TOKEN_BATCH_INTERVAL_MS = 50; // Update UI every 50ms max

interface InfoPanelData {
  theme?: string;
  nombre_d_indices?: string;
  score_globale?: string | number;
}

interface UseFlowiseOptions {
  /** Called every time a new complete sentence appears in Peter's stream. */
  onSentenceComplete?: (sentence: string) => void;
}

export function useFlowise(
  chatflowId: string,
  onInfoDataUpdate?: (data: InfoPanelData | null) => void,
  options: UseFlowiseOptions = {},
) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [client] = useState(() => new FlowiseClient(chatflowId));
  const [currentStepLabel, setCurrentStepLabel] = useState<string | null>(null);

  // Refs for token batching - reduces re-renders from 200+ to ~60-80 per response
  const tokenBufferRef = useRef<string>('');
  const batchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentMessageIdRef = useRef<string>('');
  // AbortController ref - cancels in-flight SSE stream on new message or unmount
  const abortControllersRef = useRef<AbortController | null>(null);
  // Latest onSentenceComplete callback (kept in ref so the FlowiseClient call
  // doesn't capture a stale closure when the consumer re-renders).
  const onSentenceRef = useRef<UseFlowiseOptions["onSentenceComplete"]>(options.onSentenceComplete);
  onSentenceRef.current = options.onSentenceComplete;

  // Cancel any active stream on unmount
  useEffect(() => {
    return () => {
      if (abortControllersRef.current) {
        abortControllersRef.current.abort();
      }
      if (batchTimeoutRef.current) {
        clearTimeout(batchTimeoutRef.current);
      }
    };
  }, []);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim()) return;

    // Cancel any previous in-flight stream
    if (abortControllersRef.current) {
      abortControllersRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllersRef.current = abortController;

    const userMessage: ChatMessage = {
      id: `user_${Date.now()}`,
      content: content.trim(),
      sender: 'user',
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    setCurrentStepLabel("Peter prépare sa réponse…");
    setTimeout(() => analytics.trackMessageSent(content.length), 0);
    void recordMessage("user", userMessage.content);

    if (content.trim().length <= 40) {
      void updateSessionFirstName(content.trim());
    }

    const peterMessageId = `peter_${Date.now()}`;
    const peterMessage: ChatMessage = {
      id: peterMessageId,
      content: '',
      sender: 'peter',
      timestamp: new Date().toISOString(),
      isStreaming: true,
    };

    setMessages(prev => [...prev, peterMessage]);

    // Track AI request start
    const aiRequestStart = Date.now();
    let firstTokenTime: number | undefined;
    let aiTracked = false;
    setTimeout(() => analytics.trackAIRequest({ provider: "flowise" }), 0);

    try {
      console.log('[use-flowise] Starting streaming...');
      
      tokenBufferRef.current = '';
      currentMessageIdRef.current = peterMessageId;
      if (batchTimeoutRef.current) {
        clearTimeout(batchTimeoutRef.current);
        batchTimeoutRef.current = null;
      }

      await client.sendMessageStreaming(
        content.trim(),
        // Token callback with batching
        (token: string) => {
          if (firstTokenTime === undefined) {
            firstTokenTime = Date.now() - aiRequestStart;
          }
          tokenBufferRef.current += token;
          
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
          
          if (batchTimeoutRef.current) {
            clearTimeout(batchTimeoutRef.current);
            batchTimeoutRef.current = null;
          }

          const finalText = metadata?.fullText || tokenBufferRef.current || fullText;
          console.log('[use-flowise] Using text:', finalText.length, 'chars (from', metadata?.fullText ? 'server metadata' : 'local accumulation', ')');

          const { cleanText, videos, links } = extractMediaFromText(finalText);

          setMessages(prev => prev.map(msg =>
            msg.id === peterMessageId
              ? {
                  ...msg,
                  content: cleanText,
                  isStreaming: false,
                  rawJson: metadata,
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
          setCurrentStepLabel(null);

          const totalMs = Date.now() - aiRequestStart;
          const ttftMs = firstTokenTime ?? metadata?.firstTokenTime;

          // AI response tracking (replaces old peter_replied timing)
          aiTracked = true;
          setTimeout(() => {
            analytics.trackAIResponse({
              ttftMs,
              totalMs,
              provider: "flowise",
              success: true,
            });
          }, 0);

          if (cleanText && cleanText.trim()) {
            void recordMessage("peter", cleanText);
            setTimeout(
              () =>
                analytics.trackPeterReplied(
                  cleanText.length,
                  ttftMs,
                  totalMs,
                ),
              0,
            );
          }

          if (videos.length > 0 || links.length > 0) {
            setTimeout(() => {
              videos.forEach(video => analytics.trackVideoOpened(video));
              links.forEach(link => analytics.trackLinkOpened(link));
            }, 0);
          }

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
          if (error.name === 'AbortError') {
            console.log('[use-flowise] Stream aborted (new message started)');
            setCurrentStepLabel(null);
            return;
          }

          console.error('[use-flowise] Stream error:', error);

          const totalMs = Date.now() - aiRequestStart;
          aiTracked = true;
          setTimeout(() => {
            analytics.trackAIResponse({
              ttftMs: firstTokenTime,
              totalMs,
              provider: "flowise",
              success: false,
              errorType: error.name,
            });
            analytics.trackError({ component: "ai", errorType: error.name, message: error.message, provider: "flowise" });
          }, 0);

          setMessages(prev => prev.map(msg =>
            msg.id === peterMessageId
              ? {
                  ...msg,
                  id: `error_${Date.now()}`,
                  content: "Désolé, je rencontre des difficultés techniques. Pouvez-vous réessayer votre message ?",
                  isStreaming: false,
                }
              : msg
          ));

          setIsLoading(false);
          setCurrentStepLabel(null);
        },
        abortController.signal,
        (label: FlowiseProgressLabel) => {
          setCurrentStepLabel(label.label);
        },
        (sentence: string) => {
          if (onSentenceRef.current) {
            try { onSentenceRef.current(sentence); }
            catch (err) { console.warn('[use-flowise] onSentenceComplete threw', err); }
          }
        },
      );

    } catch (error) {
      if ((error as any)?.name === 'AbortError') {
        console.log('[use-flowise] Fetch aborted');
        return;
      }
      console.error("Error sending message:", error);

      const totalMs = Date.now() - aiRequestStart;
      const errName = (error instanceof Error) ? error.name : "UnknownError";
      const errMsg = (error instanceof Error) ? error.message : String(error);
      if (!aiTracked) {
        aiTracked = true;
        setTimeout(() => {
          analytics.trackAIResponse({
            ttftMs: firstTokenTime,
            totalMs,
            provider: "flowise",
            success: false,
            errorType: errName,
          });
          analytics.trackError({ component: "ai", errorType: errName, message: errMsg, provider: "flowise" });
        }, 0);
      }

      setMessages(prev => prev.map(msg =>
        msg.id === peterMessageId
          ? {
              ...msg,
              id: `error_${Date.now()}`,
              content: "Désolé, je rencontre des difficultés techniques. Pouvez-vous réessayer votre message ?",
              isStreaming: false,
            }
          : msg
      ));

      setIsLoading(false);
      setCurrentStepLabel(null);
    }
  }, [client, onInfoDataUpdate]);

  const resetSession = useCallback(() => {
    setMessages([]);
    client.resetSession();
    setTimeout(() => analytics.trackSessionReset(), 0);
  }, [client]);

  const initializeChat = useCallback(() => {
    const introMessage: ChatMessage = {
      id: 'peter_intro',
      content: PETER_INTRO_MESSAGE,
      sender: 'peter',
      timestamp: new Date().toISOString(),
      watchedVideoButton: true,
    };

    setMessages([introMessage]);
    setTimeout(() => analytics.trackChatStart(), 0);
  }, []);

  const addWelcomeMessage = useCallback(() => {
    setMessages(prev => {
      if (prev.some(m => m.id === 'peter_welcome')) return prev;
      const welcomeMessage: ChatMessage = {
        id: 'peter_welcome',
        content: PETER_WELCOME_MESSAGE,
        sender: 'peter',
        timestamp: new Date().toISOString(),
      };
      return [...prev, welcomeMessage];
    });
    void recordMessage("peter", PETER_WELCOME_MESSAGE);
  }, []);

  return {
    messages,
    isLoading,
    currentStepLabel,
    sendMessage,
    resetSession,
    initializeChat,
    addWelcomeMessage,
    sessionId: client.getSessionId(),
  };
}
