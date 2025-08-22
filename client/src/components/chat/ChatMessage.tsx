import { ChatMessage as ChatMessageType } from "../../types/chat";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ChatMessageProps {
  message: ChatMessageType;
  onVideoClick?: (url: string) => void;
  onLinkClick?: (url: string) => void;
  onThumbsUp?: () => void;
}

export function ChatMessage({ message, onVideoClick, onLinkClick, onThumbsUp }: ChatMessageProps) {
  const isPeter = message.sender === 'peter';

  const handleMediaClick = (url: string, type: 'video' | 'link') => {
    if (type === 'video' && onVideoClick) {
      onVideoClick(url);
    } else if (type === 'link' && onLinkClick) {
      onLinkClick(url);
    }
  };

  // Detect message type for Peter's messages
  const getMessageType = (content: string) => {
    if (!isPeter) return 'user';
    
    // Check if message has links
    const hasLinks = content.includes('[') && content.includes('](');
    if (hasLinks) return 'with-links';
    
    // Check if it's an information message (no question marks, statements)
    const hasQuestion = content.includes('?');
    if (!hasQuestion) return 'information';
    
    return 'open-question';
  };

  const messageType = getMessageType(message.content);

  // Format message content with proper link formatting
  const formatContent = (content: string) => {
    if (messageType !== 'with-links') return content;
    
    // Replace markdown links with just the title text
    return content.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1');
  };

  // Extract links from content
  const extractLinks = (content: string) => {
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    const links: Array<{title: string, url: string}> = [];
    let match;
    
    while ((match = linkRegex.exec(content)) !== null) {
      let url = match[2];
      
      // Clean up URL by removing trailing punctuation
      url = url.replace(/[.,;:!?)\]]+$/, '');
      
      links.push({
        title: match[1],
        url: url
      });
    }
    
    return links;
  };

  const extractedLinks = messageType === 'with-links' ? extractLinks(message.content) : [];

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
          {messageType === 'with-links' ? (
            <div className="text-sm leading-relaxed">
              {formatContent(message.content).split('\n').map((line, lineIndex) => {
                // Find any link titles in this line
                let processedLine = line;
                const lineLinks = extractedLinks.filter(link => line.includes(link.title));
                
                if (lineLinks.length > 0) {
                  // Process each link in the line
                  const parts = [];
                  let lastIndex = 0;
                  
                  lineLinks.forEach((link, linkIndex) => {
                    const titleIndex = processedLine.indexOf(link.title, lastIndex);
                    if (titleIndex !== -1) {
                      // Add text before the link
                      if (titleIndex > lastIndex) {
                        parts.push(processedLine.substring(lastIndex, titleIndex));
                      }
                      
                      // Add the clickable link title
                      parts.push(
                        <span 
                          key={`link-${lineIndex}-${linkIndex}`}
                          className="font-bold cursor-pointer text-blue-600 hover:text-blue-800 underline"
                          onClick={() => handleMediaClick(link.url, 'link')}
                        >
                          {link.title}
                        </span>
                      );
                      
                      lastIndex = titleIndex + link.title.length;
                    }
                  });
                  
                  // Add remaining text after the last link
                  if (lastIndex < processedLine.length) {
                    parts.push(processedLine.substring(lastIndex));
                  }
                  
                  return <div key={lineIndex}>{parts}</div>;
                }
                
                return <div key={lineIndex}>{line}</div>;
              })}
            </div>
          ) : (
            <p className="text-sm leading-relaxed whitespace-pre-wrap">
              {message.content}
            </p>
          )}
        </div>
        
        {/* Action buttons based on message type */}
        {isPeter && (
          <div className="mt-2 flex flex-wrap gap-2">
            {/* Thumbs up button for information messages */}
            {messageType === 'information' && onThumbsUp && (
              <Button
                variant="outline"
                size="sm"
                onClick={onThumbsUp}
                data-testid="button-thumbs-up"
                className="bg-green-50 border-green-200 text-green-700 hover:bg-green-100"
              >
                👍 OK
              </Button>
            )}
            
            {/* Video buttons from metadata */}
            {message.metadata?.videoUrl && (
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
            
            {/* Link buttons from metadata */}
            {message.metadata?.links?.map((link, index) => (
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
