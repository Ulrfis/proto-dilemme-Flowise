import { useCallback, useEffect, useRef, useState } from "react";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { PanelsRightBottom, Copy, Check } from "lucide-react";
import { ChatMessage as ChatMessageType } from "../../types/chat";
import { cn } from "@/lib/utils";
import { AvatarSelector } from "../avatar/AvatarSelector";
import { useUserAvatar } from "../../hooks/use-user-avatar";
import { useTTSQueue } from "../../hooks/use-tts-queue";
import { plainifyForTTS } from "../../lib/tts-text";
import { splitIntoSentences } from "../../lib/sentence-split";
import peterAvatarImage from "@assets/Peter_Avatar_white_1777751289628.jpeg";

interface ChatInterfaceProps {
  messages: ChatMessageType[];
  onSendMessage: (message: string) => void;
  onVideoClick: (url: string) => void;
  onLinkClick: (url: string) => void;
  onToggleMediaPanel: () => void;
  onThumbsUp: () => void;
  onChoiceClick: (choice: string) => void;
  onWatchedVideo?: () => void;
  isLoading?: boolean;
  messageCount: number;
  /** Current streaming step label (e.g. "Peter cherche dans ses sources…"). */
  currentStepLabel?: string | null;
  /** Imperative API: parent calls this to enqueue a sentence for TTS. */
  ttsEnqueueRef?: React.MutableRefObject<((text: string) => void) | null>;
}

