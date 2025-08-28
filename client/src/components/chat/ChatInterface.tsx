import { useEffect, useRef, useState } from "react";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { PanelsRightBottom, Loader2, Copy, Check } from "lucide-react";
import { ChatMessage as ChatMessageType } from "../../types/chat";
import { cn } from "@/lib/utils";
import { AvatarSelector } from "../avatar/AvatarSelector";
import { useUserAvatar } from "../../hooks/use-user-avatar";
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

  const scrollToBottom = () => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const copyConversationToClipboard = async () => {
    try {
      // Format conversation for clipboard
      const conversationText = messages.map(message => {
        const sender = message.sender === 'peter' ? 'Peter' : 'Utilisateur';
        return `${sender}: ${message.content}`;
      }).join('\n\n');

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
      const conversationText = messages.map(message => {
        const sender = message.sender === 'peter' ? 'Peter' : 'Utilisateur';
        return `${sender}: ${message.content}`;
      }).join('\n\n');
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
              <div className="text-xs text-green-600">Assistant écologique</div>
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
        {messages.map((message) => (
          <ChatMessage
            key={message.id}
            message={message}
            onVideoClick={onVideoClick}
            onLinkClick={onLinkClick}
            onThumbsUp={onThumbsUp}
            onChoiceClick={onChoiceClick}
            userAvatarUrl={userAvatar.avatarUrl}
            userName={userAvatar.name}
          />
        ))}
        
        {isLoading && (
          <div className="flex items-center space-x-3">
            <Avatar className="w-8 h-8">
              <AvatarImage src={peterAvatarImage} alt="Peter" />
              <AvatarFallback className="bg-primary text-white text-sm font-semibold">
                P
              </AvatarFallback>
            </Avatar>
            <div className="flex items-center space-x-2 bg-gray-100 rounded-lg p-3">
              <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
              <span className="text-sm text-gray-500">Peter réfléchit...</span>
            </div>
          </div>
        )}
        
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
