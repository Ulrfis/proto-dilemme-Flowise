import { ChatMessage as ChatMessageType } from "../../types/chat";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ChatMessageProps {
  message: ChatMessageType;
  onVideoClick?: (url: string) => void;
  onLinkClick?: (url: string) => void;
}

export function ChatMessage({ message, onVideoClick, onLinkClick }: ChatMessageProps) {
  const isPeter = message.sender === 'peter';

  const handleMediaClick = (url: string, type: 'video' | 'link') => {
    if (type === 'video' && onVideoClick) {
      onVideoClick(url);
    } else if (type === 'link' && onLinkClick) {
      onLinkClick(url);
    }
  };

  return (
    <div 
      className={cn(
        "flex items-start space-x-3",
        !isPeter && "flex-row-reverse space-x-reverse"
      )}
      data-testid={`message-${message.sender}-${message.id}`}
    >
      <Avatar className="w-8 h-8 flex-shrink-0">
        <AvatarFallback className={cn(
          "text-sm font-semibold",
          isPeter ? "bg-primary text-white" : "bg-gray-200 text-gray-700"
        )}>
          {isPeter ? 'P' : 'U'}
        </AvatarFallback>
      </Avatar>
      
      <div className={cn(
        "flex-1 max-w-2xl",
        !isPeter && "text-right"
      )}>
        <div className={cn(
          "rounded-lg p-3",
          isPeter ? "bg-gray-100" : "bg-primary text-white"
        )}>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">
            {message.content}
          </p>
        </div>
        
        {/* Media buttons */}
        {message.metadata && (isPeter) && (
          <div className="mt-2 flex flex-wrap gap-2">
            {message.metadata.videoUrl && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleMediaClick(message.metadata!.videoUrl!, 'video')}
                data-testid="button-open-video"
                className="bg-green-50 border-green-200 text-green-700 hover:bg-green-100"
              >
                📹 Voir la vidéo
              </Button>
            )}
            {message.metadata.links?.map((link, index) => (
              <Button
                key={index}
                variant="outline"
                size="sm"
                onClick={() => handleMediaClick(link, 'link')}
                data-testid={`button-open-link-${index}`}
                className="bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100"
              >
                🔗 Voir le lien
              </Button>
            ))}
          </div>
        )}
        
        <div className={cn(
          "mt-1 text-xs text-gray-500",
          !isPeter && "text-right"
        )}>
          {new Date(message.timestamp).toLocaleTimeString('fr-FR', {
            hour: '2-digit',
            minute: '2-digit'
          })}
        </div>
      </div>
    </div>
  );
}