export function ChatInterface({
  messages,
  onSendMessage,
  onVideoClick,
  onLinkClick,
  onToggleMediaPanel,
  onThumbsUp,
  onChoiceClick,
  onWatchedVideo,
  isLoading = false,
  messageCount,
  currentStepLabel = null,
  ttsEnqueueRef,
}: ChatInterfaceProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const userAvatar = useUserAvatar();

  // Global mute state. Default: NOT muted (Peter speaks every response by default).
  // Persisted in localStorage so the teacher's choice survives reloads.
  const TTS_MUTED_KEY = 'tts-muted';
  const [isMuted, setIsMuted] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem(TTS_MUTED_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(TTS_MUTED_KEY, isMuted ? '1' : '0');
    } catch {
      // ignore
    }
  }, [isMuted]);

  // Detect TTS availability via /api/providers so we can hide the mute button
  // when no TTS provider is configured.
  const [ttsEnabled, setTtsEnabled] = useState<boolean>(true);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/providers')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const active = data?.tts?.active;
        setTtsEnabled(typeof active === 'string' && active !== 'none');
      })
      .catch(() => {
        // Network failure: keep enabled (button click will surface the error).
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // TTS queue: one engine for the whole conversation, plays sentences in order
  // as they are enqueued. No voice selector — uses provider default voice.
  const ttsQueue = useTTSQueue();

  // Toggle mute. Going TO muted stops in-flight playback AND clears the queue
  // (immediate silence). Going TO unmuted just enables future enqueues —
  // does not replay the current message.
  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      if (next) ttsQueue.stop();
      return next;
    });
  }, [ttsQueue]);

  // Refs to keep current values accessible from non-reactive places
  const isMutedRef = useRef(isMuted);
  isMutedRef.current = isMuted;
  const ttsEnabledRef = useRef(ttsEnabled);
  ttsEnabledRef.current = ttsEnabled;

  // Stable enqueue function exposed to the parent via ttsEnqueueRef. Parent
  // (homepage / use-flowise) calls this for each streamed sentence.
  const enqueueSentence = useCallback((text: string) => {
    if (isMutedRef.current || !ttsEnabledRef.current) return;
    const cleaned = plainifyForTTS(text);
    if (cleaned) ttsQueue.enqueue(cleaned);
  }, [ttsQueue]);

  useEffect(() => {
    if (ttsEnqueueRef) ttsEnqueueRef.current = enqueueSentence;
    return () => {
      if (ttsEnqueueRef) ttsEnqueueRef.current = null;
    };
  }, [enqueueSentence, ttsEnqueueRef]);

  // Welcome message handling: it's added to the message list as a complete
  // (non-streaming) message — no token stream, so the parent's onSentence
  // callback never fires for it. We detect it here and split+enqueue locally.
  const lastAnnouncedIdRef = useRef<string | null>(null);
  const previousMessagesRef = useRef<ChatMessageType[]>([]);

  useEffect(() => {
    const previous = previousMessagesRef.current;
    previousMessagesRef.current = messages;

    if (isMutedRef.current || !ttsEnabledRef.current) {
      const lastPeter = [...messages].reverse().find((m) => m.sender === 'peter');
      if (lastPeter && !lastPeter.isStreaming) {
        lastAnnouncedIdRef.current = lastPeter.id;
      }
      return;
    }

    const lastPeter = [...messages].reverse().find((m) => m.sender === 'peter');
    if (!lastPeter) return;
    if (lastAnnouncedIdRef.current === lastPeter.id) return;
    if (lastPeter.isStreaming) return;
    if (!lastPeter.content?.trim()) return;

    const previousState = previous.find((m) => m.id === lastPeter.id);
    // Only auto-speak messages that arrived COMPLETE (no streaming history).
    // Streamed messages are spoken sentence-by-sentence via enqueueSentence.
    const arrivedComplete = !previousState;
    if (!arrivedComplete) {
      lastAnnouncedIdRef.current = lastPeter.id;
      return;
    }

    const cleaned = plainifyForTTS(lastPeter.content);
    if (cleaned) {
      lastAnnouncedIdRef.current = lastPeter.id;
      const sentences = splitIntoSentences(cleaned);
      for (const s of sentences) ttsQueue.enqueue(s);
    }
  }, [messages, ttsQueue]);

  const rafRef = useRef<number | null>(null);

  const scrollToBottom = useCallback(() => {
    if (rafRef.current !== null) return; // already scheduled
    rafRef.current = requestAnimationFrame(() => {
      if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
      }
      rafRef.current = null;
    });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const formatMessageForClipboard = (message: ChatMessageType) => {
    if (message.sender === 'debug') {
      return `[DEBUG - JSON BRUT FLOWISE]\n${message.content}\n`;
    }
    
    const sender = message.sender === 'peter' ? 'Peter' : 'Utilisateur';
    let formattedMessage = `${sender}: ${message.content}`;
    
    // Add videos and links if they exist in metadata
    if (message.metadata) {
      const { links, videoUrl } = message.metadata;
      
      // Add video URL
      if (videoUrl) {
        formattedMessage += `\n  📹 Vidéo: ${videoUrl}`;
      }
      
      // Add links
      if (links && links.length > 0) {
        links.forEach((link, index) => {
          formattedMessage += `\n  🔗 Lien ${index + 1}: ${link}`;
        });
      }
    }
    
    return formattedMessage;
  };

  const copyConversationToClipboard = async () => {
    try {
      // Format conversation for clipboard with links and videos
      const conversationText = messages.map(formatMessageForClipboard).join('\n\n');

      // Add header with timestamp
      const timestamp = new Date().toLocaleString('fr-FR');
      const fullText = `Conversation Dilemme Plastique - ${timestamp}\n${'='.repeat(50)}\n\n${conversationText}`;

      // Copy to clipboard
      await navigator.clipboard.writeText(fullText);
      
      // Show success feedback
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy conversation:', error);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      const conversationText = messages.map(formatMessageForClipboard).join('\n\n');
      const timestamp = new Date().toLocaleString('fr-FR');
      textArea.value = `Conversation Dilemme Plastique - ${timestamp}\n${'='.repeat(50)}\n\n${conversationText}`;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Chat Header - Compact */}
      <div className="bg-gray-50 border-b border-gray-200 p-2 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Avatar className="w-8 h-8">
              <AvatarImage src={peterAvatarImage} alt="Peter" />
              <AvatarFallback className="bg-primary text-white text-sm font-semibold">
                P
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="text-sm font-semibold text-gray-900">Peter</div>
              <div className="text-xs text-teal-500">Ton guide plastique</div>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <AvatarSelector 
              currentName={userAvatar.name}
              currentGender={userAvatar.gender}
              currentAvatarUrl={userAvatar.avatarUrl}
              onAvatarChange={userAvatar.updateAvatar}
            />
            <div className="text-xs text-gray-500" data-testid="text-message-count">
              <span>{messageCount}</span> msgs
            </div>
          </div>
        </div>
      </div>
      
      {/* Chat Messages - Scrollable */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-3 space-y-3 chat-messages">
        {messages.map((message, index) => {
          const isLastPeterMessage = message.sender === 'peter' && 
            !messages.slice(index + 1).some(m => m.sender === 'peter');
          const showThinking = isLoading && isLastPeterMessage && !message.isStreaming;
          const progressLabel = showThinking ? currentStepLabel : null;
          
          return (
            <ChatMessage
              key={message.id}
              message={message}
              onVideoClick={onVideoClick}
              onLinkClick={onLinkClick}
              onThumbsUp={onThumbsUp}
              onChoiceClick={onChoiceClick}
              onWatchedVideo={onWatchedVideo}
              userAvatarUrl={userAvatar.avatarUrl}
              userName={userAvatar.name}
              showThinking={showThinking}
              progressLabel={progressLabel}
              ttsEnabled={ttsEnabled}
              isMuted={isMuted}
              onToggleMute={toggleMute}
            />
          );
        })}
        
        
        
        <div ref={messagesEndRef} />
      </div>
      
      {/* Chat Input - Fixed */}
      <div className="flex-shrink-0">
        <ChatInput
          onSendMessage={onSendMessage}
          disabled={isLoading}
          placeholder="Tapez votre message..."
        />
        
        {/* Copy Conversation Button - Compact */}
        <div className="px-2 pb-2 flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={copyConversationToClipboard}
            disabled={messages.length === 0}
            data-testid="button-copy-conversation"
            className="text-gray-500 hover:text-gray-700 flex items-center space-x-1 h-7 px-2"
            title="Copier toute la conversation dans le presse-papiers"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3" />
                <span className="text-xs">Copié!</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                <span className="text-xs">Copier</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
