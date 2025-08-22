import { useEffect, useRef } from "react";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { Button } from "@/components/ui/button";
import { PanelsRightBottom, Loader2 } from "lucide-react";
import { ChatMessage as ChatMessageType } from "../../types/chat";
import { cn } from "@/lib/utils";

interface ChatInterfaceProps {
  messages: ChatMessageType[];
  onSendMessage: (message: string) => void;
  onVideoClick: (url: string) => void;
  onLinkClick: (url: string) => void;
  onToggleMediaPanel: () => void;
  isLoading?: boolean;
  messageCount: number;
}

export function ChatInterface({
  messages,
  onSendMessage,
  onVideoClick,
  onLinkClick,
  onToggleMediaPanel,
  isLoading = false,
  messageCount,
}: ChatInterfaceProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-120px)] min-h-[500px]">
      {/* Chat Header */}
      <div className="bg-gray-50 border-b border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center">
              <span className="text-white font-semibold">P</span>
            </div>
            <div>
              <div className="font-semibold text-gray-900">Peter</div>
              <div className="text-sm text-green-600">En ligne • Assistant écologique</div>
            </div>
          </div>
          <div className="text-sm text-gray-500" data-testid="text-message-count">
            <span>{messageCount}</span> messages
          </div>
        </div>
      </div>
      
      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <ChatMessage
            key={message.id}
            message={message}
            onVideoClick={onVideoClick}
            onLinkClick={onLinkClick}
          />
        ))}
        
        {isLoading && (
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
              <span className="text-white text-sm font-semibold">P</span>
            </div>
            <div className="flex items-center space-x-2 bg-gray-100 rounded-lg p-3">
              <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
              <span className="text-sm text-gray-500">Peter réfléchit...</span>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>
      
      {/* Chat Input */}
      <ChatInput
        onSendMessage={onSendMessage}
        disabled={isLoading}
        placeholder="Tapez votre message..."
      />
    </div>
  );
}
