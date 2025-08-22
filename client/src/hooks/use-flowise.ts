import { useState, useCallback } from "react";
import { ChatMessage } from "../types/chat";
import { FlowiseClient, extractMediaFromText } from "../lib/flowise";
import { analytics } from "../lib/analytics";

export function useFlowise(chatflowId: string) {
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
      
      // Extract media from response
      const { cleanText, videos, links } = extractMediaFromText(response.text);
      
      const peterMessage: ChatMessage = {
        id: `peter_${Date.now()}`,
        content: response.text, // Keep original text for markdown link processing
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
