import { useCallback, useEffect, useRef, useState } from "react";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PanelsRightBottom, Copy, Check, Volume2, VolumeX, Mic2 } from "lucide-react";
import { ChatMessage as ChatMessageType } from "../../types/chat";
import { cn } from "@/lib/utils";
import { AvatarSelector } from "../avatar/AvatarSelector";
import { useUserAvatar } from "../../hooks/use-user-avatar";
import { useTTS } from "../../hooks/use-tts";
import { plainifyForTTS } from "../../lib/tts-text";
import peterAvatarImage from "@assets/Peter Avatar_1756370825342.jpg";

interface ChatInterfaceProps {
  messages: ChatMessageType[];
  onSendMessage: (message: string) => void;
  onVideoClick: (url: string) => void;
  onLinkClick: (url: string) => void;
  onToggleMediaPanel: () => void;
  onThumbsUp: () => void;
  onChoiceClick: (choice: string) => void;
  isLoading?: boolean;
  messageCount: number;
}

export function ChatInterface({
  messages,
  onSendMessage,
  onVideoClick,
  onLinkClick,
  onToggleMediaPanel,
  onThumbsUp,
  onChoiceClick,
  isLoading = false,
  messageCount,
}: ChatInterfaceProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const userAvatar = useUserAvatar();

  const TTS_AUTOPLAY_KEY = 'tts-autoplay';
  const TTS_VOICE_KEY = 'tts-voice-id';
  const [autoplayTTS, setAutoplayTTS] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem(TTS_AUTOPLAY_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(TTS_AUTOPLAY_KEY, autoplayTTS ? '1' : '0');
    } catch {
      // ignore
    }
  }, [autoplayTTS]);

  // Detect TTS availability via /api/providers so we can hide controls when
  // the active provider is "none" (no key configured).
  const [ttsEnabled, setTtsEnabled] = useState<boolean>(true);
  const [ttsProviderName, setTtsProviderName] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/providers')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const active = data?.tts?.active;
        setTtsEnabled(typeof active === 'string' && active !== 'none');
        setTtsProviderName(typeof active === 'string' ? active : null);
      })
      .catch(() => {
        // Network failure: keep enabled (button click will surface the error).
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Voice selector state — load persisted choice, fetch available voices.
  type TTSVoice = {
    id: string;
    name: string;
    description?: string;
    language?: string;
    isDefault?: boolean;
  };
  const [voices, setVoices] = useState<TTSVoice[]>([]);
  const [defaultVoiceId, setDefaultVoiceId] = useState<string | null>(null);
  const [voicesLoading, setVoicesLoading] = useState<boolean>(false);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      return window.localStorage.getItem(TTS_VOICE_KEY);
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (selectedVoiceId) {
        window.localStorage.setItem(TTS_VOICE_KEY, selectedVoiceId);
      } else {
        window.localStorage.removeItem(TTS_VOICE_KEY);
      }
    } catch {
      // ignore
    }
  }, [selectedVoiceId]);

  useEffect(() => {
    if (!ttsEnabled) return;
    let cancelled = false;
    setVoicesLoading(true);
    fetch('/api/tts/voices')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const list: TTSVoice[] = Array.isArray(data.voices) ? data.voices : [];
        setVoices(list);
        const defaultId =
          typeof data.defaultVoiceId === 'string' ? data.defaultVoiceId : null;
        setDefaultVoiceId(defaultId);
        // If the persisted voice is no longer available, fall back to default.
        setSelectedVoiceId((current) => {
          if (current && list.some((v) => v.id === current)) {
            return current;
          }
          return defaultId;
        });
      })
      .catch((err) => {
        console.warn('[ChatInterface] Failed to load TTS voices:', err);
      })
      .finally(() => {
        if (!cancelled) setVoicesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ttsEnabled, ttsProviderName]);

  // Single autoplay engine: triggers TTS exactly once per Peter message that
  // transitions from streaming → not-streaming (the "new response just
  // completed" edge). We track the id of the last announced message so an
  // already-completed historic message never re-triggers, and so streaming
  // updates only fire `play()` once per message.
  const autoplayTTSRef = useRef(autoplayTTS);
  autoplayTTSRef.current = autoplayTTS;
  const ttsEnabledRef = useRef(ttsEnabled);
  ttsEnabledRef.current = ttsEnabled;
  const lastAnnouncedIdRef = useRef<string | null>(null);
  const previousMessagesRef = useRef<ChatMessageType[]>([]);
  const autoplayTTS_engine = useTTS({ voiceId: selectedVoiceId });

  // Track the last Peter message id we've seen to detect new completed responses
  const firstMountRef = useRef(true);

  useEffect(() => {
    const previous = previousMessagesRef.current;
    previousMessagesRef.current = messages;
    const isFirstMount = firstMountRef.current;
    firstMountRef.current = false;

    if (!autoplayTTSRef.current || !ttsEnabledRef.current) {
      // Even with autoplay off, keep lastAnnouncedIdRef in sync with the
      // latest Peter message so toggling autoplay ON later does not replay
      // historic messages.
      const lastPeter = [...messages].reverse().find((m) => m.sender === 'peter');
      if (lastPeter && !lastPeter.isStreaming) {
        lastAnnouncedIdRef.current = lastPeter.id;
      }
      return;
    }

    // On the first mount with pre-existing history (e.g. welcome message,
    // or full reload after autoplay was previously enabled), mark the most
    // recent Peter message as "already announced" without playing it.
    if (isFirstMount) {
      const lastPeter = [...messages].reverse().find((m) => m.sender === 'peter');
      if (lastPeter) lastAnnouncedIdRef.current = lastPeter.id;
      return;
    }

    // Look for a Peter message whose state just transitioned from streaming
    // to complete (or that just appeared already complete since last render).
    const lastPeter = [...messages].reverse().find((m) => m.sender === 'peter');
    if (!lastPeter) return;
    if (lastAnnouncedIdRef.current === lastPeter.id) return;
    if (lastPeter.isStreaming) return;
    if (!lastPeter.content?.trim()) return;

    const previousState = previous.find((m) => m.id === lastPeter.id);
    const justFinishedStreaming = previousState?.isStreaming === true;
    const arrivedComplete = !previousState; // brand new, already non-streaming

    if (justFinishedStreaming || arrivedComplete) {
      const text = plainifyForTTS(lastPeter.content);
      if (text) {
        lastAnnouncedIdRef.current = lastPeter.id;
        void autoplayTTS_engine.play(text);
      }
    }
  }, [messages, autoplayTTS_engine]);

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
            {ttsEnabled && voices.length > 0 && (
              <div
                className="flex items-center gap-1.5"
                title="Choisir la voix utilisée pour Peter"
              >
                <Mic2 className="w-3.5 h-3.5 text-gray-500" />
                <Select
                  value={selectedVoiceId ?? defaultVoiceId ?? undefined}
                  onValueChange={(value) => setSelectedVoiceId(value)}
                  disabled={voicesLoading}
                >
                  <SelectTrigger
                    className="h-7 px-2 text-xs w-[110px] sm:w-[150px]"
                    data-testid="select-tts-voice"
                    aria-label="Choisir la voix de Peter"
                  >
                    <SelectValue placeholder="Voix…" />
                  </SelectTrigger>
                  <SelectContent>
                    {voices.map((voice) => (
                      <SelectItem
                        key={voice.id}
                        value={voice.id}
                        data-testid={`option-voice-${voice.id}`}
                      >
                        <div className="flex flex-col">
                          <span className="text-xs font-medium">
                            {voice.name}
                            {voice.id === defaultVoiceId ? ' (défaut)' : ''}
                          </span>
                          {voice.description && (
                            <span className="text-[10px] text-gray-500">
                              {voice.description}
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {ttsEnabled && (
              <div
                className="flex items-center gap-1.5"
                title="Lecture vocale automatique des messages de Peter"
              >
                {autoplayTTS ? (
                  <Volume2 className="w-3.5 h-3.5 text-teal-500" />
                ) : (
                  <VolumeX className="w-3.5 h-3.5 text-gray-400" />
                )}
                <Switch
                  id="tts-autoplay-toggle"
                  checked={autoplayTTS}
                  onCheckedChange={setAutoplayTTS}
                  data-testid="switch-tts-autoplay"
                  aria-label="Activer ou désactiver la lecture vocale automatique"
                  className="scale-75"
                />
                <Label
                  htmlFor="tts-autoplay-toggle"
                  className="text-xs text-gray-600 cursor-pointer select-none hidden sm:inline"
                >
                  Lecture auto
                </Label>
              </div>
            )}
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
          
          return (
            <ChatMessage
              key={message.id}
              message={message}
              onVideoClick={onVideoClick}
              onLinkClick={onLinkClick}
              onThumbsUp={onThumbsUp}
              onChoiceClick={onChoiceClick}
              userAvatarUrl={userAvatar.avatarUrl}
              userName={userAvatar.name}
              showThinking={showThinking}
              ttsEnabled={ttsEnabled}
              ttsVoiceId={selectedVoiceId ?? defaultVoiceId}
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
